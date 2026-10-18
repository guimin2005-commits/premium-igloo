import mongoose from "mongoose";
import EventPass from "@/models/EventPass";
import EventPassClaim from "@/models/EventPassClaim";
import UserXp from "@/models/UserXp";
import Payout from "@/models/Payout";
import Purchase from "@/models/Purchase";
import Item from "@/models/Item";
import XpLog from "@/models/XpLog";
import ShopItem from "@/models/ShopItem";
import ShopLock from "@/models/ShopLock";
import RoleConfig from "@/models/RoleConfig";
import { addPoints } from "@/lib/points";
import { logWallet } from "@/lib/wallet";
import { unitThingSet } from "@/lib/unitSale";
import { timingOf } from "@/app/api/shop/_lib/renewal";
import { normalizeTiers, rewardKeys, rewardLabel, rewardShort, MAX_REWARD_DAYS } from "@/lib/seasonPass";
import { PASS_NEUTRAL_SOURCES } from "@/lib/season";
import { catalogFind, draftModel, isDraftMode } from "@/lib/catalogDraft";
import { effectLinesOf, describeRoleBuff } from "@/lib/itemEffects";
import { cosmeticOf } from "@/lib/itemCosmetic";
import { resolveCategory, shortNameOf } from "@/lib/itemCategory";
import { itemTypeLabel } from "@/lib/items";
import { channelNamesFor } from "@/lib/channelNames";

// 📌 이벤트 패스(「유령 펭귄의 초대」 · 2026-10-17 운영자 규칙) 계산의 단일 진실 — 조회(GET /api/event-pass)와 수령(POST /api/event-pass/claim)이
//    반드시 이 파일을 함께 쓴다. 클라이언트가 보낸 진행도 · 상태는 절대 믿지 않는다(lib/seasonPass.js getPassState 와 같은 원칙).
//    · 진행도 = 패스 XP = 기간 중 번 XP 만(시즌 패스와 같은 셈 — 아래 eventEarnedPipelines)
//    · 📌 2026-10-17 운영자 "이벤트 전용 미션은 걍 없애자 · 기존처럼 XP만 채워도 얻을 수 있게" — 미션 · 미션 보너스는 없다.
//      예전 문서에 남은 missions 칸 · 수령 기록의 "mission" 줄은 읽지 않는다(normalizeEventConfig · computeState)
//    · 무료 한 줄. 보상 종류 · 라벨 · 단계 정리는 시즌 패스 것을 그대로 쓴다(lib/seasonPass.js normalizeTiers · rewardLabel · rewardShort · rewardKeys)
//    · 수령 기록은 models/EventPassClaim(유저 · 이벤트 키 · 종류 · 대상 유니크) — 줄을 먼저 넣고(자물쇠) 그다음 지급한다

// 📌 지금 이벤트 — 설정 문서 하나(EventPass key). 다음 이벤트는 키를 바꿔 새 문서로 연다(수령 기록이 키로 갈린다 — 시즌의 SEASONS 처럼 코드 한 줄)
export const EVENT_PASS_KEY = "ghost-2026";
export const EVENT_PASS_DEFAULTS = {
  title: "유령 펭귄의 초대",
  // 📌 2026-10-18 운영자 "이벤트 기간 … 11월 5일까지로 해" → 시작은 다시 "10.19부터" — 기본값(설정 문서가 없을 때). 저장된 설정이 있으면 관리 › 이벤트 패스의 기간이 이긴다
  startsAt: "2026-10-19T00:00:00.000+09:00", // 10/18 운영자 "날짜 10.19부터라고 다 바꿔"
  endsAt: "2026-11-06T00:00:00.000+09:00", // 끝은 들어가지 않는다 — 11. 5. 23:59:59 까지
};
// 📌 지급 표시 — 시즌 패스("pass" · "season-pass" · "pass-point")와 갈라 둔다.
//    XP 보상 Payout.source — lib/season.js PASS_NEUTRAL_SOURCES 에 같은 글자가 있다(시즌 · 이벤트 진행도 둘 다 채우지 않는다).
//    ⚠️ 봇 bot/src/features/grantQueue.js PASS_NEUTRAL(지급 순간 기준선을 같이 올림) · STOP_BLOCKED(XP 획득 중단)에도 같은 글자가 있어야 한다
export const EVENT_PASS_SOURCE = "event-pass";
// 역할 · 아이템 보상 Purchase.itemId — 상점 상품이 아니라는 고정 글자("grant" · "season-pass" 와 같은 쓰임).
//    "season-pass" 를 쓰지 않는 까닭: 퀘스트 "패스 보상"(lib/questKinds.js)이 그 글자를 시즌 패스 칸으로 세고, 인벤토리가 "· 시즌 패스"로 적는다
export const EVENT_PASS_ITEM_ID = "event-pass";
// 빙옥 보상 원장(WalletLog) 종류 — "pass-point" 는 퀘스트 "패스 보상"이 시즌 패스 칸으로 센다
export const EVENT_POINT_KIND = "event-pass-point";
// 숫자 칸의 끝 — "숫자가 깨지지 않는 한도"
const NUM_MAX = 1_000_000_000_000;

const num = (v, { min = 0, max = NUM_MAX } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
};
const dateOr = (v, fallback) => {
  const d = v ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d : new Date(fallback);
};
// 진행도를 채우지 않는 지급 — 시즌 목록에 이벤트 표시가 빠져도 이벤트 보상이 이벤트 진행도를 스스로 밀어 올리지 않게 한 번 더 넣는다
const NEUTRAL_SOURCES = [...new Set([...PASS_NEUTRAL_SOURCES, EVENT_PASS_SOURCE])];

