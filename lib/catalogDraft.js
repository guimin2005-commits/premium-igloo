import mongoose from "mongoose";
import { NextResponse } from "next/server";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import ShopBanner from "@/models/ShopBanner";
import Setting from "@/models/Setting";
import ShopLock from "@/models/ShopLock";
import Purchase from "@/models/Purchase";
import SeasonPass from "@/models/SeasonPass";
import EventPass from "@/models/EventPass";
import InviteEvent from "@/models/InviteEvent";
import { itemCascadeSet } from "@/lib/items";
import { THEMES_KEY, loadThemesWith } from "@/lib/shopThemes";
import { EFFECT_TEMPLATES_KEY } from "@/lib/itemEffects";

// 📌 상품 초안(2026-10-11 운영자 결정 — 설계 .claude/mockups/src/catalog-draft/design.md)
//    초안은 실사이트 컬렉션 옆의 draft_items · draft_shopitems · draft_shopbanners · draft_settings(itemGroups · shopThemes 키만)에 같은 _id 로 둔다.
//    실사이트(Vercel) · Railway 봇은 draft_* 를 모른다 — 초안을 읽고 쓰는 곳은 localhost(.env.local CATALOG_DRAFT=1) 하나.
//    · 실사이트 모드(플래그 없음 · Vercel): 모든 도우미가 지금의 직접 mongoose 호출과 같다(추가 쿼리 0).
//    · 초안 모드: 읽기는 실사이트 위에 초안을 덧씌운 보기, 관리 쓰기는 초안 컬렉션으로(처음 쓸 때 실사이트 문서를 복사 — copy-on-write).
//    · 반영(publishAll): 초안에서 바뀐 칸만 실사이트 문서에 제자리로 쓴다(3-way — 그 사이 실사이트에서 바뀐 다른 칸은 남는다).
//      soldCount 는 절대 쓰지 않고, stock 은 초안에서 바꾼 폭만큼만 더한다(그 사이 팔린 수량 · 초과 판매 방지).
//    ⚠️ 복제 대상 스키마(models/Item · ShopItem · ShopBanner · Setting)를 고치면 localhost 서버를 다시 켠다 — 초안 모델은 처음 쓸 때 등록된다

// ───────────────────────── 모드 ─────────────────────────

// lib/authOptions.js 의 DEV_LOGIN 과 같은 세 겹 조건 — NODE_ENV 로는 못 가른다(localhost 도 next start). Vercel 프리뷰에 변수를 붙여도 꺼진다
const LOCAL_URL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;
export const isDraftMode = () =>
  process.env.CATALOG_DRAFT === "1" && LOCAL_URL.test(process.env.NEXTAUTH_URL || "") && !process.env.VERCEL;

// 📌 실사이트(Vercel) 관리 화면의 Item · ShopItem · ShopBanner · Setting 'itemGroups' · 'shopThemes' 쓰기 잠금 —
//    예전엔 막았다(운영자 결정 1 — 고치는 곳은 localhost 하나). 2026-10-14 운영자 "메인 서버에서도 아이템 수정이나 뭐 좀 할 수 있게" → 푼다.
//    본 사이트에서 고친 건 바로 실사이트 컬렉션에 쓴다(초안 없음). 테스트 사이트(localhost 초안 모드)는 그대로 초안 → 「반영」.
//    둘이 겹쳐도 반영(publishAll)은 초안에서 바뀐 칸만 덮어써서(applyFields — 기준 _draftBase 대비) 본 사이트에서 고친 다른 칸은 남는다.
//    같은 칸을 양쪽에서 고쳤으면 반영할 때 초안 값이 이긴다. 다시 막으려면 아래를 !!process.env.VERCEL && !isDraftMode() 로 되돌린다
export const catalogWriteBlocked = () => false;
export const LIVE_LOCKED_MESSAGE = "상품 · 아이템 수정은 테스트 사이트(localhost)에서 합니다.";
export const liveLockedResponse = () =>
  NextResponse.json({ success: false, code: "LIVE_LOCKED", message: LIVE_LOCKED_MESSAGE, error: LIVE_LOCKED_MESSAGE }, { status: 403 });

// ───────────────────────── 대상 모델 ─────────────────────────

// 📌 초안 설정 키 — itemGroups(아이템 그룹 차례) · shopThemes(이벤트 테마 목록 — lib/shopThemes.js, 2026-10-11) ·
//    effectTemplates(종류별 효과 문구 — lib/itemEffects · lib/effectTemplatesServer, 2026-10-18 — 아이템 효과 문구처럼 초안 → 「반영」)
export const DRAFT_SETTING_KEYS = ["itemGroups", THEMES_KEY, EFFECT_TEMPLATES_KEY];
const MODELS = { item: Item, shopItem: ShopItem, banner: ShopBanner, setting: Setting };
export const DRAFT_KINDS = Object.keys(MODELS);
const KIND_OF = { Item: "item", ShopItem: "shopItem", ShopBanner: "banner", Setting: "setting" };
const kindOf = (Model) => KIND_OF[Model?.modelName] || "";

// 같은 문서를 가리키는 표식 — Setting 은 key(초안이 실사이트 문서보다 먼저 생겼으면 _id 가 다를 수 있다), 나머지는 _id
const identityOf = (kind, doc) => (kind === "setting" ? `k:${doc?.key ?? ""}` : String(doc?._id ?? ""));

// Setting 은 DRAFT_SETTING_KEYS(itemGroups · shopThemes) 키만 초안이다 — 다른 키(maintenance · roleMigrationMap · 잠금)는 늘 실사이트
const settingKeyDrafted = (key) => typeof key === "string" && DRAFT_SETTING_KEYS.includes(key);
// 읽기: 초안이 아닌 키를 콕 집은 조회면 실사이트만(draft_settings 에는 DRAFT_SETTING_KEYS 만 들어간다)
const readsDraft = (kind, filter) => !!kind && !(kind === "setting" && typeof filter?.key === "string" && !settingKeyDrafted(filter.key));
// 쓰기: Setting 은 DRAFT_SETTING_KEYS 키를 콕 집은 쓰기만 초안으로
const writesDraft = (kind, filter) => !!kind && (kind !== "setting" || settingKeyDrafted(filter?.key));

