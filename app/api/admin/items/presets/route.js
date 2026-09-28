export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { normalizeItemPayload } from "@/lib/items";
import { normalizeEffects } from "@/lib/itemEffects";
import { ITEM_PRESETS, PRESET_ICON_SWAPS, presetPayload, presetLines } from "@/lib/itemPresets";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import ShopLock from "@/models/ShopLock";

// 📌 추천 아이템 불러오기 — 관리자가 창에서 골라 한 번에 등록한다(목록 · 임시 값은 lib/itemPresets.js).
//    이름이 곧 키 — 같은 이름의 아이템이 이미 있으면 건너뛴다. 상점 상품은 만들지 않는다(아이템 등록까지만).
//    등록 정리는 관리자 아이템 등록 API(../route.js POST)와 같다: normalizeItemPayload + normalizeEffects, 순서는 맨 뒤에 이어 붙인다.

// 기본 효과 칸 — ../route.js 와 같은 범위
const BUFF_MAX = 1_000_000;
const buffInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(BUFF_MAX, Math.max(0, n)) : 0;
};
// 📌 두 관리자가(또는 탭 두 개에서) 동시에 눌러도 같은 이름이 두 번 생기지 않게 등록을 한 번에 하나씩만 돌린다.
//    Item.name 에는 유니크 인덱스가 없어 upsert 만으로는 동시 삽입을 못 막는다 — 결제 자물쇠(ShopLock, _id 유니크)를 이 키로 빌려 쓴다
const LOCK_ID = "admin:item-presets";

// ── [조회] 추천 목록 + 이미 있는지(이름 기준) + 아이콘 교체 대상 ──
export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const [have, swaps] = await Promise.all([
      Item.find({ name: { $in: ITEM_PRESETS.map((p) => p.name) } }, { name: 1 }).lean(),
      Item.find({ name: { $in: PRESET_ICON_SWAPS.map((s) => s.name) } }, { name: 1, icon: 1 }).lean(),
    ]);
    const haveSet = new Set(have.map((i) => i.name));
    const data = ITEM_PRESETS.map((p) => ({
      key: p.key, name: p.name, icon: p.icon, group: p.group, lines: presetLines(p), exists: haveSet.has(p.name),
    }));
    // found: 그 이름의 아이템 수, pending: 아직 도트 아이콘이 아닌 수
    const icons = PRESET_ICON_SWAPS.map((s) => {
      const rows = swaps.filter((r) => r.name === s.name);
      return { name: s.name, icon: s.icon, found: rows.length, pending: rows.filter((r) => r.icon !== s.icon).length };
    });
    return NextResponse.json({ success: true, data, icons });
  } catch (e) {
    console.error("추천 아이템 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], icons: [], message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [등록] { keys: [목록 키, ...], replaceIcons: boolean } → { created, skipped, iconsUpdated } ──
//    created · skipped 는 이름 배열. 목록 순서대로 등록한다(보낸 순서와 무관)
export async function POST(request) {
  let lock = null;
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    const b = await request.json().catch(() => ({}));
    const keys = new Set((Array.isArray(b?.keys) ? b.keys : []).map((k) => String(k || "")));
    const picked = ITEM_PRESETS.filter((p) => keys.has(p.key));
    const replaceIcons = b?.replaceIcons === true;
    if (picked.length === 0 && !replaceIcons) {
      return NextResponse.json({ success: false, message: "등록할 아이템을 골라 주세요." }, { status: 400 });
    }
    await connectToDatabase();
    lock = await ShopLock.acquire(LOCK_ID);
    if (!lock) return NextResponse.json({ success: false, message: "다른 등록이 진행 중입니다. 잠시 후 다시 시도해 주세요." }, { status: 409 });

    const created = [];
    const skipped = [];
    // 순서 — 지금 맨 뒤 다음부터 하나씩(../route.js 새 등록과 같은 999 상한)
    const last = await Item.findOne({}, { sortOrder: 1 }).sort({ sortOrder: -1 }).lean();
    let next = Math.floor(Number(last?.sortOrder) || 0) + 1;
    for (const p of picked) {
      const body = presetPayload(p);
      const n = normalizeItemPayload(body);
      if (!n.ok) { skipped.push(p.name); continue; }
      const { name, ...rest } = n.data;
      const ef = body.effects;
      // 📌 조건부 삽입 — 같은 이름이 있으면 아무것도 쓰지 않는다($setOnInsert). 두 번 눌러도 중복 없이 건너뛴다
      const r = await Item.updateOne(
        { name },
        {
          $setOnInsert: {
            ...rest,
            chatBuffXp: buffInt(ef.chatBuffXp), voiceBuffXp: buffInt(ef.voiceBuffXp), attendBuffXp: buffInt(ef.attendBuffXp),
            effects: normalizeEffects(ef.list),
            sortOrder: Math.min(999, next),
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
      if (r.upsertedCount > 0) { created.push(name); next++; }
      else skipped.push(name);
    }

    // 기존 아이템 아이콘 — 이름이 맞는 것의 icon 만 바꾼다. 그 아이템을 쓰는 상품의 표기 스냅샷(icon)도 같이 맞춘다(../route.js 수정과 같은 규칙)
    let iconsUpdated = 0;
    if (replaceIcons) {
      for (const s of PRESET_ICON_SWAPS) {
        const rows = await Item.find({ name: s.name, icon: { $ne: s.icon } }, { _id: 1 }).lean();
        if (rows.length === 0) continue;
        const ids = rows.map((r) => r._id);
        const u = await Item.updateMany({ _id: { $in: ids }, icon: { $ne: s.icon } }, { $set: { icon: s.icon } });
        iconsUpdated += u.modifiedCount || 0;
        await ShopItem.updateMany({ itemId: { $in: ids.map(String) } }, { $set: { icon: s.icon } });
      }
    }
    return NextResponse.json({ success: true, created, skipped, iconsUpdated });
  } catch (e) {
    console.error("추천 아이템 등록 오류:", e);
    return NextResponse.json({ success: false, message: "등록 중 오류가 발생했습니다." }, { status: 500 });
  } finally {
    if (lock) await ShopLock.release(lock);
  }
}
