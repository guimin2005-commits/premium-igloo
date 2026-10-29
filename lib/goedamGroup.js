import crypto from "node:crypto";
import mongoose from "mongoose";
import GoedamGroupEvent from "@/models/GoedamGroupEvent";
import GoedamGroup from "@/models/GoedamGroup";
import GoedamGroupMember from "@/models/GoedamGroupMember";
import GoedamGiftCode from "@/models/GoedamGiftCode";
import GoedamGroupBonus from "@/models/GoedamGroupBonus";
import Notification from "@/models/Notification";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";
import XpLog from "@/models/XpLog";
import { CODE_ALPHABET, CODE_LEN, normalizeCode, isCodeShape, snowflakeMs } from "@/lib/invite";
import { loadGoedamConfig } from "@/lib/goedam";
import { ticketOrderId, ticketPurchaseDocs, SCREENING_TICKETS } from "@/lib/goedamRules";
import { eventItemStates } from "@/lib/eventPass";
import { fetchGuildMember } from "@/lib/discordMember";
import { isDup, refusal } from "@/lib/rewardGrant";
import { GROUP_GAMES, GAME_OTHER } from "@/lib/goedamGames";

// 📌 게임 그룹 지원(방구석 심야 괴담회 — 2026-10-25 운영자 결정, 약속 문서 .claude/mockups/goedam-group/SPEC.md) 계산의 단일 진실 —
//    조회 · 동작(GET · POST /api/goedam/group) · 관리(app/api/admin/goedam/groups)가 반드시 이 파일을 함께 쓴다.
//    클라이언트가 보낸 수 · 상태는 절대 믿지 않는다(lib/invite.js 와 같은 원칙).
//    · "게임 할 그룹을 모아오면 문화상품권을 지원" — 참여 링크(/level?gg=CODE)로 멤버를 모으고, 그룹장이 지원 → 관리자 심사 → 승인이면 멤버 1인당 상품권 번호 한 장
//    · 1인당 그룹 1개(만들기 또는 참여) — models/GoedamGroupMember 자물쇠(userId 유니크)를 먼저 넣고 그룹을 고친다. 그룹 쓰기가 실패하면 자물쇠를 지운다
//    · 열림 = 켜짐 · 시작 ≤ 지금 < 끝(groupOpen). 꺼져 있으면 관리자만 미리 본다(「유저 화면으로 보기」 중엔 유저와 같게 — 라우트가 isAdminViewer 로 넘긴다)
//    · 로그인 필수(손님은 보기만). 디스코드 숫자 ID 가 아니면(테스트 DEV_LOGIN 의 아무 글자) 쓰기 거절 — 실서버 DB 에 흔적을 남기지 않는다
//    · 심사 중(review) · 승인(approved)에는 멤버 · 내용 변경 · 나가기 · 해체 전부 막는다. 승인 취소는 없다
//    · 화면(유저 API)에는 남의 디스코드 ID 를 내보내지 않는다 — 멤버는 mid(memberMid)로 가리킨다
//    · 지원 보너스(§6b) — 지원하기가 성공하면 멤버 전원에게 괴담회 추첨권 applyTickets 장(1인 평생 1번 — models/GoedamGroupBonus 자물쇠).
//      못 줘도 지원은 성공한다(관리 › 그룹 지원 상세 「추첨권 다시 지급」 — regrantGroupBonus)
//    · 순수 함수(정리 · 판정 · 문구)는 DB 없이 시험한다 — scripts/test-goedam-group.mjs

// ── 키 · 기본값 · 범위 ─────────────────────────────
// 설정 문서 하나(models/GoedamGroupEvent key)
export const GROUP_KEY = "goedam-group";
// 📌 기본값 — 설정 문서가 없을 때(꺼짐). 2026-10-25 운영자 "신청 지원 31일까지" — 끝 11. 1. 00:00(들어가지 않는다 — 10. 31. 23:59:59 까지)
export const GROUP_DEFAULTS = {
  startsAt: "2026-10-25T00:00:00.000+09:00",
  endsAt: "2026-11-01T00:00:00.000+09:00",
  minMembers: 4,
  maxMembers: 10,
  applyTickets: 5,
};
// 인원 범위(관리 저장이 같은 값으로 막는다) — 최소 2~20명 · 최대 최소~50명
export const MIN_MEMBERS = { min: 2, max: 20 };
export const MAX_MEMBERS_CAP = 50;
// 📌 지원 보너스 추첨권 장 수(관리 저장이 같은 값으로 막는다) — 0~20장 · 0 = 안 줌
export const APPLY_TICKETS = { min: 0, max: 20 };
// 지원 보너스 추첨권 주문 묶음 — orderId "goedam:group:<userId>"(lib/goedamRules.js ticketOrderId) · Purchase.adminNote 「게임 그룹 지원」
//    1인 평생 1번이라 그룹 · 회차가 묶음 글자에 들지 않는다(다른 그룹으로 다시 받아도 같은 묶음 — 모자란 만큼만 넣는다)
export const BONUS_SID = "group";
export const BONUS_NOTE = "게임 그룹 지원";
const BONUS_SCREENING = { sid: BONUS_SID, title: BONUS_NOTE };
// 글자 수(코드 포인트로 센다)
export const NAME_MAX = 20;
export const GAME_MAX = 30;
export const REASON_MAX = 100;
// 상품권 번호 붙여 넣기 — 한 번에 500줄 · 한 줄 100자
export const GIFT_LINES_MAX = 500;
export const GIFT_CODE_MAX = 100;
// 그룹 상태 · 그룹장이 고칠 수 있는 상태(멤버 나가기 · 내보내기 · 고치기 · 해체 · 지원)
export const GROUP_STATUS = ["open", "review", "approved", "rejected"];
export const EDITABLE_STATUS = ["open", "rejected"];
export const isEditable = (status) => EDITABLE_STATUS.includes(status);
// 「언제」로 받는 날짜 범위(그 밖은 잘못 넣은 값)
const WHEN_MIN = Date.parse("2020-01-01T00:00:00.000Z");
const WHEN_MAX = Date.parse("2100-01-01T00:00:00.000Z");
// 지우다 실패한 자물쇠로 볼 나이 — 만들기 · 참여가 도는 동안(자물쇠 → 그룹 사이)의 자물쇠는 건드리지 않게 넉넉히
const STALE_LOCK_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
// 관리 목록 — 심사 중은 전부 · 나머지는 최근 이만큼
const ADMIN_LIST_MAX = 1000;
// 관리 상세의 디스코드 멤버 조회 — 한꺼번에 이만큼씩(429 요청 제한을 피한다)
const GUILD_LOOKUP_BATCH = 5;
// 이름이 비었을 때 — 남에게 보이는 자리에 ID 를 대신 내보내지 않는다
const NO_NAME = "이름 없음";
const SNOWFLAKE = /^\d{17,20}$/;

// ── 문구 ─────────────────────────────────────────
// 📌 유저 화면 거절 문구 — 한국어 한 줄(화면은 서버 error 를 그대로 토스트에 띄운다). 약속 문서 §3 의 글자 그대로
export const MSG = {
  login: "로그인이 필요합니다",
  account: "참여할 수 없는 계정입니다",
  hasGroup: "이미 다른 그룹에 있습니다",
  full: "그룹이 꽉 찼습니다",
  closed: "모집이 끝난 그룹입니다",
  notOpen: "지원 기간이 아닙니다",
  notFound: "그룹을 찾을 수 없습니다",
  leaderOnly: "그룹장만 할 수 있습니다",
  leaderLeave: "그룹장은 나갈 수 없습니다",
  leaderKick: "그룹장은 내보낼 수 없습니다",
  noMember: "멤버를 찾을 수 없습니다",
  review: "심사 중인 그룹입니다",
  approved: "승인된 그룹입니다",
  nothing: "바꿀 내용이 없습니다",
  bad: "잘못된 요청입니다",
};
export const minMsg = (n) => `최소 ${n}명부터 지원할 수 있습니다`;
// 관리 화면 문구(사무적 공식 톤)
const ADMIN_MSG = {
  notFound: "그룹을 찾을 수 없습니다.",
  notReview: "심사 중인 그룹이 아닙니다.",
  notApplied: "지원하지 않은 그룹입니다.",
  zeroTickets: "지원 보너스 추첨권 장 수가 0장입니다.",
  noneLeft: "미지급 멤버가 없습니다.",
  grantFailed: "추첨권을 지급하지 못했습니다.",
  noTicketItem: "추첨권 아이템이 지정되지 않았습니다.",
  notLive: "추첨권 아이템이 실사이트에 없습니다.",
  goedamOff: "괴담회가 꺼져 있습니다.",
  drawClosed: "괴담회 추첨이 마감되었습니다.",
};
export const shortMsg = (need, left) => `상품권 번호가 모자랍니다 · 필요 ${need} · 남은 ${left}`;