// ── 아이템 보상 상태 ─────────────────────────────────
// 📌 2026-10-17 운영자 "ㅃㄹ 바꿔" — 반영 전(초안에만 있는) 아이템도 보상으로 고르고 저장할 수 있다. 대신:
//    · 켜기는 막는다 — 보상 아이템이 하나라도 실사이트 Item 에 없으면 켜진 채로 저장하지 않는다(app/api/admin/event-pass PUT · 관리 화면 「사용」 잠금)
//    · 지급은 늘 실사이트 Item 만 — 수령 순간 실사이트에 없으면 그 단계를 주지 않고 거절한다(단계는 그대로 남아 반영 뒤 다시 받는다 — claimTier)
//    상태 낱말: live(실사이트에 있음 — 지급 가능) · draft(초안에만 있음 — 반영 전) · missing(어디에도 없음 — 초안을 버렸거나 지움)
//    📌 실사이트(Vercel) 관리 화면도 같은 DB 의 draft_items 를 읽어 draft 로 본다(검토 반영 — 예전엔 missing 으로 보여 "지워 주십시오"가
//       반영만 기다리는 보상을 지우게 했다). 읽기 전용 · 상태 낱말에만 쓴다(덧씌우기 · 지급 없음) — draftItemRows
export const HOLD_MESSAGE = "아직 받을 수 없는 보상이 있습니다. 잠시 뒤 다시 시도해 주세요.";
// 관리 화면(app/admin/event-pass/page.tsx enableLockOf)에 같은 글자가 있다 — 바꾸면 같이
export const draftItemsMessage = (names) => {
  const n = names.length;
  return `반영 전 아이템 ${n}개(${names.slice(0, 3).join(" · ")}${n > 3 ? ` 외 ${n - 3}개` : ""}) — 상점 관리에서 실사이트 반영 후 켤 수 있습니다.`;
};
export const missingItemsMessage = (n) => `찾을 수 없는 보상 아이템 ${n}개 — 다시 고르거나 지워 주십시오.`;

// 📌 초안 아이템(반영 전 · 삭제 예정 아님) { _id, name }[] — 초안 모드는 초안 모델(lib/catalogDraft draftModel),
//    실사이트 모드는 초안 모델을 등록하지 않고 같은 DB 의 draft_items 컬렉션을 드라이버로 바로 읽는다(lib/catalogDraft 실사이트 모드는 초안 모델을 만들지 않는다).
//    쓰기 없음. 드라이버 조회라 id 를 직접 ObjectId 로 바꾼다(24자리 16진만 — 그 밖의 값은 초안일 수 없다)
async function draftItemRows(ids) {
  if (!ids.length) return [];
  if (isDraftMode()) return draftModel(Item).find({ _id: { $in: ids }, _draftOp: { $ne: "delete" } }, { name: 1 }).lean();
  const oids = ids.filter((v) => mongoose.isObjectIdOrHexString(v)).map((v) => new mongoose.Types.ObjectId(String(v)));
  if (!oids.length) return [];
  // 연결 전이면 mongoose 컬렉션이 명령을 쌓아 두고 커서 대신 Promise 를 준다 — await 로 둘 다 커서로 받는다
  const cursor = await Item.db
    .collection(`draft_${Item.collection.collectionName}`)
    .find({ _id: { $in: oids }, _draftOp: { $ne: "delete" } }, { projection: { name: 1 } });
  return cursor.toArray();
}

const itemIdsIn = (rewards) => [...new Set((Array.isArray(rewards) ? rewards : []).filter((r) => r?.kind === "item").map((r) => String(r.itemId || "")))];

// 📌 아이템 id → { state, name } (Map). name 은 실사이트 이름, 없으면 초안 이름(missing 은 "")
//    ObjectId 가 아닌 값은 묻지 않고 missing — 캐스팅 오류로 조회 · 저장 전체가 500 이 되지 않게
export async function eventItemStates(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map((v) => String(v || "")).filter(Boolean))];
  const valid = list.filter((v) => mongoose.isValidObjectId(v));
  const [live, drafts] = await Promise.all([
    valid.length ? Item.find({ _id: { $in: valid } }, { name: 1 }).lean() : [],
    draftItemRows(valid),
  ]);
  const nameMap = (rows) => new Map(rows.map((d) => [String(d._id), String(d.name || "").trim()]));
  const liveName = nameMap(live);
  const draftName = nameMap(drafts);
  return new Map(
    list.map((id) => [
      id,
      liveName.has(id) ? { state: "live", name: liveName.get(id) } : draftName.has(id) ? { state: "draft", name: draftName.get(id) } : { state: "missing", name: "" },
    ])
  );
}

// 실사이트 Item 에 없는 아이템 보상 id — 수령 직전 확인(자물쇠를 잡은 뒤 한 번 더 묻는다 — claimTier)
async function notLiveItemIds(rewards) {
  const ids = itemIdsIn(rewards);
  if (!ids.length) return [];
  const valid = ids.filter((v) => mongoose.isValidObjectId(v));
  const live = valid.length ? await Item.find({ _id: { $in: valid } }, { _id: 1 }).lean() : [];
  const have = new Set(live.map((d) => String(d._id)));
  return ids.filter((id) => !have.has(id));
}
// 지급 순간 실사이트에 없는 아이템 — grantEventReward 가 이 표시를 달아 던진다(claimTier 가 HOLD_MESSAGE 로 바꾼다)
const NOT_LIVE = "EVENT_ITEM_NOT_LIVE";

