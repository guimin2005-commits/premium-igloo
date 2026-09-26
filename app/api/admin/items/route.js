export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import mongoose from "mongoose";
import { normalizeItemPayload, itemSnapshot } from "@/lib/items";
import { normalizeEffects } from "@/lib/itemEffects";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import SeasonPass from "@/models/SeasonPass";

// 📌 아이템 효과 — 아이템 문서 자체에 저장한다(chatBuffXp · voiceBuffXp · attendBuffXp · effects). 디스코드 역할 연결과 무관하게
//    이 아이템을 인벤토리에 가진 사람(lib/ownedItems.js)에게 봇이 적용한다. 기프트카드(physical)는 항상 0 / [].
//    화면 ↔ API 모양: effects: { chatBuffXp, voiceBuffXp, attendBuffXp, list } — 응답에서는 이 객체만 준다(맨 위 칸은 뺀다).
const BUFF_MAX = 1_000_000;
const buffInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(BUFF_MAX, Math.max(0, n)) : 0;
};
const EMPTY_EFFECTS = () => ({ chatBuffXp: 0, voiceBuffXp: 0, attendBuffXp: 0, list: [] });

// 저장된 아이템(lean) → 화면 모양. 맨 위 효과 칸은 지워 effects 객체 하나로만 보이게 한다
//    (표시 토글이 {...it, effects: undefined} 로 보내므로 맨 위 값이 남으면 두 벌이 되어 헷갈린다)
function attachEffects(doc) {
  doc.effects = doc.type === "physical"
    ? EMPTY_EFFECTS()
    : { chatBuffXp: buffInt(doc.chatBuffXp), voiceBuffXp: buffInt(doc.voiceBuffXp), attendBuffXp: buffInt(doc.attendBuffXp), list: Array.isArray(doc.effects) ? doc.effects : [] };
  delete doc.chatBuffXp;
  delete doc.voiceBuffXp;
  delete doc.attendBuffXp;
  return doc;
}

// 본문 effects → 저장할 칸. 기프트카드는 항상 비운다.
//    본문에 effects 객체가 없으면 null — 수정은 기존 효과를 그대로 두고(표시 토글 등), 새 등록은 스키마 기본값(0 / [])
function effectFields(type, raw) {
  if (type === "physical") return { chatBuffXp: 0, voiceBuffXp: 0, attendBuffXp: 0, effects: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { chatBuffXp: buffInt(raw.chatBuffXp), voiceBuffXp: buffInt(raw.voiceBuffXp), attendBuffXp: buffInt(raw.attendBuffXp), effects: normalizeEffects(raw.list) };
}

// 시즌 패스 티어 보상이 이 아이템을 몇 번 쓰는지 — 삭제 409 와 목록 표시에 쓴다
async function passUsageOf() {
  const pass = await SeasonPass.findOne({ key: "main" }, { tiers: 1 }).lean();
  const count = new Map();
  for (const t of pass?.tiers || []) {
    for (const r of [t.free, t.paid]) {
      if (r?.kind === "item" && r.itemId) count.set(String(r.itemId), (count.get(String(r.itemId)) || 0) + 1);
    }
  }
  return count;
}

// 📌 아이템 등록 CRUD — 관리자 전용. 인벤토리 / 상점 상품 / 시즌 패스 보상 표기의 원천.
const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};