// 📌 알림(models/Notification) 본문 — 승인은 멤버 전원, 반려는 그룹장에게
export const approveNotice = (groupName) => ({
  type: "축하",
  title: "게임 그룹 지원 승인",
  content: `「${groupName}」 지원이 승인되었습니다. 이벤트 › 게임 그룹 지원에서 문화상품권 번호를 확인하세요.`,
});
export const rejectNotice = (groupName, reason) => ({
  type: "안내",
  title: "게임 그룹 지원 반려",
  content: `「${groupName}」 지원이 반려되었습니다. 사유: ${reason}`,
});

// ── 작은 도우미 ─────────────────────────────────────
const iso = (d) => {
  if (d == null || d === "") return null;
  const t = new Date(d);
  return Number.isFinite(t.getTime()) ? t.toISOString() : null;
};
const intIn = (v, min, max, def) => {
  const n = Number(v);
  if (v == null || v === "" || typeof v === "boolean" || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
};
const isInt = (v, min, max) =>
  v !== "" && v !== null && v !== undefined && typeof v !== "boolean" && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;
const dateOr = (v, fallback) => {
  const d = v ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d : new Date(fallback);
};
const dateOf = (v) => {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};
// 디스코드 숫자 ID 인가(DEV_LOGIN 의 아무 글자는 아니다)
export const isDiscordId = (id) => SNOWFLAKE.test(String(id ?? ""));

// ── 설정 ─────────────────────────────────────────
// 📌 설정 문서 → 계산 · 관리 화면이 쓰는 모양. 문서가 없거나 칸이 비면 기본값(꺼짐 · 10. 25. ~ 11. 9. KST · 4 · 10 · 지원 보너스 5장).
//    최대 인원은 최소 인원보다 작아지지 않는다(최소~50) · 지원 보너스는 0~20장(칸이 없던 옛 문서는 기본 5장)
export function normalizeGroupConfig(doc) {
  const D = GROUP_DEFAULTS;
  const minMembers = intIn(doc?.minMembers, MIN_MEMBERS.min, MIN_MEMBERS.max, D.minMembers);
  const maxMembers = intIn(doc?.maxMembers, minMembers, MAX_MEMBERS_CAP, Math.max(minMembers, D.maxMembers));
  return {
    key: String(doc?.key || GROUP_KEY),
    enabled: !!doc?.enabled,
    startsAt: dateOr(doc?.startsAt, D.startsAt),
    endsAt: dateOr(doc?.endsAt, D.endsAt),
    minMembers,
    maxMembers,
    applyTickets: intIn(doc?.applyTickets, APPLY_TICKETS.min, APPLY_TICKETS.max, D.applyTickets),
    updatedAt: doc?.updatedAt ?? null,
  };
}

// 📌 열림 — 켜짐 · 시작 ≤ 지금 < 끝(끝 시각은 들어가지 않는다). 만들기 · 참여 · 지원은 열려 있을 때만
export const groupOpen = (cfg, now = Date.now()) =>
  !!cfg?.enabled && Number(now) >= cfg.startsAt.getTime() && Number(now) < cfg.endsAt.getTime();

// 📌 관리 저장(PUT config) 검사 — 온 칸만 지금 값에 얹어 본 뒤 { ok: true, set }(바뀐 칸만) · 아니면 { ok: false, error }.
//    정리 함수(normalizeGroupConfig)가 조용히 고칠 값(범위 밖 · 정수 아님 · 시작 ≥ 끝 · 최대 < 최소)을 먼저 돌려보낸다
export function checkConfigPatch(cur, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "설정 형식이 올바르지 않습니다." };
  const set = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") return { ok: false, error: "사용 여부 형식이 올바르지 않습니다." };
    set.enabled = input.enabled;
  }
  if (input.startsAt !== undefined) {
    const d = dateOf(input.startsAt);
    if (!d) return { ok: false, error: "시작 시각이 올바르지 않습니다." };
    set.startsAt = d;
  }
  if (input.endsAt !== undefined) {
    const d = dateOf(input.endsAt);
    if (!d) return { ok: false, error: "끝 시각이 올바르지 않습니다." };
    set.endsAt = d;
  }
  if (input.minMembers !== undefined) {
    if (!isInt(input.minMembers, MIN_MEMBERS.min, MIN_MEMBERS.max)) {
      return { ok: false, error: `최소 인원은 ${MIN_MEMBERS.min}~${MIN_MEMBERS.max}명 사이 정수로 입력해 주십시오.` };
    }
    set.minMembers = Number(input.minMembers);
  }
  const min = set.minMembers ?? cur.minMembers;
  if (input.maxMembers !== undefined) {
    if (!isInt(input.maxMembers, min, MAX_MEMBERS_CAP)) {
      return { ok: false, error: `최대 인원은 ${min}~${MAX_MEMBERS_CAP}명 사이 정수로 입력해 주십시오.` };
    }
    set.maxMembers = Number(input.maxMembers);
  }
  if (input.applyTickets !== undefined) {
    if (!isInt(input.applyTickets, APPLY_TICKETS.min, APPLY_TICKETS.max)) {
      return { ok: false, error: `지원 보너스 추첨권은 ${APPLY_TICKETS.min}~${APPLY_TICKETS.max}장 사이 정수로 입력해 주십시오.` };
    }
    set.applyTickets = Number(input.applyTickets);
  }
  if ((set.maxMembers ?? cur.maxMembers) < min) return { ok: false, error: "최대 인원은 최소 인원 이상이어야 합니다." };
  const start = (set.startsAt ?? cur.startsAt).getTime();
  const end = (set.endsAt ?? cur.endsAt).getTime();
  if (start >= end) return { ok: false, error: "끝 시각은 시작 시각보다 뒤여야 합니다." };
  return { ok: true, set };
}

// ── 입력 정리 ───────────────────────────────────────
// 📌 글자 정리 — 제어 글자 · 폭 없는 글자 · 방향 바꿈 글자를 빈칸으로, 빈칸은 하나로, 앞뒤 빈칸 빼기(이모지 잇기 글자 ZWJ 는 둔다)
export const cleanText = (v) =>
  String(v ?? "")
    .replace(/[\p{Cc}​‌‎‏‪-‮⁠-⁤⁦-⁩﻿]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const lenOf = (s) => [...s].length;
function checkText(v, max, emptyMsg, longMsg) {
  const value = cleanText(v);
  if (!value) return { ok: false, error: emptyMsg };
  if (lenOf(value) > max) return { ok: false, error: longMsg };
  return { ok: true, value };
}
export const checkName = (v) => checkText(v, NAME_MAX, "그룹 이름을 입력해 주세요", `그룹 이름은 ${NAME_MAX}자까지입니다`);
// 📌 2026-10-25 운영자 "게임 이름 적는 게 아니라 선택하는 방식" — lib/goedamGames.js GROUP_GAMES 안의 것만 받는다(화면은 칩으로 고름)
export const checkGame = (v) => {
  const value = cleanText(v);
  if (!value) return { ok: false, error: "게임을 골라 주세요" };
  if (GROUP_GAMES.includes(value)) return { ok: true, value };
  // 📌 2026-10-26 「기타」 — 표에 없는 이름은 직접 적은 게임(1~30자). 「기타」 글자 그대로는 이름이 아니다
  if (value === GAME_OTHER) return { ok: false, error: "게임 이름을 입력해 주세요" };
  if (lenOf(value) > GAME_MAX) return { ok: false, error: `게임 이름은 ${GAME_MAX}자까지입니다` };
  return { ok: true, value };
};
// 📌 언제(선택) — 비면 null · 날짜 글자(ISO — 화면이 날짜 · 시간 두 칸을 합쳐 보낸다)면 그 시각 · 그 밖은 거절
export function checkWhen(v) {
  if (v == null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" && typeof v !== "number") return { ok: false, error: "날짜가 올바르지 않습니다" };
  const t = new Date(v).getTime();
  if (!Number.isFinite(t) || t < WHEN_MIN || t >= WHEN_MAX) return { ok: false, error: "날짜가 올바르지 않습니다" };
  return { ok: true, value: new Date(t) };
}
// 반려 사유(관리) — 1~100자
export function checkReason(v) {
  const value = cleanText(v);
  if (!value) return { ok: false, error: "반려 사유를 입력해 주십시오." };
  if (lenOf(value) > REASON_MAX) return { ok: false, error: `반려 사유는 ${REASON_MAX}자까지 입력할 수 있습니다.` };
  return { ok: true, value };
}
// 표시 이름 스냅샷 — 비면 ""(화면은 「이름 없음」)
export const cleanName = (v) => [...cleanText(v)].slice(0, 64).join("");

// 📌 상품권 번호 붙여 넣기 — 줄마다 하나 · 앞뒤 빈칸 빼기 · 빈 줄 빼기 · 겹침 빼기. 500줄 · 한 줄 100자를 넘으면 조용히 깎지 않고 돌려보낸다.
//    반환 { ok: true, codes(겹침 뺀 번호), dup(붙여 넣은 글 안의 겹친 줄 수) } · { ok: false, error }
export function parseGiftCodes(text) {
  const lines = String(text ?? "")
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return { ok: false, error: "번호를 입력해 주십시오." };
  if (lines.length > GIFT_LINES_MAX) return { ok: false, error: `번호는 한 번에 ${GIFT_LINES_MAX}줄까지 넣을 수 있습니다.` };
  if (lines.some((s) => s.length > GIFT_CODE_MAX)) return { ok: false, error: `번호는 한 줄에 ${GIFT_CODE_MAX}자까지 넣을 수 있습니다.` };
  const codes = [...new Set(lines)];
  return { ok: true, codes, dup: lines.length - codes.length };
}

// ── 참여 코드 · 멤버 가리킴 ───────────────────────────
// 📌 코드 — 친구 초대와 같은 글자판(헷갈리는 글자 뺀 32자 중 6자 — lib/invite.js). 넣은 글자 정리도 같은 함수
export const normalizeGroupCode = (v) => normalizeCode(v);
export const isGroupCode = (c) => isCodeShape(String(c ?? ""));
export const genGroupCode = () => Array.from({ length: CODE_LEN }, () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)]).join("");

