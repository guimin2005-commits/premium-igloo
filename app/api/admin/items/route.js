export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import mongoose from "mongoose";
import { normalizeItemPayload, itemCascadeSet, normalizeItemGroup, copyNameOf } from "@/lib/items";
import { normalizeEffects, hasConsumable, effectDisplayOf, autoEffectLinesOf, autoScopeOf, normalizeEffectText, normalizeScope } from "@/lib/itemEffects";
import { channelNamesFor } from "@/lib/channelNames";
import { unitThingSet } from "@/lib/unitSale";
import { goedamTicketInfo } from "@/lib/goedam";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import Setting from "@/models/Setting";
import {
  catalogWriteBlocked, liveLockedResponse, catalogFind, catalogFindById, catalogCount,
  forWrite, catalogCreate, catalogDelete, nextSortOrder, stripDraft, passUsageOf,
} from "@/lib/catalogDraft";
import {
  normalizeOrder, sameOrder, changesOf, groupList, groupsInOrder,
  moveUnit, moveInGroup, moveToGroup, assignGroup, appendItem,
  nestParents, orderParentBlocks, autoSortOrder, parentList, orderGroupsNested, itemUnitKey,
} from "@/lib/itemOrder";
import { ITEM_TYPES } from "@/lib/items";
import { GROUPS_KEY, loadGroupMeta } from "@/lib/itemGroupsMeta";
import { VOICE_TIERS } from "@/lib/voiceTiers";
import { categoryFieldsOf } from "@/lib/itemCategory";

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

// 📌 분류(2026-10-17 — lib/itemCategory.js) — 응답 행마다 category(저장 칸 그대로 · "" = 자동) · categoryLabel(보일 분류) · categoryAuto(자동이면 보일 분류) · shortName(보일 이름).
//    관리 폼은 category 만 돌려보낸다(categoryLabel 을 저장 칸으로 쓰지 않게). 효과 모양(배열 · { list })은 둘 다 읽는다 — attachEffects 앞뒤 어디서 불러도 같다
const attachCategory = (doc) => Object.assign(doc, categoryFieldsOf(doc));

// 📌 효과 문구 · 적용 범위(2026-10-18 — lib/itemEffects effectDisplayOf) — 응답 행마다
//    effectText(저장 칸 그대로 · [] = 자동) · scope(저장 칸 그대로 · [] = 자동) — 관리 폼은 이 두 칸만 돌려보낸다
//    effectLines(보일 효과 줄 — 직접 쓴 문구 > 자동, 꾸미기 문장 없음) · effectAuto(자동이면 보일 줄 — 「직접 쓰기」가 이 줄로 채워 연다) · effectCustom(직접 쓴 문구인가)
//    isCosmetic · scopeLabel(보일 적용 범위 글자, 꾸미기가 아니면 "") · scopeAuto(자동 적용 범위 키)
//    attachEffects 뒤에 부른다(효과 모양 { list }도 읽는다). nameOf — 채널 하나만 지정한 효과의 「#이름」(namesFor)
const attachDisplay = (doc, nameOf) => {
  doc.effectText = normalizeEffectText(doc.effectText);
  doc.scope = normalizeScope(doc.scope);
  const d = effectDisplayOf(doc, nameOf);
  return Object.assign(doc, {
    effectLines: d.effectLines, effectAuto: autoEffectLinesOf(doc, nameOf), effectCustom: d.effectCustom,
    isCosmetic: d.isCosmetic, scopeLabel: d.scopeLabel, scopeAuto: autoScopeOf(doc),
  });
};
// 채널 이름 — 채널 하나만 지정한 효과가 있을 때만 읽는다(lib/channelNames — 10분 캐시). 못 읽으면 이름 없이(「채널 1곳」)
const namesFor = async (docs) => {
  const names = await channelNamesFor(docs.map((d) => (Array.isArray(d?.effects) ? d.effects : d?.effects?.list))).catch(() => new Map());
  return (cid) => names.get(String(cid));
};

