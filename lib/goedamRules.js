import { normalizeRarity } from "./rarity.js";
import { kstDateKey } from "./kst.js";

// 📌 방구석 심야 괴담회(2026-10-23 운영자 결정 — 약속 문서 .claude/mockups/goedam/SPEC.md) 규칙 중 DB 없는 부분 — 키 · 표식 · 기본값 · 설정 정리 · 비중 고르기.
//    서버 계산(lib/goedam.js — 이 파일을 그대로 다시 내보낸다) · 관리 화면 · 유저 화면이 같이 읽는다. 모델 · 별칭(@/) import 를 넣지 않는다
//    (화면 번들 · node 로 바로 돌리는 점검이 이 파일을 그대로 읽는다 — lib/season.js 의 순수 식과 같은 쓰임).
//    ⚠️ 봇 bot/src/features/goedamWatch.js 는 사이트 코드를 import 할 수 없다 — 키 · 표식 · 추첨권 지급 모양(ticketPurchaseDocs)을 바꾸면 봇 사본도 같이

// ── 키 · 표식(세 갈래가 같은 글자를 쓴다) ─────────────────
// 📌 이벤트 키 — 설정 문서 하나(models/Goedam key). 다음 괴담회는 키를 바꿔 새 문서로 연다(기록이 키로 갈린다 — 이벤트 패스 EVENT_PASS_KEY 와 같은 방식)
export const GOEDAM_KEY = "goedam-2026";
// 추첨권 지급 Purchase.itemId — 1장 = 1건(×N 으로 쌓인다 — lib/inventory.js units)
//    📌 2026-10-24 운영자 「받는 법」 확장 — 추첨권 수는 이 표식이 아니라 추첨권 아이템(ticketItemId)을 가진 개수로 센다(lib/goedam.js countGoedamTickets).
//       이 글자는 상영 완청 · 음성 활동 · 관리자 손 지급이 넣는 건의 출처 표시로만 남는다(상점에서 산 건 · 다른 길로 받은 건에는 없다)
export const GOEDAM_TICKET_ID = "goedam-ticket";
// 추첨권을 쓴 표시(Purchase.consumedBy) — { consumedAt: null } 조건부로 세운다
export const GOEDAM_DRAW_BY = "goedam-draw";
// 📌 상품 지급 표식 — 이벤트 패스("event-pass")와 같은 대우, 글자만 괴담회 것.
//    XP Payout.source — lib/season.js PASS_NEUTRAL_SOURCES 에 같은 글자가 있다(시즌 · 이벤트 패스 진행도를 채우지 않는다).
//    ⚠️ 봇 bot/src/features/grantQueue.js PASS_NEUTRAL · STOP_BLOCKED 에도 같은 글자가 있어야 한다
export const GOEDAM_SOURCE = "goedam";
// 아이템 · 역할 상품 Purchase.itemId — 상점 상품이 아니라는 고정 글자("event-pass" 와 같은 쓰임)
export const GOEDAM_ITEM_ID = "goedam";
// 빙옥 상품 원장(WalletLog) 종류
export const GOEDAM_POINT_KIND = "goedam-point";

// 📌 기본값 — 설정 문서가 없을 때(꺼짐 · 기본 제목 · 기본 추첨 기간). 저장된 설정이 있으면 관리 › 괴담회의 값이 이긴다
//    추첨 기간 [열림, 닫힘) — 끝 시각은 들어가지 않는다(11. 6. 00:00 KST 면 11. 5. 23:59:59 까지 — 2026-10-25 운영자 "11월 5일까지로 바꿔")
//    음성 활동 기간 [시작, 끝)도 같다(2026-10-24 — 봇 bot/src/db.js · bot/src/features/goedamWatch.js normalizeGoedam 과 같은 기본값)
export const GOEDAM_DEFAULTS = {
  title: "방구석 심야 괴담회",
  drawOpensAt: "2026-10-26T00:00:00.000+09:00", // 2026-10-25 운영자 "뽑기는 내일부터" · 10/26 00:00
  drawClosesAt: "2026-11-06T00:00:00.000+09:00",
  voiceStartsAt: "2026-10-30T00:00:00.000+09:00",
  voiceEndsAt: "2026-11-06T00:00:00.000+09:00",
};