// 📌 mid — 멤버를 가리키는, 남이 못 맞추는 글자 10자. 그룹 _id · 디스코드 ID 를 서버 비밀(NEXTAUTH_SECRET)로 섞는다(HMAC-SHA256 앞 10자).
//    화면은 이 글자로만 멤버를 가리킨다(내보내기 { mid }) — 남의 디스코드 ID 는 내보내지 않는다. 같은 그룹 · 같은 사람이면 늘 같은 글자
const MID_KEY = process.env.NEXTAUTH_SECRET || GROUP_KEY;
export const memberMid = (groupId, userId, key = MID_KEY) =>
  crypto.createHmac("sha256", String(key)).update(`${groupId}:${userId}`).digest("hex").slice(0, 10);

// ── 판정(순수) ─────────────────────────────────────
const countOf = (g) => (Array.isArray(g?.members) ? g.members.length : 0);
const isMember = (g, userId) => !!userId && Array.isArray(g?.members) && g.members.some((m) => m.userId === userId);

// 📌 화면 그룹 모양 G — { code, name, game, when(ISO|null), status, reason, members: [{ mid, name, leader, me }], count }. ID 없음.
//    code 는 내 그룹 · 초대 미리보기(보는 사람이 이미 아는 코드)에만 쓰인다 — 유저 API 에서 G 가 나가는 곳은 그 둘뿐이다
export function groupView(g, viewerId = "") {
  const gid = String(g._id);
  const members = (Array.isArray(g.members) ? g.members : []).map((m) => ({
    mid: memberMid(gid, m.userId),
    name: String(m.name || "") || NO_NAME,
    leader: m.userId === g.leaderId,
    me: !!viewerId && m.userId === viewerId,
  }));
  return {
    code: String(g.code || ""),
    name: String(g.name || ""),
    game: String(g.game || ""),
    when: iso(g.when),
    status: GROUP_STATUS.includes(g.status) ? g.status : "open",
    reason: String(g.reason || ""),
    members,
    count: members.length,
  };
}

// 📌 참여할 수 있나 — 초대 미리보기(invite.why)와 참여(POST join)가 같은 순서로 가른다. "" = 된다.
//    guest(로그인 안 함 · 디스코드 숫자 ID 아님) → not-open(지원 기간 밖 · 꺼짐) → has-group(이미 그룹 있음) → closed(모집 중이 아님) → full(최대 인원)
export function joinWhy({ cfg, group, viewerId = "", hasGroup = false, now = Date.now() }) {
  if (!viewerId || !isDiscordId(viewerId)) return "guest";
  if (!groupOpen(cfg, now)) return "not-open";
  if (hasGroup || isMember(group, viewerId)) return "has-group";
  if (group?.status !== "open") return "closed";
  if (countOf(group) >= cfg.maxMembers) return "full";
  return "";
}
// why → 거절(상태 코드 · 문구). 손님은 401(로그인), 그 밖은 막힘(403) · 겹침(409)
export const WHY_REFUSAL = {
  guest: [401, MSG.login],
  "not-open": [403, MSG.notOpen],
  "has-group": [409, MSG.hasGroup],
  closed: [409, MSG.closed],
  full: [409, MSG.full],
};
export const whyRefusal = (why) => refusal(...(WHY_REFUSAL[why] || [400, MSG.bad]));

// 심사 중 · 승인이면 막는다 — 거절 | null
export function lockedRefusal(status) {
  if (status === "review") return refusal(409, MSG.review);
  if (status === "approved") return refusal(409, MSG.approved);
  if (!isEditable(status)) return refusal(409, MSG.bad);
  return null;
}
// 📌 그룹장 동작(내보내기 · 고치기 · 해체) 입구 — 그룹 있음 · 그룹장 · open 또는 rejected. 거절 | null
export function leaderRefusal(group, viewerId) {
  if (!group) return refusal(404, MSG.notFound);
  if (group.leaderId !== viewerId) return refusal(403, MSG.leaderOnly);
  return lockedRefusal(group.status);
}
// 📌 나가기 입구 — 그룹 있음 · 그룹장 아님(그룹장은 해체) · open 또는 rejected. 거절 | null
export function leaveRefusal(group, viewerId) {
  if (!group) return refusal(404, MSG.notFound);
  if (group.leaderId === viewerId) return refusal(400, MSG.leaderLeave);
  return lockedRefusal(group.status);
}
// 📌 지원하기 입구 — 그룹장 · open 또는 rejected · 열림 · 인원 ≥ 최소. 거절 | null
export function submitRefusal({ cfg, group, viewerId, now = Date.now() }) {
  const bad = leaderRefusal(group, viewerId);
  if (bad) return bad;
  if (!groupOpen(cfg, now)) return refusal(403, MSG.notOpen);
  if (countOf(group) < cfg.minMembers) return refusal(409, minMsg(cfg.minMembers));
  return null;
}
// 📌 탭 숫자(meta n) — 내가 그룹장이고 지금 지원할 수 있으면 1, 그 밖 0
export const metaCount = ({ cfg, group, viewerId, now = Date.now() }) =>
  group && isMember(group, viewerId) && !submitRefusal({ cfg, group, viewerId, now }) ? 1 : 0;

// 📌 관리 목록 차례 — 심사 중 먼저(지원 시각 최근 순), 그다음 만든 시각 최근 순
export function sortAdminGroups(rows) {
  const t = (v) => (v ? Date.parse(v) || 0 : 0);
  return [...rows].sort((a, b) => {
    const ra = a.status === "review" ? 0 : 1;
    const rb = b.status === "review" ? 0 : 1;
    if (ra !== rb) return ra - rb;
    if (ra === 0) return t(b.submittedAt) - t(a.submittedAt) || t(b.createdAt) - t(a.createdAt);
    return t(b.createdAt) - t(a.createdAt);
  });
}

// ── 인덱스 ─────────────────────────────────────────
// 📌 테스트 사이트(localhost)도 같은 DB 를 읽는다 — 모델마다 autoCreate · autoIndex 를 꺼 두고(models/GoedamGroup*, GoedamGiftCode), 처음 쓰기 직전에 한 번 만든다.
//    실패하면 다음 쓰기가 다시 만든다(lib/invite.js ensureInviteIndexes 와 같은 방식)
const indexJobs = new Map();
const ensureIndexes = (Model) => {
  let job = indexJobs.get(Model.modelName);
  if (!job) {
    job = Model.createIndexes().catch((e) => {
      indexJobs.delete(Model.modelName);
      throw e;
    });
    indexJobs.set(Model.modelName, job);
  }
  return job;
};
export const ensureGroupIndexes = (...models) => Promise.all(models.map(ensureIndexes));