// ── 설정 정리 ─────────────────────────────────────

// 📌 단계 — 시즌 패스 normalizeTiers 그대로(need 오름차순 · level 재부여 · tid 발급/보존 · 보상 정리) 뒤 프리미엄 칸만 버린다.
//    반환 { tiers: [{ tid, level, need, free }], nextTid } — 호출부가 nextTid 도 함께 저장해야 번호가 다시 쓰이지 않는다
export function normalizeEventTiers(tiers, startTid = 1) {
  const rows = (Array.isArray(tiers) ? tiers : []).map((t) => ({ tid: t?.tid, need: t?.need, free: t?.free, paid: [] }));
  const n = normalizeTiers(rows, startTid);
  return { tiers: n.tiers.map((t) => ({ tid: t.tid, level: t.level, need: t.need, free: t.free })), nextTid: n.nextTid };
}

// 📌 설정 문서 → 계산 · 관리 화면이 쓰는 모양. 문서가 없으면 기본값(꺼짐 · 기본 제목 · 기본 기간 · 빈 단계)
//    예전 문서에 남은 missions · nextMid 는 싣지 않는다(미션 폐지 — 위 머리 주석)
export function normalizeEventConfig(doc) {
  const t = normalizeEventTiers(doc?.tiers, doc?.nextTid);
  return {
    key: String(doc?.key || EVENT_PASS_KEY),
    enabled: !!doc?.enabled,
    title: String(doc?.title || "").trim() || EVENT_PASS_DEFAULTS.title,
    startsAt: dateOr(doc?.startsAt, EVENT_PASS_DEFAULTS.startsAt),
    endsAt: dateOr(doc?.endsAt, EVENT_PASS_DEFAULTS.endsAt),
    tiers: t.tiers,
    nextTid: t.nextTid,
    updatedAt: doc?.updatedAt ?? null,
  };
}

// 설정 읽기 — 늘 .lean() + 정리(스키마로 되살려 쓰지 않는다)
export async function loadEventPassConfig() {
  return normalizeEventConfig(await EventPass.findOne({ key: EVENT_PASS_KEY }).lean());
}

// ── 번 XP(기간) ─────────────────────────────────────

// 📌 시즌 패스 번 XP 식(lib/season.js passEarnedPipelines)의 기간판 — [start, end) 안의 XpLog(amount + passBoost) +
//    그 안에 지급된 XP 대기열(amount + passBoost · 빙옥 · 패스 보상 · 역할 환불 · 이벤트 패스 보상 · 관리자 초기화 제외).
//    시즌 쪽 식은 손대지 않는다(시즌 기준선 · 봇 사본과 맞물려 있다).
//    📌 퇴장 초기화 — 세는 구간의 시작은 사람마다 max(이벤트 시작, UserXp 문서가 생긴 시각)(computeState 의 userStart, 시즌 passSince 와 같은 규칙).
//       운영 결정 "퇴장 초기화는 통째"(2026-09-27) — 다시 들어오면 이벤트 진행도도 0 부터. 받은 기록(EventPassClaim)은 남아 같은 단계를 또 받지 않는다
export const eventEarnedPipelines = (userId, start, end) => ({
  logs: [
    { $match: { userId, createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: null, s: { $sum: { $add: ["$amount", { $ifNull: ["$passBoost", 0] }] } } } },
  ],
  pays: [
    { $match: { userId, status: "paid", currency: { $ne: "point" }, source: { $nin: NEUTRAL_SOURCES }, kind: { $ne: "reset" }, paidAt: { $gte: start, $lt: end } } },
    { $group: { _id: null, s: { $sum: { $add: ["$amount", { $ifNull: ["$passBoost", 0] }] } } } },
  ],
});

// 번 XP — 회수(음수 지급)로 0 아래가 되면 0(시즌 패스 진행도와 같은 자르기)
export async function eventEarnedXp(userId, start, end) {
  if (!(end > start)) return 0;
  const { logs, pays } = eventEarnedPipelines(userId, start, end);
  const [l, p] = await Promise.all([XpLog.aggregate(logs), Payout.aggregate(pays)]);
  return Math.max(0, (Number(l[0]?.s) || 0) + (Number(p[0]?.s) || 0));
}

// ── 상태 ─────────────────────────────────────────

const iso = (d) => (d ? new Date(d).toISOString() : null);
const cellLabelOf = (cfg, tier) => `${cfg.title} ${tier.level}단계`;

// 📌 2026-10-18 운영자 "아이템 효과가 뭔지를 알아야 좀 알지?" · "카테고리는 카테고리답게" — 보상 칸 말풍선(app/level/EventPassModal.js)이 쓰는 표기 재료.
//    효과 문장 = 인벤토리 · 상점과 같은 effectLinesOf(lib/itemEffects) — 아이템에 직접 쓴 문구(effectText) > 종류별 틀 > 기본(10/18 「종류별 효과 문구」).
//    꾸미기 효과(카드 배경 · 카드 테두리 · 프로필 테두리 · 프로필 배지)는 거기서 이미 빠진다:
//    그건 분류 칩(categoryLabel)과 「미리보기」(cosmetic — lib/itemCosmetic, 시즌 패스 칸과 같은 값)가 말한다(「프로필 배지」 맨 글자 한 줄이 되지 않게).
//    역할(역할 보상 · 역할이 붙은 아이템)은 역할 버프(RoleConfig — describeRoleBuff, 인벤토리와 같은 문장)를 덧붙인다

