import crypto from "node:crypto";
import InviteEvent from "@/models/InviteEvent";
import InviteCode from "@/models/InviteCode";
import InviteUse from "@/models/InviteUse";
import InviteClaim from "@/models/InviteClaim";
import Purchase from "@/models/Purchase";
import XpLog from "@/models/XpLog";
import Payout from "@/models/Payout";
import { rewardKeys } from "@/lib/seasonPass";
import { normalizeEventTiers, eventItemStates } from "@/lib/eventPass";
import { loadGoedamConfig, ticketOrderId, ticketPurchaseDocs } from "@/lib/goedam";
import { fetchGuildMember } from "@/lib/discordMember";
import { claimRewardSet, rewardViewsLoader, notLiveItemIds, isDup, refusal, holdRefusal } from "@/lib/rewardGrant";

// 📌 친구 초대(상시 이벤트 — 2026-10-25 운영자 결정, 약속 문서 scratchpad/invite/SPEC.md) 계산의 단일 진실 —
//    조회(GET /api/invite) · 코드 넣기(POST /api/invite/redeem) · 받기(POST /api/invite/claim) · 관리(app/api/admin/invite/**)가 반드시 이 파일을 함께 쓴다.
//    클라이언트가 보낸 수 · 상태는 절대 믿지 않는다(lib/eventPass.js 와 같은 원칙).
//    · 모두에게 내 코드 하나(6자 — CODE_ALPHABET). 사이트가 처음 볼 때 만든다(ensureInviteCode)
//    · 새 멤버는 남의 코드를 계정당 평생 한 번 넣는다(내 코드는 안 됨). 넣자마자 초대한 사람에게 한 명이 쌓인다(활동 조건 없음)
//    · 넣기 조건(모두 통과 — redeemInvite 의 순서): 켜짐 + 시작 뒤 · 디스코드 계정 나이 · 지금 서버 멤버(봇 아님) + 시작 뒤 가입 · 가입 후 기한 안 · 예전에 온 적 없음
//    · 괴담회 추첨권 보너스(덤 · 기간제) — 초대 한 건마다 초대한 사람 · 들어온 친구에게 추첨권(grantInviteTickets). 못 줘도 넣기는 성공한다(관리자가 다시 지급)
//    · 누적 보상 — 관리자가 정한 단계(need = 누적 초대 수) · 닿으면 ready · 단계마다 「받기」(claimInviteTier — 지급은 lib/rewardGrant.js)
//    · 끝 시각이 없다(상시). 꺼져 있으면 관리자만 미리 본다(「유저 화면으로 보기」 중엔 유저와 같게 — 라우트가 isAdminViewer 로 넘긴다)
//    ⚠️ 옛 초대 이벤트(models/Referral · app/api/referral)와는 따로다 — 그 기록은 건드리지 않는다

// ── 키 · 표식 ─────────────────────────────────────
// 설정 문서 하나(models/InviteEvent key) · 수령 기록(InviteClaim.eventKey)도 같은 글자
export const INVITE_KEY = "invite";
// 📌 지급 표식 — 이벤트 패스("event-pass") · 괴담회("goedam")와 같은 대우, 글자만 친구 초대 것(lib/rewardGrant.js 머리 주석의 등록처 전부에 같은 글자):
//    XP Payout.source — lib/season.js PASS_NEUTRAL_SOURCES · 봇 grantQueue PASS_NEUTRAL · STOP_BLOCKED · 봇 views/pass.js
//    역할 · 아이템 Purchase.itemId — lib/inventory.js srcOf("invite") · 관리 › 유저 인벤토리 FREE_IDS
//    빙옥 WalletLog.kind — lib/adminEconomy.js POINT_LABEL
//    ("referral" 은 옛 초대 이벤트 글자라 쓰지 않는다 — 시즌 패스 진행도에 섞이는 지급이었다)
export const INVITE_SOURCE = "invite";
export const INVITE_ITEM_ID = "invite";
export const INVITE_POINT_KIND = "invite-point";
const INVITE_MARKS = { source: INVITE_SOURCE, itemId: INVITE_ITEM_ID };

// 📌 코드 — 헷갈리는 글자(I · O · 0 · 1) 뺀 32자 중 6자(옛 app/api/referral 과 같은 글자판)
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LEN = 6;

// 📌 기본값 — 설정 문서가 없을 때(꺼짐). 저장된 설정이 있으면 관리 › 친구 초대의 값이 이긴다
export const INVITE_DEFAULTS = {
  startsAt: "2026-10-26T00:00:00.000+09:00",
  joinDays: 7,
  accountDays: 7,
  // 끝 시각은 들어가지 않는다 — 11. 8. 23:59:59 까지(괴담회 추첨 닫힘과 같은 날)
  bonus: { enabled: true, endsAt: "2026-11-09T00:00:00.000+09:00", inviter: 2, invitee: 1 },
};
// 숫자 범위(관리 저장 API 가 같은 값으로 막는다) — 일수 0~60(📌 0 = 조건 없음 · 기한 없음) · 추첨권 0~10장(lib/goedamRules.js SCREENING_TICKETS.max 와 같다)
export const INVITE_DAYS = { min: 0, max: 60 };
export const INVITE_TICKETS = { min: 0, max: 10 };
// 단계 need(누적 초대 수) 상한
export const INVITE_NEED_MAX = 100_000;
// 내 초대 친구 목록 · 관리 기록 한 쪽
export const FRIENDS_MAX = 50;
export const ADMIN_PAGE_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const SNOWFLAKE = /^\d{17,20}$/;
// 디스코드 길드 멤버 flags — DID_REJOIN(나갔다가 다시 들어온 적 있음)
const DID_REJOIN = 1;
const ENTERED_MSG = "이미 초대 코드를 넣었습니다.";
// 이름이 비었을 때 — 남에게 보이는 자리(친구 목록 · 넣기 알림 · 추첨권 메모)에 ID 를 대신 내보내지 않는다
const NO_NAME = "이름 없음";
const OFF_MSG = "친구 초대가 열려 있지 않습니다.";