// ── 설정 읽기 · 쓰기 ─────────────────────────────────
// 설정 읽기 — 늘 .lean() + 정리(스키마로 되살려 쓰지 않는다)
export async function loadGroupConfig() {
  return normalizeGroupConfig(await GoedamGroupEvent.findOne({ key: GROUP_KEY }).lean());
}

// 📌 설정 문서 쓰기 — 온 칸만 덮어쓴다($set). 문서가 없으면 만든다(첫 저장) — 그때 기본값을 같이(이미 $set 에 있는 칸은 빼고)
export async function writeGroupConfig($set) {
  await ensureGroupIndexes(GoedamGroupEvent);
  const D = GROUP_DEFAULTS;
  const defaults = {
    enabled: false,
    startsAt: new Date(D.startsAt),
    endsAt: new Date(D.endsAt),
    minMembers: D.minMembers,
    maxMembers: D.maxMembers,
    applyTickets: D.applyTickets,
  };
  const $setOnInsert = Object.fromEntries(Object.entries(defaults).filter(([k]) => !(k in $set)));
  const doc = await GoedamGroupEvent.findOneAndUpdate(
    { key: GROUP_KEY },
    { $set, ...(Object.keys($setOnInsert).length ? { $setOnInsert } : {}) },
    { upsert: true, returnDocument: "after" }
  ).lean();
  return normalizeGroupConfig(doc);
}

// ── 내 그룹 · 자물쇠 ─────────────────────────────────
const findGroupById = (id, projection) => (mongoose.isValidObjectId(String(id || "")) ? GoedamGroup.findById(String(id), projection).lean() : null);

// 📌 내 그룹 — 자물쇠 → 그 그룹 → 내가 멤버인지. 셋 중 하나라도 아니면 null(자물쇠만 남은 흔적은 만들기 · 참여가 치운다 — takeLock)
async function findMine(userId) {
  if (!userId) return null;
  const lock = await GoedamGroupMember.findOne({ userId }, { _id: 0, groupId: 1 }).lean();
  if (!lock) return null;
  const g = await findGroupById(lock.groupId);
  return g && isMember(g, userId) ? g : null;
}

// 지우다 실패한 자물쇠인가 — 1분 지났고 그 그룹이 없거나 내가 멤버가 아니다
async function isStaleLock(lock, userId, now) {
  if (Number(now) - new Date(lock.createdAt || 0).getTime() < STALE_LOCK_MS) return false;
  const g = await findGroupById(lock.groupId, { members: 1 });
  return !g || !isMember(g, userId);
}

// 📌 자물쇠 넣기 — 겹치면(이미 그룹이 있음) false. 남은 흔적(isStaleLock)이면 그 줄만 지우고 한 번 더 넣는다
async function takeLock(userId, groupId, now) {
  for (let i = 0; i < 2; i++) {
    try {
      await GoedamGroupMember.create({ userId, groupId, createdAt: new Date(now) });
      return true;
    } catch (e) {
      if (!isDup(e)) throw e;
      if (i > 0) return false;
      const old = await GoedamGroupMember.findOne({ userId }).lean();
      if (!old) continue;
      if (!(await isStaleLock(old, userId, now))) return false;
      await GoedamGroupMember.deleteOne({ _id: old._id, groupId: old.groupId });
    }
  }
  return false;
}

// 자물쇠 지우기 — 그 그룹 줄만(다른 그룹 자물쇠는 건드리지 않는다). 실패는 남겨 둔다(다음 만들기 · 참여가 흔적으로 치운다)
async function dropLock(userId, groupId) {
  try {
    await GoedamGroupMember.deleteOne({ userId, groupId: String(groupId) });
  } catch (e) {
    console.error("[goedam-group] 자물쇠 지우기 실패 — 1분 뒤 흔적으로 치운다", { userId, groupId: String(groupId), err: e?.message });
  }
}

// 📌 나가기 · 내보내기용 — 빼기($pull) 전에 그 자물쇠 _id 를 잡아 두고, 빼기가 된 뒤 그 _id 만 지운다.
//    그 사이 같은 사람이 같은 그룹에 다시 들어와 새 자물쇠를 넣었으면(takeLock — 새 _id) 그 자물쇠는 건드리지 않는다
const lockIdOf = async (userId, groupId) => (await GoedamGroupMember.findOne({ userId, groupId: String(groupId) }, { _id: 1 }).lean())?._id || null;
async function dropLockId(lockId, userId, groupId) {
  if (!lockId) return;
  try {
    await GoedamGroupMember.deleteOne({ _id: lockId });
  } catch (e) {
    console.error("[goedam-group] 자물쇠 지우기 실패 — 1분 뒤 흔적으로 치운다", { userId, groupId: String(groupId), err: e?.message });
  }
}

// 조건부 쓰기가 아무것도 못 바꿨을 때 — 다시 읽어 그 사이 무엇이 바뀌었는지로 가른다
async function whyMissed(groupId, check) {
  const g = await findGroupById(groupId);
  return check(g) || refusal(409, MSG.bad);
}

// ── 지원 보너스(§6b) ─────────────────────────────────
// 지원한 그룹의 상태 — 관리 「추첨권 다시 지급」은 이 상태의 그룹에만
export const APPLIED_STATUS = ["review", "approved", "rejected"];

// 📌 추첨권 Purchase N건 — lib/goedamRules.js ticketPurchaseDocs 그대로(orderId "goedam:group:<userId>" · adminNote 「게임 그룹 지원」).
//    그 함수는 한 번에 SCREENING_TICKETS.max 장까지만 만든다 — 지원 보너스는 20장까지라 나눠 만들어 잇는다
export function bonusPurchaseDocs({ goedam, userId, userName = "", n, now = new Date() }) {
  const docs = [];
  for (let left = Math.max(0, Math.floor(Number(n) || 0)); left > 0; left -= SCREENING_TICKETS.max) {
    const part = Math.min(left, SCREENING_TICKETS.max);
    docs.push(...ticketPurchaseDocs({ cfg: goedam, screening: BONUS_SCREENING, userId, userName, n: part, now, note: BONUS_NOTE }));
  }
  return docs;
}

