// 📌 XP 획득 중단 — 판정 · 문구 한 곳. 관리자가 관리 › 유저 조회에서 세운다(POST /api/admin/users/xp-stop).
//    2026-10-04 운영자 "회수 + 타임아웃 3일 + 그 뒤 5일 전체 XP 획득 중단" — UserXp.xpStopFrom ≤ 지금 < xpStopUntil 이면 중단 중.
//    끝 시각이 지나면 저절로 풀린다(끄는 작업 없음). 시작 전이면 예약.
//    봇(bot/src/xpStop.js)과 같은 규칙 — 봇은 채팅 · 음성 · 출석 · 아이템 효과 · 지급 대기열의 자동 출처 XP · 활동 횟수를 막고,
//    사이트는 보상 받기를 거절하고(denyIfXpStopped — 아래 사용처) 상점 캐시백을 주지 않는다(app/api/shop/checkout · purchase). 운영진 지급은 그대로.
//    유저 화면에는 따로 표시하지 않는다 — 받으려 할 때 거절 문구로만 알린다
import { NextResponse } from "next/server";
import UserXp from "@/models/UserXp";

export const XP_STOP_FIELDS = { xpStopFrom: 1, xpStopUntil: 1, xpStopBy: 1, xpStopReason: 1 };

const msOf = (d) => {
  if (d == null || d === "") return NaN;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : NaN;
};

// 문서의 중단 — 끝나지 않은 것만 { from, until, by, reason, active }(active = 지금 막는 중, false 면 예약). 없거나 끝났으면 null
export function xpStopState(doc, now = Date.now()) {
  const from = msOf(doc?.xpStopFrom);
  const until = msOf(doc?.xpStopUntil);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until <= now) return null;
  return {
    from: new Date(from),
    until: new Date(until),
    by: String(doc?.xpStopBy || ""),
    reason: String(doc?.xpStopReason || ""),
    active: from <= now,
  };
}

// "2026.10.12 11:39" (KST) — 봇 formatUntil 과 같은 모양
export function kstMinute(date) {
  const t = msOf(date);
  if (!Number.isFinite(t)) return "";
  const k = new Date(t + 9 * 3600e3).toISOString();
  return `${k.slice(0, 4)}.${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
}

// 거절 문구 — 봇 xpStopText 와 같은 글
export const xpStopMessage = (until) => `${kstMinute(until)}까지 XP 획득이 중단된 상태입니다.`;

// 지금 중단 중이면 끝 시각(Date), 아니면 null. 읽기에 실패하면 던진다(부르는 쪽이 정한다)
export async function activeXpStopUntil(userId, now = Date.now()) {
  if (!userId) return null;
  const doc = await UserXp.findOne({ userId }, { xpStopFrom: 1, xpStopUntil: 1 }).lean();
  const s = xpStopState(doc, now);
  return s?.active ? s.until : null;
}

// 📌 보상 받기 API 입구 — 중단 중이면 403 응답(봇 /출석체크와 같은 글), 아니면 null.
//    응답 모양은 lib/apiAuth 와 같은 { success:false, message, error } — 화면마다 message 를 읽기도, error 를 읽기도 한다
//    사용법: `const stop = await denyIfXpStopped(userId); if (stop) return stop;` (connectToDatabase() 뒤)
//    사용처: 시즌 패스 받기(app/api/pass/claim). 퀘스트 받기(app/api/xp/quests POST) · 보상형 쿠폰(app/api/shop/my-coupons)도 같은 입구를 쓴다 —
//    거기서 안 막아도 봇 지급 대기열이 자동 출처 XP 를 넣지 않지만(bot/src/features/grantQueue.js STOP_BLOCKED), 자물쇠 · 빙옥은 사이트가 바로 쓰기 때문
export async function denyIfXpStopped(userId) {
  const until = await activeXpStopUntil(userId);
  if (!until) return null;
  const msg = xpStopMessage(until);
  return NextResponse.json({ success: false, code: "XP_STOPPED", message: msg, error: msg }, { status: 403 });
}
