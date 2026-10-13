// 📌 잠수 확인(봇 bot/src/features/afkCheck.js) — 제재 중 첫 확인 시간 계산을 사이트에서도 같은 식으로(관리 › 제재 · 잠수 기록 「다음 첫 확인」).
//    2026-10-13 운영자 "제재 먹은 인원은 1회 · 2회 · 3회 반복 잠수 채널로 이동되면 잠수 메시지 오는 시간을 5분씩 줄여 10분까지" —
//    기본(BotSetting.afkCheckSanctionMin, 30분)에서 제재 중 이동 횟수(UserXp.afkSanctionMoves) × 5분을 빼고 10분 아래로는 안 내려간다
//    (관리자가 기본을 10분보다 짧게 잡았으면 그 값이 바닥). 횟수는 저절로 지우지 않는다 — 관리 화면에서 관리자가 지운다
export const SANCTION_STEP_MIN = 5;
export const SANCTION_FLOOR_MIN = 10;
export function afkSanctionWaitMin(baseMin, moves) {
  const base = Math.max(1, Number(baseMin) || 30);
  const floor = Math.min(base, SANCTION_FLOOR_MIN);
  return Math.max(floor, base - Math.max(0, Number(moves) || 0) * SANCTION_STEP_MIN);
}

// 제재받은 사람 — 봇과 같은 조건: 음성 XP 정지 중이거나 XP 획득 중단 기록이 있는 사람(지금 · 예약 · 기간이 끝났지만 해제하지 않은 것)
export const SANCTIONED_QUERY = { $or: [{ voiceXpOff: true }, { xpStopUntil: { $ne: null } }] };
