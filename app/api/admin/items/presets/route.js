export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { normalizeItemPayload } from "@/lib/items";
import { normalizeEffects } from "@/lib/itemEffects";
import { ITEM_PRESETS, PRESET_ICON_SWAPS, presetPayload, presetLines, presetNamesOf } from "@/lib/itemPresets";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import ShopLock from "@/models/ShopLock";
import { catalogWriteBlocked, liveLockedResponse, catalogFind, forWrite, catalogCreate, nextSortOrder } from "@/lib/catalogDraft";
import { resolveCategory, shortNameOf, legacyCategoryOf, autoCategoryOf } from "@/lib/itemCategory";

// 📌 추천 아이템 불러오기 — 관리자가 창에서 골라 한 번에 등록한다(목록 · 임시 값은 lib/itemPresets.js).
//    분류 + 짧은 이름이 곧 키 — 같은 것이 이미 있으면 건너뛴다(실DB 옛 이름 「카드 스킨 · 」 · 「아바타 테두리 · 」도 — presetNamesOf · 아래 presetKeyOf). 상점 상품은 만들지 않는다(아이템 등록까지만).
//    등록 정리는 관리자 아이템 등록 API(../route.js POST)와 같다: normalizeItemPayload + normalizeEffects, 순서는 맨 뒤에 이어 붙인다.
//    📌 상품 초안(lib/catalogDraft.js) — 이름 확인 · 아이콘 대상은 초안을 덧씌운 보기, 등록 · 아이콘 교체는 초안으로(초안 모드).
//       실사이트 모드는 지금처럼 바로 쓴다. 실사이트(Vercel) 관리 화면의 등록은 liveLockedResponse(403)

// 기본 효과 칸 — ../route.js 와 같은 범위
const BUFF_MAX = 1_000_000;
const buffInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(BUFF_MAX, Math.max(0, n)) : 0;
};
// 📌 두 관리자가(또는 탭 두 개에서) 동시에 눌러도 같은 이름이 두 번 생기지 않게 등록을 한 번에 하나씩만 돌린다.
//    Item.name 에는 유니크 인덱스가 없어 upsert 만으로는 동시 삽입을 못 막는다 — 결제 자물쇠(ShopLock, _id 유니크)를 이 키로 빌려 쓴다
const LOCK_ID = "admin:item-presets";

// 📌 2026-10-17 분류는 따로 저장한다(lib/itemCategory.js) — 추천 이름 「카드 테두리 · 골드」는 짧은 이름 「골드」 + 분류(자동과 같으면 "" = 자동)로 등록한다.
//    같은 것 판정은 「분류 + 짧은 이름」 — 옛 이름(「카드 스킨 · 골드」) · 옮긴 이름(「골드」 + 카드 테두리) 어느 쪽으로 있어도 이미 있는 것으로 친다.
//    이름만 같고 분류가 다른 아이템(「골드」 역할 등)은 다른 것이다
const presetKeyOf = (doc) => `${resolveCategory(doc)}|${shortNameOf(doc?.name)}`;
// 이름 후보 — 추천 이름 · 옛 이름(presetNamesOf) · 짧은 이름. 그 이름의 아이템을 읽어 분류까지 맞춰 본다
const candidatesOf = (name) => [...new Set([...presetNamesOf(name), shortNameOf(name)])];
const HAVE_SELECT = { name: 1, type: 1, category: 1, effects: 1 };
// 등록 본문 → 저장 이름 · 분류(머리말이 없는 추천은 그대로)
const splitPreset = (body) => {
  const auto = autoCategoryOf({ type: body.type, effects: body.effects?.list });
  const legacy = legacyCategoryOf(body.name, auto);
  return legacy ? { ...body, name: shortNameOf(body.name), category: legacy === auto ? "" : legacy } : body;
};