// 📌 계산 본체 — 공개 상태(state)와 수령이 쓰는 속값(inner: 설정 · 단계별 보상 키 · 받은 부분)을 같이 돌려준다
//    detail — 보상 칸 말풍선 재료(역할 버프 · 채널 이름)까지 읽는다. 수령 앞의 확인 계산(claimEventPass first)은 끈다(상태 판정엔 안 쓴다)
async function computeState(userId, { isAdmin = false, now = Date.now(), detail = true } = {}) {
  const cfg = await loadEventPassConfig();
  const startMs = cfg.startsAt.getTime();
  const endMs = cfg.endsAt.getTime();
  const open = cfg.enabled && startMs <= now && now < endMs;
  const head = {
    enabled: cfg.enabled,
    key: cfg.key,
    title: cfg.title,
    startsAt: iso(cfg.startsAt),
    endsAt: iso(cfg.endsAt),
    now: iso(now),
    open,
    // 📌 「비공개」 칩은 관리자 미리보기에만(꺼져 있을 때) — 유저는 꺼져 있어도 단계를 보기만 한다(아래)
    adminPreview: !cfg.enabled && !!isAdmin,
  };
  // 📌 2026-10-18 밤 운영자 "비공개긴 한데 이벤트 배너는 들어가지게 바꿔 · 쌓이는 건 19일부터고, 사람들이 클릭해서 화면 보는 건 지금부터" —
  //    꺼져 있어도 · 시작 전이어도 누구나 단계 · 보상을 본다(보기 전용). 진행도는 시작(startsAt)부터만(started), 받기는 open(켜짐 + 기간 안)일 때만.
  //    예전엔 꺼져 있으면 유저에게 빈 단계를 보냈다(그 갈래는 걷었다). 띠는 끝 시각이 지나면 app/level/page.js 가 뺀다

  const until = new Date(Math.min(now, endMs));
  const started = now >= startMs;
  // 📌 사람마다 세는 시작 — 퇴장 초기화로 문서를 지우고 다시 들어온 사람은 새 문서가 생긴 때부터(위 eventEarnedPipelines 주석)
  const me = started ? await UserXp.findOne({ userId }, { _id: 1 }).lean() : null;
  const start = new Date(Math.max(startMs, me?._id?.getTimestamp?.()?.getTime?.() || 0));
  // 아이템 보상은 등록된 아이콘을 같이 실어 보낸다 — 📌 표시만 초안을 덧씌운다(lib/catalogDraft). 지급은 늘 실사이트(Item.findById)
  //    ObjectId 가 아닌 값(손으로 고친 문서)은 묻지 않는다 — 캐스팅 오류로 조회 전체가 500 이 되지 않게(그 칸은 아이콘 없이 그려진다)
  const itemIds = [...new Set(cfg.tiers.flatMap((t) => t.free.map((r) => r.itemId)).filter((v) => mongoose.isValidObjectId(v)))];
  // 📌 수령 기록은 단계 · 부분만 읽는다 — 미션 폐지 전의 "mission" 줄은 진행도에도 받을 수에도 들지 않는다
  //    📌 초안 모드면 실사이트에 있는지를 따로 묻는다(덧씌운 목록엔 반영 전 아이템도 들어 있다) — 아래 hold
  const [earnedXp, claims, itemDocs, liveDocs] = await Promise.all([
    started ? eventEarnedXp(userId, start, until) : 0,
    EventPassClaim.find({ userId, eventKey: cfg.key, kind: { $in: ["tier", "part"] } }, { _id: 0, kind: 1, ref: 1 }).lean(),
    // 📌 효과 문장 · 분류 · 꾸미기 미리보기 재료도 같이(이름 · 분류 · 효과 · 기본 효과 세 칸 · 역할 · 설명)
    itemIds.length
      ? catalogFind(Item, { _id: { $in: itemIds } }, {
          select: { name: 1, type: 1, category: 1, icon: 1, imageUrl: 1, color: 1, roleId: 1, description: 1, effects: 1, effectText: 1, chatBuffXp: 1, voiceBuffXp: 1, attendBuffXp: 1 },
        })
      : [],
    itemIds.length && isDraftMode() ? Item.find({ _id: { $in: itemIds } }, { _id: 1 }).lean() : null,
  ]);
  const itemById = new Map(itemDocs.map((d) => [String(d._id), d]));
  const liveIds = new Set((liveDocs ?? itemDocs).map((d) => String(d._id)));
  // 📌 말풍선 재료 — 역할 버프(역할 보상 · 역할이 붙은 아이템) · 채널 하나만 지정한 효과의 채널 이름(lib/channelNames — 없으면 "지정 채널 1곳").
  //    읽기 실패는 문장만 빠진다(상태 · 수령은 그대로)
  const roleIds = detail
    ? [...new Set([...cfg.tiers.flatMap((t) => t.free.filter((r) => r.kind === "role").map((r) => r.roleId)), ...itemDocs.map((d) => d.roleId)].filter(Boolean).map(String))]
    : [];
  const [roleCfgs, chNames] = detail
    ? await Promise.all([
        roleIds.length ? RoleConfig.find({ roleId: { $in: roleIds } }, { _id: 0, roleId: 1, buffXp: 1, attendBuffXp: 1 }).lean().catch(() => []) : [],
        channelNamesFor(itemDocs.map((d) => d.effects)).catch(() => new Map()),
      ])
    : [[], new Map()];
  const roleCfgOf = new Map(roleCfgs.map((c) => [String(c.roleId), c]));
  const chName = (id) => chNames.get(String(id));
  const buffOf = (roleId) => (roleId && roleCfgOf.has(String(roleId)) ? describeRoleBuff(roleCfgOf.get(String(roleId))) : []);
  const tierDone = new Set();
  const parts = new Set();
  for (const c of claims) {
    if (c.kind === "tier") tierDone.add(String(c.ref));
    else if (c.kind === "part") parts.add(String(c.ref));
  }
  // 📌 패스 XP = 기간 중 번 XP 그대로(미션 보너스 없음)
  const passXp = earnedXp;

  // 📌 단계 상태 — done: 받음(받을 보상이 없는 단계는 닿으면 done) · ready: 닿았고 남은 보상이 있음 · lock: 아직 못 닿음.
  //    ready 는 닿았는지로만 정한다 — 끝난 뒤에도 랜턴이 꺼지지 않게. 지금 받을 수 있는지는 open(과 claimable)이 말한다
  const innerTiers = [];
  const tiers = cfg.tiers.map((t) => {
    const keys = rewardKeys(t.tid, t.free);
    const whole = tierDone.has(t.tid);
    const pending = t.free.filter((r, j) => !whole && !parts.has(keys[j]));
    const reached = passXp >= t.need;
    const state = t.free.length && !pending.length ? "done" : !reached ? "lock" : t.free.length ? "ready" : "done";
    // 📌 hold — 남은 보상에 실사이트에 없는 아이템(반영 전 · 지워짐)이 있다. 상태(ready)는 그대로 두고 받기만 거절한다(claimEventPass).
    //    계약 밖 덧붙임 — 화면은 모두 받기 뒤 못 받은 단계를 알리는 데 쓴다(app/level/EventPassModal.js)
    const hold = pending.some((r) => r.kind === "item" && !liveIds.has(r.itemId));
    innerTiers.push({ ...t, keys, state, hold });
    return {
      tid: t.tid,
      level: t.level,
      need: t.need,
      state,
      hold,
      rewards: t.free.map((r, j) => {
        const item = r.kind === "item" ? itemById.get(r.itemId) : null;
        const cosmetic = item ? cosmeticOf(item) : null;
        const effectLines = item ? [...effectLinesOf(item, chName), ...buffOf(item.roleId)] : r.kind === "role" ? buffOf(r.roleId) : [];
        return {
          kind: r.kind,
          amount: r.amount,
          itemId: r.itemId,
          itemName: r.itemName,
          icon: item?.icon || "",
          days: r.days,
          roleName: r.roleName,
          label: rewardLabel(r),
          short: rewardShort(r),
          // 📌 계약 밖 덧붙임(시즌 패스 칸과 같은 표기 재료) — 그림 아이콘 · 색 · 유형
          imageUrl: item?.imageUrl || "",
          itemType: item?.type || "",
          color: item?.color || "",
          // 📌 2026-10-18 말풍선 · 칸 재료(계약 밖 덧붙임) —
          //    claimed: 이 보상을 받았는지(단계 통째 · 부분 수령 표시) — 일부만 받은 단계는 받은 칸에 배지
          //    shortName · categoryLabel: 상점 칩과 같은 규칙(lib/itemCategory — 직접 정한 분류 > 옛 이름 머리말 > 자동). 이름엔 기간 꼬리 · 분류 머리말이 없다
          //    effectLines: 효과 문장(위 effectLinesOf · 역할 버프) · cosmetic: 꾸미기 미리보기 재료 · desc: 효과 문장 · 꾸미기가 없을 때만 아이템 설명
          claimed: whole || parts.has(keys[j]),
          shortName: r.kind === "item" ? shortNameOf(item?.name || r.itemName || "") || itemTypeLabel(item?.type) : r.kind === "role" ? r.roleName || "" : "",
          categoryLabel: r.kind === "item" ? resolveCategory(item || { name: r.itemName, type: "item" }) : r.kind === "role" ? itemTypeLabel("role") : "",
          effectLines,
          ...(cosmetic ? { cosmetic } : {}),
          ...(!effectLines.length && !cosmetic && item?.description ? { desc: String(item.description) } : {}),
        };
      }),
    };
  });

  const level = cfg.tiers.filter((t) => passXp >= t.need).length;
  const nextTier = cfg.tiers.find((t) => passXp < t.need);
  const ready = tiers.filter((t) => t.state === "ready").length;
  return {
    state: {
      ...head,
      earnedXp,
      passXp,
      level,
      maxLevel: cfg.tiers.length,
      next: nextTier ? { level: nextTier.level, need: nextTier.need, left: nextTier.need - passXp } : null,
      tiers,
      // 지금 받을 수 있는 수 — 열려 있을 때만(끝났거나 시작 전이면 0)
      claimable: open ? ready : 0,
    },
    inner: { cfg, tiers: innerTiers },
  };
}