const iso = (d) => (d ? new Date(d).toISOString() : null);
const intIn = (v, min, max, def) => {
  const n = Number(v);
  if (v == null || v === "" || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
};
const dateOr = (v, fallback) => {
  const d = v ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d : new Date(fallback);
};
// 거절 + 화면용 구분 글자(code — 계약의 { ok:false, error, code? })
const deny = (status, error, code) => ({ ...refusal(status, error), ...(code ? { code } : {}) });

// ── 인덱스 ─────────────────────────────────────────
// 📌 테스트 사이트(localhost)도 같은 DB 를 읽는다 — 모델마다 autoCreate · autoIndex 를 꺼 두고(models/Invite*), 처음 쓰기 직전에 한 번 만든다.
//    실패하면 다음 쓰기가 다시 만든다(lib/goedam.js ensureGoedamIndexes 와 같은 방식)
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
export const ensureInviteIndexes = (...models) => Promise.all(models.map(ensureIndexes));

// ── 설정 ─────────────────────────────────────────

// 📌 단계 — 이벤트 패스 normalizeEventTiers 그대로(need 오름차순 · level 재부여 · tid 발급/보존 · 보상 정리 — 보상 최대 4개).
//    need 가 1 이상 정수 · 겹치지 않음은 관리 저장 API 가 먼저 돌려보낸다(정리 함수는 막지 않는다)
export const normalizeInviteTiers = (tiers, startTid = 1) => normalizeEventTiers(tiers, startTid);

// 📌 설정 문서 → 계산 · 관리 화면이 쓰는 모양. 문서가 없으면 기본값(꺼짐 · 기본 시작 · 7일 · 7일 · 보너스 켜짐 · 빈 단계)
export function normalizeInviteConfig(doc) {
  const t = normalizeInviteTiers(doc?.tiers, doc?.nextTid);
  const b = doc?.bonus || {};
  const D = INVITE_DEFAULTS;
  return {
    key: String(doc?.key || INVITE_KEY),
    enabled: !!doc?.enabled,
    startsAt: dateOr(doc?.startsAt, D.startsAt),
    joinDays: intIn(doc?.joinDays, INVITE_DAYS.min, INVITE_DAYS.max, D.joinDays),
    accountDays: intIn(doc?.accountDays, INVITE_DAYS.min, INVITE_DAYS.max, D.accountDays),
    bonus: {
      enabled: b.enabled === undefined || b.enabled === null ? D.bonus.enabled : !!b.enabled,
      endsAt: dateOr(b.endsAt, D.bonus.endsAt),
      inviter: intIn(b.inviter, INVITE_TICKETS.min, INVITE_TICKETS.max, D.bonus.inviter),
      invitee: intIn(b.invitee, INVITE_TICKETS.min, INVITE_TICKETS.max, D.bonus.invitee),
    },
    tiers: t.tiers,
    nextTid: t.nextTid,
    updatedAt: doc?.updatedAt ?? null,
  };
}

// 설정 읽기 — 늘 .lean() + 정리(스키마로 되살려 쓰지 않는다)
export async function loadInviteConfig() {
  return normalizeInviteConfig(await InviteEvent.findOne({ key: INVITE_KEY }).lean());
}

// 코드를 넣을 수 있는 때 — 켜짐 · 시작 ≤ 지금(끝 없음)
export const inviteOpen = (cfg, now = Date.now()) => !!cfg.enabled && Number(now) >= cfg.startsAt.getTime();

// 📌 추첨권 보너스가 지금 도는가 — 보너스 켜짐 · 줄 장 수가 있음 · 지금 < 보너스 끝 · 괴담회 켜짐 · 추첨권 아이템 있음 · 지금 < 괴담회 추첨 닫힘.
//    endsAt — 둘 중 이른 끝(ISO) · 꺼져 있으면 null. 지급 순간에는 추첨권 아이템이 실사이트에 있는지도 본다(grantInviteTickets)
export function bonusOf(cfg, goedamCfg, now = Date.now()) {
  const t = Number(now);
  const end = Math.min(cfg.bonus.endsAt.getTime(), goedamCfg.drawClosesAt.getTime());
  const on =
    !!cfg.bonus.enabled &&
    cfg.bonus.inviter + cfg.bonus.invitee > 0 &&
    t < cfg.bonus.endsAt.getTime() &&
    !!goedamCfg.enabled &&
    !!goedamCfg.ticketItemId &&
    t < goedamCfg.drawClosesAt.getTime();
  return { on, inviter: cfg.bonus.inviter, invitee: cfg.bonus.invitee, endsAt: on ? iso(end) : null };
}

// ── 코드 ─────────────────────────────────────────
// 📌 넣은 글자 정리 — 대문자 · 빈칸 · 하이픈(여러 가지 대시 포함) 빼기. 모양 검사는 따로(isCodeShape)
export const normalizeCode = (v) => String(v ?? "").toUpperCase().replace(/[\s\-‐-―−－]/g, "");
export const isCodeShape = (c) => c.length === CODE_LEN && [...c].every((ch) => CODE_ALPHABET.includes(ch));
const genCode = () => Array.from({ length: CODE_LEN }, () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)]).join("");

