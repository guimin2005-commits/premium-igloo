// ── 역할 설정 캐시 (대시보드 변경을 1분 주기로 반영) ──
import { RoleConfig } from "./db.js";

const REFRESH_MS = 60 * 1000;
let cache = [];

export async function refreshRoleConfigs() {
  try {
    cache = await RoleConfig.find().lean();
  } catch (e) {
    console.error("역할 설정 갱신 오류:", e.message);
  }
}

export function startRoleConfigLoop() {
  setInterval(refreshRoleConfigs, REFRESH_MS);
}

export const getRoleConfigs = () => cache;

// 채팅/음성 공통 버프 합산 (대시보드 설정 기반)
//   📌 2026-10-04 "옛 장치를 지우고, 가산은 관리 화면(역할 버프·부스트)으로만 함" — 환경 변수 역할 버프 · EVENT_BONUS_XP 는 없앴다
export function getBuffXp(member) {
  let buff = 0;
  for (const cfg of cache) {
    if (cfg.buffXp > 0 && member.roles.cache.has(cfg.roleId)) buff += cfg.buffXp;
  }
  return buff;
}

// 출석 전용 버프 합산 (대시보드 설정 기반)
export function getAttendBuffXp(member) {
  let buff = 0;
  for (const cfg of cache) {
    if (cfg.attendBuffXp > 0 && member.roles.cache.has(cfg.roleId)) buff += cfg.attendBuffXp;
  }
  return buff;
}