// 📌 이벤트 패스 상태 — 계약(GET /api/event-pass 로그인 응답)의 본문을 그대로 만든다(ok 는 라우트가 붙인다)
export async function getEventPassState(userId, opts = {}) {
  return (await computeState(userId, opts)).state;
}

// 비로그인 — 열려 있는지 · 제목 · 기간만
export async function getEventPassGuest() {
  const cfg = await loadEventPassConfig();
  return { enabled: cfg.enabled, title: cfg.title, startsAt: iso(cfg.startsAt), endsAt: iso(cfg.endsAt) };
}

// ── 지급 ─────────────────────────────────────────

// 📌 상점 결제 자물쇠를 잠깐 기다렸다 잡는다 — lib/seasonPass.js takeShopLock 과 같은 규칙(내보내지 않아 옮겨 둔다 — 바꾸면 같이)
async function takeShopLock(userId, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const lock = await ShopLock.acquire(userId);
    if (lock) return lock;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

// 📌 기간제 아이템 보상의 기보유 판정 — lib/seasonPass.js planTimedItem 과 같은 규칙(내보내지 않아 옮겨 둔다 — 바꾸면 같이).
//    ×N 아이템은 늘 새로 · 무기한 보유면 { block } · 전부 기간제면 { renew } 가장 늦은 끝에 이어 붙임 · 보유 없음 {}
async function planTimedItem(userId, item) {
  const itemId = String(item._id);
  const shops = await ShopItem.find({ itemId }, { type: 1, roleId: 1, itemId: 1, unitSale: 1, durations: 1 }).lean();
  if (unitThingSet(shops, [item]).has(`i:${itemId}`)) return {};
  const shopIds = shops.map((s) => String(s._id));
  const live = await Purchase.find(
    {
      userId,
      status: { $in: ["pending", "completed"] },
      consumedAt: null,
      $and: [
        { $or: [{ itemRef: itemId }, ...(shopIds.length ? [{ itemId: { $in: shopIds } }] : [])] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
    },
    { expiresAt: 1 }
  ).lean();
  if (!live.length) return {};
  const forever = live.find((p) => !p.expiresAt);
  if (forever) return { block: forever };
  return { renew: live.reduce((a, b) => (new Date(b.expiresAt).getTime() > new Date(a.expiresAt).getTime() ? b : a)) };
}

// 📌 보상 지급 — 시즌 패스 grantReward(lib/seasonPass.js)와 같은 길, 표시만 이벤트 것:
//    xp   : Payout 대기열(source EVENT_PASS_SOURCE — 봇이 지급 + 레벨 재계산 + 역할 동기화, 기준선도 같이 올린다)
//    point: addPoints 로 바로(원장은 수령이 한 줄로 — claimTier)
//    role : Purchase 대기열(itemId EVENT_PASS_ITEM_ID) — 봇이 역할을 붙인다
//    item : Purchase(itemRef) — days > 0 이면 상점 기간제와 같은 연장 · 1인 1개(planTimedItem · timingOf)
//    cell — 받은 칸 이름("유령 펭귄의 초대 3단계"). Payout.reason · Purchase.passCell · 역할 이름 꼬리에 쓴다
export async function grantEventReward(userId, reward, cell, userName = "") {
  const kind = reward?.kind;
  const amount = num(reward?.amount);
  const result = { kind: kind || "none", amount, label: cell, queued: false, point: null };

  if (kind === "xp") {
    await Payout.create({ userName: userName || userId, userId, amount, reason: cell, source: EVENT_PASS_SOURCE });
    result.queued = true;
    return result;
  }

  if (kind === "point") {
    const doc = await addPoints(userId, amount);
    result.point = doc?.point ?? null;
    return result;
  }

  if (kind === "role") {
    await Purchase.create({
      userId,
      userName,
      itemId: EVENT_PASS_ITEM_ID,
      // itemName 이 인벤토리 카드 · 봇 로그 · DM 에 그대로 찍힌다 — 역할 이름을 앞에 둔다(시즌 패스와 같은 모양)
      itemName: `${reward.roleName || "역할"} (${cell})`,
      passCell: cell,
      itemType: "role",
      roleId: reward.roleId,
      price: 0,
      payMethod: "xp",
      paidXp: 0,
      paidPoint: 0,
      days: 0,
      status: "pending",
    });
    result.queued = true;
    return result;
  }

  if (kind === "item") {
    // 📌 지급은 늘 실사이트 Item — 초안에만 있는(반영 전) 아이템은 주지 않는다(위 「아이템 보상 상태」)
    const item = await Item.findById(reward.itemId).lean().catch(() => null);
    // 아이템이 없으면 던진다 — 이 보상만 못 받은 것으로 남겨, 반영하거나 관리자가 고친 뒤 다시 받을 수 있게(시즌 패스와 같다)
    if (!item) throw Object.assign(new Error(`이벤트 패스 아이템 보상을 찾을 수 없습니다: ${reward.itemId}`), { code: NOT_LIVE });
    const hasRole = !!item.roleId;
    const days = item.type === "physical" ? 0 : num(reward?.days, { max: MAX_REWARD_DAYS });
    let timing = { renewOf: "", startsAt: null, expiresAt: null };
    let lock = null;
    try {
      if (days > 0) {
        lock = await takeShopLock(userId);
        if (!lock) throw new Error(`처리 중인 결제가 있어 기간제 아이템 보상을 지급하지 못했습니다: ${reward.itemId}`);
        const plan = await planTimedItem(userId, item);
        if (plan.block) {
          // 이미 무기한으로 가졌다 — 만들지 않고 받은 것으로 친다
          result.kept = true;
          return result;
        }
        timing = timingOf(plan, days);
      }
      await Purchase.create({
        userId,
        userName,
        itemId: EVENT_PASS_ITEM_ID,
        itemRef: String(item._id),
        itemName: item.name,
        passCell: cell,
        itemType: item.type,
        roleId: item.roleId || "",
        price: 0,
        payMethod: "xp",
        paidXp: 0,
        paidPoint: 0,
        days,
        expiresAt: timing.expiresAt,
        renewOf: timing.renewOf,
        startsAt: timing.startsAt,
        status: hasRole ? "pending" : "completed",
        processedAt: hasRole ? undefined : new Date(),
      });
    } finally {
      if (lock) await ShopLock.release(lock);
    }
    result.queued = hasRole;
    result.renewed = !!timing.renewOf;
    return result;
  }

  return result;
}

// ── 수령 ─────────────────────────────────────────

// 📌 유니크 인덱스 — 수령(쓰기) 직전에 한 번(models/EventPassClaim 의 ⚠️). 실패하면 다음 수령이 다시 만든다
let indexJob = null;
const ensureClaimIndexes = () => {
  if (!indexJob) {
    indexJob = EventPassClaim.createIndexes().catch((e) => {
      indexJob = null;
      throw e;
    });
  }
  return indexJob;
};
const isDup = (e) =>
  e?.code === 11000 ||
  (Array.isArray(e?.writeErrors) && e.writeErrors.length > 0 && e.writeErrors.every((w) => (w?.code ?? w?.err?.code) === 11000));
const refusal = (status, error) => ({ ok: false, status, error });
// 실사이트에 없는 아이템 때문에 못 받음 — 단계는 쓰지 않은 채(자물쇠를 푼 채) 거절한다. hold 로 다른 거절과 가른다(모두 받기의 대표 오류)
const holdRefusal = () => ({ ...refusal(409, HOLD_MESSAGE), hold: true });

// 📌 단계 하나 받기 — 시즌 패스 claimCell 과 같은 순서:
//    1) 단계 줄을 넣는다(자물쇠 — 유니크라 동시에 눌러도 한 요청만) 2) 자물쇠를 잡은 뒤의 부분 수령 표시로 남은 보상만 고른다
//    2-1) 📌 남은 보상에 실사이트에 없는 아이템(반영 전 · 지워짐)이 있으면 아무것도 주지 않고 자물쇠를 푼다(holdRefusal) —
//         단계가 그대로 남아 반영 뒤 다시 받으면 전부 받는다. 부분 수령 표시는 건드리지 않아 이미 받은 보상을 또 주지 않는다
//    3) 보상마다 따로 지급(하나가 실패해도 나머지는 준다)
//    4) 다 줬으면 부분 표시를 치운다 · 하나도 못 줬으면 단계 줄을 지운다(처음과 같다) ·
//       일부만 줬으면 받은 보상을 부분 표시로 먼저 적고 나서 단계 줄을 지운다(이 순서여야 푸는 순간 다른 요청이 받은 것을 또 주지 않는다).
//       적기에 실패하면 자물쇠를 그대로 둔다 — 남은 보상을 못 받는 쪽이 같은 보상을 두 번 주는 쪽보다 낫다(운영진이 수동 지급)
async function claimTier({ userId, userName, cfg, tier }) {
  const base = { userId, eventKey: cfg.key };
  try {
    await EventPassClaim.create({ ...base, kind: "tier", ref: tier.tid, level: tier.level });
  } catch (e) {
    if (isDup(e)) return refusal(409, "이미 받았습니다.");
    throw e;
  }
  const done = new Set(
    (await EventPassClaim.find({ ...base, kind: "part", ref: { $in: tier.keys } }, { _id: 0, ref: 1 }).lean()).map((p) => String(p.ref))
  );
  const clearParts = () => (done.size ? EventPassClaim.deleteMany({ ...base, kind: "part", ref: { $in: [...done] } }).catch(() => {}) : null);
  const todo = tier.free.map((r, j) => ({ r, key: tier.keys[j] })).filter((x) => !done.has(x.key));
  if (!todo.length) {
    await clearParts();
    return refusal(409, "이미 받았습니다.");
  }
  const unlock = () => EventPassClaim.deleteOne({ ...base, kind: "tier", ref: tier.tid });
  // 📌 보류 · 실패로 자물쇠를 풀 때 — 풀기마저 실패하면 그 단계가 받은 것처럼 잠긴다(지급 0). 조용히 삼키지 않고 남겨 수동으로 확인하게
  const unlockQuiet = () => unlock().catch((e) => console.error("[event-pass] 자물쇠 해제 실패 — 수동 확인 필요", { userId: base.userId, eventKey: base.eventKey, tid: tier.tid, err: e?.message }));
  // 2-1) 자물쇠를 잡은 뒤에 다시 묻는다 — 조회(computeState)와 이 사이에 반영 · 삭제가 있었어도 지금 값으로 가른다
  //      묻다가 실패해도 자물쇠를 푼다(아무것도 주지 않았다 — 단계가 받은 것으로 굳지 않게)
  let notLive;
  try {
    notLive = await notLiveItemIds(todo.map((x) => x.r));
  } catch (e) {
    await unlockQuiet();
    throw e;
  }
  if (notLive.length) {
    await unlockQuiet();
    return holdRefusal();
  }

  const cell = cellLabelOf(cfg, tier);
  const granted = [];
  const failed = [];
  for (const x of todo) {
    try {
      granted.push({ ...x, g: await grantEventReward(userId, x.r, cell, userName) });
    } catch (e) {
      console.error(`이벤트 패스 보상 지급 실패 (${userId} ${cfg.key} ${tier.tid} ${x.key}):`, e);
      failed.push({ ...x, hold: e?.code === NOT_LIVE });
    }
  }

  if (!failed.length) {
    await clearParts();
    await EventPassClaim.updateOne({ ...base, kind: "tier", ref: tier.tid }, { $set: { labels: granted.map((x) => rewardLabel(x.r)) } }).catch(() => {});
  } else if (!granted.length) {
    await unlockQuiet();
  } else {
    try {
      await EventPassClaim.insertMany(
        granted.map((x) => ({ ...base, kind: "part", ref: x.key, level: tier.level, labels: [rewardLabel(x.r)] })),
        { ordered: false }
      ).catch((e) => {
        if (!isDup(e)) throw e;
      });
      await unlock();
    } catch (e) {
      console.error(`이벤트 패스 부분 수령 기록 실패 — 자물쇠 유지 (${userId} ${cfg.key} ${tier.tid}):`, e);
    }
  }
  // 하나도 못 줬다 — 확인과 지급 사이에 아이템이 빠진 것뿐이면 같은 거절(holdRefusal), 아니면 오류
  if (!granted.length) return failed.every((x) => x.hold) ? holdRefusal() : refusal(500, "수령 중 오류가 발생했습니다.");

  // 📌 빙옥 보상은 잔액에 바로 들어가고 Payout 이 없다 — 원장에 이번 수령분 합계 한 줄(시즌 패스 claimCell 과 같다 · 종류만 이벤트 것)
  const pointSum = granted.reduce((s, x) => s + (x.g.kind === "point" ? x.g.amount : 0), 0);
  if (pointSum > 0) {
    await logWallet({ userId, currency: "point", amount: pointSum, kind: EVENT_POINT_KIND, label: cell, refId: `${cfg.key}:${tier.tid}` });
  }
  return { ok: true, kind: "tier", ref: tier.tid, labels: granted.map((x) => rewardLabel(x.r)), partial: failed.length > 0 };
}

// 📌 받기 — body { kind: "tier" | "all", ref? }. 상태는 매번 서버가 다시 센다(클라이언트 값은 쓰지 않는다).
//    받을 수 있는 때: 켜져 있음 · 시작 ≤ 지금 < 끝. 모두 받기 = 받을 수 있는 단계 전부(미션 없음 — 머리 주석).
//    반환 { ok: true, claimed: [{ kind, ref, labels }], state } · { ok: false, status, error, hold? }(hold — 실사이트에 없는 아이템 · HOLD_MESSAGE)
export async function claimEventPass({ userId, userName = "", kind, ref = "", isAdmin = false }) {
  const first = await computeState(userId, { isAdmin, detail: false });
  const { state } = first;
  if (!state.enabled) return refusal(403, "이벤트 패스가 열려 있지 않습니다.");
  if (!state.open) return refusal(403, Date.parse(state.now) < Date.parse(state.startsAt) ? "아직 시작 전입니다." : "이벤트가 끝났습니다.");
  await ensureClaimIndexes();
  const { cfg } = first.inner;
  const claimed = [];

  if (kind === "tier") {
    const id = String(ref || "");
    const tier = first.inner.tiers.find((t) => t.tid === id);
    if (!tier) return refusal(404, "존재하지 않는 단계입니다.");
    if (tier.state === "done") return refusal(409, "이미 받았습니다.");
    if (tier.state !== "ready") return refusal(400, "아직 도달하지 않았습니다.");
    // 📌 실사이트에 없는 아이템이 남은 단계 — 자물쇠를 잡기 전에 거절한다(쓰기 없음). 그 사이의 변화는 claimTier 가 다시 본다
    if (tier.hold) return holdRefusal();
    const r = await claimTier({ userId, userName, cfg, tier });
    if (!r.ok) return r;
    claimed.push({ kind: r.kind, ref: r.ref, labels: r.labels });
  } else if (kind === "all") {
    // 한 건이 실패해도(이미 받음 — 다른 탭 · 동시 요청, 지급 오류, 📌 실사이트에 없는 아이템) 받은 건은 그대로 두고 나머지를 계속 받는다.
    //    못 받은 단계는 돌려주는 상태(state)의 tiers[].hold 로 보인다(ready 그대로) — 화면이 그것으로 알린다(app/level/EventPassModal.js)
    const errors = [];
    const take = async (fn, what) => {
      try {
        const r = await fn();
        if (r.ok) claimed.push({ kind: r.kind, ref: r.ref, labels: r.labels });
        else errors.push(r);
      } catch (e) {
        console.error(`이벤트 패스 모두 받기 중 실패 (${userId} ${cfg.key} ${what}):`, e);
        errors.push(refusal(500, "수령 중 오류가 발생했습니다."));
      }
    };
    for (const tier of first.inner.tiers.filter((t) => t.state === "ready")) {
      if (tier.hold) errors.push(holdRefusal());
      else await take(() => claimTier({ userId, userName, cfg, tier }), tier.tid);
    }
    // 하나도 못 받았으면 대표 오류 하나 — 기다리면 받을 수 있는 거절(hold)을 먼저 알린다
    if (!claimed.length) return errors.find((e) => e.hold) || errors[0] || refusal(409, "지금 받을 보상이 없습니다.");
  } else {
    return refusal(400, "요청이 올바르지 않습니다.");
  }

  // 받은 뒤의 상태 — 조회(GET)와 같은 본문
  return { ok: true, claimed, state: await getEventPassState(userId, { isAdmin }) };
}

// ── 관리자 ─────────────────────────────────────────

// 📌 관리 화면 응답 모양(GET · PUT /api/admin/event-pass 의 pass) — 날짜는 ISO 글자. tid 가 실려 나간다(화면은 그대로 되돌려 보내야 한다)
export const toAdminEventPass = (doc) => {
  const c = normalizeEventConfig(doc);
  return { ...c, startsAt: iso(c.startsAt), endsAt: iso(c.endsAt), updatedAt: c.updatedAt ? iso(c.updatedAt) : null };
};