// 📌 내 코드 — 있으면 그것(이름이 바뀌었으면 맞춘다), 없으면 만든다. 디스코드 ID 모양(숫자 17~20자리)만 —
//    테스트 사이트 DEV_LOGIN 의 아무 글자 ID 는 실서버 DB 에 코드를 남기지 않는다(null).
//    동시에 두 번 만들면 userId 유니크가 하나만 남긴다(튕긴 쪽은 이긴 쪽 코드를 읽는다) · 코드가 겹치면 다시 뽑는다
export async function ensureInviteCode(userId, userName = "") {
  if (!SNOWFLAKE.test(String(userId || ""))) return null;
  const name = String(userName || "").trim();
  const have = await InviteCode.findOne({ userId }, { _id: 0, code: 1, userName: 1 }).lean();
  if (have) {
    if (name && have.userName !== name) {
      InviteCode.updateOne({ userId }, { $set: { userName: name } }).catch((e) => console.error("[invite] 코드 이름 맞추기 실패", { userId, err: e?.message }));
    }
    return have.code;
  }
  await ensureInviteIndexes(InviteCode);
  for (let i = 0; i < 8; i++) {
    try {
      const doc = await InviteCode.create({ userId, code: genCode(), userName: name, createdAt: new Date() });
      return doc.code;
    } catch (e) {
      if (!isDup(e)) throw e;
      const again = await InviteCode.findOne({ userId }, { _id: 0, code: 1 }).lean();
      if (again) return again.code;
    }
  }
  throw new Error("초대 코드를 만들지 못했습니다(겹침이 계속됨)");
}