// 📌 보너스를 줄 멤버 — 디스코드 숫자 ID · 겹침 빼기 · 이미 받은 사람(have — 보너스 줄이 있는 userId) 빼기
export function bonusTargets(members, have = new Set()) {
  const seen = new Set();
  return (Array.isArray(members) ? members : []).filter((m) => {
    const id = String(m?.userId || "");
    if (!isDiscordId(id) || seen.has(id) || have.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// 관리 상세 멤버 칸 — 보너스 줄 → { tickets, grantedAt } · 없으면 null(미지급)
export const bonusView = (row) => (row ? { tickets: Math.max(0, Math.floor(Number(row.tickets) || 0)), grantedAt: iso(row.grantedAt) } : null);

// 📌 설정만 보고 막을 까닭(순수 — DB 없음) · "" 이면 통과. admin 이 아니면(지원하기) 괴담회 켜짐 · 지금 < 괴담회 추첨 닫힘
//    (lib/invite.js bonusOf 와 같은 조건 — 그룹 기간 끝이 추첨 닫힘보다 늦게 저장돼도, 닫힌 뒤엔 못 쓰는 추첨권을 넣지 않는다).
//    관리자 다시 지급은 꺼짐 · 닫힘이어도 준다(운영자 덮어쓰기 · 괴담회 손 지급과 같다). 추첨권 아이템은 둘 다 정해져 있어야 한다
export function bonusBlock(goedam, { admin = false, now = Date.now() } = {}) {
  if (!admin && !goedam?.enabled) return ADMIN_MSG.goedamOff;
  if (!admin && !(Number(now) < new Date(goedam?.drawClosesAt).getTime())) return ADMIN_MSG.drawClosed;
  if (!goedam?.ticketItemId) return ADMIN_MSG.noTicketItem;
  return "";
}

// 📌 추첨권을 넣을 수 있나 — lib/goedam.js grantGoedamTickets · lib/invite.js grantInviteTickets 와 같은 입구:
//    설정으로 막히지 않고(bonusBlock) 추첨권 아이템이 실사이트(live — lib/eventPass.js eventItemStates)에 있을 때만.
//    반환 { ok: true, goedam(괴담회 설정) } · 거절
async function bonusReady({ admin = false, now = Date.now() } = {}) {
  const goedam = await loadGoedamConfig();
  const why = bonusBlock(goedam, { admin, now });
  if (why) return refusal(409, why);
  const st = (await eventItemStates([goedam.ticketItemId])).get(goedam.ticketItemId)?.state;
  if (st !== "live") return refusal(409, ADMIN_MSG.notLive);
  return { ok: true, goedam };
}

// 📌 한 사람 — 자물쇠(GoedamGroupBonus userId 유니크)를 먼저 넣고(겹치면 이미 받음 → { tickets: 0, had: true }),
//    주문 묶음(goedam:group:<userId>)으로 이미 들어간 장 수를 세어 모자란 만큼만 넣는다(넣다 만 뒤 줄을 지운 사람에게 두 번 주지 않게).
//    넣다 실패하면 그 사람 줄을 지우고 던진다(부르는 쪽이 로그를 남기고 다음 사람으로 — 관리에서 다시 지급)
async function grantBonusTo({ goedam, gid, member, n, at }) {
  const userId = String(member.userId);
  let lock;
  try {
    lock = await GoedamGroupBonus.create({ userId, groupId: gid, tickets: n, grantedAt: at });
  } catch (e) {
    if (isDup(e)) return { tickets: 0, had: true };
    throw e;
  }
  try {
    const have = await Purchase.countDocuments({ userId, orderId: ticketOrderId(BONUS_SID, userId) });
    const need = Math.max(0, n - have);
    if (need > 0) await Purchase.insertMany(bonusPurchaseDocs({ goedam, userId, userName: cleanName(member.name), n: need, now: at }));
    return { tickets: need, had: false };
  } catch (e) {
    await GoedamGroupBonus.deleteOne({ _id: lock._id }).catch((err) =>
      console.error("[goedam-group] 지원 보너스 자물쇠 되돌리기 실패 — 수동 확인 필요", { userId, groupId: gid, err: err?.message })
    );
    throw e;
  }
}

// 📌 그룹 멤버에게 — 사람마다 grantBonusTo. 한 사람이 실패해도 다음 사람으로 넘어간다(로그만).
//    자물쇠 유니크가 서야 「1인 평생 1번」이 지켜진다 — 인덱스를 첫 줄 넣기 직전에 만든다(실패하면 던진다 · 아무에게도 안 줌).
//    반환 { given: Map(userId → 이번에 넣은 장 수), granted(이번에 줄을 넣은 사람 수), tickets(이번에 넣은 장 수 합), failed(실패한 사람 수) }
async function grantApplyBonus({ goedam, group, n, now }) {
  const gid = String(group._id);
  const at = new Date(now);
  await ensureGroupIndexes(GoedamGroupBonus);
  const given = new Map();
  let granted = 0;
  let tickets = 0;
  let failed = 0;
  for (const m of bonusTargets(group.members)) {
    try {
      const r = await grantBonusTo({ goedam, gid, member: m, n, at });
      given.set(m.userId, r.tickets);
      tickets += r.tickets;
      if (!r.had) granted += 1;
    } catch (e) {
      failed += 1;
      given.set(m.userId, 0);
      console.error("[goedam-group] 지원 보너스 지급 실패 — 관리 › 그룹 지원 상세에서 다시 지급", { userId: m.userId, groupId: gid, err: e?.message });
    }
  }
  return { given, granted, tickets, failed };
}

// 📌 지원하기 성공 뒤 보너스 — 설정 0장이면 안 준다. 괴담회 쪽이 준비 안 됨(꺼짐 · 추첨 닫힘 · 아이템 없음 · 실사이트에 없음) · 오류면 아무도 안 받고 0
//    (지원은 그대로 성공 — 관리 › 그룹 지원 상세 「추첨권 다시 지급」). 반환 = 지원한 사람(그룹장)에게 이번에 넣은 장 수
async function submitBonus({ cfg, group, userId, now }) {
  if (cfg.applyTickets <= 0) return 0;
  const gid = String(group._id);
  try {
    const ready = await bonusReady({ now });
    if (!ready.ok) {
      console.warn("[goedam-group] 지원 보너스 못 줌 — 관리 › 그룹 지원 상세에서 다시 지급", { groupId: gid, why: ready.error });
      return 0;
    }
    const r = await grantApplyBonus({ goedam: ready.goedam, group, n: cfg.applyTickets, now });
    return r.given.get(userId) || 0;
  } catch (e) {
    console.error("[goedam-group] 지원 보너스 지급 오류 — 관리 › 그룹 지원 상세에서 다시 지급", { groupId: gid, err: e?.message });
    return 0;
  }
}

// ── 동작 ─────────────────────────────────────────
// 📌 만들기(name, game, when?) — 열림 · 자물쇠 없음 → 자물쇠 → 그룹(status open, members [나]). 코드가 겹치면 다시 뽑는다.
//    그룹 _id 를 먼저 정해 자물쇠에 적는다 · 그룹 쓰기가 실패하면 자물쇠를 지운다
async function createGroup({ cfg, userId, userName, body, now }) {
  if (!groupOpen(cfg, now)) return refusal(403, MSG.notOpen);
  const name = checkName(body?.name);
  if (!name.ok) return refusal(400, name.error);
  const game = checkGame(body?.game);
  if (!game.ok) return refusal(400, game.error);
  const when = checkWhen(body?.when);
  if (!when.ok) return refusal(400, when.error);

  const id = new mongoose.Types.ObjectId();
  const gid = String(id);
  // 인덱스는 거를 것 다 거른 뒤 첫 쓰기(자물쇠) 직전에만 — 꺼짐 · 기간 밖 · 잘못된 칸은 컬렉션도 만들지 않는다
  await ensureGroupIndexes(GoedamGroup, GoedamGroupMember);
  if (!(await takeLock(userId, gid, now))) return refusal(409, MSG.hasGroup);
  const at = new Date(now);
  try {
    for (let i = 0; i < 8; i++) {
      try {
        await GoedamGroup.create({
          _id: id,
          code: genGroupCode(),
          name: name.value,
          game: game.value,
          when: when.value,
          leaderId: userId,
          members: [{ userId, name: userName, joinedAt: at }],
          status: "open",
          reason: "",
          submittedAt: null,
          reviewedAt: null,
          reviewedBy: "",
          createdAt: at,
          updatedAt: at,
        });
        return { ok: true };
      } catch (e) {
        if (!isDup(e)) throw e;
        // 겹침이 _id 면(앞선 시도가 실제로는 들어감) 그대로 성공 · 코드면 다시 뽑는다
        if (await GoedamGroup.exists({ _id: id })) return { ok: true };
      }
    }
    throw new Error("그룹 코드를 만들지 못했습니다(겹침이 계속됨)");
  } catch (e) {
    await dropLock(userId, gid);
    throw e;
  }
}

// 📌 참여(code) — 열림 · 그룹 open · 인원 < 최대 · 자물쇠 없음 → 자물쇠 → $push(조건: open · 인원 < 최대 · 내가 아직 없음을 업데이트 필터에 같이).
//    못 넣으면 자물쇠를 지우고 다시 읽어 까닭을 가른다
async function joinGroup({ cfg, userId, userName, body, now }) {
  const c = normalizeGroupCode(body?.code);
  if (!isGroupCode(c)) return refusal(404, MSG.notFound);
  const g = await GoedamGroup.findOne({ code: c }).lean();
  if (!g) return refusal(404, MSG.notFound);
  const why = joinWhy({ cfg, group: g, viewerId: userId, hasGroup: !!(await findMine(userId)), now });
  if (why) return whyRefusal(why);

  const gid = String(g._id);
  await ensureGroupIndexes(GoedamGroup, GoedamGroupMember); // 첫 쓰기(자물쇠) 직전 — 만들기와 같다
  if (!(await takeLock(userId, gid, now))) return refusal(409, MSG.hasGroup);
  const at = new Date(now);
  let r;
  try {
    r = await GoedamGroup.updateOne(
      { _id: g._id, status: "open", [`members.${cfg.maxMembers - 1}`]: { $exists: false }, "members.userId": { $ne: userId } },
      { $push: { members: { userId, name: userName, joinedAt: at } }, $set: { updatedAt: at } }
    );
  } catch (e) {
    await dropLock(userId, gid);
    throw e;
  }
  if (r.modifiedCount === 1) return { ok: true };
  await dropLock(userId, gid);
  return whyMissed(g._id, (cur) => {
    if (!cur) return refusal(404, MSG.notFound);
    if (cur.status !== "open") return refusal(409, MSG.closed);
    if (isMember(cur, userId)) return refusal(409, MSG.hasGroup);
    return refusal(409, MSG.full);
  });
}

// 📌 나가기 — 멤버(그룹장 아님) · open 또는 rejected → 빼기 + 자물쇠 지움
async function leaveGroup({ userId, now }) {
  const g = await findMine(userId);
  const bad = leaveRefusal(g, userId);
  if (bad) return bad;
  const lockId = await lockIdOf(userId, g._id);
  const r = await GoedamGroup.updateOne(
    { _id: g._id, leaderId: { $ne: userId }, status: { $in: EDITABLE_STATUS }, "members.userId": userId },
    { $pull: { members: { userId } }, $set: { updatedAt: new Date(now) } }
  );
  if (!r.modifiedCount) return whyMissed(g._id, (cur) => (cur && isMember(cur, userId) ? leaveRefusal(cur, userId) : refusal(404, MSG.notFound)));
  await dropLockId(lockId, userId, g._id);
  return { ok: true };
}

// 📌 내보내기(mid) — 그룹장 · open 또는 rejected → 그 멤버 빼기 + 그 사람 자물쇠 지움. 그룹장 자신은 못 내보낸다(해체)
async function kickMember({ userId, body, now }) {
  const g = await findMine(userId);
  const bad = leaderRefusal(g, userId);
  if (bad) return bad;
  const gid = String(g._id);
  const mid = String(body?.mid ?? "").trim().toLowerCase();
  const target = mid ? g.members.find((m) => memberMid(gid, m.userId) === mid) : null;
  if (!target) return refusal(404, MSG.noMember);
  if (target.userId === g.leaderId) return refusal(400, MSG.leaderKick);
  const lockId = await lockIdOf(target.userId, gid);
  const r = await GoedamGroup.updateOne(
    { _id: g._id, leaderId: userId, status: { $in: EDITABLE_STATUS }, "members.userId": target.userId },
    { $pull: { members: { userId: target.userId } }, $set: { updatedAt: new Date(now) } }
  );
  if (!r.modifiedCount) return whyMissed(g._id, (cur) => leaderRefusal(cur, userId) || refusal(404, MSG.noMember));
  await dropLockId(lockId, target.userId, gid);
  return { ok: true };
}

// 📌 고치기(name, game, when) — 그룹장 · open 또는 rejected. 온 칸만 바꾼다(빈 칸은 그대로 · when 은 "" 이면 지움)
async function editGroup({ userId, body, now }) {
  const g = await findMine(userId);
  const bad = leaderRefusal(g, userId);
  if (bad) return bad;
  const $set = {};
  if (body?.name !== undefined) {
    const v = checkName(body.name);
    if (!v.ok) return refusal(400, v.error);
    $set.name = v.value;
  }
  if (body?.game !== undefined) {
    const v = checkGame(body.game);
    if (!v.ok) return refusal(400, v.error);
    $set.game = v.value;
  }
  if (body?.when !== undefined) {
    const v = checkWhen(body.when);
    if (!v.ok) return refusal(400, v.error);
    $set.when = v.value;
  }
  if (!Object.keys($set).length) return refusal(400, MSG.nothing);
  $set.updatedAt = new Date(now);
  const r = await GoedamGroup.updateOne({ _id: g._id, leaderId: userId, status: { $in: EDITABLE_STATUS } }, { $set });
  if (!r.matchedCount) return whyMissed(g._id, (cur) => leaderRefusal(cur, userId));
  return { ok: true };
}

// 📌 해체 — 그룹장 · open 또는 rejected → 그룹 + 그 그룹 자물쇠 전부 지움
async function disbandGroup({ userId }) {
  const g = await findMine(userId);
  const bad = leaderRefusal(g, userId);
  if (bad) return bad;
  const r = await GoedamGroup.deleteOne({ _id: g._id, leaderId: userId, status: { $in: EDITABLE_STATUS } });
  if (!r.deletedCount) return whyMissed(g._id, (cur) => leaderRefusal(cur, userId));
  try {
    await GoedamGroupMember.deleteMany({ groupId: String(g._id) });
  } catch (e) {
    console.error("[goedam-group] 해체 뒤 자물쇠 지우기 실패 — 1분 뒤 흔적으로 치운다", { groupId: String(g._id), err: e?.message });
  }
  return { ok: true };
}

// 📌 지원하기 — 그룹장 · open 또는 rejected · 열림 · 인원 ≥ 최소 → review · submittedAt · reason "".
//    인원 조건은 업데이트 필터에 같이(그 사이 누가 나가면 못 바뀐다).
//    📌 바뀐 뒤의 멤버(심사 중이라 더는 안 바뀐다) 전원에게 지원 보너스(submitBonus — 1인 평생 1번 · 못 줘도 지원은 성공).
//    반환 { ok: true, bonus: { tickets(나에게 이번에 넣은 장 수 — 이미 받았거나 못 주면 0) } }
async function submitGroup({ cfg, userId, now }) {
  const g = await findMine(userId);
  const bad = submitRefusal({ cfg, group: g, viewerId: userId, now });
  if (bad) return bad;
  const at = new Date(now);
  const done = await GoedamGroup.findOneAndUpdate(
    { _id: g._id, leaderId: userId, status: { $in: EDITABLE_STATUS }, [`members.${cfg.minMembers - 1}`]: { $exists: true } },
    { $set: { status: "review", submittedAt: at, reason: "", updatedAt: at } },
    { returnDocument: "after" }
  ).lean();
  if (!done) return whyMissed(g._id, (cur) => submitRefusal({ cfg, group: cur, viewerId: userId, now }));
  return { ok: true, bonus: { tickets: await submitBonus({ cfg, group: done, userId, now }) } };
}

const ACTIONS = { create: createGroup, join: joinGroup, leave: leaveGroup, kick: kickMember, edit: editGroup, disband: disbandGroup, submit: submitGroup };
export const GROUP_ACTIONS = Object.keys(ACTIONS);

// 📌 유저 동작(POST /api/goedam/group { action, ... }) — 로그인 · 디스코드 숫자 ID 확인 → 동작마다 위 규칙.
//    반환 { ok: true, bonus?(submit 만 — { tickets }) } · { ok: false, status, error }(라우트가 4xx 로 내보낸다 — 성공이면 라우트가 조회와 같은 상태를 붙인다)
export async function groupAction({ action, userId, userName = "", body = {}, now = Date.now() }) {
  if (!userId) return refusal(401, MSG.login);
  if (!isDiscordId(userId)) return refusal(403, MSG.account);
  const fn = Object.hasOwn(ACTIONS, String(action || "")) ? ACTIONS[action] : null;
  if (!fn) return refusal(400, MSG.bad);
  const cfg = await loadGroupConfig();
  // 인덱스는 만들기 · 참여가 첫 쓰기 직전에 만든다(거절만 하는 요청은 공유 DB 에 아무것도 만들지 않는다). 나머지 동작은 이미 있는 그룹에만 쓴다
  return fn({ cfg, userId, userName: cleanName(userName), body: body && typeof body === "object" ? body : {}, now });
}

// ── 조회 ─────────────────────────────────────────
// 내 문화상품권 번호 — 승인된 그룹에서 나에게 잡힌 것(없으면 null)
async function myGiftCode(group, userId) {
  if (group?.status !== "approved") return null;
  const c = await GoedamGiftCode.findOne({ groupId: String(group._id), userId }, { _id: 0, code: 1 }).lean();
  return c?.code || null;
}

// 📌 탭 노출 · 탭 숫자(GET ?meta=1) — 디스코드에 묻지 않는다.
//    visible = 열림 · 관리자(꺼져 있어도) · 내 그룹이 있음(기간 전후에도 번호 확인) · n = metaCount · end = 끝 시각(ms — 이벤트 창 탭 「~ 날짜」, 괴담회 meta 와 같은 칸)
export async function getGroupMeta(userId = "", { isAdmin = false, now = Date.now() } = {}) {
  const cfg = await loadGroupConfig();
  const mine = userId ? await findMine(userId) : null;
  const visible = groupOpen(cfg, now) || !!isAdmin || !!mine;
  return { visible, n: metaCount({ cfg, group: mine, viewerId: userId, now }), end: cfg.endsAt.getTime() };
}

// 📌 창 본문(GET [?code=]) — 약속 문서 §3 모양 그대로:
//    { guest, enabled, open, adminPreview, startsAt, endsAt, minMembers, maxMembers, applyTickets, my: null | { role, group: G, giftCode }, invite: null | { group: G, canJoin, why } }
//    my 가 있으면 invite 는 null(?code 가 내 그룹 코드여도 my 만). 초대 미리보기는 켜져 있거나 관리자일 때만(손님도 본다 — why "guest")
//    applyTickets — 지원 보너스 추첨권 장 수(설정값 · 0 이면 화면에 줄 없음)
export async function getGroupState(userId = "", { isAdmin = false, code = "", now = Date.now() } = {}) {
  const cfg = await loadGroupConfig();
  const head = {
    guest: !userId,
    enabled: cfg.enabled,
    open: groupOpen(cfg, now),
    adminPreview: !cfg.enabled && !!isAdmin,
    startsAt: iso(cfg.startsAt),
    endsAt: iso(cfg.endsAt),
    minMembers: cfg.minMembers,
    maxMembers: cfg.maxMembers,
    applyTickets: cfg.applyTickets,
  };
  const mine = userId ? await findMine(userId) : null;
  if (mine) {
    return {
      ...head,
      my: { role: mine.leaderId === userId ? "leader" : "member", group: groupView(mine, userId), giftCode: await myGiftCode(mine, userId) },
      invite: null,
    };
  }
  let invite = null;
  const c = normalizeGroupCode(code);
  if (isGroupCode(c) && (cfg.enabled || isAdmin)) {
    const g = await GoedamGroup.findOne({ code: c }).lean();
    if (g) {
      const why = joinWhy({ cfg, group: g, viewerId: userId, hasGroup: false, now });
      invite = { group: groupView(g, userId), canJoin: !why, why };
    }
  }
  return { ...head, my: null, invite };
}

// ── 관리자 ─────────────────────────────────────────
// 📌 관리 화면 설정 모양 — 날짜는 ISO 글자
export const toAdminConfig = (cfg) => ({
  enabled: cfg.enabled,
  startsAt: iso(cfg.startsAt),
  endsAt: iso(cfg.endsAt),
  minMembers: cfg.minMembers,
  maxMembers: cfg.maxMembers,
  applyTickets: cfg.applyTickets,
  updatedAt: iso(cfg.updatedAt),
});

// 관리 목록 한 줄 — { id, code, name, game, when, status, reason, leader: { id, name }, count, submittedAt, reviewedAt, reviewedBy, createdAt }
export function adminRow(g) {
  const members = Array.isArray(g.members) ? g.members : [];
  const leader = members.find((m) => m.userId === g.leaderId);
  return {
    id: String(g._id),
    code: String(g.code || ""),
    name: String(g.name || ""),
    game: String(g.game || ""),
    when: iso(g.when),
    status: GROUP_STATUS.includes(g.status) ? g.status : "open",
    reason: String(g.reason || ""),
    leader: { id: String(g.leaderId || ""), name: String(leader?.name || "") },
    count: members.length,
    submittedAt: iso(g.submittedAt),
    reviewedAt: iso(g.reviewedAt),
    reviewedBy: String(g.reviewedBy || ""),
    createdAt: iso(g.createdAt),
  };
}

// 상품권 번호 수 — { total, assigned, left }
export async function giftCodeStats() {
  const [total, assigned] = await Promise.all([GoedamGiftCode.countDocuments({}), GoedamGiftCode.countDocuments({ groupId: { $type: "string" } })]);
  return { total, assigned, left: Math.max(0, total - assigned) };
}

// 📌 관리 화면 본문(GET) — { config, codes, groups(심사 중 먼저 · 그다음 최근) }. 읽기만(문서가 없으면 기본값 — 첫 저장이 만든다)
export async function getGroupAdmin() {
  const [cfg, review, rest, codes] = await Promise.all([
    loadGroupConfig(),
    GoedamGroup.find({ status: "review" }).lean(),
    GoedamGroup.find({ status: { $ne: "review" } }).sort({ createdAt: -1 }).limit(ADMIN_LIST_MAX).lean(),
    giftCodeStats(),
  ]);
  return { config: toAdminConfig(cfg), codes, groups: sortAdminGroups([...review, ...rest].map(adminRow)) };
}

// 디스코드 서버 들어온 시각 — 몇 명씩 끊어 묻는다(실패 · 없음은 null)
async function guildJoinedMap(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += GUILD_LOOKUP_BATCH) {
    const part = ids.slice(i, i + GUILD_LOOKUP_BATCH);
    const got = await Promise.all(part.map((id) => fetchGuildMember(id).catch(() => null)));
    part.forEach((id, j) => {
      const r = got[j];
      out.set(id, r?.status === "ok" ? iso(Date.parse(String(r.member?.joined_at || "")) || null) : null);
    });
  }
  return out;
}

// 📌 그룹 상세(GET ?id=) — 부계정 가려내기용. 멤버마다 { accountAt(디스코드 계정 만든 때 — ID 에서), guildJoinedAt|null, level, xp, firstXpAt|null(XpLog 가장 이른 기록 — 100일 보관), xp30(최근 30일 XpLog 합) }
//    · bonus — 지원 보너스 추첨권 { tickets, grantedAt } | null(미지급). 1인 평생 1번이라 다른 그룹에서 받은 것도 받음으로 보인다
//    giftCodes — 이 그룹에 잡힌 번호(승인된 그룹이면 멤버마다 한 장). 없는 그룹이면 null
export async function getGroupDetail(id, { now = Date.now() } = {}) {
  const g = await findGroupById(id);
  if (!g) return null;
  const members = Array.isArray(g.members) ? g.members : [];
  const ids = members.map((m) => m.userId);
  const since = new Date(Number(now) - 30 * DAY_MS);
  const [xps, firsts, sums, gifts, bonuses, joined] = await Promise.all([
    UserXp.find({ userId: { $in: ids } }, { _id: 0, userId: 1, level: 1, xp: 1 }).lean(),
    XpLog.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: "$userId", first: { $min: "$createdAt" } } }]),
    XpLog.aggregate([{ $match: { userId: { $in: ids }, createdAt: { $gte: since } } }, { $group: { _id: "$userId", sum: { $sum: "$amount" } } }]),
    GoedamGiftCode.find({ groupId: String(g._id) }, { _id: 0, userId: 1, code: 1 }).sort({ assignedAt: 1, _id: 1 }).lean(),
    GoedamGroupBonus.find({ userId: { $in: ids } }, { _id: 0, userId: 1, tickets: 1, grantedAt: 1 }).lean(),
    guildJoinedMap(ids),
  ]);
  const xpOf = new Map(xps.map((x) => [x.userId, x]));
  const firstOf = new Map(firsts.map((x) => [x._id, x.first]));
  const sumOf = new Map(sums.map((x) => [x._id, x.sum]));
  const bonusOf = new Map(bonuses.map((b) => [b.userId, b]));
  const nameOf = new Map(members.map((m) => [m.userId, String(m.name || "") || NO_NAME]));
  return {
    ...adminRow(g),
    members: members.map((m) => ({
      id: m.userId,
      name: String(m.name || ""),
      joinedAt: iso(m.joinedAt),
      bonus: bonusView(bonusOf.get(m.userId)),
      check: {
        accountAt: iso(snowflakeMs(m.userId)),
        guildJoinedAt: joined.get(m.userId) ?? null,
        level: Math.max(0, Number(xpOf.get(m.userId)?.level) || 0),
        xp: Math.max(0, Number(xpOf.get(m.userId)?.xp) || 0),
        firstXpAt: iso(firstOf.get(m.userId)),
        xp30: Number(sumOf.get(m.userId)) || 0,
      },
    })),
    giftCodes: gifts.map((c) => ({ name: nameOf.get(c.userId) || NO_NAME, code: String(c.code || "") })),
  };
}