// 초안 모델 — 같은 스키마 복제 + _draft* 칸. 이름 "Draft" + 모델 이름, 컬렉션 "draft_" + 컬렉션 이름. 초안 모드에서만 만든다
//    _draftOp: "" | "delete"(실사이트 문서 삭제 예정) · _draftBase: 처음 복사한 순간의 실사이트 문서(새 초안이면 null) · _draftAt
export function draftModel(Model) {
  const name = `Draft${Model.modelName}`;
  if (mongoose.models[name]) return mongoose.models[name];
  const schema = Model.schema.clone();
  schema.add({
    _draftOp: { type: String, default: "" },
    _draftBase: { type: mongoose.Schema.Types.Mixed, default: null },
    _draftAt: { type: Date, default: Date.now },
  });
  return mongoose.model(name, schema, `draft_${Model.collection.collectionName}`);
}

const DRAFT_META = ["_draftOp", "_draftBase", "_draftAt"];
// 응답용 — 초안 저장 칸(_draftOp · _draftBase · _draftAt)을 뺀다. 표시용 _draft("new" | "edit")는 남긴다
export function stripDraft(doc) {
  if (Array.isArray(doc)) return doc.map(stripDraft);
  if (!doc || typeof doc !== "object") return doc;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const out = { ...plain };
  for (const k of DRAFT_META) delete out[k];
  return out;
}

// ───────────────────────── 순수 계산 (scripts/test-catalog-draft.mjs) ─────────────────────────

const isOid = (v) => !!v && typeof v === "object" && (v._bsontype === "ObjectId" || v._bsontype === "ObjectID");

// 비교용 정규화 — 키 정렬 · Date/ObjectId 를 값으로 · 하위 문서 _id 무시(durations 를 다시 저장하면 _id 만 새로 생긴다) · undefined 칸 무시
function canonValue(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return { $date: v.getTime() };
  if (isOid(v)) return { $oid: String(v) };
  if (Array.isArray(v)) return v.map(canonValue);
  if (typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (k === "_id" || v[k] === undefined) continue;
      out[k] = canonValue(v[k]);
    }
    return out;
  }
  return v;
}
const canon = (v) => JSON.stringify(canonValue(v));

// 스키마 기본값 — 없는 칸은 이 값으로 본다(placement 가 없는 옛 배너 = "home" 등)
const defaultsCache = new Map();
function defaultsOf(Model) {
  const key = Model.modelName;
  if (!defaultsCache.has(key)) {
    const o = new Model().toObject();
    delete o._id;
    defaultsCache.set(key, o);
  }
  return defaultsCache.get(key);
}
const topPaths = (Model) => [...new Set(Object.keys(Model.schema.paths).map((p) => p.split(".")[0]))];

// 비교에서 빼는 칸 — 식별 · 버전 · 만든 시각 · 초안 칸. 상품 soldCount 는 실시간 카운터(반영도 안 한다), 설정 updatedAt 은 저장 시각
const DIFF_OMIT = new Set(["_id", "__v", "createdAt", "_draft", ...DRAFT_META]);
const DIFF_OMIT_BY_MODEL = { ShopItem: ["soldCount"], Setting: ["updatedAt"] };

// 초안 d 와 기준 b(처음 복사한 실사이트 문서)에서 값이 다른 맨 위 칸 이름들(정렬)
export function diffFields(Model, d, b) {
  const defs = defaultsOf(Model);
  const omit = new Set([...DIFF_OMIT, ...(DIFF_OMIT_BY_MODEL[Model.modelName] || [])]);
  const valOf = (doc, k) => (doc && doc[k] !== undefined ? doc[k] : defs[k]);
  const keys = new Set([...Object.keys(d || {}), ...Object.keys(b || {}), ...topPaths(Model)]);
  const out = [];
  for (const k of keys) {
    if (omit.has(k)) continue;
    if (canon(valOf(d, k)) !== canon(valOf(b, k))) out.push(k);
  }
  return out.sort();
}

const stockOf = (doc) => {
  const n = Number(doc?.stock);
  return doc && doc.stock != null && Number.isFinite(n) ? n : -1; // 칸이 없으면 스키마 기본값(-1 = 무제한)
};
// 📌 보이는 재고 — 초안 d · 기준 b · 지금 실사이트 l. 관리 폼의 stockBase 폭 반영과 같은 규칙(그 사이 팔린 수량을 지키고 초과 판매가 없다)
//    안 바꿨으면 실사이트 값, 한정 → 한정이면 실사이트 + 바꾼 폭(0 아래로 안 내림), 무제한이 끼면 초안 값
export function shownStock(d, b, l) {
  const ds = stockOf(d);
  const bs = stockOf(b);
  if (!l) return ds;
  const ls = stockOf(l);
  if (ds === bs) return ls;
  if (ds >= 0 && bs >= 0 && ls >= 0) return Math.max(0, ls + ds - bs);
  return ds;
}

// 📌 초안 재고 쓰기(관리 폼 저장) — 초안 d · 기준 b · 지금 실사이트 l 에서 { stock, "_draftBase.stock"? } 를 낸다(쓸 것 없음 = null).
//    delta: 폼의 stockBase 폭(보이는 재고에 더한다 — 보이는 재고가 무제한이면 쓰지 않는다. 실사이트 updateOne { stock: { $gte: 0 } } 과 같은 뜻)
//    value: 그 값으로(무제한이 끼었거나 stockBase 없이 보낸 저장 — 실사이트 덮어쓰기와 같은 뜻)
//    실사이트 문서가 있으면 기준 재고를 지금 실사이트 재고로 옮긴다 → 보이는 재고 = 목표 그대로, 반영 = 실사이트 + (목표 − 저장 때 실사이트)라
//    저장 뒤 팔린 수량을 지킨다. (초안 사본 재고에 폭을 더하면 그 사이 환불 등으로 실사이트 재고가 늘었을 때 0 에서 잘려 보이는 재고가 폼 값과 어긋났다)
export function draftStockSet(d, b, l, { delta = null, value = null } = {}) {
  const shown = b ? shownStock(d, b, l) : stockOf(d);
  let target;
  if (delta != null) {
    if (shown < 0) return null;
    target = Math.max(0, shown + Math.floor(Number(delta)));
  } else target = Math.floor(Number(value));
  if (!Number.isFinite(target)) throw new Error("재고 값이 올바르지 않습니다.");
  target = Math.max(-1, target);
  const $set = { stock: target };
  if (b && l) $set["_draftBase.stock"] = stockOf(l);
  return $set;
}