// ── [조회] 추천 목록 + 이미 있는지(이름 기준) + 아이콘 교체 대상 ──
export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const [have, swaps] = await Promise.all([
      catalogFind(Item, { name: { $in: [...new Set(ITEM_PRESETS.flatMap((p) => candidatesOf(p.name)))] } }, { select: HAVE_SELECT }),
      catalogFind(Item, { name: { $in: PRESET_ICON_SWAPS.map((s) => s.name) } }, { select: { name: 1, icon: 1 } }),
    ]);
    const haveKeys = new Set(have.map(presetKeyOf));
    // 📌 categoryLabel · shortName — 창 목록도 상점 · 인벤토리처럼 분류(작게) + 짧은 이름으로(name 은 추천 이름 그대로)
    const data = ITEM_PRESETS.map((p) => ({
      key: p.key, name: p.name, categoryLabel: resolveCategory(p), shortName: shortNameOf(p.name),
      icon: p.icon, group: p.group, lines: presetLines(p), exists: haveKeys.has(presetKeyOf(p)),
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
    if (catalogWriteBlocked()) return liveLockedResponse();
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
    // 📌 그룹 — 목록에 itemGroup 이 있으면 그 그룹으로 등록한다(상점 관리 › 아이템 목록의 묶음, lib/items.js normalizeItemGroup).
    //    창의 묶음 제목(p.group — 도트 아이콘 묶음)과는 다른 값이다
    //    이름 머리말은 짧은 이름 + 분류로 나눠 등록한다(위 splitPreset)
    const entries = picked.map((p) => {
      const body = splitPreset({ ...presetPayload(p), group: p.itemGroup || "" });
      return { p, body, n: normalizeItemPayload(body) };
    });
    // 📌 같은 것(분류 + 짧은 이름 — 위 presetKeyOf)이 이미 있으면 아무것도 쓰지 않고 건너뛴다 — 한 번 읽어 두고(초안 모드는 초안을 덧씌운 보기) 없는 것만 만든다.
    //    자물쇠 안이라 두 번 눌러도 중복이 생기지 않는다. 이번에 만든 것도 바로 넣어 같은 것이 두 번 생기지 않게 한다.
    //    created · skipped 는 추천 이름(「카드 테두리 · 골드」 — 짧은 이름만으로는 무엇인지 모른다)
    const wanted = [...new Set(entries.filter((e) => e.n.ok).flatMap((e) => candidatesOf(e.p.name)))];
    const have = new Set(
      wanted.length ? (await catalogFind(Item, { name: { $in: wanted } }, { select: HAVE_SELECT })).map(presetKeyOf) : []
    );
    // 순서 — 지금 맨 뒤 다음부터 하나씩(../route.js 새 등록과 같은 999 상한). 초안 모드는 초안 · 실사이트를 합친 목록의 맨 뒤
    let next = await nextSortOrder(Item);
    for (const { p, body, n } of entries) {
      if (!n.ok) { skipped.push(p.name); continue; }
      const { name, ...rest } = n.data;
      const key = presetKeyOf(p);
      if (have.has(key)) { skipped.push(p.name); continue; }
      const ef = body.effects;
      await catalogCreate(Item, {
        ...rest,
        name,
        chatBuffXp: buffInt(ef.chatBuffXp), voiceBuffXp: buffInt(ef.voiceBuffXp), attendBuffXp: buffInt(ef.attendBuffXp),
        effects: normalizeEffects(ef.list),
        sortOrder: Math.min(999, next),
        createdAt: new Date(),
      });
      have.add(key);
      created.push(p.name);
      next++;
    }

    // 기존 아이템 아이콘 — 이름이 맞는 것의 icon 만 바꾼다. 그 아이템을 쓰는 상품의 표기 스냅샷(icon)도 같이 맞춘다(../route.js 수정과 같은 규칙)
    //    초안 모드는 아이템 · 연결 상품 모두 초안으로 간다(실사이트 문서를 처음 고치면 초안으로 복사)
    let iconsUpdated = 0;
    if (replaceIcons) {
      for (const s of PRESET_ICON_SWAPS) {
        const rows = await catalogFind(Item, { name: s.name, icon: { $ne: s.icon } }, { select: { _id: 1 } });
        if (rows.length === 0) continue;
        const ids = rows.map((r) => r._id);
        const W = await forWrite(Item, { _id: { $in: ids } });
        const u = await W.updateMany({ _id: { $in: ids }, icon: { $ne: s.icon } }, { $set: { icon: s.icon } });
        iconsUpdated += u.modifiedCount || 0;
        const linked = { itemId: { $in: ids.map(String) } };
        const S = await forWrite(ShopItem, linked);
        await S.updateMany(linked, { $set: { icon: s.icon } });
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