// 알림 넣기(사이트 알림함) — 실패해도 승인 · 반려는 그대로(로그만). 디스코드 DM 핑은 lib 에 쓸 수 있는 도우미가 없어 보내지 않는다(dmSent false)
async function notify(people, notice, sentBy) {
  const docs = people
    .filter((p) => p?.userId)
    .map((p) => ({ recipientName: String(p.name || "") || NO_NAME, recipientId: p.userId, ...notice, read: false, dmSent: false, sentBy, createdAt: new Date() }));
  if (!docs.length) return;
  try {
    await Notification.insertMany(docs, { ordered: false });
  } catch (e) {
    console.error("[goedam-group] 알림 넣기 실패", { title: notice.title, err: e?.message });
  }
}

// 그 그룹에 잡힌 번호를 풀로 되돌린다
const releaseCodes = (gid) => GoedamGiftCode.updateMany({ groupId: gid }, { $set: { groupId: null, userId: null, assignedAt: null, noticeAt: null, noticeError: "" } });

// 📌 번호 한 장 잡기 — 남은 번호(groupId null) 중 먼저 넣은 것을 조건부로. 겹침(동시 승인이 이 사람 몫을 먼저 잡음) · 남은 번호 없음이면
//    이 그룹 · 이 사람 몫이 이미 있는지 본다(있으면 그것). 없으면 null(모자람)
async function grabCode(gid, userId, at) {
  try {
    const c = await GoedamGiftCode.findOneAndUpdate(
      { groupId: null },
      { $set: { groupId: gid, userId, assignedAt: at } },
      { sort: { createdAt: 1, _id: 1 }, returnDocument: "after" }
    ).lean();
    if (c) return c.code;
  } catch (e) {
    if (!isDup(e)) throw e;
  }
  const mine = await GoedamGiftCode.findOne({ groupId: gid, userId }, { _id: 0, code: 1 }).lean();
  return mine?.code || null;
}