// 상품 종류 — xp · point(빙옥) · item(count 개 · 무기한 — 2개 이상은 쌓이는 아이템만) · role · code(코드 풀에서 한 장 — models/GoedamCode) · none(꽝)
export const PRIZE_KINDS = ["xp", "point", "item", "role", "code", "none"];

// ── 숫자 범위(관리 화면 · 저장 API 가 같은 값으로 막는다) ─────
export const SCREENING_TICKETS = { min: 1, max: 10, def: 1 };
export const SCREENING_RATIO = { min: 0.1, max: 1, def: 0.8 };
// 음성 활동 — 하루 음성 N분(10~1440, 기본 60) · 장 수(1~10, 기본 1). ⚠️ 봇 normalizeGoedam 과 같은 범위
export const VOICE_MINUTES = { min: 10, max: 1440, def: 60 };
export const VOICE_TICKETS = { min: 1, max: 10, def: 1 };
export const PRIZE_WEIGHT = { min: 1, max: 1_000_000, def: 1 };
export const MAX_SCREENINGS = 60;
export const MAX_PRIZES = 50;
export const MAX_TITLE = 40;
// 코드 한 장 길이 · 한 번에 붙여 넣는 수
export const MAX_CODE_LEN = 100;
export const MAX_CODES_PER_SAVE = 5000;
// 수량 · XP · 빙옥 상한 — lib/seasonPass.js num 의 max 와 같다
export const NUM_MAX = 1_000_000_000;
// 📌 아이템 상품 개수(2026-10-25 운영자 "개수 아이템도 1개 2개 … 설정 가능하게 · 일자 말고") — 1~99(관리자 수동 지급 1회 최대와 같다).
//    여러 개는 쌓이는 아이템만(1개 단위로 파는 상품이 가리키거나 소모형 — lib/unitSale.js unitThingSet · 괴담회 추첨권 아이템). 기간(일)은 없앴다 — 아이템 상품은 늘 무기한
export const PRIZE_COUNT = { min: 1, max: 99, def: 1 };

const intIn = (v, min, max, def) => {
  const n = Number(v);
  if (v == null || v === "" || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
};
const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const dateOrNull = (v) => {
  const d = v ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
};
const dateOr = (v, fallback) => dateOrNull(v) || new Date(fallback);
export const iso = (d) => (d ? new Date(d).toISOString() : null);

// 완청 비율 — 0.1 ~ 1, 0.01 단위(80% = 0.8). 못 읽으면 기본 0.8
export const ratioOf = (v) => {
  const n = Number(v);
  if (v == null || v === "" || !Number.isFinite(n)) return SCREENING_RATIO.def;
  return Math.round(Math.min(SCREENING_RATIO.max, Math.max(SCREENING_RATIO.min, n)) * 100) / 100;
};
// 수량 — null = 무제한. 빈 값 · 숫자 아님도 무제한, 음수는 0(안 나옴)
export const qtyOf = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(NUM_MAX, Math.max(0, Math.floor(n))) : null;
};

