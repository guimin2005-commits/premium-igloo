export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import Item from "@/models/Item";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";
import ShopItem from "@/models/ShopItem";
import mongoose from "mongoose";
import { unitThingSet, MAX_PER_ORDER } from "@/lib/unitSale";

// 📌 아이템 수동 지급 — 관리자가 등록된 아이템을 유저에게 바로 준다.
//    상점 구매와 같은 Purchase 행(itemId "grant")을 만들어 인벤토리·봇 지급 큐가 그대로 처리한다.
//    역할이 연결된 아이템은 pending 으로 두어 봇이 30초 안에 역할을 붙이고, 없으면 바로 completed.

const MAX_DAYS = 3650;
// 📌 여러 개 지급 — "all" 대상에 수량을 곱하면 한 번에 너무 많은 건이 생긴다. 대상 수 × 수량 상한 · 한 번에 넣는 묶음 크기
const MAX_ROWS = 20000;
const INSERT_CHUNK = 1000;

// ── [조회] 최근 수동 아이템 지급 — 여러 개 지급은 1개가 한 건이라 넉넉히 읽고, 화면이 orderId 로 한 줄에 묶는다 ──
export async function GET() {
  try {
    const { deny } = await requireAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const rows = await Purchase.find(
      { itemId: "grant" },
      { userId: 1, userName: 1, itemRef: 1, itemName: 1, itemType: 1, days: 1, expiresAt: 1, status: 1, createdAt: 1, adminNote: 1, error: 1, orderId: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    console.error("아이템 지급 내역 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [지급] { itemId, target, days, reason, qty } ──
//    📌 qty(1~99) — ×N 으로 쌓이는 아이템(1개 단위 상품이 가리키거나 역할 없는 소모형 — lib/unitSale.js unitThingSet)만 여러 개.
//       그런 아이템은 이미 가진 사람도 건너뛰지 않고 사람마다 qty 건을 만든다(한 사람의 건은 같은 orderId). 나머지는 1개 · 1인 1개 그대로
export async function POST(request) {
  try {
    const { deny, session } = await requireAdmin();
    if (deny) return deny;
    await connectToDatabase();

    const b = await request.json().catch(() => ({}));
    const itemId = String(b?.itemId || "").trim();
    const item = itemId ? await Item.findById(itemId).lean().catch(() => null) : null;
    if (!item) return NextResponse.json({ success: false, message: "지급할 아이템을 선택해 주세요." }, { status: 400 });
    if (item.type === "physical") {
      return NextResponse.json({ success: false, message: "기프트카드는 수동 지급할 수 없습니다." }, { status: 400 });
    }
    const days = Math.min(MAX_DAYS, Math.max(0, Math.trunc(Number(b?.days) || 0)));
    const reason = String(b?.reason || "").trim().slice(0, 120);
    const qtyIn = Math.max(1, Math.min(MAX_PER_ORDER, Math.trunc(Number(b?.qty) || 1)));
    const linkedShops = await ShopItem.find({ itemId: String(item._id) }, { type: 1, roleId: 1, itemId: 1, unitSale: 1, durations: 1 }).lean();
    const stackable = unitThingSet(linkedShops, [item]).has(`i:${item._id}`);
    if (qtyIn > 1 && !stackable) {
      return NextResponse.json({ success: false, message: "이 아이템은 1개만 지급할 수 있습니다." }, { status: 400 });
    }
    const qty = stackable ? qtyIn : 1;

    // 대상 — "all" 이면 XP 기록이 있는 전원, 아니면 ID·닉네임으로 찾는다 (XP 수동 지급과 같은 규칙)
    const target = b?.target;
    let targets = [];
    if (target === "all") {
      targets = await UserXp.find({}, { userId: 1, username: 1, displayName: 1 }).lean();
      if (targets.length === 0) return NextResponse.json({ success: false, message: "지급 대상이 없습니다." }, { status: 404 });
    } else {
      const key = String(target || "").trim();
      if (!key) return NextResponse.json({ success: false, message: "지급 대상을 입력해주세요." }, { status: 400 });
      // 유저 ID 가 맞으면 그 한 명만 — 아니면 사용자명 · 표시 이름으로 찾되, 여러 명이 걸리면 아무에게도 주지 않는다 (동명이인)
      targets = await UserXp.find({ userId: key }, { userId: 1, username: 1, displayName: 1 }).lean();
      if (targets.length === 0) {
        targets = await UserXp.find({ $or: [{ username: key }, { displayName: key }] }, { userId: 1, username: 1, displayName: 1 }).lean();
      }
      if (targets.length > 1) {
        return NextResponse.json({
          success: false,
          message: `같은 이름의 유저가 ${targets.length}명입니다. 유저 ID로 지정해 주세요. (${targets.slice(0, 5).map((r) => `${r.displayName || r.username || "이름 없음"} ${r.userId}`).join(", ")})`,
        }, { status: 409 });
      }
      if (targets.length === 0) return NextResponse.json({ success: false, message: "해당 유저를 찾을 수 없습니다." }, { status: 404 });
    }

    if (targets.length * qty > MAX_ROWS) {
      return NextResponse.json({ success: false, message: `한 번에 ${MAX_ROWS.toLocaleString()}개까지 지급할 수 있습니다. 수량을 줄여 주세요.` }, { status: 400 });
    }

    // 1인 1개 — 같은 아이템을 아직 살아 있는 채로 들고 있으면 건너뛴다 (상점 구매·패스 보상·수동 지급 모두). ×N 아이템은 더 쌓는다
    const now = new Date();
    const alive = stackable ? [] : await Purchase.find(
      {
        userId: { $in: targets.map((t) => t.userId) },
        itemRef: String(item._id),
        status: { $in: ["pending", "completed"] },
        consumedAt: null, // 다 쓴 소모품은 다시 줄 수 있다
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      { userId: 1 }
    ).lean();
    const has = new Set(alive.map((a) => a.userId));

    const who = session?.user?.name || "admin";
    const rows = [];
    for (const t of targets) {
      if (has.has(t.userId)) continue;
      // 한 사람분은 한 주문 — 주문 내역 · 원장이 "×N" 한 줄로 묶는다
      const orderId = new mongoose.Types.ObjectId().toString();
      for (let k = 0; k < qty; k++) rows.push({
        orderId,
        createdAt: now,
        userId: t.userId,
        userName: t.displayName || t.username || "",
        itemId: "grant",
        itemRef: String(item._id),
        itemName: item.name,
        itemType: item.type,
        roleId: item.roleId || "",
        price: 0,
        payMethod: "xp",
        paidXp: 0,
        paidPoint: 0,
        days,
        expiresAt: days > 0 ? new Date(now.getTime() + days * 86400000) : null,
        contact: "",
        adminNote: reason || `관리자 지급 (${who})`,
        // 역할이 있으면 봇이 붙인 뒤 completed 로 바꾼다. 없으면 사이트 보유라 바로 완료.
        status: item.roleId ? "pending" : "completed",
        processedAt: item.roleId ? null : now,
      });
    }
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) await Purchase.insertMany(rows.slice(i, i + INSERT_CHUNK));

    const people = rows.length / qty;
    const skipped = targets.length - people;
    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: "이미 모두 보유하고 있습니다." }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      message: `${people}명에게 ${qty > 1 ? `${qty}개씩 ` : ""}지급했습니다.${skipped > 0 ? ` (이미 보유 ${skipped}명 건너뜀)` : ""}`,
      data: { count: people, qty, skipped },
    });
  } catch (e) {
    console.error("아이템 수동 지급 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
