// ── 역할 설정 캐시 (대시보드 변경을 1분 주기로 반영) ──
import { RoleConfig } from "./db.js";
import { config } from "./config.js";

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

// 채팅/음성 공통 버프 합산 — 대시보드 설정 우선, env는 하위 호환
export function getBuffXp(member) {
  let buff = 0;
  const inDashboard = new Set();

  for (const cfg of cache) {
    inDashboard.add(cfg.roleId);
    if (cfg.buffXp > 0 && member.roles.cache.has(cfg.roleId)) buff += cfg.buffXp;
  }

  for (const { id, buff: legacyBuff } of config.legacyRoleBuffs) {
    if (!inDashboard.has(id) && member.roles.cache.has(id)) buff += legacyBuff;
  }

  buff += config.eventBonusXp;
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