// ── [조회] 전체 목록 — ?withUsage=1 이면 이 아이템을 쓰는 상품 수를 함께 준다 ──
export async function GET(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const withUsage = new URL(request.url).searchParams.get("withUsage") === "1";
    const rows = await Item.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();

    // 효과 — 아이템 문서에 든 값을 화면 모양(effects 객체)으로 바꿔 붙인다
    for (const r of rows) attachEffects(r);

    if (withUsage) {
      const usage = await ShopItem.aggregate([
        { $match: { itemId: { $ne: "" } } },
        { $group: { _id: "$itemId", count: { $sum: 1 } } },
      ]);
      const countOf = new Map(usage.map((u) => [String(u._id), u.count]));
      const passOf = await passUsageOf();
      for (const r of rows) {
        r.usage = countOf.get(String(r._id)) || 0;
        r.passUsage = passOf.get(String(r._id)) || 0;
      }
    }
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    console.error("아이템 목록 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [등록·수정] { id?, ...fields } upsert ──
//    수정 시 이 아이템을 참조하는 상품(ShopItem.itemId)의 스냅샷도 함께 갱신한다.
export async function POST(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));
    const n = normalizeItemPayload(b);
    if (!n.ok) return NextResponse.json({ success: false, message: n.error }, { status: 400 });

    // 효과도 같은 저장 한 번에 담는다 — 따로 쓰다 절반만 저장되는 경우가 없게
    const ef = effectFields(n.data.type, b?.effects);
    const data = ef ? { ...n.data, ...ef } : n.data;

    const id = String(b?.id || "").trim();
    let doc;
    if (id) {
      doc = await Item.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
      if (!doc) return NextResponse.json({ success: false, message: "아이템을 찾을 수 없습니다." }, { status: 404 });
      // 상품이 들고 있는 표기 스냅샷을 새 값으로 맞춘다 — 상점 카드·인벤토리가 함께 바뀐다.
      //    기프트카드가 되면 기간제 가격표는 뜻이 없으므로 같이 비운다 (상품 POST 경로와 같은 규칙)
      const snap = itemSnapshot(doc);
      if (doc.type === "physical") snap.durations = [];
      await ShopItem.updateMany({ itemId: id }, { $set: snap });
    } else {
      // 순서를 안 보냈으면 맨 뒤에 붙인다 — 순서는 상점 관리 목록에서 끌어서 정한다(아래 PATCH)
      if (data.sortOrder == null) {
        const last = await Item.findOne({}, { sortOrder: 1 }).sort({ sortOrder: -1 }).lean();
        data.sortOrder = Math.min(999, Math.floor(Number(last?.sortOrder) || 0) + 1);
      }
      doc = (await Item.create(data)).toObject();
    }
    return NextResponse.json({ success: true, data: attachEffects(doc) });
  } catch (e) {
    console.error("아이템 저장 오류:", e);
    return NextResponse.json({ success: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [순서 저장] { order: [아이템 id, ...] } 앞에서부터 0, 1, 2 … ──
//    상점 관리에서 끌어 놓은 순서를 한 번에 쓴다. 인벤토리 · 상품 연결 목록이 이 순서를 따른다. 목록에 없는 아이템은 그대로 둔다.
export async function PATCH(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    const b = await request.json().catch(() => ({}));
    const ids = [...new Set((Array.isArray(b?.order) ? b.order : []).map((v) => String(v || "")))].filter((v) => mongoose.isValidObjectId(v)).slice(0, 999);
    if (ids.length === 0) return NextResponse.json({ success: false, message: "순서를 받지 못했습니다." }, { status: 400 });
    await connectToDatabase();
    await Item.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } } })), { ordered: false });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("아이템 순서 저장 오류:", e);
    return NextResponse.json({ success: false, message: "순서를 저장하지 못했습니다." }, { status: 500 });
  }
}

// ── [삭제] ?id= — 참조 상품이 있으면 409 ──
export async function DELETE(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const id = String(new URL(request.url).searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ success: false, message: "삭제할 아이템을 지정해 주세요." }, { status: 400 });

    const used = await ShopItem.countDocuments({ itemId: id });
    if (used > 0) {
      return NextResponse.json(
        { success: false, message: `이 아이템을 쓰는 상품 ${used}개를 먼저 정리해 주세요.`, usage: used },
        { status: 409 }
      );
    }
    const passUsed = (await passUsageOf()).get(id) || 0;
    if (passUsed > 0) {
      return NextResponse.json(
        { success: false, message: `이 아이템을 보상으로 쓰는 시즌 패스 티어 ${passUsed}개를 먼저 정리해 주세요.`, passUsage: passUsed },
        { status: 409 }
      );
    }
    await Item.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("아이템 삭제 오류:", e);
    return NextResponse.json({ success: false, message: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