// 포함형 select("a b" · { a: 1, b: 1 }) → { inc: [칸], exc: [칸], noId }
function selectSpec(select) {
  if (!select) return null;
  const obj = {};
  if (typeof select === "string") {
    for (const t of select.split(/\s+/).filter(Boolean)) {
      if (t.startsWith("-")) obj[t.slice(1)] = 0;
      else obj[t.replace(/^\+/, "")] = 1;
    }
  } else if (typeof select === "object") Object.assign(obj, select);
  const inc = [];
  const exc = [];
  let noId = false;
  let idOn = false;
  for (const [k, v] of Object.entries(obj)) {
    const on = !(v === 0 || v === false || v === "0");
    if (k === "_id") { noId = !on; idOn = on; continue; }
    (on ? inc : exc).push(k);
  }
  // { _id: 1 } 하나만이면 _id 만 남기는 포함형
  return { inc, exc, noId, inclusive: inc.length > 0 || (idOn && !exc.length) };
}
// JS 투영 — 실사이트 쿼리의 projection 과 같은 모양(점 경로는 맨 위 칸 통째로)
export function projectDoc(doc, select) {
  const spec = selectSpec(select);
  if (!doc || !spec || (!spec.inclusive && !spec.exc.length && !spec.noId)) return doc;
  let out;
  if (spec.inclusive) {
    out = {};
    if (!spec.noId && doc._id !== undefined) out._id = doc._id;
    for (const k of spec.inc) {
      const top = k.split(".")[0];
      if (doc[top] !== undefined) out[top] = doc[top];
    }
  } else {
    out = { ...doc };
    for (const k of spec.exc) if (!k.includes(".")) delete out[k];
    if (spec.noId) delete out._id;
  }
  return out;
}

// 정렬 — Mongo 형 순서(null < 숫자 < 문자 < 객체 < 배열 < ObjectId < 불 < 날짜)를 따른다
const typeRank = (v) => (v == null ? 0
  : typeof v === "number" ? 1
  : typeof v === "string" ? 2
  : v instanceof Date ? 7
  : isOid(v) ? 5
  : typeof v === "boolean" ? 6
  : Array.isArray(v) ? 4
  : 3);