// 📌 승인(관리자) — review → 멤버마다 상품권 번호 하나씩(이미 잡힌 사람은 그것 — 다시 눌러도 두 장 안 잡힘, 모델의 (groupId, userId) 유니크).
//    모자라면 이 그룹에 잡은 번호를 되돌리고 거절(「상품권 번호가 모자랍니다 · 필요 N · 남은 M」 — N = 멤버 수 · M = 되돌린 뒤 남은 번호).
//    → approved · reviewedAt · reviewedBy(조건: 아직 review — 그 사이 반려되면 잡은 번호를 되돌리고 거절). 멤버 전원에게 사이트 알림
export async function approveGroup({ id, adminName = "", now = Date.now() }) {
  const g = await findGroupById(id);
  if (!g) return refusal(404, ADMIN_MSG.notFound);
  if (g.status !== "review") return refusal(409, ADMIN_MSG.notReview);
  await ensureGroupIndexes(GoedamGiftCode, GoedamGroup);
  const gid = String(g._id);
  const members = Array.isArray(g.members) ? g.members : [];
  const at = new Date(now);

  // 아직 심사 중일 때만 되돌린다(그 사이 다른 승인이 끝냈으면 그 번호는 그대로)
  const release = async () => {
    if (await GoedamGroup.exists({ _id: g._id, status: "review" })) await releaseCodes(gid);
  };
  const short = async () => {
    await release();
    const left = await GoedamGiftCode.countDocuments({ groupId: null });
    return refusal(409, shortMsg(members.length, left));
  };

  // 미리 세기 — 이미 잡힌 사람을 빼고 모자라면 잡지 않고 거절
  const [have, free] = await Promise.all([
    GoedamGiftCode.find({ groupId: gid }, { _id: 0, userId: 1 }).lean(),
    GoedamGiftCode.countDocuments({ groupId: null }),
  ]);
  const haveSet = new Set(have.map((c) => c.userId));
  const need = members.filter((m) => !haveSet.has(m.userId));
  if (free < need.length) return short();
  for (const m of need) {
    let got;
    try {
      got = await grabCode(gid, m.userId, at);
    } catch (e) {
      await release().catch((err) => console.error("[goedam-group] 승인 실패 뒤 번호 되돌리기 실패 — 수동 확인 필요", { groupId: gid, err: err?.message }));
      throw e;
    }
    if (!got) return short();
  }

  const r = await GoedamGroup.updateOne(
    { _id: g._id, status: "review" },
    { $set: { status: "approved", reviewedAt: at, reviewedBy: String(adminName || ""), updatedAt: at } }
  );
  if (!r.modifiedCount) {
    const cur = await findGroupById(gid, { status: 1 });
    if (cur?.status === "approved") return { ok: true };
    await releaseCodes(gid);
    return cur ? refusal(409, ADMIN_MSG.notReview) : refusal(404, ADMIN_MSG.notFound);
  }
  await notify(members, approveNotice(g.name), String(adminName || ""));
  return { ok: true };
}