// ── 식별자(sid · pid) ─────────────────────────────────
// 📌 회차 sid("s1" …) · 상품 pid("p1" …)는 기록(GoedamWatch.sid · GoedamDraw.pid · GoedamStock · GoedamCode)이 담는 안정 식별자다.
//    한 번 붙은 번호는 바꾸지도 다시 쓰지도 않는다 — 다음 번호(nextSid · nextPid)를 문서에 들고 다니고, 들어온 번호보다 늘 크게 올린다(이벤트 패스 tid 와 같은 이유).
//    known(Set)을 주면 그 안의 번호만 이어 쓴다 — 저장 API 가 지금 문서에 없는 번호(지운 회차 · 상품, 손으로 만든 값)를 새로 발급하게(되살아나 옛 기록과 섞이지 않게)
const idNum = (v, prefix) => {
  const m = new RegExp(`^${prefix}([1-9]\\d{0,8})$`).exec(String(v || ""));
  return m ? Number(m[1]) : 0;
};
function issueIds(rows, prefix, start, known) {
  // 이어 쓸 번호 — 모양이 맞고(known 이 있으면 그 안에 있는) 것만. 다음 번호는 이어 쓴 번호보다 늘 크다
  const keep = rows.map((r) => (idNum(r.id, prefix) && (!known || known.has(r.id)) ? r.id : ""));
  let next = Math.max(1, Math.floor(Number(start)) || 1);
  for (const id of keep) if (id) next = Math.max(next, idNum(id, prefix) + 1);
  const seen = new Set();
  const out = rows.map((r, i) => {
    let id = keep[i];
    if (!id || seen.has(id)) id = `${prefix}${next++}`;
    seen.add(id);
    return { ...r, id };
  });
  return { rows: out, next };
}

// ── 회차 ─────────────────────────────────────────
// 📌 회차 정리 — 시각이 깨졌거나 끝 ≤ 시작인 줄은 뺀다(저장 API 가 먼저 돌려보낸다 — 손으로 고친 문서만 여기서 걸린다).
//    장 수 1~10(기본 1) · 완청 비율 0.1~1(기본 0.8) · 시작 순 정렬 뒤 sid 발급(새 회차 번호도 시작 순으로 붙는다).
//    반환 { screenings: [{ sid, title, startsAt, endsAt, tickets, ratio }], nextSid } — 호출부가 nextSid 도 함께 저장해야 번호가 다시 쓰이지 않는다
export function normalizeScreenings(list, startSid = 1, known) {
  const rows = (Array.isArray(list) ? list : [])
    .map((r, i) => ({
      i,
      id: String(r?.sid || ""),
      title: str(r?.title, MAX_TITLE),
      startsAt: dateOrNull(r?.startsAt),
      endsAt: dateOrNull(r?.endsAt),
      tickets: intIn(r?.tickets, SCREENING_TICKETS.min, SCREENING_TICKETS.max, SCREENING_TICKETS.def),
      ratio: ratioOf(r?.ratio),
    }))
    .filter((r) => r.startsAt && r.endsAt && r.endsAt.getTime() > r.startsAt.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.i - b.i)
    .slice(0, MAX_SCREENINGS);
  const n = issueIds(rows, "s", startSid, known);
  return {
    screenings: n.rows.map((r) => ({ sid: r.id, title: r.title, startsAt: r.startsAt, endsAt: r.endsAt, tickets: r.tickets, ratio: r.ratio })),
    nextSid: n.next,
  };
}