// ── 넣기 조건 ──────────────────────────────────────
// 디스코드 계정 만든 시각(ms) — ID(snowflake)에서. 숫자 ID 가 아니면 null(DEV_LOGIN 등 — BigInt 가 던진다)
export function snowflakeMs(id) {
  const s = String(id || "");
  if (!SNOWFLAKE.test(s)) return null;
  try {
    const ms = Number((BigInt(s) >> 22n) + 1420070400000n);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

// 📌 넣기의 멤버 조회는 캐시를 건너뛴다(방금 들어온 사람을 1분 전 「없음」으로 보지 않게 — fresh).
//    단, 한 사람이 넣기를 연달아 누르면 10초에 한 번만 새로 묻는다 — 거절된 사람이 눌러 댈 때마다 디스코드에 물어 429(요청 제한)로
//    모두의 로그인 확인까지 막히지 않게(lib/discordMember.js — 429 동안은 전부 받아 둔 값). 10초 안의 재조회는 방금 받은 값(60초 캐시)을 쓴다 —
//    단, 마지막 새 조회보다 먼저 받은 값(그 새 조회가 실패해 남은 예전 캐시)이면 예전 값(stale)으로 친다(→ 503 잠시 뒤 · 「없음」으로 단정하지 않는다)
const FRESH_GAP_MS = 10_000;
const FRESH_MAX = 5000;
const freshAt = new Map();
function memberLookup(userId, fresh) {
  let useFresh = !!fresh;
  let since = 0;
  if (useFresh) {
    const last = freshAt.get(userId) || 0;
    if (Date.now() - last < FRESH_GAP_MS) {
      useFresh = false;
      since = last;
    } else {
      since = Date.now();
      freshAt.delete(userId);
      freshAt.set(userId, since);
      if (freshAt.size > FRESH_MAX) freshAt.delete(freshAt.keys().next().value);
    }
  }
  return fetchGuildMember(userId, { fresh: useFresh }).then((r) => (since && r?.at && r.at < since && !r.stale ? { ...r, stale: true } : r));
}

// 📌 넣기 조건 (2)~(5) — 약속 문서 순서 그대로(싼 것 먼저: 계산 → 디스코드 → DB). 통과하면 { ok: true, joinedAt }, 아니면 거절.
//    (2) 디스코드 계정 나이 ≥ accountDays(0 = 조건 없음) — 숫자 ID 가 아니면 거절
//    (3) 지금 서버 멤버 — 조회 실패 · 예전 값(stale)이면 503(잠시 뒤 — 예전 값이 「없음」이어도: 그 뒤에 들어왔을 수 있다) · 새로 받은 「없음」만 403 ·
//        봇 거절 · joined_at ≥ 시작(이 시각 전부터 있던 사람은 새 멤버가 아니다)
//    (4) 가입 후 joinDays 안(0 = 기한 없음)
//    (5) 예전에 온 적 없음 — 다시 들어온 표시(flags DID_REJOIN) · 시작 전 XP 기록(XpLog — 100일 보관) · 초기화 기록(Payout kind "reset" — 퇴장 초기화 · 관리자 초기화)
//    fresh — 넣기(POST)는 true, 조회의 입력 칸 판정(enter.show)은 false(60초 캐시)
async function eligibility(userId, cfg, { now, fresh }) {
  const created = snowflakeMs(userId);
  if (created == null) return deny(403, "넣을 수 없는 계정입니다.", "ACCOUNT");
  if (cfg.accountDays > 0 && now - created < cfg.accountDays * DAY_MS) {
    return deny(403, `디스코드 계정을 만든 지 ${cfg.accountDays}일이 지나야 넣을 수 있습니다.`, "ACCOUNT_AGE");
  }
  const r = await memberLookup(userId, fresh);
  if (r?.stale || (r?.status !== "ok" && r?.status !== "absent")) return deny(503, "잠시 뒤 다시 시도해 주세요.", "RETRY");
  if (r.status === "absent") return deny(403, "서버에 들어온 멤버만 넣을 수 있습니다.", "NOT_MEMBER");
  const m = r.member;
  if (m?.user?.bot) return deny(403, "넣을 수 없는 계정입니다.", "ACCOUNT");
  const joined = Date.parse(String(m?.joined_at || ""));
  if (!Number.isFinite(joined) || joined < cfg.startsAt.getTime()) return deny(403, "새로 들어온 멤버만 넣을 수 있습니다.", "NOT_NEW");
  if (cfg.joinDays > 0 && now - joined > cfg.joinDays * DAY_MS) {
    return deny(403, `서버에 들어온 지 ${cfg.joinDays}일이 지나 넣을 수 없습니다.`, "JOIN_DAYS");
  }
  const cameBefore = "예전에 들어온 적이 있는 계정은 넣을 수 없습니다.";
  if ((Number(m?.flags) & DID_REJOIN) !== 0) return deny(403, cameBefore, "CAME_BEFORE");
  const [log, reset] = await Promise.all([XpLog.exists({ userId, createdAt: { $lt: cfg.startsAt } }), Payout.exists({ userId, kind: "reset" })]);
  if (log || reset) return deny(403, cameBefore, "CAME_BEFORE");
  return { ok: true, joinedAt: new Date(joined) };
}

// ── 추첨권 보너스 ───────────────────────────────────
// 📌 초대 한 건의 추첨권 — 괴담회 grantGoedamTickets(lib/goedam.js)와 같은 자물쇠 · 채우기:
//    1) InviteUse 줄을 { ticketsGrantedAt: null } 조건부로 세운다(장 수도 같이 적는다 — 동시에 두 요청이 와도 한쪽만 이긴다)
//    2) 사람마다 주문 묶음(orderId "goedam:invite:<들어온 친구 ID>:<받는 사람 ID>" — lib/goedamRules.js ticketOrderId)으로 이미 들어간 장 수를 세어 모자란 만큼만 넣는다
//       (넣다 만 뒤 표시를 되돌린 줄을 다시 지급해도 두 번 주지 않게). 추첨권 1장 = Purchase 1건 · itemRef = 괴담회 추첨권 아이템(괴담회 추첨권 수에 저절로 든다)
//    3) 넣기에 실패하면 1)의 표시를 되돌리고 던진다(관리 › 초대 기록 「다시 지급」으로 다시)
//    admin — 관리자 다시 지급(기간이 지나도 준다 — 운영자 덮어쓰기). 아니면 보너스가 도는 동안만(bonusOf — 밖이면 건너뜀 { skipped } · 넣기가 줄에 적는다).
//    대상 아님 줄(ticketsSkipped)은 1)의 조건에서도 빠진다(다시 지급으로 안 생긴 몫을 만들지 않게 — regrantInviteTickets 가 먼저 거절)
//    장 수는 지금 설정의 보너스 장 수. 반환 { ok: true, granted: { inviter, invitee }, skipped? } · { ok: false, status, error }
export async function grantInviteTickets(use, { admin = false, now = Date.now(), cfg: cfgIn } = {}) {
  const cfg = cfgIn || (await loadInviteConfig());
  const g = await loadGoedamConfig();
  const none = (skipped) => ({ ok: true, granted: { inviter: 0, invitee: 0 }, skipped });
  if (!admin && !bonusOf(cfg, g, now).on) return none("off");
  if (!g.ticketItemId) return refusal(409, "추첨권 아이템이 지정되지 않았습니다.");
  const a = cfg.bonus.inviter;
  const b = cfg.bonus.invitee;
  if (a + b <= 0) return admin ? refusal(409, "지급할 추첨권 장 수가 0장입니다.") : none("zero");
  const st = (await eventItemStates([g.ticketItemId])).get(g.ticketItemId)?.state;
  if (st !== "live") return refusal(409, "추첨권 아이템이 실사이트에 없습니다.");

  const at = new Date(now);
  await ensureInviteIndexes(InviteUse);
  const row = await InviteUse.findOneAndUpdate(
    { inviteeId: use.inviteeId, ticketsGrantedAt: null, ticketsSkipped: null },
    { $set: { ticketsGrantedAt: at, inviterTickets: a, inviteeTickets: b } },
    { returnDocument: "after" }
  ).lean();
  if (!row) return refusal(409, "이미 지급되었습니다.");

  const sid = `invite:${row.inviteeId}`;
  const screening = { sid, title: "친구 초대" };
  const sides = [
    { userId: row.inviterId, userName: row.inviterName, n: a, other: row.inviteeName || NO_NAME },
    { userId: row.inviteeId, userName: row.inviteeName, n: b, other: row.inviterName || NO_NAME },
  ];
  try {
    for (const s of sides) {
      if (s.n <= 0) continue;
      const have = await Purchase.countDocuments({ userId: s.userId, orderId: ticketOrderId(sid, s.userId) });
      const need = Math.max(0, s.n - have);
      if (need > 0) {
        await Purchase.insertMany(ticketPurchaseDocs({ cfg: g, screening, userId: s.userId, userName: s.userName, n: need, now: at, note: `친구 초대 · ${s.other}` }));
      }
    }
  } catch (e) {
    await InviteUse.updateOne({ inviteeId: row.inviteeId, ticketsGrantedAt: at }, { $set: { ticketsGrantedAt: null, inviterTickets: 0, inviteeTickets: 0 } }).catch((err) =>
      console.error("[invite] 추첨권 지급 표시 되돌리기 실패 — 수동 확인 필요", { inviteeId: row.inviteeId, err: err?.message })
    );
    throw e;
  }
  return { ok: true, granted: { inviter: a, invitee: b } };
}

// ── 코드 넣기 ─────────────────────────────────────
// 📌 넣기(POST /api/invite/redeem) — 약속 문서 순서, 싼 것 먼저:
//    (1) 켜짐 + 시작 뒤 → 글자 모양 → 이미 넣었나(평생 한 번) → 코드 주인 찾기 · 내 코드 거절 → (2)~(5) eligibility(디스코드는 캐시를 건너뛰어 새로)
//    → InviteUse 넣기(inviteeId 유니크 — 동시에 두 번 보내도 하나만, 튕긴 쪽은 「이미 넣었습니다」) → 추첨권 보너스(실패 · 건너뜀은 넣기를 실패시키지 않는다)
//    반환 { ok: true, inviterName, tickets: { me, inviter } } · { ok: false, status, error, code }
export async function redeemInvite({ userId, userName = "", code, now = Date.now() }) {
  if (!userId) return deny(401, "로그인이 필요합니다.");
  const cfg = await loadInviteConfig();
  if (!cfg.enabled) return deny(403, OFF_MSG, "OFF");
  if (!inviteOpen(cfg, now)) return deny(403, "아직 시작 전입니다.", "OFF");
  const c = normalizeCode(code);
  if (!c) return deny(400, "초대 코드를 입력해 주세요.", "NO_CODE");
  if (!isCodeShape(c)) return deny(404, "없는 초대 코드입니다.", "NO_CODE");
  if (await InviteUse.exists({ inviteeId: userId })) return deny(409, ENTERED_MSG, "ENTERED");
  const owner = await InviteCode.findOne({ code: c }, { _id: 0, userId: 1, userName: 1 }).lean();
  if (!owner) return deny(404, "없는 초대 코드입니다.", "NO_CODE");
  if (String(owner.userId) === String(userId)) return deny(400, "내 코드는 넣을 수 없습니다.", "OWN_CODE");

  const ok = await eligibility(userId, cfg, { now, fresh: true });
  if (!ok.ok) return ok;

  await ensureInviteIndexes(InviteUse);
  let use;
  try {
    use = (
      await InviteUse.create({
        inviteeId: userId,
        inviteeName: String(userName || "").trim(),
        inviterId: owner.userId,
        inviterName: String(owner.userName || "").trim(),
        code: c,
        joinedAt: ok.joinedAt,
        at: new Date(now),
        ticketsGrantedAt: null,
        ticketsSkipped: null,
        inviterTickets: 0,
        inviteeTickets: 0,
      })
    ).toObject();
  } catch (e) {
    if (isDup(e)) return deny(409, ENTERED_MSG, "ENTERED");
    throw e;
  }

  let tickets = { me: 0, inviter: 0 };
  try {
    const g = await grantInviteTickets(use, { now, cfg });
    if (g.ok && g.skipped) {
      // 📌 대상 아님(넣은 순간 보너스가 안 돎) — 까닭을 줄에 적어 못 준 줄과 가른다(관리 › 초대 기록 「대상 아님」 · 미지급 수 · 다시 지급에서 빠짐)
      await InviteUse.updateOne({ inviteeId: userId, ticketsGrantedAt: null }, { $set: { ticketsSkipped: g.skipped } }).catch((e) =>
        console.error("[invite] 추첨권 대상 아님 표시 실패 — 미지급으로 보임", { inviteeId: userId, err: e?.message })
      );
    } else if (g.ok) tickets = { me: g.granted.invitee, inviter: g.granted.inviter };
    else console.warn("[invite] 추첨권 보너스 못 줌 — 관리 › 초대 기록에서 다시 지급", { inviteeId: userId, why: g.error });
  } catch (e) {
    console.error("[invite] 추첨권 보너스 지급 실패 — 관리 › 초대 기록에서 다시 지급", { inviteeId: userId, err: e?.message });
  }
  return { ok: true, inviterName: use.inviterName || NO_NAME, tickets };
}

// ── 누적 보상 단계 ─────────────────────────────────
const cellOf = (tier) => `친구 초대 ${tier.need}명`;

// 내 누적 수 · 수령 기록(단계 · 부분) — 로그인 아니면 0 · []
async function progressOf(userId, cfg) {
  if (!userId) return { count: 0, claims: [] };
  const [count, claims] = await Promise.all([
    InviteUse.countDocuments({ inviterId: userId }),
    cfg.tiers.length ? InviteClaim.find({ userId, eventKey: cfg.key, kind: { $in: ["tier", "part"] } }, { _id: 0, kind: 1, ref: 1 }).lean() : [],
  ]);
  return { count, claims };
}

// 📌 단계 상태 — done: 받음(받을 보상이 없는 단계는 닿으면 done) · ready: 닿았고 남은 보상이 있음 · lock: 아직 못 닿음(이벤트 패스와 같은 판정).
//    반환 [{ ...단계, keys, whole, parts, pending, state }] — hold(남은 보상에 실사이트에 없는 아이템)는 부르는 쪽이 붙인다
function tierRows(cfg, count, claims) {
  const tierDone = new Set();
  const parts = new Set();
  for (const c of claims) {
    if (c.kind === "tier") tierDone.add(String(c.ref));
    else if (c.kind === "part") parts.add(String(c.ref));
  }
  return cfg.tiers.map((t) => {
    const keys = rewardKeys(t.tid, t.free);
    const whole = tierDone.has(t.tid);
    const pending = t.free.filter((r, j) => !whole && !parts.has(keys[j]));
    const reached = count >= t.need;
    const state = t.free.length && !pending.length ? "done" : !reached ? "lock" : t.free.length ? "ready" : "done";
    return { ...t, keys, whole, parts, pending, state };
  });
}

// ── 조회 ─────────────────────────────────────────
// 📌 띠 노출 · 띠 배지용(GET /api/invite?meta=1) — 디스코드에 묻지 않는다. visible = 켜짐 또는 관리자 · claimable = 받을 수 있는 단계 수(열려 있을 때만, 손님 0)
export async function getInviteMeta(userId = "", { isAdmin = false, now = Date.now() } = {}) {
  const cfg = await loadInviteConfig();
  const visible = cfg.enabled || !!isAdmin;
  let claimable = 0;
  if (visible && userId && inviteOpen(cfg, now) && cfg.tiers.length) {
    const { count, claims } = await progressOf(userId, cfg);
    claimable = tierRows(cfg, count, claims).filter((t) => t.state === "ready").length;
  }
  return { visible, enabled: cfg.enabled, claimable };
}

// 📌 입력 칸을 보일까(enter.show) — 아직 안 넣었고 넣기 조건을 전부 통과하는 사람만. 멤버 조회는 60초 캐시 · 어떤 실패든 false(넣기가 다시 확인한다)
//    대부분(예전부터 있던 멤버)은 시작 전 XP 기록으로 걸린다 — 그 DB 확인을 먼저 해 디스코드에 묻지 않고 끝낸다(참 거짓만 보므로 순서는 상관없다)
async function canEnter(userId, cfg, now) {
  try {
    if (!userId || !inviteOpen(cfg, now) || snowflakeMs(userId) == null) return false;
    const [entered, log] = await Promise.all([InviteUse.exists({ inviteeId: userId }), XpLog.exists({ userId, createdAt: { $lt: cfg.startsAt } })]);
    if (entered || log) return false;
    return (await eligibility(userId, cfg, { now, fresh: false })).ok === true;
  } catch {
    return false;
  }
}

// 📌 입력 칸만(GET /api/invite?enter=1 — 인증 화면 /verify) — 창 본문(getInviteState)과 같은 판정(보일 때만 canEnter).
//    내 코드를 만들지 않고(ensureInviteCode 안 부름) 보상 보기 · 친구 · 수령 기록 · 괴담회 설정도 읽지 않는다. 넣기 입구(점검 · 비공개 · XP 중단)는 라우트가 더한다
export async function getInviteEnter(userId = "", { isAdmin = false, now = Date.now() } = {}) {
  const cfg = await loadInviteConfig();
  const visible = cfg.enabled || !!isAdmin;
  return { show: visible ? await canEnter(userId, cfg, now) : false };
}

// 📌 창 본문(GET /api/invite) — 계약 모양 그대로 + 계약 밖 덧붙임(visible · startsAt).
//    꺼져 있으면 관리자만 단계를 본다(adminPreview) — 유저에게는 단계를 비워 보내고 코드를 만들지 않는다(괴담회 「켜기 전엔 운영진 미리보기만」과 같다).
//    friends — 이름 · 넣은 시각만(남의 ID 는 내보내지 않는다) · 최신순 50명. 손님은 code null · count 0 · friends [] · enter.show false
export async function getInviteState(userId = "", { isAdmin = false, userName = "", now = Date.now() } = {}) {
  const cfg = await loadInviteConfig();
  const open = inviteOpen(cfg, now);
  const visible = cfg.enabled || !!isAdmin;
  const head = {
    guest: !userId,
    enabled: cfg.enabled,
    open,
    adminPreview: !cfg.enabled && !!isAdmin,
    visible,
    startsAt: iso(cfg.startsAt),
  };

  const [gcfg, prog, friendRows, views, code, show] = await Promise.all([
    loadGoedamConfig(),
    progressOf(userId, cfg),
    userId ? InviteUse.find({ inviterId: userId }, { _id: 0, inviteeName: 1, at: 1 }).sort({ at: -1 }).limit(FRIENDS_MAX).lean() : [],
    visible && cfg.tiers.length ? rewardViewsLoader(cfg.tiers.map((t) => t.free), { detail: true }) : null,
    userId && visible
      ? ensureInviteCode(userId, userName).catch((e) => {
          console.error("[invite] 내 코드 만들기 실패", { userId, err: e?.message });
          return null;
        })
      : null,
    visible ? canEnter(userId, cfg, now) : false,
  ]);

  const rows = visible ? tierRows(cfg, prog.count, prog.claims) : [];
  const tiers = rows.map((t) => ({
    tid: t.tid,
    level: t.level,
    need: t.need,
    state: t.state,
    // 📌 hold — 남은 보상에 실사이트에 없는 아이템(반영 전 · 지워짐)이 있다. 상태(ready)는 그대로 두고 받기만 거절한다(claimInviteTier)
    hold: !!views && t.pending.some((r) => r.kind === "item" && !views.isLive(r.itemId)),
    rewards: t.free.map((r, j) => views.viewOf(r, t.whole || t.parts.has(t.keys[j]))),
  }));
  return {
    ...head,
    code: code || null,
    count: prog.count,
    friends: friendRows.map((f) => ({ name: String(f.inviteeName || "") || NO_NAME, at: iso(f.at) })),
    tiers,
    // 지금 받을 수 있는 수 — 열려 있을 때만(시작 전 · 꺼짐이면 0)
    claimable: open ? tiers.filter((t) => t.state === "ready").length : 0,
    bonus: bonusOf(cfg, gcfg, now),
    enter: { show: !!show },
  };
}

// ── 받기 ─────────────────────────────────────────
// 📌 단계 하나 받기(POST /api/invite/claim { tid }) — 상태는 매번 서버가 다시 센다(클라이언트 값은 쓰지 않는다).
//    받을 수 있는 때: 켜짐 · 시작 뒤(끝 없음). 실사이트에 없는 아이템이 남은 단계는 자물쇠 전에 거절(hold) — 그 사이 변화는 claimRewardSet 이 다시 본다.
//    누적 수는 줄지 않는다(InviteUse 를 지우지 않는다) — 확인과 받기 사이에 「닿음」이 풀리지 않는다.
//    반환 { ok: true, labels, partial, state(조회와 같은 본문) } · { ok: false, status, error, hold? }
export async function claimInviteTier({ userId, userName = "", tid, isAdmin = false, now = Date.now() }) {
  if (!userId) return refusal(401, "로그인이 필요합니다.");
  const cfg = await loadInviteConfig();
  if (!cfg.enabled) return refusal(403, OFF_MSG);
  if (!inviteOpen(cfg, now)) return refusal(403, "아직 시작 전입니다.");
  const id = String(tid || "");
  if (!cfg.tiers.some((t) => t.tid === id)) return refusal(404, "존재하지 않는 단계입니다.");
  const { count, claims } = await progressOf(userId, cfg);
  const tier = tierRows(cfg, count, claims).find((t) => t.tid === id);
  if (tier.state === "done") return refusal(409, "이미 받았습니다.");
  if (tier.state !== "ready") return refusal(400, "아직 도달하지 않았습니다.");
  if ((await notLiveItemIds(tier.pending)).length) return holdRefusal();

  const r = await claimRewardSet({
    Claim: InviteClaim,
    ensureIndexes: () => ensureInviteIndexes(InviteClaim),
    base: { userId, eventKey: cfg.key },
    ref: tier.tid,
    level: tier.level,
    rewards: tier.free,
    keys: tier.keys,
    cell: cellOf(tier),
    marks: INVITE_MARKS,
    pointKind: INVITE_POINT_KIND,
    refId: `${cfg.key}:${tier.tid}`,
    userId,
    userName,
    tag: "invite",
  });
  if (!r.ok) return r;
  return { ok: true, labels: r.labels, partial: r.partial, state: await getInviteState(userId, { isAdmin, userName }) };
}

// ── 관리자 ─────────────────────────────────────────
// 📌 관리 화면 응답 모양(GET · PUT /api/admin/invite 의 cfg) — 날짜는 ISO 글자. tid 가 실려 나간다(화면은 그대로 되돌려 보내야 한다)
export const toAdminInvite = (cfg) => ({
  ...cfg,
  startsAt: iso(cfg.startsAt),
  bonus: { ...cfg.bonus, endsAt: iso(cfg.bonus.endsAt) },
  updatedAt: cfg.updatedAt ? iso(cfg.updatedAt) : null,
});
// 응답 모양 — Map(id → { state }) → { id: state }
const statesOut = (m) => Object.fromEntries([...m].map(([id, s]) => [id, s.state]));
export const inviteItemIds = (tiers) => [...new Set((Array.isArray(tiers) ? tiers : []).flatMap((t) => t.free).filter((r) => r.kind === "item").map((r) => r.itemId))];

// 📌 관리 화면 본문 — { cfg, itemStates(단계 아이템 보상 id → live | draft | missing), stats: { uses(초대 수), codes(만든 코드 수), ticketsPending(추첨권 미지급 줄 — 대상 아님 줄 ticketsSkipped 은 뺀다) } }.
//    읽기만(문서가 없으면 기본값 — 첫 저장이 만든다)
export async function getInviteAdmin(cfgIn) {
  const cfg = cfgIn || (await loadInviteConfig());
  const [states, uses, codes, ticketsPending] = await Promise.all([
    eventItemStates(inviteItemIds(cfg.tiers)),
    InviteUse.countDocuments({}),
    InviteCode.countDocuments({}),
    InviteUse.countDocuments({ ticketsGrantedAt: null, ticketsSkipped: null }),
  ]);
  return { cfg: toAdminInvite(cfg), itemStates: statesOut(states), stats: { uses, codes, ticketsPending } };
}

// 📌 설정 문서 쓰기 — 온 칸만 덮어쓴다($set). 문서가 없으면 만든다(첫 저장) — 그때 기본값을 같이(이미 $set 에 있는 칸은 빼고)
export async function writeInviteConfig($set) {
  await ensureInviteIndexes(InviteEvent);
  const D = INVITE_DEFAULTS;
  const defaults = {
    enabled: false,
    startsAt: new Date(D.startsAt),
    joinDays: D.joinDays,
    accountDays: D.accountDays,
    bonus: { ...D.bonus, endsAt: new Date(D.bonus.endsAt) },
    tiers: [],
    nextTid: 1,
  };
  const $setOnInsert = Object.fromEntries(Object.entries(defaults).filter(([k]) => !(k in $set)));
  const doc = await InviteEvent.findOneAndUpdate(
    { key: INVITE_KEY },
    { $set, ...(Object.keys($setOnInsert).length ? { $setOnInsert } : {}) },
    { upsert: true, returnDocument: "after" }
  ).lean();
  return normalizeInviteConfig(doc);
}

// 📌 초대 기록(GET /api/admin/invite/uses?page=&q=) — 최신순 50줄 한 쪽(page 1부터). q — 이름 · ID · 코드 일부(대소문자 무시)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function inviteUses({ page = 1, q = "" } = {}) {
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  const s = String(q || "").trim().slice(0, 64);
  let filter = {};
  if (s) {
    const rx = { $regex: escapeRe(s), $options: "i" };
    const codeRx = normalizeCode(s);
    filter = {
      $or: [
        { inviteeName: rx },
        { inviterName: rx },
        { inviteeId: rx },
        { inviterId: rx },
        ...(codeRx ? [{ code: { $regex: escapeRe(codeRx) } }] : []),
      ],
    };
  }
  const [rows, total] = await Promise.all([
    InviteUse.find(filter).sort({ at: -1, _id: -1 }).skip((p - 1) * ADMIN_PAGE_SIZE).limit(ADMIN_PAGE_SIZE).lean(),
    InviteUse.countDocuments(filter),
  ]);
  return {
    page: p,
    perPage: ADMIN_PAGE_SIZE,
    total,
    rows: rows.map((r) => ({
      inviteeId: String(r.inviteeId || ""),
      inviteeName: String(r.inviteeName || ""),
      inviterId: String(r.inviterId || ""),
      inviterName: String(r.inviterName || ""),
      code: String(r.code || ""),
      at: iso(r.at),
      joinedAt: iso(r.joinedAt),
      ticketsGrantedAt: iso(r.ticketsGrantedAt),
      // 추첨권 대상 아님 까닭("off" · "zero") — 있으면 미지급이 아니다(「다시 지급」 없음) · null 이면 줬거나 못 줌
      ticketsSkipped: r.ticketsSkipped ? String(r.ticketsSkipped) : null,
      inviterTickets: Math.max(0, Number(r.inviterTickets) || 0),
      inviteeTickets: Math.max(0, Number(r.inviteeTickets) || 0),
    })),
  };
}

// 📌 추첨권 다시 지급(POST /api/admin/invite/regrant { inviteeId }) — 아직 못 준 줄(ticketsGrantedAt null)만. 보너스 기간이 지나도 준다(관리자 덮어쓰기).
//    대상 아님 줄(ticketsSkipped — 넣은 순간 보너스가 안 돎)은 거절한다(받을 몫이 없던 줄 · 추첨이 닫힌 뒤 추첨권이 새로 생기지 않게)
//    장 수는 지금 설정의 보너스 장 수 · 이미 들어간 장 수는 주문 묶음으로 세어 모자란 만큼만(grantInviteTickets)
export async function regrantInviteTickets(inviteeId) {
  const use = await InviteUse.findOne({ inviteeId }).lean();
  if (!use) return refusal(404, "초대 기록이 없습니다.");
  if (use.ticketsGrantedAt) return refusal(409, "이미 지급되었습니다.");
  if (use.ticketsSkipped) return refusal(409, "추첨권 지급 대상이 아닌 초대입니다.");
  return grantInviteTickets(use, { admin: true });
}