// 📌 반려(관리자, 사유 1~100자) — review → rejected · reason · reviewedAt · reviewedBy. 그룹장에게 알림.
//    혹시 잡혀 있던 번호(승인이 도중에 멈춘 흔적)는 풀로 되돌린다
export async function rejectGroup({ id, reason, adminName = "", now = Date.now() }) {
  const rs = checkReason(reason);
  if (!rs.ok) return refusal(400, rs.error);
  if (!mongoose.isValidObjectId(String(id || ""))) return refusal(404, ADMIN_MSG.notFound);
  await ensureGroupIndexes(GoedamGroup, GoedamGiftCode);
  const at = new Date(now);
  const g = await GoedamGroup.findOneAndUpdate(
    { _id: String(id), status: "review" },
    { $set: { status: "rejected", reason: rs.value, reviewedAt: at, reviewedBy: String(adminName || ""), updatedAt: at } },
    { returnDocument: "after" }
  ).lean();
  if (!g) return (await GoedamGroup.exists({ _id: String(id) })) ? refusal(409, ADMIN_MSG.notReview) : refusal(404, ADMIN_MSG.notFound);
  await releaseCodes(String(g._id));
  const leader = (g.members || []).find((m) => m.userId === g.leaderId) || { userId: g.leaderId, name: "" };
  await notify([leader], rejectNotice(g.name, rs.value), String(adminName || ""));
  return { ok: true };
}

// 📌 추첨권 다시 지급(관리자 regrant) — 지원한 그룹(심사 중 · 승인 · 반려)의 지금 멤버 중 보너스 줄이 없는 사람에게만, 지금 설정의 장 수로.
//    괴담회가 꺼져 있거나 추첨이 닫혀도 준다(운영자 덮어쓰기 · bonusBlock) — 추첨권 아이템이 정해져 있고 실사이트에 있어야 한다. 줄 넣기 · 모자란 만큼 채우기는 지원하기와 같은 길(grantApplyBonus)
//    반환 { ok: true, granted(이번에 받은 사람 수), tickets(이번에 넣은 장 수 합), failed(실패한 사람 수) } · 거절(아무도 못 받았으면 500)
export async function regrantGroupBonus({ id, now = Date.now() }) {
  const g = await findGroupById(id);
  if (!g) return refusal(404, ADMIN_MSG.notFound);
  if (!APPLIED_STATUS.includes(g.status)) return refusal(409, ADMIN_MSG.notApplied);
  const cfg = await loadGroupConfig();
  if (cfg.applyTickets <= 0) return refusal(409, ADMIN_MSG.zeroTickets);
  const ids = bonusTargets(g.members).map((m) => m.userId);
  const have = new Set((await GoedamGroupBonus.find({ userId: { $in: ids } }, { _id: 0, userId: 1 }).lean()).map((b) => b.userId));
  const targets = bonusTargets(g.members, have);
  if (!targets.length) return refusal(409, ADMIN_MSG.noneLeft);
  const ready = await bonusReady({ admin: true, now });
  if (!ready.ok) return ready;
  const r = await grantApplyBonus({ goedam: ready.goedam, group: { ...g, members: targets }, n: cfg.applyTickets, now });
  if (!r.granted && r.failed) return refusal(500, ADMIN_MSG.grantFailed);
  return { ok: true, granted: r.granted, tickets: r.tickets, failed: r.failed };
}

// 📌 상품권 번호 넣기(관리자 codes-add) — 붙여 넣은 글(parseGiftCodes) 중 풀에 없는 것만. 반환 { ok: true, added, dup(글 안 겹침 + 이미 있던 번호) }
export async function addGiftCodes(text, { now = Date.now() } = {}) {
  const p = parseGiftCodes(text);
  if (!p.ok) return refusal(400, p.error);
  await ensureGroupIndexes(GoedamGiftCode);
  const have = new Set((await GoedamGiftCode.find({ code: { $in: p.codes } }, { _id: 0, code: 1 }).lean()).map((c) => c.code));
  const at = new Date(now);
  const docs = p.codes.filter((code) => !have.has(code)).map((code) => ({ code, groupId: null, userId: null, assignedAt: null, createdAt: at }));
  let added = 0;
  if (docs.length) {
    try {
      added = (await GoedamGiftCode.insertMany(docs, { ordered: false })).length;
    } catch (e) {
      // 그 사이 같은 번호가 먼저 들어갔다 — 나머지는 들어갔다(ordered: false · insertedDocs 는 mongoose 가 붙인다)
      if (!isDup(e)) throw e;
      added = Array.isArray(e?.insertedDocs) ? e.insertedDocs.length : 0;
    }
  }
  return { ok: true, added, dup: p.dup + (p.codes.length - added) };
}

// 📌 상품권 번호 지우기(관리자 code-delete) — 배정 안 된 것만
export async function deleteGiftCode(code) {
  const c = String(code ?? "").trim();
  if (!c) return refusal(400, "번호를 입력해 주십시오.");
  const r = await GoedamGiftCode.deleteOne({ code: c, groupId: null });
  if (r.deletedCount) return { ok: true };
  return (await GoedamGiftCode.exists({ code: c })) ? refusal(409, "배정된 번호는 지울 수 없습니다.") : refusal(404, "없는 번호입니다.");
}
