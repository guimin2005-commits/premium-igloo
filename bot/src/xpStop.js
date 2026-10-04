// ── XP 획득 중단 — 사이트 관리자가 세운다(관리 › 유저 조회, POST /api/admin/users/xp-stop) ──
//    📌 2026-10-04 운영자 "회수 + 타임아웃 3일 + 그 뒤 5일 전체 XP 획득 중단" — UserXp.xpStopFrom ≤ 지금 < xpStopUntil 이면 중단 중이다.
//       끝 시각이 지나면 저절로 풀린다(끄는 작업이 따로 없다). 시작 시각이 아직이면 예약 — 그 시각이 되면 바로 막는다.
//    📌 중단 중에 막는 것 — 봇이 스스로 주는 XP 전부와 그 재료:
//       채팅 XP(쿨타임도 쓰지 않는다 — features/chatXp.js) · 음성 XP 와 음성 시간(음성 XP 정지와 같게 — features/voiceTime.js) ·
//       출석(명령 · 음성 자동 — 출석 기록도 남기지 않는다, attend.js) · 아이템 효과(레벨업 효과 · 하루 1번 효과 포함 — xp.js) ·
//       지급 대기열의 자동 출처 XP(퀘스트 · 패스 · 쿠폰 · 코드 — features/grantQueue.js) · 활동 횟수(features/activityStats.js).
//       운영진 지급(수동 지급 등) · 회수는 그대로 들어간다.
//    📌 판정은 메모리로 — 60초마다 아직 끝나지 않은 중단(xpStopUntil > 지금, 색인)만 읽어 둔다.
//       XP 를 넣는 쓰기(xp.js grantXp · 출석 자물쇠 · 채팅 쿨타임)는 같은 조건(notStopped)을 DB 조건에도 걸어, 60초 사이에 세운 중단도 바로 막는다.
//       이미 읽는 문서(음성 기록 · 지급 결과)로도 메모리를 고친다(noteXpStop). 사이트 lib/xpStop.js 와 같은 규칙
import { UserXp } from "./db.js";
import { formatUntil } from "./botMessages.js";

const REFRESH_MS = 60 * 1000;
let stops = new Map(); // userId → { from: ms, until: ms }

const msOf = (d) => {
  if (d == null || d === "") return NaN;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : NaN;
};

// 문서(xpStopFrom · xpStopUntil 을 읽은 것)의 중단 구간 — 없으면 null
export function stopRange(doc) {
  const from = msOf(doc?.xpStopFrom);
  const until = msOf(doc?.xpStopUntil);
  return Number.isFinite(from) && Number.isFinite(until) && until > from ? { from, until } : null;
}

// 그 문서가 지금 중단 중이면 끝 시각(ms), 아니면 0
export function stopUntilOf(doc, now = Date.now()) {
  const r = stopRange(doc);
  return r && r.from <= now && now < r.until ? r.until : 0;
}

// 메모리 판정 — 지금 중단 중이면 끝 시각(ms), 아니면 0
export function xpStoppedUntil(userId, now = Date.now()) {
  const r = userId ? stops.get(userId) : null;
  return r && r.from <= now && now < r.until ? r.until : 0;
}
export const isXpStopped = (userId, now = Date.now()) => xpStoppedUntil(userId, now) > 0;

// 읽은 문서로 메모리를 고친다 — xpStopFrom · xpStopUntil 을 함께 읽은 문서만 넘길 것(칸이 없으면 중단 없음으로 본다)
export function noteXpStop(userId, doc) {
  if (!userId || !doc) return;
  const r = stopRange(doc);
  if (r && r.until > Date.now()) stops.set(userId, r);
  else stops.delete(userId);
}

// 📌 DB 조건 "지금 중단 중이 아님" — XP 를 넣는 쓰기의 조건에 붙인다.
//    upsert 와 같이 쓰면 중단 중인 사람은 조건에 안 맞아 새 문서를 만들려다 E11000(userId 유일 색인)이 난다 — 부르는 쪽이 받는다
export const notStopped = (now = new Date()) => ({ $nor: [{ xpStopFrom: { $lte: now }, xpStopUntil: { $gt: now } }] });

// 유저에게 보이는 글 — 사이트 lib/xpStop.js xpStopMessage 와 같은 글
export const xpStopText = (until) => `${formatUntil(until)}까지 XP 획득이 중단된 상태입니다.`;

export async function refreshXpStops() {
  try {
    const rows = await UserXp.find({ xpStopUntil: { $gt: new Date() } }, { userId: 1, xpStopFrom: 1, xpStopUntil: 1 }).lean();
    const next = new Map();
    for (const d of rows) {
      const r = stopRange(d);
      if (r && d.userId) next.set(d.userId, r);
    }
    stops = next;
  } catch (e) {
    console.error("XP 획득 중단 갱신 오류:", e.message); // 직전 값을 그대로 쓴다
  }
}

export function startXpStopLoop() {
  setInterval(refreshXpStops, REFRESH_MS);
}
