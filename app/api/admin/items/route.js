export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { normalizeItemPayload, itemSnapshot } from "@/lib/items";
import { normalizeEffects } from "@/lib/itemEffects";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import SeasonPass from "@/models/SeasonPass";
import RoleConfig from "@/models/RoleConfig";

// 📌 아이템 효과 — 저장 위치는 아이템에 연결된 역할(roleId)의 RoleConfig 다. 봇이 1분마다 읽어 역할 보유자에게 적용한다.
//    화면 ↔ API 모양: effects: { buffXp, attendBuffXp, list }. 역할이 없는 아이템은 0 / [] 로 준다.
const BUFF_MAX = 1_000_000;
const buffInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(BUFF_MAX, Math.max(0, n)) : 0;
};
const EMPTY_EFFECTS = () => ({ buffXp: 0, attendBuffXp: 0, list: [] });
const effectsOf = (cfg) =>
  cfg
    ? { buffXp: buffInt(cfg.buffXp), attendBuffXp: buffInt(cfg.attendBuffXp), list: Array.isArray(cfg.effects) ? cfg.effects : [] }
    : EMPTY_EFFECTS();
const EFFECT_FIELDS = { roleId: 1, buffXp: 1, attendBuffXp: 1, effects: 1 };

// 본문 effects 를 그 역할의 RoleConfig 에 쓴다. rewardLevel · exclusive 는 역할 탭 소관이라 건드리지 않는다.
//    전부 비었으면 새 문서는 만들지 않는다 — 효과 없는 아이템마다 역할 탭에 빈 줄이 생기지 않게(있던 문서는 비운다).
async function saveEffects(roleId, roleName, raw) {
  const set = {
    buffXp: buffInt(raw?.buffXp),
    attendBuffXp: buffInt(raw?.attendBuffXp),
    effects: normalizeEffects(raw?.list),
  };
  const empty = !set.buffXp && !set.attendBuffXp && set.effects.length === 0;
  if (empty) {
    const cfg = await RoleConfig.findOneAndUpdate({ roleId }, { $set: set }, { returnDocument: "after" }).select(EFFECT_FIELDS).lean();
    return effectsOf(cfg);
  }
  const cfg = await RoleConfig.findOneAndUpdate(
    { roleId },
    { $set: set, $setOnInsert: { roleName: String(roleName || "") } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).select(EFFECT_FIELDS).lean();
  return effectsOf(cfg);
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

    // 효과 — 연결 역할의 RoleConfig 를 한 번에 읽어 붙인다(같은 역할을 쓰는 아이템은 같은 효과를 본다)
    const roleIds = [...new Set(rows.map((r) => r.roleId).filter(Boolean))];
    const cfgs = roleIds.length ? await RoleConfig.find({ roleId: { $in: roleIds } }, EFFECT_FIELDS).lean() : [];
    const cfgOf = new Map(cfgs.map((c) => [c.roleId, c]));
    for (const r of rows) r.effects = r.roleId ? effectsOf(cfgOf.get(r.roleId)) : EMPTY_EFFECTS();

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

    const id = String(b?.id || "").trim();
    let doc;
    if (id) {
      doc = await Item.findByIdAndUpdate(id, { $set: n.data }, { new: true, runValidators: true }).lean();
      if (!doc) return NextResponse.json({ success: false, message: "아이템을 찾을 수 없습니다." }, { status: 404 });
      // 상품이 들고 있는 표기 스냅샷을 새 값으로 맞춘다 — 상점 카드·인벤토리가 함께 바뀐다.
      //    기프트카드가 되면 기간제 가격표는 뜻이 없으므로 같이 비운다 (상품 POST 경로와 같은 규칙)
      const snap = itemSnapshot(doc);
      if (doc.type === "physical") snap.durations = [];
      await ShopItem.updateMany({ itemId: id }, { $set: snap });
    } else {
      doc = (await Item.create(n.data)).toObject();
    }

    // 효과 — 역할이 연결된 아이템만. 역할이 없으면 본문 effects 는 무시한다(오류 아님)
    if (doc.roleId) {
      const raw = b?.effects;
      try {
        doc.effects = raw && typeof raw === "object"
          ? await saveEffects(doc.roleId, doc.roleName, raw)
          : effectsOf(await RoleConfig.findOne({ roleId: doc.roleId }, EFFECT_FIELDS).lean());
      } catch (err) {
        // 아이템은 이미 저장됐다 — 새 등록이 다시 눌려 두 개가 되지 않게 저장된 문서(_id)를 함께 준다
        console.error("아이템 효과 저장 오류:", err);
        return NextResponse.json(
          { success: false, message: "아이템은 저장했지만 효과를 저장하지 못했습니다. 다시 저장해 주세요.", data: doc },
          { status: 500 }
        );
      }
    } else {
      doc.effects = EMPTY_EFFECTS();
    }
    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    console.error("아이템 저장 오류:", e);
    return NextResponse.json({ success: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
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