// 회차 길이(초) · 완청에 필요한 머문 초(비율 × 길이, 올림) · 머문 비율(%, 소수 첫째 자리)
//    📌 올림 전에 소수 오차를 걷어 낸다 — 0.14 × 300 = 42.00000000000001 이 43 으로 올라가면 봇 판정(seconds ≥ 비율 × 길이 − 1e-6, bot/src/features/goedamWatch.js isFullWatch)보다
//       1초 깐깐해져 봇은 준 사람이 화면 · 명단에서 「완청 아님」으로 보인다. 비율은 0.01 단위 · 길이는 정수 초라 참값은 0.01 의 배수 — 1e-6 을 빼도 값이 바뀌지 않는다
export const screeningSeconds = (s) => Math.max(0, Math.floor((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 1000));
export const needSeconds = (s) => Math.ceil(ratioOf(s.ratio) * screeningSeconds(s) - 1e-6);
export const watchPct = (seconds, s) => {
  const len = screeningSeconds(s);
  return len > 0 ? Math.min(100, Math.round((Math.max(0, Number(seconds) || 0) / len) * 1000) / 10) : 0;
};

// ── 음성 활동 ───────────────────────────────────────
// 📌 2026-10-24 운영자 "디코 일정 시간한 것도 지급할 거고 상점에도 판매할 거라서 회차라는 개념이 좀 애매한데" — 추첨권을 받는 길은 상영 · 음성 · 상점 셋.
//    음성 = 하루(KST 자정 기준) 음성 N분을 채우면 추첨권 M장, 하루 한 번. 봇(bot/src/features/goedamWatch.js)이 5분마다
//    오늘 셀 구간(0시 ~ 다음 0시 ∩ 기간 — voiceTodayRange)의 XpLog { reason: "voice" } 를 사람마다 sec 합으로 모아(sec 없는 옛 줄은 VOICE_LOG_SEC) 판정 · 지급한다.
//    기록 줄은 GoedamWatch { sid: "voice:<YYYY-MM-DD>" }(그날 합 · 지급) · 추첨권 orderId "goedam:voice:<YYYY-MM-DD>:<userId>"(ticketOrderId 그대로).
//    어느 채널을 셀지는 추후 — 지금은 채널 조건 없이(음성 XP 기록 전부) 기본 꺼짐(관리자가 채널을 정한 뒤 켠다).
//    추후 채널 조건은 설정 voice.channels 로 더한다(이 정리 함수 · models/Goedam.js · 봇 normalizeGoedam · 봇 판정을 같이)
//    ⚠️ 기본값 · 범위 · 날짜 글자 · 표식 글자는 봇 사본과 같아야 한다
// 음성 XP 한 줄의 초 — sec 칸이 없는 옛 줄은 300초(lib/questKinds.js 의 { $ifNull: ["$sec", 300] } 와 같은 규칙)
export const VOICE_LOG_SEC = 300;
export const VOICE_SID_PREFIX = "voice:";
// 📌 음성 설정 정리 — 문서에 칸이 없으면 기본값(꺼짐 · 60분 · 1장 · 기본 기간). 기간이 뒤집힌(끝 ≤ 시작) 값은 그대로 둔다 — 기간 안인 때가 없어 저절로 안 준다
//    (저장 API 가 먼저 돌려보낸다 — 손으로 고친 문서만 여기 걸린다)
export function normalizeVoice(v) {
  return {
    enabled: !!v?.enabled,
    minutes: intIn(v?.minutes, VOICE_MINUTES.min, VOICE_MINUTES.max, VOICE_MINUTES.def),
    tickets: intIn(v?.tickets, VOICE_TICKETS.min, VOICE_TICKETS.max, VOICE_TICKETS.def),
    startsAt: dateOr(v?.startsAt, GOEDAM_DEFAULTS.voiceStartsAt),
    endsAt: dateOr(v?.endsAt, GOEDAM_DEFAULTS.voiceEndsAt),
  };
}
// 기간 [시작, 끝) 안인가 — 끝 시각은 들어가지 않는다
export const voiceInPeriod = (v, now = Date.now()) => {
  const t = Number(now);
  return t >= new Date(v?.startsAt).getTime() && t < new Date(v?.endsAt).getTime();
};
// 📌 지금 음성으로 받을 수 있나 — 봇 지급 조건 그대로(괴담회 켜짐 && 음성 켜짐 && 기간 안 && 추첨권 아이템 있음). 창의 「받는 법 › 음성」 줄이 흐려지는 기준
export const voiceOn = (cfg, now = Date.now()) => !!cfg?.enabled && !!cfg?.voice?.enabled && !!cfg?.ticketItemId && voiceInPeriod(cfg.voice, now);
// 하루 기준 초(분 × 60) · 채운 비율(%, 소수 첫째 자리 · 100 상한)
export const voiceNeedSeconds = (v) => intIn(v?.minutes, VOICE_MINUTES.min, VOICE_MINUTES.max, VOICE_MINUTES.def) * 60;
export const voicePct = (seconds, v) => Math.min(100, Math.round((Math.max(0, Number(seconds) || 0) / voiceNeedSeconds(v)) * 1000) / 10);
// 📌 날짜 — KST "YYYY-MM-DD"(lib/kst.js kstDateKey · 봇 goedamWatch.js kstDayKey 와 같은 글자) · 그날 0시(KST) · 기록 줄 sid
export const voiceDayKey = (now = Date.now()) => kstDateKey(now);
export const voiceDayStart = (day) => new Date(`${day}T00:00:00.000+09:00`);
export const voiceSid = (day) => `${VOICE_SID_PREFIX}${day}`;
// 📌 오늘 셀 구간 [from, to)(ms) = 오늘(KST) [0시, 다음 0시) ∩ 기간 [startsAt, endsAt) — 봇 voiceDays 의 「오늘」과 같은 구간(맞물림 검사 2026-10-24).
//    기간이 낮 시각에 시작 · 끝나는 첫날 · 마지막 날에도 창 막대(todaySec)와 봇 지급 판정이 갈리지 않게. 겹치지 않으면(기간 밖) null
const VOICE_DAY_MS = 24 * 60 * 60 * 1000;
export const voiceTodayRange = (v, now = Date.now()) => {
  const day = voiceDayStart(voiceDayKey(now)).getTime();
  const from = Math.max(day, new Date(v?.startsAt).getTime());
  const to = Math.min(day + VOICE_DAY_MS, new Date(v?.endsAt).getTime());
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null;
};
// 그날 초(정수) — sec 합(0.1초 단위 줄을 더한 값)의 아주 작은 소수 오차는 찬 것으로 본다(봇 daySeconds 의 + 1e-6 과 같다)
export const voiceSecOf = (sum) => Math.max(0, Math.floor((Number(sum) || 0) + 1e-6));
// sid → 날짜("voice:2026-10-30" → "2026-10-30") — 음성 줄이 아니거나 있지 않은 날짜(2026-02-30 등)면 ""
export const voiceDayOf = (sid) => {
  const m = /^voice:(\d{4}-\d{2}-\d{2})$/.exec(String(sid || ""));
  if (!m) return "";
  const t = voiceDayStart(m[1]).getTime();
  return Number.isFinite(t) && kstDateKey(t) === m[1] ? m[1] : "";
};
// 날짜 표기 "10. 30." — 관리 명단 탭 「음성 10. 30.」 · 추첨권 adminNote 꼬리
export const voiceDayLabel = (day) => (/^\d{4}-\d{2}-\d{2}$/.test(String(day || "")) ? `${Number(day.slice(5, 7))}. ${Number(day.slice(8, 10))}.` : "");
// 음성 활동 추첨권 adminNote — "괴담회 음성 60분 · 10. 30."(봇 자동 지급 · 관리자 손 지급이 같은 글자)
export const voiceTicketNote = (minutes, day) => `괴담회 음성 ${minutes}분 · ${voiceDayLabel(day)}`;

// ── 상품 ─────────────────────────────────────────
// 📌 상품 정리 — 종류에 맞는 칸만 남긴다(나머지는 빈 값). 줄을 빼거나 순서를 바꾸지 않는다(저장 API 가 붙여 넣은 코드를 같은 자리 상품에 잇는다).
//    수량 null = 무제한 · code 는 코드 수가 곧 수량이라 qty 를 쓰지 않는다(null) · 비중 1~1,000,000(기본 1) · 희귀도는 lib/rarity 키("" = 일반으로 보인다)
//    반환 { prizes: [{ pid, name, kind, amount, itemId, itemName, count, roleId, roleName, qty, weight, rarity }], nextPid } — count 는 아이템만(그 밖 0)
export function normalizePrizes(list, startPid = 1, known) {
  const rows = (Array.isArray(list) ? list : []).slice(0, MAX_PRIZES).map((r) => {
    const kind = PRIZE_KINDS.includes(r?.kind) ? r.kind : "none";
    const money = kind === "xp" || kind === "point";
    return {
      id: String(r?.pid || ""),
      name: str(r?.name, MAX_TITLE),
      kind,
      amount: money ? intIn(r?.amount, 0, NUM_MAX, 0) : 0,
      itemId: kind === "item" ? str(r?.itemId, 40) : "",
      itemName: kind === "item" ? str(r?.itemName, 80) : "",
      count: kind === "item" ? intIn(r?.count, PRIZE_COUNT.min, PRIZE_COUNT.max, PRIZE_COUNT.def) : 0,
      roleId: kind === "role" ? str(r?.roleId, 40) : "",
      roleName: kind === "role" ? str(r?.roleName, 100) : "",
      qty: kind === "code" ? null : qtyOf(r?.qty),
      weight: intIn(r?.weight, PRIZE_WEIGHT.min, PRIZE_WEIGHT.max, PRIZE_WEIGHT.def),
      rarity: normalizeRarity(r?.rarity),
    };
  });
  const n = issueIds(rows, "p", startPid, known);
  return { prizes: n.rows.map(({ id, ...p }) => ({ pid: id, ...p })), nextPid: n.next };
}

// 상품 보이는 이름 — 관리자가 쓴 이름, 비었으면 내용으로(「XP 1,000」 · 「빙옥 50」 · 아이템 이름(2개 이상이면 「 ×2」) · 역할 이름 · 「코드」 · 「꽝」)
export const prizeTitle = (p) => {
  if (p?.name) return p.name;
  const n = (v) => (Number(v) || 0).toLocaleString("ko-KR");
  if (p?.kind === "xp") return `XP ${n(p.amount)}`;
  if (p?.kind === "point") return `빙옥 ${n(p.amount)}`;
  if (p?.kind === "item") return `${p.itemName || "아이템"}${Number(p.count) > 1 ? ` ×${n(p.count)}` : ""}`;
  if (p?.kind === "role") return p.roleName || "역할";
  if (p?.kind === "code") return "코드";
  return "꽝";
};

// ── 설정 ─────────────────────────────────────────
// 📌 설정 문서 → 계산 · 관리 화면이 쓰는 모양. 문서가 없으면 기본값(꺼짐 · 기본 제목 · 기본 추첨 기간 · 빈 회차 · 빈 상품 · 음성 꺼짐)
//    늘 .lean() 으로 읽은 문서를 이 함수에 넣는다(스키마로 되살려 쓰지 않는다 — 이벤트 패스 normalizeEventConfig 와 같은 규칙)
export function normalizeGoedamConfig(doc) {
  const s = normalizeScreenings(doc?.screenings, doc?.nextSid);
  const p = normalizePrizes(doc?.prizes, doc?.nextPid);
  return {
    key: String(doc?.key || GOEDAM_KEY),
    enabled: !!doc?.enabled,
    title: str(doc?.title, MAX_TITLE) || GOEDAM_DEFAULTS.title,
    // 스테이지 채널 ID — "" 이면 봇이 기록하지 않는다
    channelId: str(doc?.channelId, 40),
    // 추첨권 아이템(models/Item id) · 표시 스냅샷
    ticketItemId: str(doc?.ticketItemId, 40),
    ticketItemName: str(doc?.ticketItemName, 80),
    drawOpensAt: dateOr(doc?.drawOpensAt, GOEDAM_DEFAULTS.drawOpensAt),
    drawClosesAt: dateOr(doc?.drawClosesAt, GOEDAM_DEFAULTS.drawClosesAt),
    screenings: s.screenings,
    nextSid: s.nextSid,
    // 음성 활동(2026-10-24) — { enabled, minutes, tickets, startsAt, endsAt }
    voice: normalizeVoice(doc?.voice),
    prizes: p.prizes,
    nextPid: p.nextPid,
    updatedAt: doc?.updatedAt ?? null,
  };
}

// 📌 추첨 단계 — 시각으로만 가른다(켜짐 여부는 따로 — 꺼져 있으면 운영진 미리보기만, lib/goedam.js)
//    before: 열리기 전 · open: [열림, 닫힘) · closed: 닫힌 뒤
export const phaseOf = (cfg, now = Date.now()) => {
  const t = Number(now);
  if (t < new Date(cfg.drawOpensAt).getTime()) return "before";
  return t < new Date(cfg.drawClosesAt).getTime() ? "open" : "closed";
};

// ── 비중 고르기 ───────────────────────────────────
// 📌 남은 상품 중 하나 — 비중(weight) 합 안의 정수 n(0 ≤ n < 합)이 떨어지는 칸. 비중 0 이하 · 숫자 아님은 건너뛴다. 고를 게 없으면 -1.
//    n 은 부르는 쪽이 정한다(lib/goedam.js — crypto.randomInt(0, totalWeight(목록))). 이 함수는 난수를 만들지 않아 점검이 같은 값을 넣어 본다
export const weightOf = (p) => {
  const w = Math.floor(Number(p?.weight));
  return Number.isFinite(w) && w > 0 ? w : 0;
};
export const totalWeight = (list) => (Array.isArray(list) ? list : []).reduce((s, p) => s + weightOf(p), 0);
export function pickByWeight(list, n) {
  const k = Math.floor(Number(n));
  if (!Array.isArray(list) || !Number.isFinite(k) || k < 0) return -1;
  let acc = 0;
  for (let i = 0; i < list.length; i++) {
    const w = weightOf(list[i]);
    if (!w) continue;
    acc += w;
    if (k < acc) return i;
  }
  return -1;
}

// ── 추첨권 지급 모양 ─────────────────────────────────
// 📌 회차 완청 · 관리자 수동 지급이 넣는 Purchase N건(1장 = 1건) — 봇 자동 지급(bot/src/features/goedamWatch.js)과 같은 칸 · 같은 글자.
//    orderId "goedam:<sid>:<userId>" 로 한 회차 지급분이 한 주문으로 묶인다. 역할 없는 아이템이라 바로 completed
//    📌 2026-10-24 음성 활동도 같은 모양 — screening 자리에 { sid: "voice:<YYYY-MM-DD>" }, note 에 voiceTicketNote(분, 날짜)를 준다
//       (orderId "goedam:voice:<YYYY-MM-DD>:<userId>" · adminNote "괴담회 음성 60분 · 10. 30."). note 를 안 주면 상영 글자(ticketNote)
export const ticketOrderId = (sid, userId) => `goedam:${sid}:${userId}`;
export const ticketNote = (title) => `괴담회 완청 · ${title}`;
export function ticketPurchaseDocs({ cfg, screening, userId, userName = "", n, now = new Date(), note = "" }) {
  const count = intIn(n, 0, SCREENING_TICKETS.max, 0);
  return Array.from({ length: count }, () => ({
    userId,
    userName: userName || userId,
    itemId: GOEDAM_TICKET_ID,
    itemRef: cfg.ticketItemId,
    itemName: cfg.ticketItemName || "할로윈 추첨권",
    itemType: "item",
    roleId: "",
    price: 0,
    payMethod: "xp",
    paidXp: 0,
    paidPoint: 0,
    days: 0,
    status: "completed",
    processedAt: now,
    createdAt: now,
    orderId: ticketOrderId(screening.sid, userId),
    adminNote: note || ticketNote(screening.title),
  }));
}