function compareValues(a, b) {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 1) return a - b;
  if (ra === 7) return a.getTime() - b.getTime();
  if (ra === 6) return (a ? 1 : 0) - (b ? 1 : 0);
  if (ra === 2 || ra === 5) {
    const x = String(a);
    const y = String(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return 0;
}
function sortSpec(sort) {
  if (!sort) return [];
  if (typeof sort === "string") {
    return sort.split(/\s+/).filter(Boolean).map((t) => (t.startsWith("-") ? [t.slice(1), -1] : [t, 1]));
  }
  return Object.entries(sort).map(([k, v]) => [k, v === -1 || v === "-1" || v === "desc" || v === "descending" ? -1 : 1]);
}
const pathValue = (doc, path) => path.split(".").reduce((o, p) => (o == null ? undefined : o[p]), doc);
export function sortDocs(list, sort) {
  const spec = sortSpec(sort);
  if (!spec.length) return list;
  return [...list].sort((a, b) => {
    for (const [k, dir] of spec) {
      const c = compareValues(pathValue(a, k), pathValue(b, k));
      if (c) return c * dir;
    }
    return 0;
  });
}

// 초안 한 건의 표시 — "new" | "edit" | ""(순서만 바뀌었거나 바뀐 칸이 없음)
function markOf(Model, d) {
  const base = d?._draftBase || null;
  if (!base) return "new";
  return diffFields(Model, d, base).some((k) => k !== "sortOrder") ? "edit" : "";
}

// 📌 덧씌우기(순수) — 실사이트 결과 live 에서 초안이 있는 문서(draftKeys — 삭제 예정 포함)를 빼고, filter 에 맞는 초안 drafts 로 바꾼다.
//    순서: 실사이트 자리에 그대로 바꿔 넣고, 실사이트 결과에 없던 초안은 뒤에. sort 가 있으면 그 규칙으로 다시 정렬.
//    상품 초안의 soldCount 는 실사이트 값, stock 은 shownStock(liveCounters: id → { stock, soldCount } 실사이트 값)
export function overlayMerge({ Model, live = [], drafts = [], draftKeys, liveCounters = null, select, sort, mark = false }) {
  const kind = kindOf(Model);
  const keys = new Set(draftKeys || []);
  const byKey = new Map();
  for (const d of drafts) {
    const k = identityOf(kind, d);
    keys.add(k);
    if (!byKey.has(k)) byKey.set(k, d);
  }
  const shape = (d) => {
    const base = d._draftBase || null;
    let doc = stripDraft(d);
    if (kind === "shopItem" && base) {
      const l = liveCounters?.get(String(d._id));
      if (l) {
        doc.soldCount = Number(l.soldCount) || 0;
        doc.stock = shownStock(d, base, l);
      }
    }
    doc = projectDoc(doc, select);
    if (mark) {
      const m = markOf(Model, d);
      if (m) doc._draft = m;
    }
    return doc;
  };
  const used = new Set();
  const out = [];
  for (const l of live) {
    const k = identityOf(kind, l);
    if (!keys.has(k)) { out.push(projectDoc(l, select)); continue; }
    const d = byKey.get(k);
    if (d && !used.has(k)) { used.add(k); out.push(shape(d)); }
  }
  for (const d of drafts) {
    const k = identityOf(kind, d);
    if (used.has(k)) continue;
    used.add(k);
    out.push(shape(d));
  }
  return sortDocs(out, sort);
}

// 📌 시즌 패스 티어 보상이 아이템을 몇 번 쓰는지(id → 수) — lib/seasonPass.js rewardsOf 와 같은 셈(빈 보상 빼고 칸마다 앞 4개).
//    lib/seasonPass 가 이 파일을 import 하므로 순환을 피해 규칙을 여기 둔다 — 바꾸면 거기도 같이
const PASS_MAX_REWARDS = 4;
const passRewardLive = (r) => {
  const kind = r?.kind;
  if (kind === "item") return !!String(r?.itemId || "").trim();
  if (kind === "role") return !!String(r?.roleId || "").trim();
  if (kind === "xp" || kind === "point") { const n = Math.floor(Number(r?.amount)); return Number.isFinite(n) && n > 0; }
  return false;
};
export function countPassItems(tiers) {
  const count = new Map();
  for (const t of Array.isArray(tiers) ? tiers : []) {
    for (const cell of [t?.free, t?.paid]) {
      const list = Array.isArray(cell) ? cell : cell && typeof cell === "object" ? [cell] : [];
      for (const r of list.filter(passRewardLive).slice(0, PASS_MAX_REWARDS)) {
        if (r.kind !== "item") continue;
        const id = String(r.itemId).trim();
        count.set(id, (count.get(id) || 0) + 1);
      }
    }
  }
  return count;
}
// 실사이트 시즌 패스 기준(아이템 삭제 409 · 반영 때 다시 확인) — admin/items 의 passUsageOf 와 같은 결과
//    📌 이벤트 패스(models/EventPass — 2026-10-17) 단계 보상도 같이 센다. 시즌 패스처럼 초안 밖(늘 실사이트)이고,
//       쓰는 아이템을 지우면 수령이 "보상을 찾을 수 없습니다"로 실패한다. 이벤트 단계는 무료 칸(free)뿐이라 countPassItems 그대로 센다
//    📌 친구 초대 누적 보상(models/InviteEvent — 2026-10-25)도 같다(무료 칸만 · 설정 문서가 없으면 빈 목록)
export async function passUsageOf() {
  const [pass, events, invites] = await Promise.all([
    SeasonPass.findOne({ key: "main" }, { tiers: 1 }).lean(),
    EventPass.find({}, { tiers: 1 }).lean(),
    InviteEvent.find({}, { tiers: 1 }).lean(),
  ]);
  const tiersOf = (list) => list.flatMap((e) => (Array.isArray(e?.tiers) ? e.tiers : []));
  return countPassItems([...(Array.isArray(pass?.tiers) ? pass.tiers : []), ...tiersOf(events), ...tiersOf(invites)]);
}

// ───────────────────────── 읽기 ─────────────────────────

const withKeySelect = (select) => {
  const spec = selectSpec(select);
  if (!spec || !spec.inclusive || spec.inc.includes("key")) return select;
  const obj = { key: 1 };
  for (const k of spec.inc) obj[k] = 1;
  if (spec.noId) obj._id = 0;
  return obj;
};

// 📌 목록 읽기 → lean[] — 실사이트 모드: Model.find(filter, select).sort(sort).lean() 그대로.
//    초안 모드: 실사이트 + 초안(삭제 예정 숨김) 덧씌우기, mark 면 초안 행에 _draft = "new" | "edit". select 는 포함형만 쓴다
export async function catalogFind(Model, filter = {}, { select, sort, mark = false } = {}) {
  const kind = kindOf(Model);
  if (!isDraftMode() || !readsDraft(kind, filter)) {
    let q = Model.find(filter, select);
    if (sort) q = q.sort(sort);
    return q.lean();
  }
  const D = draftModel(Model);
  const f = filter || {};
  const [live, drafts, ids] = await Promise.all([
    Model.find(f, kind === "setting" ? withKeySelect(select) : select).lean(),
    D.find({ ...f, _draftOp: { $ne: "delete" } }).lean(),
    D.find({}, { _id: 1, key: 1 }).lean(),
  ]);
  let liveCounters = null;
  const spec = selectSpec(select);
  const wantsCounters = !spec || !spec.inclusive || spec.inc.some((k) => k === "stock" || k === "soldCount");
  if (kind === "shopItem" && wantsCounters) {
    const edited = drafts.filter((d) => d._draftBase).map((d) => d._id);
    if (edited.length) {
      const rows = await Model.find({ _id: { $in: edited } }, { stock: 1, soldCount: 1 }).lean();
      liveCounters = new Map(rows.map((r) => [String(r._id), r]));
    }
  }
  return overlayMerge({ Model, live, drafts, draftKeys: new Set(ids.map((r) => identityOf(kind, r))), liveCounters, select, sort, mark });
}

// 한 건 — 실사이트 모드: Model.findOne(filter, select).sort(sort).lean()
export async function catalogFindOne(Model, filter = {}, opts = {}) {
  if (!isDraftMode() || !readsDraft(kindOf(Model), filter)) {
    let q = Model.findOne(filter, opts.select);
    if (opts.sort) q = q.sort(opts.sort);
    return q.lean();
  }
  return (await catalogFind(Model, filter, opts))[0] || null;
}

// 📌 이벤트 테마 목록(lib/shopThemes.js) — 초안 모드는 초안을 덧씌운 shopThemes. 설정이 없으면 기본(할로윈 하나 켬).
//    lib/shopThemes.js 는 화면도 import 해 DB 모듈을 못 들인다 — 서버 읽기는 여기 한 곳(테마 API · 상품 · 배너 저장)
export const loadShopThemes = () => loadThemesWith((filter, opts) => catalogFindOne(Setting, filter, opts));

// id 로 한 건 — 잘못된 id 는 null. 실사이트 모드: Model.findById(id, select).lean()
export async function catalogFindById(Model, id, opts = {}) {
  if (!mongoose.isValidObjectId(id)) return null;
  if (!isDraftMode() || !kindOf(Model)) return Model.findById(id, opts.select).lean();
  return catalogFindOne(Model, { _id: id }, opts);
}

// 개수 — exists · countDocuments 대신(> 0 으로 exists). 실사이트 모드: Model.countDocuments(filter)
export async function catalogCount(Model, filter = {}) {
  if (!isDraftMode() || !readsDraft(kindOf(Model), filter)) return Model.countDocuments(filter);
  return (await catalogFind(Model, filter, { select: { _id: 1 } })).length;
}

// 새 순서 — 맨 뒤 + 1(cap 으로 자름). 초안 모드는 초안 · 실사이트를 합친 목록의 최댓값 + 1
export async function nextSortOrder(Model, cap = Infinity) {
  if (!isDraftMode() || !kindOf(Model)) {
    const last = await Model.findOne({}, { sortOrder: 1 }).sort({ sortOrder: -1 }).lean();
    return Math.min(cap, Math.floor(Number(last?.sortOrder) || 0) + 1);
  }
  let max = null;
  for (const r of await catalogFind(Model, {}, { select: { sortOrder: 1 } })) {
    const n = Number(r.sortOrder);
    if (r.sortOrder != null && Number.isFinite(n) && (max == null || n > max)) max = n;
  }
  return Math.min(cap, Math.floor(Number(max) || 0) + 1);
}

// ───────────────────────── 쓰기 ─────────────────────────

const onlyDuplicate = (e) => {
  const list = Array.isArray(e?.writeErrors) && e.writeErrors.length ? e.writeErrors : [e];
  return list.every((w) => (w?.code ?? w?.err?.code) === 11000);
};

// filter 에 맞는데 아직 초안이 없는 실사이트 문서를 초안으로 복사(copy-on-write). 이미 초안이 있으면(삭제 예정 포함) 그대로 둔다
async function copyIn(Model, filter, op = "") {
  const D = draftModel(Model);
  const live = await Model.find(filter || {}).lean();
  if (!live.length) return D;
  const at = new Date();
  try {
    await D.collection.bulkWrite(
      live.map(({ _id, ...rest }) => ({
        updateOne: { filter: { _id }, update: { $setOnInsert: { ...rest, _draftOp: op, _draftBase: rest, _draftAt: at } }, upsert: true },
      })),
      { ordered: false }
    );
  } catch (e) {
    if (!onlyDuplicate(e)) throw e; // 동시에 같은 문서를 복사했으면 먼저 들어간 쪽을 쓴다
  }
  return D;
}

// 📌 쓸 모델 — 실사이트 모드: Model 그대로. 초안 모드: filter 에 맞는 실사이트 문서를 초안으로 복사한 뒤 초안 모델.
//    부르는 쪽은 같은 mongoose 호출(findByIdAndUpdate · updateMany · updateOne(+updatePipeline) · bulkWrite)을 그 모델에 그대로 한다
export async function forWrite(Model, filter = {}) {
  const kind = kindOf(Model);
  if (!isDraftMode() || !writesDraft(kind, filter)) return Model;
  return copyIn(Model, filter);
}

// 📌 초안 상품 재고 저장(관리 폼 — app/api/shop/items POST, 초안 모드에서만) — draftStockSet 규칙으로 초안 재고(+ 기준 재고)를 쓴다.
//    forWrite(ShopItem, { _id }) 뒤에 부른다. 초안이 없으면(삭제 예정 포함) 아무것도 쓰지 않는다
export async function writeDraftStock(id, opts) {
  requireDraftMode();
  if (!mongoose.isValidObjectId(id)) return false;
  const D = draftModel(ShopItem);
  const d = await D.findOne({ _id: id, _draftOp: { $ne: "delete" } }, { stock: 1, _draftBase: 1 }).lean();
  if (!d) return false;
  const base = d._draftBase || null;
  const live = base ? await ShopItem.findById(d._id, { stock: 1 }).lean() : null;
  const $set = draftStockSet(d, base, live, opts);
  if ($set) await D.collection.updateOne({ _id: d._id }, { $set });
  return true;
}

// 새로 만들기 → lean. 초안 모드는 초안 컬렉션에(_draftBase null — 반영 때 같은 _id 로 실사이트에 들어간다)
export async function catalogCreate(Model, data) {
  const kind = kindOf(Model);
  if (!isDraftMode() || !writesDraft(kind, kind === "setting" ? { key: data?.key } : {})) return (await Model.create(data)).toObject();
  const D = draftModel(Model);
  const doc = await D.create({ ...data, _draftOp: "", _draftBase: null, _draftAt: new Date() });
  return stripDraft(doc.toObject());
}

// 지우기 — 실사이트 모드: Model.findByIdAndDelete(id) 그대로. 초안 모드: 새 초안이면 지우고, 실사이트 문서면 삭제 예정(_draftOp "delete")
export async function catalogDelete(Model, id) {
  const kind = kindOf(Model);
  if (!isDraftMode() || !kind) return Model.findByIdAndDelete(id);
  if (!mongoose.isValidObjectId(id)) return null;
  const D = draftModel(Model);
  const at = new Date();
  const d = await D.findById(id).lean();
  if (d) {
    if (!d._draftBase) {
      await D.deleteOne({ _id: d._id });
      return stripDraft(d);
    }
    if (d._draftOp !== "delete") await D.updateOne({ _id: d._id }, { $set: { _draftOp: "delete", _draftAt: at } });
    return stripDraft(d);
  }
  const live = await Model.findById(id).lean();
  if (!live) return null;
  if (kind === "setting" && !settingKeyDrafted(live.key)) return Model.findByIdAndDelete(id);
  const { _id, ...rest } = live;
  await D.collection.updateOne({ _id }, { $setOnInsert: { ...rest, _draftOp: "delete", _draftBase: rest, _draftAt: at } }, { upsert: true });
  return live;
}

// ───────────────────────── 결제 막기 ─────────────────────────

// 결제 판정에서 봐주는 칸 — 순서 · 관리 그룹은 판매에 영향이 없다
//    📌 희귀도(Item.rarity — 2026-10-17)도 — 상품 · 구매 스냅샷에 들지 않고 인벤토리 표시에만 쓴다(반영 뒤 바로 그 값으로 보인다)
//    📌 분류(Item · ShopItem category — 2026-10-17 lib/itemCategory.js)도 — 표시 칸이라 상품 · 구매 스냅샷 · 결제 판정에 들지 않는다
//    📌 효과 문구 · 적용 범위(Item effectText · scope — 2026-10-18 lib/itemEffects effectLinesOf · scopeOf)도 — 표시만 바꾸고 지급 규칙은 그대로다
const NON_BLOCKING = { item: ["sortOrder", "group", "rarity", "category", "effectText", "scope"], shopItem: ["sortOrder", "category"] };
const draftBlocks = (kind, d) => {
  if (!d) return false;
  if (d._draftOp === "delete" || !d._draftBase) return true;
  const free = NON_BLOCKING[kind] || [];
  return diffFields(MODELS[kind], d, d._draftBase).some((k) => !free.includes(k));
};

// 📌 초안 모드에서 그 상품 · 연결 아이템(itemId) · 세트 구성 아이템 중 하나라도 바뀐 초안이 있으면 true(결제 409 DRAFT — 운영자 결정 2).
//    실사이트 모드는 늘 false(쿼리 없음)
export async function draftBlockedProducts(shopItemIds) {
  if (!isDraftMode()) return false;
  const ids = [...new Set((Array.isArray(shopItemIds) ? shopItemIds : []).map((v) => String(v || "")))].filter((v) => mongoose.isValidObjectId(v));
  if (!ids.length) return false;
  const [shopDrafts, liveShops] = await Promise.all([
    draftModel(ShopItem).find({ _id: { $in: ids } }).lean(),
    ShopItem.find({ _id: { $in: ids } }, { itemId: 1, bundle: 1 }).lean(),
  ]);
  if (shopDrafts.some((d) => draftBlocks("shopItem", d))) return true;
  const itemIds = new Set();
  for (const s of liveShops) {
    if (s.itemId) itemIds.add(String(s.itemId));
    for (const c of Array.isArray(s.bundle) ? s.bundle : []) if (c?.itemId) itemIds.add(String(c.itemId));
  }
  const refs = [...itemIds].filter((v) => mongoose.isValidObjectId(v));
  if (!refs.length) return false;
  const itemDrafts = await draftModel(Item).find({ _id: { $in: refs } }).lean();
  return itemDrafts.some((d) => draftBlocks("item", d));
}

// ───────────────────────── 요약 · 경고 ─────────────────────────

const KIND_ORDER = ["item", "shopItem", "banner", "setting"];
const nameOf = (kind, d) => {
  if (kind === "setting") return d?.key === THEMES_KEY ? "테마 목록" : d?.key === EFFECT_TEMPLATES_KEY ? "효과 문구" : "그룹 순서";
  if (kind === "banner") return String(d?.title || d?._draftBase?.title || "").trim() || "제목 없는 배너";
  return String(d?.name || d?._draftBase?.name || "").trim() || "이름 없음";
};
// 초안 한 건의 종류 — "add" | "edit" | "order" | "del" | ""(바뀐 칸 없음 — 반영 때 초안만 지운다)
function opOf(kind, d) {
  const base = d?._draftBase || null;
  if (d?._draftOp === "delete") return base ? "del" : "";
  if (!base) return kind === "setting" ? "edit" : "add";
  const diff = diffFields(MODELS[kind], d, base);
  if (!diff.length) return "";
  if (kind !== "setting" && diff.every((k) => k === "sortOrder")) return "order";
  return "edit";
}

async function loadDrafts() {
  const lists = await Promise.all(KIND_ORDER.map((k) => draftModel(MODELS[k]).find({}).sort({ _draftAt: 1, _id: 1 }).lean()));
  return Object.fromEntries(KIND_ORDER.map((k, i) => [k, lists[i]]));
}

// 꾸미기 · 아이콘 · 배경 키 — 실사이트 · 봇 코드가 아직 모를 수 있는 값(운영자 결정 5)
const artKey = (icon) => { const s = String(icon ?? ""); return s.startsWith("art:") ? s.slice(4) : ""; };
function cosmeticKeys(kind, doc) {
  const out = [];
  const art = artKey(doc?.icon);
  if (art) out.push({ key: `art:${art}`, why: `처음 쓰는 아이콘 · art:${art}` });
  if (kind === "item") {
    for (const e of Array.isArray(doc?.effects) ? doc.effects : []) {
      if (e?.skin) out.push({ key: `skin:${e.skin}`, why: `처음 쓰는 카드 테두리 · ${e.skin}` });
      if (e?.scene) out.push({ key: `scene:${e.scene}`, why: `처음 쓰는 카드 배경 · ${e.scene}` });
      if (e?.frame) out.push({ key: `frame:${e.frame}`, why: `처음 쓰는 프로필 테두리 · ${e.frame}` });
    }
  }
  if (kind === "shopItem" && doc?.backdrop) out.push({ key: `backdrop:${doc.backdrop}`, why: `처음 쓰는 배경 · ${doc.backdrop}` });
  return out;
}
const IMAGE_FIELDS = { item: ["imageUrl"], shopItem: ["imageUrl", "itemImageUrl"], banner: ["imageUrl", "mobileImageUrl"] };

async function draftWarnings(all) {
  const warnings = [];
  const kept = (kind) => (all[kind] || []).filter((d) => d._draftOp !== "delete");
  const needKeys = kept("item").length + kept("shopItem").length > 0;
  const used = new Set();
  if (needKeys) {
    const [items, shops] = await Promise.all([
      Item.find({}, { icon: 1, effects: 1 }).lean(),
      ShopItem.find({}, { icon: 1, backdrop: 1 }).lean(),
    ]);
    for (const it of items) for (const k of cosmeticKeys("item", it)) used.add(k.key);
    for (const s of shops) for (const k of cosmeticKeys("shopItem", s)) used.add(k.key);
  }
  for (const kind of ["item", "shopItem", "banner"]) {
    for (const d of kept(kind)) {
      const base = d._draftBase || null;
      const changed = base ? new Set(diffFields(MODELS[kind], d, base)) : null;
      if (!base || changed.size) {
        const seen = new Set();
        for (const k of kind === "banner" ? [] : cosmeticKeys(kind, d)) {
          if (used.has(k.key) || seen.has(k.key)) continue;
          seen.add(k.key);
          warnings.push({ kind, id: String(d._id), name: nameOf(kind, d), why: k.why });
        }
      }
      for (const f of IMAGE_FIELDS[kind]) {
        const url = String(d[f] || "").trim();
        if (!url || /^https:\/\//i.test(url) || (changed && !changed.has(f))) continue;
        warnings.push({ kind, id: String(d._id), name: nameOf(kind, d), why: "https 아닌 이미지 주소" });
        break;
      }
    }
  }
  return warnings;
}

// 📌 초안 요약 — { total, counts: { item|shopItem|banner: { add, edit, order, del }, setting: { edit } }, rows: [{ kind, id, op, name }], warnings }
//    rows.op 는 counts 와 같은 이름("add" | "edit" | "order" | "del"). 바뀐 칸이 없는 초안은 세지 않는다(반영 때 초안만 지운다)
export async function draftSummary() {
  const counts = {
    item: { add: 0, edit: 0, order: 0, del: 0 },
    shopItem: { add: 0, edit: 0, order: 0, del: 0 },
    banner: { add: 0, edit: 0, order: 0, del: 0 },
    setting: { edit: 0 },
  };
  if (!isDraftMode()) return { total: 0, counts, rows: [], warnings: [] };
  const all = await loadDrafts();
  const rows = [];
  for (const kind of KIND_ORDER) {
    for (const d of all[kind]) {
      const op = opOf(kind, d);
      if (!op || counts[kind][op] === undefined) continue;
      counts[kind][op] += 1;
      rows.push({ kind, id: String(d._id), op, name: nameOf(kind, d) });
    }
  }
  return { total: rows.length, counts, rows, warnings: await draftWarnings(all) };
}

// ───────────────────────── 반영 · 버리기 ─────────────────────────

const LOCK_ID = "admin:catalog-publish";
export const PUBLISH_BUSY = "PUBLISH_BUSY";
const LOCK_TOUCH_MS = 10_000; // ShopLock 은 30초면 남이 가져간다 — 길어지면 중간중간 시각을 민다

function requireDraftMode() {
  if (!isDraftMode()) {
    const e = new Error("초안 모드가 아닙니다.");
    e.code = "NOT_DRAFT";
    throw e;
  }
}

// 반영 · 버리기 · 되돌리기는 한 번에 하나 — 잡혀 있으면 PUBLISH_BUSY 를 던진다(라우트가 409)
async function withPublishLock(fn) {
  const lock = await ShopLock.acquire(LOCK_ID);
  if (!lock) {
    const e = new Error("다른 반영이 진행 중입니다.");
    e.code = PUBLISH_BUSY;
    throw e;
  }
  let last = Date.now();
  const touch = async () => {
    if (Date.now() - last < LOCK_TOUCH_MS) return;
    last = Date.now();
    await ShopLock.updateOne({ _id: lock._id, token: lock.token }, { $set: { at: new Date() } }).catch(() => {});
  };
  try {
    return await fn(touch);
  } finally {
    await ShopLock.release(lock);
  }
}

// 실사이트에 넣을 모양 — _id(필터로 간다) · 초안 칸을 뺀다
const cleanDoc = (d) => {
  const { _id, ...rest } = d;
  for (const k of DRAFT_META) delete rest[k];
  return rest;
};
const isValidRef = (v) => /^[0-9a-f]{24}$/i.test(String(v || ""));
const refsOf = (d) => {
  const out = [];
  if (d?.itemId) out.push(String(d.itemId));
  for (const c of Array.isArray(d?.bundle) ? d.bundle : []) if (c?.itemId) out.push(String(c.itemId));
  return out;
};

// 바뀐 칸만 실사이트 문서에 — 초안에서 빠진 칸은 $unset. 상품 soldCount 는 쓰지 않고 stock 은 폭으로만
async function applyFields(kind, d, base, liveDoc, fields) {
  const Model = MODELS[kind];
  const $set = {};
  const $unset = {};
  for (const k of fields) {
    if (kind === "shopItem" && (k === "stock" || k === "soldCount")) continue;
    if (d[k] === undefined) $unset[k] = "";
    else $set[k] = d[k];
  }
  const ops = {};
  if (Object.keys($set).length) ops.$set = $set;
  if (Object.keys($unset).length) ops.$unset = $unset;
  if (Object.keys(ops).length) await Model.collection.updateOne({ _id: d._id }, ops);
  if (kind === "shopItem" && fields.includes("stock")) {
    const ds = stockOf(d);
    const bs = stockOf(base);
    if (ds >= 0 && bs >= 0 && stockOf(liveDoc) >= 0) {
      // 한정 → 한정 — 그 사이 팔린 수량을 지키고 바꾼 폭만 더한다(0 아래로 안 내림). mongoose 9 는 배열 update 에 updatePipeline 필요.
      //    폭 더하기만 다시 하면 두 번 더해지므로, 먼저 초안의 기준 재고를 초안 값으로 맞춰 둔다 — 여기서 끊기면 다시 눌러도 폭을 또 더하지 않는다
      await draftModel(ShopItem).collection.updateOne({ _id: d._id }, { $set: { "_draftBase.stock": ds } });
      await ShopItem.updateOne(
        { _id: d._id, stock: { $gte: 0 } },
        [{ $set: { stock: { $max: [0, { $add: ["$stock", ds - bs] }] } } }],
        { updatePipeline: true }
      );
    } else {
      await ShopItem.collection.updateOne({ _id: d._id }, { $set: { stock: ds } });
    }
  }
}

// 📌 실사이트 반영(설계 6절 순서) → { applied, skipped: [{ kind, id, name, why }], hidden: [{ kind, id, name }] }
//    그룹 설정 → 아이템 추가 · 수정 → 상품 추가 · 수정 → 연결 상품 표기 → 상품 삭제 → 아이템 삭제 → 배너.
//    새 아이템이 상품보다 먼저 들어가고 상품이 아이템보다 먼저 지워져, 중간 상태를 읽어도 없는 아이템을 가리키는 상품이 생기지 않는다.
//    문서마다 '실사이트 쓰기 → 초안 삭제'라 도중에 끊겨도 다시 누르면 같은 결과. 건너뛴 것은 초안으로 남는다
export async function publishAll() {
  requireDraftMode();
  return withPublishLock(async (touch) => {
    const all = await loadDrafts();
    const res = { applied: 0, skipped: [], hidden: [] };
    const skip = (kind, d, why) => res.skipped.push({ kind, id: String(d._id), name: nameOf(kind, d), why });
    const dropDraft = (kind, d) => draftModel(MODELS[kind]).deleteOne({ _id: d._id });
    const run = async (kind, d, write) => {
      await touch();
      try {
        await write();
      } catch (e) {
        console.error(`초안 반영 오류(${kind} ${d._id}):`, e);
        skip(kind, d, "저장 오류");
        return false;
      }
      res.applied += 1;
      await dropDraft(kind, d).catch((e) => console.error(`반영한 초안 정리 오류(${kind} ${d._id}):`, e));
      return true;
    };

    // 0. 분류 — 바뀐 칸이 없는 초안은 초안만 지운다
    const plan = {};
    for (const kind of KIND_ORDER) {
      plan[kind] = { add: [], edit: [], del: [] };
      for (const d of all[kind]) {
        const base = d._draftBase || null;
        if (d._draftOp === "delete") {
          if (base) plan[kind].del.push(d);
          else await dropDraft(kind, d);
          continue;
        }
        if (!base) { plan[kind].add.push(d); continue; }
        const fields = diffFields(MODELS[kind], d, base);
        if (!fields.length) { await dropDraft(kind, d); continue; }
        plan[kind].edit.push({ d, base, fields });
      }
    }
    const liveOf = async (kind) => {
      const ids = plan[kind].edit.map((e) => e.d._id);
      if (!ids.length) return new Map();
      return new Map((await MODELS[kind].find({ _id: { $in: ids } }).lean()).map((l) => [String(l._id), l]));
    };
    // 새 문서 — 같은 _id 로 실사이트에. 앞선 반영이 실사이트에 넣고 초안을 못 지운 채 끊겼으면(실사이트에 이미 있음) 초안 값으로 다시 맞춘다
    //    ($setOnInsert 만 쓰면 그 뒤 고친 초안이 말없이 버려진다). 상품 재고 · 판매 수는 처음 넣을 때만 — 그 사이 팔린 수량을 지킨다
    const putNew = (kind, d) => () => {
      const doc = cleanDoc(d);
      const once = {};
      if (kind === "shopItem") {
        if (doc.stock !== undefined) once.stock = doc.stock;
        once.soldCount = 0;
        delete doc.stock;
        delete doc.soldCount;
      }
      const ops = {};
      if (Object.keys(doc).length) ops.$set = doc;
      if (Object.keys(once).length) ops.$setOnInsert = once;
      return MODELS[kind].collection.updateOne({ _id: d._id }, ops, { upsert: true });
    };

    // 1. 설정(Setting itemGroups · shopThemes) — key 기준 upsert. 상품 · 배너보다 먼저(새 테마 키를 가리키는 상품이 테마 목록보다 먼저 서지 않게)
    for (const d of [...plan.setting.add, ...plan.setting.edit.map((e) => e.d)]) {
      if (!settingKeyDrafted(d.key)) { skip("setting", d, "대상 아닌 설정"); continue; }
      await run("setting", d, () => Setting.updateOne({ key: d.key }, { $set: { value: d.value ?? null, updatedAt: new Date() } }, { upsert: true }));
    }
    for (const d of plan.setting.del) skip("setting", d, "설정 삭제는 반영하지 않음");

    // 2. 아이템 추가 · 수정
    const writtenItems = new Set();
    for (const d of plan.item.add) {
      if (await run("item", d, putNew("item", d))) writtenItems.add(String(d._id));
    }
    const liveItems = await liveOf("item");
    for (const { d, base, fields } of plan.item.edit) {
      const l = liveItems.get(String(d._id));
      if (!l) { skip("item", d, "실사이트에서 지워짐"); continue; }
      if (await run("item", d, () => applyFields("item", d, base, l, fields))) writtenItems.add(String(d._id));
    }

    // 3. 상품 추가 · 수정 — 새로 가리키는 아이템(연결 · 세트 구성)이 실사이트에 있어야 한다
    const shopWrites = [
      ...plan.shopItem.add.map((d) => ({ d, base: null, fields: null, refs: refsOf(d) })),
      ...plan.shopItem.edit.map((e) => {
        const before = new Set(refsOf(e.base));
        return { ...e, refs: refsOf(e.d).filter((r) => !before.has(r)) };
      }),
    ];
    const wantRefs = [...new Set(shopWrites.flatMap((w) => w.refs))];
    const refIds = wantRefs.filter(isValidRef);
    const haveRefs = new Set(
      refIds.length ? (await Item.find({ _id: { $in: refIds } }, { _id: 1 }).lean()).map((r) => String(r._id)) : []
    );
    const liveShops = await liveOf("shopItem");
    const cascadeIds = new Set(writtenItems);
    for (const { d, base, fields, refs } of shopWrites) {
      if (refs.some((r) => !haveRefs.has(r))) { skip("shopItem", d, "연결 아이템이 실사이트에 없음"); continue; }
      let ok;
      if (!base) {
        ok = await run("shopItem", d, putNew("shopItem", d));
      } else {
        const l = liveShops.get(String(d._id));
        if (!l) { skip("shopItem", d, "실사이트에서 지워짐"); continue; }
        ok = await run("shopItem", d, () => applyFields("shopItem", d, base, l, fields));
      }
      if (ok && d.itemId) cascadeIds.add(String(d.itemId));
    }

    // 4. 연결 상품 표기 — 반영한 아이템 · 반영한 상품이 가리키는 아이템의 실사이트 값으로 모든 연결 상품(그 사이 실사이트에서 만든 것 포함)을 맞춘다
    const cascadeRefs = [...cascadeIds].filter(isValidRef);
    if (cascadeRefs.length) {
      const items = await Item.find({ _id: { $in: cascadeRefs } }).lean();
      for (const it of items) {
        await touch();
        try {
          await ShopItem.updateMany({ itemId: String(it._id) }, { $set: itemCascadeSet(it) });
        } catch (e) {
          console.error(`연결 상품 표기 갱신 오류(${it._id}):`, e);
          res.skipped.push({ kind: "item", id: String(it._id), name: nameOf("item", it), why: "연결 상품 표기 갱신 실패" });
        }
      }
    }

    // 5. 상품 삭제 — 구매 이력이 있으면 지우지 않고 판매 중지(active:false — 운영자 결정 4. 옛 구매가 상품을 거쳐 아이템을 찾는다)
    for (const d of plan.shopItem.del) {
      await touch();
      let bought = false;
      try {
        bought = !!(await Purchase.exists({ itemId: String(d._id) }));
      } catch (e) {
        console.error(`구매 이력 확인 오류(${d._id}):`, e);
        skip("shopItem", d, "저장 오류");
        continue;
      }
      if (bought) {
        if (await run("shopItem", d, () => ShopItem.collection.updateOne({ _id: d._id }, { $set: { active: false } }))) {
          res.hidden.push({ kind: "shopItem", id: String(d._id), name: nameOf("shopItem", d) });
        }
      } else {
        await run("shopItem", d, () => ShopItem.findByIdAndDelete(d._id));
      }
    }

    // 6. 아이템 삭제 — 실사이트에서 다시 확인(상품 연결 · 세트 구성 · 시즌 패스 보상)
    if (plan.item.del.length) {
      const pass = await passUsageOf();
      for (const d of plan.item.del) {
        const id = String(d._id);
        const used = await ShopItem.exists({ $or: [{ itemId: id }, { "bundle.itemId": id }] });
        if (used || (pass.get(id) || 0) > 0) { skip("item", d, "상품 · 패스가 쓰는 중"); continue; }
        await run("item", d, () => Item.findByIdAndDelete(d._id));
      }
    }

    // 7. 배너 추가 · 수정 · 삭제
    for (const d of plan.banner.add) await run("banner", d, putNew("banner", d));
    const liveBanners = await liveOf("banner");
    for (const { d, base, fields } of plan.banner.edit) {
      const l = liveBanners.get(String(d._id));
      if (!l) { skip("banner", d, "실사이트에서 지워짐"); continue; }
      await run("banner", d, () => applyFields("banner", d, base, l, fields));
    }
    for (const d of plan.banner.del) await run("banner", d, () => ShopBanner.findByIdAndDelete(d._id));

    return res;
  });
}

// 초안 버리기 — draft_* 를 비운다. 실사이트는 건드리지 않는다 → { removed }
export async function discardAll() {
  requireDraftMode();
  return withPublishLock(async () => {
    const results = await Promise.all(KIND_ORDER.map((k) => draftModel(MODELS[k]).deleteMany({})));
    return { removed: results.reduce((n, r) => n + (r?.deletedCount || 0), 0) };
  });
}

// 📌 초안 한 건 되돌리기(운영자 결정 6) → { removed }. kind: "item" | "shopItem" | "banner" | "setting", id: 초안 _id
//    아이템을 되돌리면 그 아이템을 가리키는 상품 초안의 표기도 실사이트 아이템 값으로 되돌린다(아이템 수정이 상품 초안에 연쇄로 써졌으므로)
export async function discardOne(kind, id) {
  requireDraftMode();
  const Model = MODELS[kind];
  if (!Model || !mongoose.isValidObjectId(id)) return { removed: 0 };
  return withPublishLock(async () => {
    const r = await draftModel(Model).deleteOne({ _id: id });
    const removed = r?.deletedCount || 0;
    if (kind === "item" && removed) {
      const live = await Item.findById(id).lean();
      if (live) await draftModel(ShopItem).updateMany({ itemId: String(id) }, { $set: itemCascadeSet(live) });
    }
    return { removed };
  });
}