// 본문 effects → 저장할 칸. 기프트카드는 항상 비운다.
//    본문에 effects 객체가 없으면 null — 수정은 기존 효과를 그대로 두고(표시 토글 등), 새 등록은 스키마 기본값(0 / [])
function effectFields(type, raw) {
  if (type === "physical") return { chatBuffXp: 0, voiceBuffXp: 0, attendBuffXp: 0, effects: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { chatBuffXp: buffInt(raw.chatBuffXp), voiceBuffXp: buffInt(raw.voiceBuffXp), attendBuffXp: buffInt(raw.attendBuffXp), effects: normalizeEffects(raw.list) };
}

// 📌 시즌 패스 티어 보상이 이 아이템을 몇 번 쓰는지(삭제 409 · 목록 표시)는 lib/catalogDraft.js passUsageOf — 패스는 초안 밖이라 늘 실사이트,
//    초안 반영이 아이템을 지우기 전 다시 확인하는 것과 같은 함수

// 📌 상품 초안(lib/catalogDraft.js) — 읽기는 catalogFind*(초안 모드면 초안을 덧씌운 보기), 쓰기는 forWrite · catalogCreate · catalogDelete.
//    실사이트 모드는 모두 지금의 직접 호출과 같다. 실사이트(Vercel) 관리 화면의 쓰기는 liveLockedResponse(403)
//    초안 모드의 쓰기 모델은 삭제 예정 초안(목록에서 빠진 아이템)을 건드리지 않는다
const writable = (W, filter) => (W === Item ? filter : { ...filter, _draftOp: { $ne: "delete" } });

// 📌 아이템 순서 · 그룹 — 순서는 하나(Item.sortOrder → createdAt): 관리 목록 = 인벤토리 · 상점 순서(2026-10-11 운영자 — 예전엔 관리 목록만
//    그룹을 저장된 차례로 위에 모아 그려 실제 순서와 달랐다). 같은 그룹 아이템은 늘 붙어 있다(덩어리 — 규칙 · 계산은 lib/itemOrder.js).
//    순서를 바꾸는 요청은 모두 [지금 순서 읽기 → lib/itemOrder 로 새 순서 → 바뀐 sortOrder · group 만 bulkWrite] 한 번에 한다.
//    그룹 목록(Setting "itemGroups" = [{ name }])은 아이템이 든 그룹(덩어리 차례) 뒤에 빈 그룹 — 빈 그룹을 기억하는 자리라 바뀔 때마다 같이 맞춘다.
//    그룹 이름 자체는 아이템 문서의 group 칸이 원천
//    📌 상위 그룹(그룹의 그룹 — 2026-10-11)도 같은 설정에 — 그룹 줄 { name, parent? } 뒤에 상위 줄 { name, kind: "parent" }(차례 = 상위 차례).
//       같은 상위의 그룹 덩어리는 늘 이어져 있다(lib/itemOrder.js nestParents — 순서를 쓰기 전에 늘 한 번 거친다). 상위는 관리 목록 정리용(유저 화면엔 없음)
const GROUPS_MAX = 100;
const PARENTS_MAX = 30;
// 그룹 설정 저장 — 그룹 차례(names) + 상위(바꿀 때만 next.parents · next.parentOf, 아니면 저장된 것). 저장된 것과 같으면 쓰지 않는다
//    (초안 모드는 draft_settings 의 itemGroups — 같은 반영으로 실사이트에 간다). 상위는 아직 있는 그룹 · 있는 상위만 남긴다.
//    next.list(쓴 순서)를 주면 상위 차례를 그 목록에서 다시 센다(lib/itemOrder.js parentList — 그룹 차례처럼 목록 덩어리 차례가 곧 상위 차례).
//    아이템 든 그룹은 자르지 않는다(2026-10-11 검토 — 100개를 넘긴 그룹의 상위 연결이 빠졌다). 개수 제한은 빈 그룹 만들기(create)에서만.
//    돌려주는 것 { groups, parents, parentOf } = 응답에 그대로 싣는 값
const syncGroups = async (names, meta, next = {}) => {
  const groups = names.slice();
  const pOf = next.parentOf ?? meta.parentOf;
  const base = next.parents ?? meta.parents;
  const parents = (next.list ? parentList(next.list, pOf, base) : base).slice(0, PARENTS_MAX);
  const value = [
    ...groups.map((name) => (pOf[name] && parents.includes(pOf[name]) ? { name, parent: pOf[name] } : { name })),
    ...parents.map((name) => ({ name, kind: "parent" })),
  ];
  if (JSON.stringify(value) !== JSON.stringify(meta.value)) {
    const W = await forWrite(Setting, { key: GROUPS_KEY });
    await W.updateOne({ key: GROUPS_KEY }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
  }
  return { groups, parents, parentOf: Object.fromEntries(Object.entries(pOf).filter(([g, p]) => parents.includes(p) && groups.includes(g))) };
};
// 응답에 싣는 상위(쓰지 않고 보기만 — 목록 GET) — parents(목록 덩어리 차례) · parentOf(그룹 → 상위)
const parentsOut = (meta, list) => {
  const parents = list ? parentList(list, meta.parentOf, meta.parents) : meta.parents;
  return { parents, parentOf: Object.fromEntries(Object.entries(meta.parentOf).filter(([, p]) => parents.includes(p))) };
};
// 지금 순서 — 목록 GET · 인벤토리와 같은 정렬(같은 값이면 _id 로 늘 같은 차례). 계산에 쓰는 칸만
const orderRowOf = (r) => ({ id: String(r._id), group: typeof r.group === "string" ? r.group : "", sortOrder: r.sortOrder });
const ORDER_SORT = { sortOrder: 1, createdAt: 1, _id: 1 };
const loadOrder = async () =>
  (await catalogFind(Item, {}, { select: { group: 1, sortOrder: 1, createdAt: 1 }, sort: ORDER_SORT })).map(orderRowOf);
// 바뀐 것만 쓴다(sortOrder = 새 자리, 그룹이 바뀐 아이템은 group 도 같은 쓰기에) — 초안 모드는 바뀐 아이템만 초안이 된다.
//    쓰기 전에 상위 규칙(같은 상위의 그룹 덩어리는 이어진다)을 맞춘다 — 돌려주는 것이 실제로 쓴 순서(응답 order 는 이것으로)
//    pin: 방금 끌어 옮긴 그룹(상위 덩어리는 형제 쪽에 — lib/itemOrder.js nestParents)
const writeOrder = async (before, next, parentOf, pin = "") => {
  const fin = nestParents(next, parentOf, pin);
  const ch = changesOf(before, fin);
  if (ch.length) {
    const W = await forWrite(Item, { _id: { $in: ch.map((c) => c.id) } });
    await W.bulkWrite(ch.map((c) => ({ updateOne: { filter: { _id: c.id }, update: { $set: c.set } } })), { ordered: false });
  }
  return fin;
};
const idsOf = (list) => list.map((r) => r.id);
// 그룹 목록 새 값 — 아이템 든 그룹(새 덩어리 차례) + 빈 그룹(저장 차례 → 이번에 비게 된 그룹)
const groupsAfter = (before, next, saved) => groupList(next, [...saved, ...groupsInOrder(before)]);

// 저장(POST) 뒤 자리 — 새 아이템은 맨 뒤(그룹이 있으면 그 덩어리 끝), 그룹을 바꾼 아이템은 새 그룹 덩어리 끝(빼면 옛 덩어리 바로 뒤).
//    prevGroup: 수정 전 그룹(그룹을 안 보냈으면 undefined). 그 밖의 저장도 규칙이 깨져 있으면 맞춘다(보낸 sortOrder 등)
async function placeSaved(id, { created, prevGroup }) {
  const [list, meta] = await Promise.all([loadOrder(), loadGroupMeta()]);
  const cur = list.find((r) => r.id === id);
  let next;
  if (created) next = appendItem(list, id);
  else if (cur && prevGroup !== undefined && prevGroup !== cur.group) {
    // 그룹은 이미 저장됐다 — 옛 그룹 자리에서 옮긴 것으로 계산하고, 쓰기는 지금 값(list)과 비교한다
    next = assignGroup(list.map((r) => (r.id === id ? { ...r, group: prevGroup } : r)), [id], cur.group);
  } else next = normalizeOrder(list);
  const fin = await writeOrder(list, next, meta.parentOf);
  await syncGroups(groupList(fin, [...meta.names, ...(prevGroup ? [prevGroup] : [])]), meta, { list: fin });
}

// 📌 자동 정렬의 등급 차례 — 등급 아이템(등급 아바타 테두리 · 등급 카드 스킨 rank_<등급>)이면 VOICE_TIERS 차례(0 = 아이언 …), 아니면 -1.
//    효과에 등급 키가 없으면 이름의 등급 낱말(「아바타 테두리 · 브론즈」 · 「골드 등급」 — 앞뒤가 띄어쓰기 · 가운뎃점 · 괄호인 것만)로 본다.
//    긴 이름부터 본다(그랜드마스터 ⊃ 마스터). 자동 정렬은 같은 그룹 안에서만 이 차례로 놓는다
const TIER_WORDS = VOICE_TIERS.flatMap((t, i) => [[t.name, i], [t.en, i], ...(t.key === "diamond" ? [["다이아", i]] : [])])
  .sort((a, b) => b[0].length - a[0].length);
const TIER_EDGE = "[\\s·:/()\\[\\]_-]";
const TIER_RE = TIER_WORDS.map(([w, i]) => [new RegExp(`(^|${TIER_EDGE})${w}($|${TIER_EDGE}|등급)`, "i"), i]);
//    꾸미기 키가 등급이 아닌 것(골드 카드 스킨 · 할로윈 테두리 등)은 이름에 등급 낱말이 있어도 등급 아이템이 아니다
const tierRankOf = (doc) => {
  let cosmetic = false;
  for (const e of Array.isArray(doc?.effects) ? doc.effects : []) {
    const skin = String(e?.skin || "");
    const v = e?.on === "avatarFrame" ? String(e.frame || "") : e?.on === "cardSkin" ? (skin.startsWith("rank_") ? skin.slice(5) : "") : e?.on === "cardScene" ? "" : null; // 카드 배경은 등급 아이템이 아니다
    if (v === null) continue;
    cosmetic = true;
    const i = v ? VOICE_TIERS.findIndex((t) => t.key === v) : -1;
    if (i >= 0) return i;
  }
  if (cosmetic) return -1;
  const name = String(doc?.name || "");
  for (const [re, i] of TIER_RE) if (re.test(name)) return i;
  return -1;
};

// 📌 아이템 등록 CRUD — 관리자 전용. 인벤토리 / 상점 상품 / 시즌 패스 보상 표기의 원천.

// ── [조회] 전체 목록 — ?withUsage=1 이면 이 아이템을 쓰는 상품 수를 함께 준다 ──
export async function GET(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const withUsage = params.get("withUsage") === "1";
    // ?groups=1 — 그룹 목록(덩어리 차례 · 빈 그룹 포함)도 함께 준다(상점 관리)
    const withGroups = params.get("groups") === "1";
    // 📌 초안 모드는 초안을 덧씌운 목록 — 초안 행에 _draft("new" | "edit"). 상품은 한 번 읽어 연결 · 사용 수를 함께 센다
    const [loaded, shops, ticket] = await Promise.all([
      catalogFind(Item, {}, { sort: ORDER_SORT, mark: true }),
      catalogFind(ShopItem, {}, { select: { type: 1, roleId: 1, itemId: 1, unitSale: 1, durations: 1, bundle: 1 } }),
      goedamTicketInfo().catch(() => ({ id: "", closesAt: null })),
    ]);
    // 아이템을 가리키는 상품(itemId 가 "" 가 아닌 것 — 예전 { itemId: { $ne: "" } } 조회와 같은 범위. 세트는 itemId 가 "" 라 빠진다)
    const linkedShops = shops.filter((s) => s.itemId !== "");
    // 📌 여러 개 지급할 수 있는 아이템인가(수동 지급의 수량 칸) — 수동 지급 API(app/api/admin/items/grant POST)와 같은 판정:
    //    unitThingSet(이 아이템을 가리키는 상품들, [아이템]).has("i:<id>") — 1개 단위로 파는 상품이 가리키거나 역할 없는 소모형.
    //    인벤토리 ×N 묶음(lib/unitSale.js)과 같은 키. 효과 모양을 바꾸기 전(attachEffects 앞)에 본다
    //    📌 괴담회 추첨권 아이템도 늘 ×N(1장 = Purchase 1건 — lib/inventory.js · lib/goedam.js 와 같다). ticketUntil = 추첨 마감(ISO — 관리 미리보기의 만료 줄)
    let rows = loaded;
    const units = unitThingSet(linkedShops, rows);
    if (ticket.id) units.add(`i:${ticket.id}`);

    // 효과 — 아이템 문서에 든 값을 화면 모양(effects 객체)으로 바꿔 붙인다
    for (const r of rows) {
      r.stackable = units.has(`i:${r._id}`);
      if (ticket.id && ticket.closesAt && String(r._id) === ticket.id) r.ticketUntil = ticket.closesAt.toISOString();
      // 그룹 — 칸이 생기기 전 문서는 비어 있다("" = 묶지 않음)
      r.group = typeof r.group === "string" ? r.group : "";
      attachCategory(attachEffects(r));
    }
    // 효과 문구 · 적용 범위 — 보일 줄 · 글자(위 attachDisplay)
    const nameOf = await namesFor(rows);
    for (const r of rows) attachDisplay(r, nameOf);

    if (withUsage) {
      // 연결 상품 수(itemId) + 세트 구성(bundle.itemId)으로 쓰는 것도 '쓰는 상품'으로 센다(삭제 확인과 같은 기준) — 예전 집계 두 개와 같은 셈
      const countOf = new Map();
      const add = (id) => countOf.set(String(id), (countOf.get(String(id)) || 0) + 1);
      for (const s of linkedShops) add(s.itemId);
      for (const s of shops) {
        if (s.type !== "bundle" || !Array.isArray(s.bundle)) continue;
        for (const c of s.bundle) add(c?.itemId);
      }
      const passOf = await passUsageOf();
      for (const r of rows) {
        r.usage = countOf.get(String(r._id)) || 0;
        r.passUsage = passOf.get(String(r._id)) || 0;
      }
    }
    let groups;
    let parentInfo;
    if (withGroups) {
      // 📌 같은 그룹이 떨어져 있으면(추천 아이템 등록 · 가져오기처럼 맨 뒤에 붙인 길) 그 자리에서 맞춰 저장한다 —
      //    관리 목록(그룹 첫 아이템 자리에 덩어리)과 실제 순서(인벤토리)가 어긋난 채 남지 않게. 못 쓰면 읽은 순서 그대로 준다
      //    실사이트(Vercel) 관리 화면은 아이템 쓰기가 막혀 있어 맞추지 않는다(읽은 순서 그대로 — 고치는 곳은 localhost)
      //    같은 상위 그룹의 덩어리가 떨어져 있어도 같이 맞춘다(writeOrder → nestParents)
      const meta = await loadGroupMeta();
      const before = rows.map(orderRowOf);
      const next = nestParents(normalizeOrder(before), meta.parentOf);
      if (!catalogWriteBlocked() && !sameOrder(before, next)) {
        try {
          await writeOrder(before, next, meta.parentOf);
          const at = new Map(next.map((r, i) => [r.id, i]));
          rows = [...rows].sort((a, b) => (at.get(String(a._id)) ?? 0) - (at.get(String(b._id)) ?? 0));
          rows.forEach((r, i) => { r.sortOrder = i; });
          await syncGroups(groupList(next, meta.names), meta, { list: next });
        } catch (e) {
          console.error("아이템 순서 맞추기 오류:", e);
        }
      }
      groups = groupList(rows.map(orderRowOf), meta.names);
      parentInfo = parentsOut(meta, rows.map(orderRowOf));
    }
    return NextResponse.json({ success: true, data: rows, ...(groups ? { groups, ...parentInfo } : {}) });
  } catch (e) {
    console.error("아이템 목록 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [등록·수정] { id?, ...fields } upsert ──
//    수정 시 이 아이템을 참조하는 상품(ShopItem.itemId)의 스냅샷도 함께 갱신한다.
export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));
    const n = normalizeItemPayload(b);
    if (!n.ok) return NextResponse.json({ success: false, message: n.error }, { status: 400 });

    // 효과도 같은 저장 한 번에 담는다 — 따로 쓰다 절반만 저장되는 경우가 없게
    const ef = effectFields(n.data.type, b?.effects);
    const data = ef ? { ...n.data, ...ef } : n.data;

    const id = String(b?.id || "").trim();
    // 📌 소모형 효과(연속 출석 보호막 등)가 있는 아이템에는 역할을 연결하지 않는다 — 쓴 뒤에도 역할이 남아
    //    역할 기준 보유(lib/ownedItems.js (B))로 다시 '보유'가 되어 소모가 되살아난다. 효과를 안 보냈으면(표시 토글) 저장된 효과로 본다
    if (data.roleId) {
      const list = ef ? ef.effects : id && mongoose.isValidObjectId(id) ? (await catalogFindById(Item, id, { select: { effects: 1 } }))?.effects : [];
      if (hasConsumable({ effects: list })) {
        return NextResponse.json({ success: false, message: "소모품에는 역할을 연결할 수 없습니다." }, { status: 400 });
      }
      // 📌 1개 단위로 파는 상품이 이 아이템을 가리키면 역할을 붙이지 않는다 — 여러 개를 가진 사람에게 역할 하나만 붙어
      //    쓰고 나도 역할이 남는다(소모품과 같은 이유). 상품의 판매 방식을 먼저 바꾸게 한다(lib/unitSale.js)
      //    (초안 모드는 초안 상품까지 함께 본다 — 아래 세트도 같다)
      if (id && mongoose.isValidObjectId(id) && (await catalogCount(ShopItem, { itemId: id, unitSale: true })) > 0) {
        return NextResponse.json({ success: false, message: "1개 단위로 파는 상품이 있어 역할을 연결할 수 없습니다." }, { status: 400 });
      }
      // 📌 세트(lib/bundle.js)에 2개 이상으로 든 아이템도 같은 이유로 역할을 붙이지 않는다(한 결제가 역할 아이템을 여러 건 준다)
      if (id && mongoose.isValidObjectId(id) && (await catalogCount(ShopItem, { type: "bundle", bundle: { $elemMatch: { itemId: id, qty: { $gt: 1 } } } })) > 0) {
        return NextResponse.json({ success: false, message: "여러 개를 넣은 세트가 있어 역할을 연결할 수 없습니다." }, { status: 400 });
      }
    }
    let doc;
    // 수정 전 그룹 — 그룹을 바꾸면 새 그룹 덩어리 끝으로 옮긴다(아래 placeSaved). 그룹을 안 보냈으면 undefined
    let prevGroup;
    if (id) {
      if (data.group !== undefined && mongoose.isValidObjectId(id)) {
        const was = await catalogFindById(Item, id, { select: { group: 1 } });
        if (was) prevGroup = typeof was.group === "string" ? was.group : "";
      }
      // 초안 모드: 실사이트 아이템이면 초안으로 복사한 뒤 초안을 고친다(삭제 예정 초안은 못 찾음 = 404)
      const W = await forWrite(Item, { _id: id });
      doc = await W.findOneAndUpdate(writable(W, { _id: id }), { $set: data }, { new: true, runValidators: true }).lean();
      if (!doc) return NextResponse.json({ success: false, message: "아이템을 찾을 수 없습니다." }, { status: 404 });
      doc = stripDraft(doc);
      // 상품이 들고 있는 표기 스냅샷을 새 값으로 맞춘다 — 상점 카드·인벤토리가 함께 바뀐다.
      //    기프트카드가 되면 기간제 가격표는 비우고, 1개 단위가 안 되는 유형으로 바뀌면 1개 단위도 끈다(lib/items.js itemCascadeSet — 상품 저장 API 와 같은 규칙).
      //    초안 모드는 연결 상품도 초안으로 간다(반영 때 실사이트 아이템 값으로 다시 맞춘다)
      const S = await forWrite(ShopItem, { itemId: id });
      await S.updateMany({ itemId: id }, { $set: itemCascadeSet(doc) });
    } else {
      // 순서를 안 보냈으면 맨 뒤에 붙인다 — 순서는 상점 관리 목록에서 끌어서 정한다(아래 PATCH).
      //    그룹이 있으면 저장 뒤 그 덩어리 끝으로 옮긴다(placeSaved). 초안 모드는 초안 · 실사이트를 합친 목록의 맨 뒤
      if (data.sortOrder == null) data.sortOrder = await nextSortOrder(Item, 999);
      doc = stripDraft(await catalogCreate(Item, data));
    }
    // 자리 · 그룹 목록 — 실패해도 아이템 저장은 된 것이라 막지 않는다(다음 목록 조회가 덩어리를 다시 맞춘다)
    await placeSaved(String(doc._id), { created: !id, prevGroup }).catch((e) => console.error("아이템 순서 · 그룹 목록 저장 오류:", e));
    const out = attachCategory(attachEffects(doc));
    return NextResponse.json({ success: true, data: attachDisplay(out, await namesFor([out])) });
  } catch (e) {
    console.error("아이템 저장 오류:", e);
    return NextResponse.json({ success: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── 순서 · 그룹 바꾸기(PATCH) — 모두 지금 순서를 읽어 lib/itemOrder.js 로 새 순서를 내고, 바뀐 sortOrder · group 만 한 번에 쓴다.
//    응답: { success, order: [아이템 id, ...] (새 순서 전체), groups: [그룹 이름, ...] (덩어리 차례 + 빈 그룹) } — 화면은 이 순서로 맞춘다
//    기준 아이템 · 그룹을 못 찾으면(다른 창에서 바뀐 목록) 409 — 화면은 다시 불러온다
// ── [끌어 옮기기] { move: { unit: "g:<그룹>" | "i:<아이템 id>", after?: 단위 키, before?: 단위 키 } } — 그룹 머리줄(덩어리째) · 그룹 없는 아이템을 단위 사이로
//                 { move: { item: 아이템 id, after?: id, before?: id } } — 그룹 안에서만
//                 { move: { item: 아이템 id, group: "이름" | "", after?, before? } } — 그룹을 바꾸며 그 자리에(끌어서 넣기 · 빼기 · 옮기기, 2026-10-11)
//                   group 있음: 그 덩어리 안 — after · before = 그 그룹 아이템 id(둘 다 없으면 그 덩어리 끝 — 접힌 머리줄 위)
//                   group "":  그룹에서 빼 단위 사이로 — after · before = 단위 키(둘 다 없으면 옛 덩어리 바로 뒤). lib/itemOrder.js moveToGroup
//    after(그 바로 뒤)가 먼저, 없으면 before(그 바로 앞). 기준이 그룹 안 아이템이면 그 덩어리 앞 · 뒤(덩어리 안으로는 안 들어간다 — group 이 없는 두 모양)
// ── [그룹 지정] { ids: [아이템 id, ...], group: "이름" } — 고른 아이템을 한 번에 같은 그룹으로("" = 그룹에서 빼기) ──
//    새로 든 아이템은 그 그룹 덩어리 끝에(아이템이 없던 그룹이면 고른 것 중 맨 앞 자리에서), 뺀 아이템은 옛 덩어리 바로 뒤에.
//    그룹은 관리 화면 정리용이라 상품 스냅샷은 건드리지 않는다
// ── [그룹 관리] { groupOp, ... } — 상점 관리 › 아이템 › 그룹 관리 ──
//      create { name }       빈 그룹을 목록 끝에(순서 그대로)
//      rename { from, to }   그 그룹의 아이템을 모두 새 이름으로(순서 그대로 · 같은 이름이 이미 있으면 거절) — 상위도 따라간다
//      delete { name }       그 그룹의 아이템은 제자리에서 그룹 없음으로, 목록에서 뺀다
//      order  { names }      그룹 차례 — 덩어리들이 차지한 자리 안에서 덩어리를 바꿔 끼운다(그룹 없는 아이템은 제자리). 빈 그룹은 그 뒤 names 차례
//    상위 그룹(그룹의 그룹 — 2026-10-11) — 이름은 그룹 · 상위를 통틀어 겹치지 않는다
//      parentCreate { name }        새 상위(차례 끝, 든 그룹 없음)
//      parentRename { from, to }    이름만(든 그룹 · 순서 그대로)
//      parentDelete { name }        상위만 지운다 — 든 그룹은 제자리에서 상위 없음으로
//      parentOrder  { names }       상위 차례 — 상위 덩어리들이 차지한 자리 안에서 바꿔 끼운다(상위 없는 단위는 제자리)
//      setParent    { group, parent }  그 그룹을 그 상위로("" = 상위에서 빼기). 넣으면 그 상위 덩어리 끝으로 옮겨 붙는다(처음 드는 그룹이면 제자리)
//      autoSort     {}              자동 정렬 — 유형(역할 → 권한 → 아이템 → 꾸미기 → 기프트카드) → 상위 덩어리 → 상위 없는 그룹 → 그룹 없는 아이템,
//                                   그룹 안은 등급 아이템만 등급 차례(lib/itemOrder.js autoSortOrder · tierRankOf). 응답 moved = 자리가 바뀐 아이템 수
//    응답은 모두 { groups, parents, parentOf, order } — 화면은 이것으로 맞춘다
// ── [순서 저장(옛 모양)] { order: [아이템 id, ...] } — 그 차례 + 빠진 아이템은 뒤에 지금 차례로, 덩어리 규칙으로 맞춰 쓴다
// ── [일괄 편집] { batch: [{ id, set: { name?, description?, category?, rarity?, group?, visible?, type?, color?, icon? } }] } — 아래 batchOp
// ── [일괄 복제] { duplicate: [{ id, name?, description? }] } — 아래 duplicateOp
const MOVE_REF_MAX = 200;
const refOf = (v) => (typeof v === "string" && v && v.length <= MOVE_REF_MAX ? v : null);
const conflict = () => NextResponse.json({ success: false, message: "목록이 바뀌었습니다. 다시 불러온 뒤 옮겨 주세요." }, { status: 409 });

export async function PATCH(request) {
  let grouping = false;
  let failMsg = "";
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    const b = await request.json().catch(() => ({}));
    if (Array.isArray(b?.batch)) {
      failMsg = "일괄 저장 중 오류가 발생했습니다.";
      return await batchOp(b.batch);
    }
    if (Array.isArray(b?.duplicate)) {
      failMsg = "복제 중 오류가 발생했습니다.";
      return await duplicateOp(b.duplicate);
    }
    if (typeof b?.groupOp === "string") {
      grouping = true;
      return await groupOp(b);
    }
    if (b?.move && typeof b.move === "object" && !Array.isArray(b.move)) return await moveOp(b.move);
    grouping = !Array.isArray(b?.order) && typeof b?.group === "string";
    if (grouping) {
      const pick = [...new Set((Array.isArray(b?.ids) ? b.ids : []).map((v) => String(v || "")))].filter((v) => mongoose.isValidObjectId(v)).slice(0, 999);
      if (pick.length === 0) return NextResponse.json({ success: false, message: "옮길 아이템을 골라 주세요." }, { status: 400 });
      const group = normalizeItemGroup(b.group);
      await connectToDatabase();
      const [before, meta] = await Promise.all([loadOrder(), loadGroupMeta()]);
      const matched = pick.filter((id) => before.some((r) => r.id === id)).length;
      const next = await writeOrder(before, assignGroup(before, pick, group), meta.parentOf);
      const sync = await syncGroups(groupsAfter(before, next, meta.names), meta, { list: next });
      return NextResponse.json({ success: true, group, matched, order: idsOf(next), ...sync });
    }
    const ids = [...new Set((Array.isArray(b?.order) ? b.order : []).map((v) => String(v || "")))].filter((v) => mongoose.isValidObjectId(v)).slice(0, 999);
    if (ids.length === 0) return NextResponse.json({ success: false, message: "순서를 받지 못했습니다." }, { status: 400 });
    await connectToDatabase();
    const [before, meta] = await Promise.all([loadOrder(), loadGroupMeta()]);
    const byId = new Map(before.map((r) => [r.id, r]));
    const listed = ids.map((id) => byId.get(id)).filter(Boolean);
    const listedSet = new Set(listed);
    const next = await writeOrder(before, normalizeOrder([...listed, ...before.filter((r) => !listedSet.has(r))]), meta.parentOf);
    const sync = await syncGroups(groupsAfter(before, next, meta.names), meta, { list: next });
    return NextResponse.json({ success: true, order: idsOf(next), ...sync });
  } catch (e) {
    console.error("아이템 순서 · 그룹 저장 오류:", e);
    return NextResponse.json({ success: false, message: failMsg || (grouping ? "그룹을 저장하지 못했습니다." : "순서를 저장하지 못했습니다.") }, { status: 500 });
  }
}

// ── 일괄 편집(2026-10-17 상점 관리 › 아이템 여러 개 고르기) — PATCH 가 권한을 본 뒤 부른다 ──
//    { batch: [{ id, set }] } — 줄마다 지금 값에 set 을 덧씌워 POST 와 같은 정리(normalizeItemPayload)를 거친 뒤, set 이 건드린 칸만 쓴다
//    (유형을 바꾸면 그에 딸린 역할 · 시즌 뗌 · 기프트카드 효과 비움 · 역할 검사도 POST 와 같이). 정리 · 검사에 걸린 줄은 이유와 함께 skipped 로 돌려주고 나머지는 쓴다.
//    쓰기는 POST 와 같은 길 — forWrite(초안 모드면 초안) · 삭제 예정 초안은 못 고침 · 표기 칸(이름 · 설명 · 아이콘 · 색 · 유형)이 바뀌면 연결 상품 스냅샷도(itemCascadeSet).
//    그룹은 순서 규칙(같은 그룹은 붙은 덩어리)이 있어 그룹 지정({ ids, group })과 같은 계산으로 — 새 그룹 덩어리 끝에(빼면 옛 덩어리 바로 뒤)
//    응답: { success, updated, unchanged, skipped: [{ id, name, why }], data: [바뀐 아이템(화면 모양)], order?, groups?, parents?, parentOf? }
const BATCH_MAX = 500;
//    📌 description — 「설명 바꾸기」(고른 아이템 설명을 한 번에 — 같은 글을 줄마다 보내면 된다) · category — 「분류」("" = 자동, 2026-10-17 lib/itemCategory.js)
const BATCH_KEYS = ["name", "description", "category", "rarity", "group", "visible", "type", "color", "icon"];
// 연결 상품에 복사해 두는 표기 칸을 건드리는 키 — 바뀌면 연결 상품도 맞춘다(lib/items.js SNAPSHOT_FIELDS)
const CASCADE_KEYS = ["name", "description", "icon", "color", "type"];
// models/Item.js 기본값(비교용)
const ITEM_DEFAULTS = { description: "", icon: "", imageUrl: "", color: "", type: "item", roleId: "", roleName: "", detachOnSeason: false, visible: true, group: "", rarity: "", category: "", effectText: [], scope: [] };
const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function batchOp(list) {
  const bad = (message, status = 400) => NextResponse.json({ success: false, message }, { status });
  // 같은 아이템이 여러 번 오면 앞에서부터 합친다(뒤 값이 이긴다)
  const want = new Map();
  for (const raw of list.slice(0, BATCH_MAX)) {
    const id = String(raw?.id || "");
    const set = raw?.set && typeof raw.set === "object" && !Array.isArray(raw.set) ? raw.set : null;
    if (!mongoose.isValidObjectId(id) || !set) continue;
    const pick = {};
    for (const k of BATCH_KEYS) if (set[k] !== undefined) pick[k] = set[k];
    if (Object.keys(pick).length) want.set(id, { ...(want.get(id) || {}), ...pick });
  }
  if (!want.size) return bad("바꿀 아이템을 골라 주세요.");
  await connectToDatabase();
  const ids = [...want.keys()];
  const byId = new Map((await catalogFind(Item, { _id: { $in: ids } })).map((d) => [String(d._id), d]));

  const skipped = [];
  const plans = []; // { id, name, $set, cascade }
  const regroup = new Map(); // 새 그룹 이름 → [아이템 id]
  let unchanged = 0;
  for (const id of ids) {
    const doc = byId.get(id);
    const set = want.get(id);
    if (!doc) { skipped.push({ id, name: "", why: "아이템을 찾을 수 없습니다." }); continue; }
    // 칸이 생기기 전 문서는 스키마 기본값으로 본다(비어 있는 칸을 같은 값으로 다시 쓰지 않게)
    const cur = { ...ITEM_DEFAULTS, ...doc };
    const name = String(cur.name || "");
    // 지금 값 + 바꿀 값 → POST 와 같은 정리. 순서는 보내지 않는다(일괄 편집은 순서를 바꾸지 않는다 — 그룹만 아래에서)
    const n = normalizeItemPayload({ ...cur, ...set, sortOrder: undefined });
    if (!n.ok) { skipped.push({ id, name, why: n.error }); continue; }
    const d = n.data;
    const $set = {};
    const put = (k) => { if (!sameVal(d[k], cur[k])) $set[k] = d[k]; };
    for (const k of ["name", "description", "icon", "color", "visible", "rarity", "category"]) if (k in set) put(k);
    if ("type" in set) {
      for (const k of ["type", "roleId", "roleName", "detachOnSeason"]) put(k);
      // 기프트카드가 되면 효과를 비운다(POST effectFields 와 같다) — 직접 쓴 효과 문구 · 적용 범위도(lib/items.js normalizeItemPayload 가 [] 로 둔다)
      if (d.type === "physical") {
        for (const [k, v] of Object.entries(effectFields("physical"))) if (!sameVal(v, cur[k])) $set[k] = v;
        put("effectText");
        put("scope");
      }
    }
    // 📌 역할이 남는 유형으로 바꾸면 POST 와 같은 역할 검사 — 소모품은 여기서, 1개 단위 상품 · 2개 이상 든 세트는 아래에서 한 번에 센다
    const roleCheck = !!d.roleId && "type" in $set;
    if (roleCheck && hasConsumable({ effects: cur.effects })) { skipped.push({ id, name, why: "소모품에는 역할을 연결할 수 없습니다." }); continue; }
    let regrouped = false;
    if ("group" in set) {
      const g = normalizeItemGroup(set.group);
      if (g !== (typeof cur.group === "string" ? cur.group : "")) {
        const arr = regroup.get(g);
        if (arr) arr.push(id);
        else regroup.set(g, [id]);
        regrouped = true;
      }
    }
    if (Object.keys($set).length) plans.push({ id, name, $set, cascade: CASCADE_KEYS.some((k) => k in $set), roleCheck });
    else if (!regrouped) unchanged += 1;
  }

  // 역할 검사 나머지(POST 와 같은 문구) — 1개 단위로 파는 상품이 가리키거나 세트에 2개 이상 든 아이템. 초안 모드는 초안 상품까지 함께 본다
  const roleIds = plans.filter((p) => p.roleCheck).map((p) => p.id);
  const unitIds = new Set();
  const multiIds = new Set();
  if (roleIds.length) {
    const [units, bundles] = await Promise.all([
      catalogFind(ShopItem, { itemId: { $in: roleIds }, unitSale: true }, { select: { itemId: 1 } }),
      catalogFind(ShopItem, { type: "bundle", bundle: { $elemMatch: { itemId: { $in: roleIds }, qty: { $gt: 1 } } } }, { select: { bundle: 1 } }),
    ]);
    for (const s of units) unitIds.add(String(s.itemId || ""));
    for (const s of bundles) for (const c of Array.isArray(s.bundle) ? s.bundle : []) if (Number(c?.qty) > 1) multiIds.add(String(c?.itemId || ""));
  }
  const writes = [];
  for (const p of plans) {
    const why = !p.roleCheck ? ""
      : unitIds.has(p.id) ? "1개 단위로 파는 상품이 있어 역할을 연결할 수 없습니다."
      : multiIds.has(p.id) ? "여러 개를 넣은 세트가 있어 역할을 연결할 수 없습니다."
      : "";
    if (why) skipped.push({ id: p.id, name: p.name, why });
    else writes.push(p);
  }

  // 칸 쓰기 — 바뀌는 아이템만 초안으로 옮긴다(초안 모드). POST 수정과 같은 호출
  const done = new Set();
  const data = [];
  if (writes.length) {
    const W = await forWrite(Item, { _id: { $in: writes.map((p) => p.id) } });
    const cascaded = [];
    for (const p of writes) {
      const doc = await W.findOneAndUpdate(writable(W, { _id: p.id }), { $set: p.$set }, { new: true, runValidators: true }).lean();
      if (!doc) { skipped.push({ id: p.id, name: p.name, why: "아이템을 찾을 수 없습니다." }); continue; }
      const clean = stripDraft(doc);
      done.add(p.id);
      if (p.cascade) cascaded.push(clean);
      data.push(clean);
    }
    if (cascaded.length) {
      const S = await forWrite(ShopItem, { itemId: { $in: cascaded.map((x) => String(x._id)) } });
      for (const doc of cascaded) await S.updateMany({ itemId: String(doc._id) }, { $set: itemCascadeSet(doc) });
    }
  }

  // 그룹 — 그룹 지정과 같은 계산(새 그룹 덩어리 끝 · 빼면 옛 덩어리 바로 뒤)을 그룹마다 이어서, 바뀐 순서 · 그룹은 한 번에 쓴다
  let orderOut = {};
  const gone = new Set(skipped.map((s) => s.id));
  if (regroup.size) {
    const [before, meta] = await Promise.all([loadOrder(), loadGroupMeta()]);
    let next = before;
    for (const [g, gids] of regroup) {
      const ok = gids.filter((id) => !gone.has(id) && before.some((r) => r.id === id));
      if (!ok.length) continue;
      next = assignGroup(next, ok, g);
      for (const id of ok) done.add(id);
    }
    const fin = await writeOrder(before, next, meta.parentOf);
    const sync = await syncGroups(groupsAfter(before, fin, meta.names), meta, { list: fin });
    orderOut = { order: idsOf(fin), ...sync };
  }
  const shaped = data.map((d) => attachCategory(attachEffects(d)));
  const nameOf = shaped.length ? await namesFor(shaped) : () => undefined;
  return NextResponse.json({ success: true, updated: done.size, unchanged, skipped, data: shaped.map((d) => attachDisplay(d, nameOf)), ...orderOut });
}

// ── 일괄 복제 — PATCH 가 권한을 본 뒤 부른다 ──
//    { duplicate: [{ id, name?, description? }] } — 같은 값의 새 아이템(효과 · 그룹 · 희귀도 · 분류 · 그림 · 표시 그대로). name 이 없으면 원래 이름 + 「 (복사)」(lib/items.js copyNameOf)
//    정리 · 소모품 역할 검사는 POST 새 등록과 같다. 새 아이템은 원래 아이템 바로 뒤에(같은 그룹 덩어리 안 — 여러 개면 원래 차례대로 이어서)
//    응답: { success, created: [{ from, id, name }], skipped: [{ id, name, why }], order, groups, parents, parentOf }
const DUP_MAX = 100;
async function duplicateOp(list) {
  const bad = (message, status = 400) => NextResponse.json({ success: false, message }, { status });
  const want = [];
  for (const raw of list.slice(0, DUP_MAX)) {
    const id = String((typeof raw === "string" ? raw : raw?.id) || "");
    if (!mongoose.isValidObjectId(id)) continue;
    want.push({
      id,
      name: typeof raw?.name === "string" ? raw.name : null,
      description: typeof raw?.description === "string" ? raw.description : null,
    });
  }
  if (!want.length) return bad("복제할 아이템을 골라 주세요.");
  await connectToDatabase();
  const byId = new Map((await catalogFind(Item, { _id: { $in: [...new Set(want.map((w) => w.id))] } })).map((d) => [String(d._id), d]));
  const skipped = [];
  const made = [];
  for (const w of want) {
    const src = byId.get(w.id);
    if (!src) { skipped.push({ id: w.id, name: "", why: "아이템을 찾을 수 없습니다." }); continue; }
    const n = normalizeItemPayload({
      ...src,
      name: w.name ?? copyNameOf(src.name),
      description: w.description ?? src.description,
      group: typeof src.group === "string" ? src.group : "",
      rarity: src.rarity ?? "",
      category: src.category ?? "",
      sortOrder: undefined,
    });
    if (!n.ok) { skipped.push({ id: w.id, name: String(src.name || ""), why: n.error }); continue; }
    const ef = effectFields(n.data.type, { chatBuffXp: src.chatBuffXp, voiceBuffXp: src.voiceBuffXp, attendBuffXp: src.attendBuffXp, list: src.effects });
    const data = ef ? { ...n.data, ...ef } : n.data;
    if (data.roleId && hasConsumable({ effects: data.effects })) {
      skipped.push({ id: w.id, name: String(src.name || ""), why: "소모품에는 역할을 연결할 수 없습니다." });
      continue;
    }
    data.sortOrder = await nextSortOrder(Item, 999);
    const doc = stripDraft(await catalogCreate(Item, data));
    made.push({ from: w.id, id: String(doc._id), name: doc.name, group: data.group || "" });
  }
  if (!made.length) return NextResponse.json({ success: true, created: [], skipped });
  // 자리 — 원래 아이템 바로 뒤(같은 원본을 여러 번이면 앞 복제본 뒤). 기준을 못 찾으면 맨 뒤 그대로(다음 목록 조회가 덩어리를 맞춘다)
  const [before, meta] = await Promise.all([loadOrder(), loadGroupMeta()]);
  let cur = normalizeOrder(before);
  const lastOf = new Map();
  for (const m of made) {
    const anchor = lastOf.get(m.from) || m.from;
    const moved = m.group ? moveInGroup(cur, m.id, { after: anchor }) : moveUnit(cur, itemUnitKey(m.id), { after: itemUnitKey(anchor) });
    if (moved) { cur = moved; lastOf.set(m.from, m.id); }
  }
  const fin = await writeOrder(before, cur, meta.parentOf);
  const sync = await syncGroups(groupList(fin, meta.names), meta, { list: fin });
  return NextResponse.json({ success: true, created: made.map(({ from, id, name }) => ({ from, id, name })), skipped, order: idsOf(fin), ...sync });
}

// 끌어 옮기기 한 건 — PATCH 가 권한을 본 뒤 부른다
async function moveOp(m) {
  await connectToDatabase();
  const [before, meta] = await Promise.all([loadOrder(), loadGroupMeta()]);
  const to = { after: refOf(m.after), before: refOf(m.before) };
  const item = refOf(m.item);
  const unit = refOf(m.unit);
  // group 칸이 있으면 그룹을 바꾸며 옮기기(없는 칸 = 예전 두 모양 그대로)
  const group = typeof m.group === "string" ? normalizeItemGroup(m.group) : null;
  const moved = item && group !== null ? moveToGroup(before, item, group, to)
    : item ? moveInGroup(before, item, to)
    : unit ? moveUnit(before, unit, to)
    : null;
  if (!moved) return conflict();
  // 상위 덩어리 한가운데 · 다른 상위 사이에 놓은 그룹은 제 상위 덩어리로 돌아간다(같은 상위는 늘 이어짐 — 상위를 바꾸는 곳은 그룹 관리 창)
  const pin = unit && unit.startsWith("g:") ? normalizeItemGroup(unit.slice(2)) : "";
  const next = await writeOrder(before, moved, meta.parentOf, pin);
  const sync = await syncGroups(groupsAfter(before, next, meta.names), meta, { list: next });
  return NextResponse.json({ success: true, order: idsOf(next), ...sync, ...(group !== null ? { group } : {}) });
}

// 등급 · 유형까지 읽은 지금 순서(자동 정렬용) — loadOrder 와 같은 정렬
const loadSortRows = async () =>
  (await catalogFind(Item, {}, { select: { group: 1, sortOrder: 1, createdAt: 1, type: 1, name: 1, effects: 1 }, sort: ORDER_SORT }))
    .map((r) => ({ ...orderRowOf(r), type: typeof r.type === "string" ? r.type : "", rank: tierRankOf(r) }));

// 그룹 관리 한 건 — PATCH 가 권한을 본 뒤 부른다
async function groupOp(b) {
  const bad = (message, status = 400) => NextResponse.json({ success: false, message }, { status });
  await connectToDatabase();
  const [list, meta] = await Promise.all([loadOrder(), loadGroupMeta()]);
  const cur = groupList(list, meta.names);
  const order = idsOf(list);
  const op = b.groupOp;
  const taken = (n) => cur.includes(n) || meta.parents.includes(n);
  // 응답 — syncGroups 가 돌려준 { groups, parents, parentOf } 그대로 + 순서(바꾼 것이면 그 순서)
  const out = (sync, extra = {}) => NextResponse.json({ success: true, order, ...sync, ...extra });
  // 상위 표 고친 사본(원본 meta 는 비교용으로 둔다)
  const pCopy = () => Object.assign(Object.create(null), meta.parentOf);
  if (op === "create") {
    const name = normalizeItemGroup(b.name);
    if (!name) return bad("그룹 이름을 입력해 주세요.");
    if (taken(name)) return bad(cur.includes(name) ? "이미 있는 그룹입니다." : "같은 이름의 상위 그룹이 있습니다.", 409);
    if (cur.length >= GROUPS_MAX) return bad(`그룹은 최대 ${GROUPS_MAX}개까지 만들 수 있습니다.`);
    return out(await syncGroups([...cur, name], meta, { list }));
  }
  if (op === "rename") {
    const from = normalizeItemGroup(b.from);
    const to = normalizeItemGroup(b.to);
    if (!from || !cur.includes(from)) return bad("그룹을 찾을 수 없습니다.", 404);
    if (!to) return bad("그룹 이름을 입력해 주세요.");
    if (to === from) return out(await syncGroups(cur, meta, { list }), { matched: 0 });
    if (taken(to)) return bad(cur.includes(to) ? "같은 이름의 그룹이 있습니다." : "같은 이름의 상위 그룹이 있습니다.", 409);
    const W = await forWrite(Item, { group: from });
    const r = await W.updateMany(writable(W, { group: from }), { $set: { group: to } });
    const parentOf = pCopy();
    if (parentOf[from]) { parentOf[to] = parentOf[from]; delete parentOf[from]; }
    const renamed = list.map((x) => (x.group === from ? { ...x, group: to } : x));
    return out(await syncGroups(cur.map((g) => (g === from ? to : g)), meta, { parentOf, list: renamed }), { matched: r.matchedCount || 0 });
  }
  if (op === "delete") {
    const name = normalizeItemGroup(b.name);
    if (!name || !cur.includes(name)) return bad("그룹을 찾을 수 없습니다.", 404);
    const W = await forWrite(Item, { group: name });
    const r = await W.updateMany(writable(W, { group: name }), { $set: { group: "" } });
    const parentOf = pCopy();
    delete parentOf[name];
    const cleared = list.map((x) => (x.group === name ? { ...x, group: "" } : x));
    return out(await syncGroups(cur.filter((g) => g !== name), meta, { parentOf, list: cleared }), { matched: r.matchedCount || 0 });
  }
  if (op === "order") {
    const want = [...new Set((Array.isArray(b.names) ? b.names : []).map(normalizeItemGroup))].filter((g) => cur.includes(g));
    const names = [...want, ...cur.filter((g) => !want.includes(g))];
    // 맨 윗단위(상위 덩어리 · 상위 없는 그룹)끼리만 바꿔 끼우고 상위 안 그룹 차례도 names 대로 — 그룹 없는 아이템은 제자리(lib/itemOrder.js orderGroupsNested).
    //    다른 상위 사이로 끈 그룹은 제 상위 안 차례만 바뀐다
    const next = await writeOrder(list, orderGroupsNested(list, names, meta.parentOf), meta.parentOf);
    // 아이템 든 그룹은 새 덩어리 차례, 빈 그룹은 그 뒤 names 차례
    return out(await syncGroups(groupList(next, names), meta, { list: next }), { order: idsOf(next) });
  }
  if (op === "parentCreate") {
    const name = normalizeItemGroup(b.name);
    if (!name) return bad("상위 그룹 이름을 입력해 주세요.");
    if (taken(name)) return bad(meta.parents.includes(name) ? "이미 있는 상위 그룹입니다." : "같은 이름의 그룹이 있습니다.", 409);
    if (meta.parents.length >= PARENTS_MAX) return bad(`상위 그룹은 최대 ${PARENTS_MAX}개까지 만들 수 있습니다.`);
    return out(await syncGroups(cur, meta, { parents: [...meta.parents, name], list }));
  }
  if (op === "parentRename") {
    const from = normalizeItemGroup(b.from);
    const to = normalizeItemGroup(b.to);
    if (!from || !meta.parents.includes(from)) return bad("상위 그룹을 찾을 수 없습니다.", 404);
    if (!to) return bad("상위 그룹 이름을 입력해 주세요.");
    if (to === from) return out(await syncGroups(cur, meta, { list }));
    if (taken(to)) return bad(meta.parents.includes(to) ? "같은 이름의 상위 그룹이 있습니다." : "같은 이름의 그룹이 있습니다.", 409);
    const parents = meta.parents.map((p) => (p === from ? to : p));
    const parentOf = pCopy();
    for (const g of Object.keys(parentOf)) if (parentOf[g] === from) parentOf[g] = to;
    return out(await syncGroups(cur, meta, { parents, parentOf, list }));
  }
  if (op === "parentDelete") {
    const name = normalizeItemGroup(b.name);
    if (!name || !meta.parents.includes(name)) return bad("상위 그룹을 찾을 수 없습니다.", 404);
    const parents = meta.parents.filter((p) => p !== name);
    const parentOf = pCopy();
    for (const g of Object.keys(parentOf)) if (parentOf[g] === name) delete parentOf[g];
    return out(await syncGroups(cur, meta, { parents, parentOf, list }));
  }
  if (op === "parentOrder") {
    // 보낸 차례는 화면이 본 차례(목록 덩어리 차례 — 위 parentList)라 그대로 바꿔 끼운다. 빠진 상위는 지금 덩어리 차례로 뒤에
    const shown = parentList(list, meta.parentOf, meta.parents);
    const want = [...new Set((Array.isArray(b.names) ? b.names : []).map(normalizeItemGroup))].filter((p) => meta.parents.includes(p));
    const parents = [...want, ...shown.filter((p) => !want.includes(p))];
    const next = await writeOrder(list, orderParentBlocks(list, parents, meta.parentOf), meta.parentOf);
    return out(await syncGroups(groupList(next, meta.names), meta, { parents, list: next }), { order: idsOf(next) });
  }
  if (op === "setParent") {
    const group = normalizeItemGroup(b.group);
    const parent = normalizeItemGroup(b.parent);
    if (!group || !cur.includes(group)) return bad("그룹을 찾을 수 없습니다.", 404);
    if (parent && !meta.parents.includes(parent)) return bad("상위 그룹을 찾을 수 없습니다.", 404);
    const parentOf = pCopy();
    if ((parentOf[group] || "") === parent) return out(await syncGroups(cur, meta, { list }));
    if (parent) parentOf[group] = parent;
    else delete parentOf[group];
    // 새 상위에 넣으면 그 상위 덩어리 끝으로 — 그 그룹 덩어리를 상위의 마지막 그룹 뒤로 옮긴 다음 상위 규칙(빼면 제자리에서 상위 없음)
    let moved = list;
    if (parent) {
      const sibs = groupsInOrder(list).filter((g) => g !== group && parentOf[g] === parent);
      if (sibs.length) moved = moveUnit(list, `g:${group}`, { after: `g:${sibs[sibs.length - 1]}` }) || list;
    }
    const next = await writeOrder(list, moved, parentOf);
    return out(await syncGroups(groupList(next, meta.names), meta, { parentOf, list: next }), { order: idsOf(next) });
  }
  if (op === "autoSort") {
    const rows = await loadSortRows();
    const sorted = autoSortOrder(rows, { typeOrder: ITEM_TYPES, parents: parentList(rows, meta.parentOf, meta.parents), parentOf: meta.parentOf });
    const next = await writeOrder(rows, sorted, meta.parentOf);
    const was = new Map(rows.map((r, i) => [r.id, i]));
    const movedN = next.filter((r, i) => was.get(r.id) !== i).length;
    return out(await syncGroups(groupList(next, meta.names), meta, { list: next }), { order: idsOf(next), moved: movedN });
  }
  return bad("알 수 없는 요청입니다.");
}

// ── [삭제] ?id= — 참조 상품이 있으면 409 ──
// ── [일괄 삭제] ?ids=a,b,c — 한 건 삭제와 같은 검사를 줄마다(상품 · 세트 구성 · 시즌 패스가 쓰는 아이템은 남긴다).
//    응답 { success, deleted: [id], blocked: [{ id, usage, passUsage }] } — 막힌 것만 남기고 나머지는 지운다(초안 모드는 삭제 예정 초안)
const DELETE_MAX = 500;
export async function DELETE(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    if (params.has("ids")) {
      const ids = [...new Set(String(params.get("ids") || "").split(",").map((v) => v.trim()))].filter((v) => mongoose.isValidObjectId(v)).slice(0, DELETE_MAX);
      if (!ids.length) return NextResponse.json({ success: false, message: "삭제할 아이템을 골라 주세요." }, { status: 400 });
      // 쓰는 상품 수 — 한 건 삭제의 catalogCount({ $or: [itemId, bundle.itemId] })와 같은 셈(상품 하나는 한 번)
      const [shops, passOf] = await Promise.all([
        catalogFind(ShopItem, { $or: [{ itemId: { $in: ids } }, { "bundle.itemId": { $in: ids } }] }, { select: { itemId: 1, bundle: 1 } }),
        passUsageOf(),
      ]);
      const usageOf = (id) => shops.filter((s) => String(s.itemId || "") === id || (Array.isArray(s.bundle) && s.bundle.some((c) => String(c?.itemId || "") === id))).length;
      const deleted = [];
      const blocked = [];
      for (const id of ids) {
        const usage = usageOf(id);
        const passUsage = passOf.get(id) || 0;
        if (usage > 0 || passUsage > 0) { blocked.push({ id, usage, passUsage }); continue; }
        if (await catalogDelete(Item, id)) deleted.push(id);
      }
      return NextResponse.json({ success: true, deleted, blocked });
    }
    const id = String(params.get("id") || "").trim();
    if (!id) return NextResponse.json({ success: false, message: "삭제할 아이템을 지정해 주세요." }, { status: 400 });

    // 세트 구성(bundle.itemId)으로 쓰는 상품도 센다 — 지우면 그 세트는 "구성을 확인할 수 없습니다"로 팔리지 않는다.
    //    초안 모드는 초안 상품 · 실사이트 상품을 합친 보기로 센다(삭제 예정 상품은 빠진다 — 반영 때 상품이 먼저 지워진다)
    const used = await catalogCount(ShopItem, { $or: [{ itemId: id }, { "bundle.itemId": id }] });
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
    // 실사이트 모드는 바로 지운다. 초안 모드는 새 초안이면 지우고, 실사이트 아이템이면 삭제 예정(반영 때 다시 확인하고 지움)
    await catalogDelete(Item, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("아이템 삭제 오류:", e);
    return NextResponse.json({ success: false, message: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
