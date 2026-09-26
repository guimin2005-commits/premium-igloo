// ── 역할 설정 캐시 (대시보드 변경을 1분 주기로 반영) ──
import { RoleConfig, UserXp } from "./db.js";
import { config } from "./config.js";
import { kstToday } from "./leveling.js";

const REFRESH_MS = 60 * 1000;
let cache = [];

export async function refreshRoleConfigs() {
  try {
    const rows = await RoleConfig.find().lean();
    // 📌 조건 효과는 읽을 때 한 번만 정리해 둔다 — 지급할 때마다 값을 다시 따지지 않게
    cache = rows.map((cfg) => ({ ...cfg, effects: cleanEffects(cfg.effects) }));
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

// ═══════════════════════════════════════════════════════
// 📌 아이템 효과(조건 효과) — 사이트 lib/itemEffects.js 규칙을 손으로 옮긴 사본
//    ⚠️ 봇은 별도 배포라 사이트 파일을 import 하지 못한다.
//       상황(on) 값 · 의미 · 한도 · 시간 판정을 바꾸면 lib/itemEffects.js 와 반드시 같이 고칠 것.
//    효과 하나: { id, on, mode: "add" | "percent", amount, minMinutes?, everyN?, days?, hourFrom?, hourTo?, channelIds? }
//      · days      : KST 요일(0=일 … 6=토). 비면 매일
//      · hourFrom/hourTo : KST 시각. from <= 지금 < to, from > to 면 자정을 넘는 구간(22~2)
//      · channelIds : 채팅 · 음성에서만 — 그 채널(또는 그 카테고리 안)에서만
//      · percent   : 그 1회 지급의 기본 XP(다른 효과 · 버프를 더하기 전 값)의 N%
// ═══════════════════════════════════════════════════════
const EFFECT_TRIGGERS = {
  chat: { modes: ["add", "percent"], channels: true },          // 채팅할 때마다
  voice: { modes: ["add", "percent"], channels: true },         // 음성 XP 받을 때마다
  voiceDaily: { modes: ["add"], needs: "minMinutes", once: true }, // 하루 음성 N분 채우면 (하루 1번)
  firstChat: { modes: ["add"], once: true },                    // 하루 첫 채팅 (하루 1번)
  attend: { modes: ["add"] },                                   // 출석할 때
  attendEvery: { modes: ["add"], needs: "everyN" },             // 출석 N번째마다 (누적 출석 수 기준)
  levelUp: { modes: ["add"] },                                  // 레벨이 오를 때마다
};
const MAX_EFFECTS = 20;
const LIMIT = { add: 1_000_000, percent: 500, minutes: 1440, everyN: 365 };

const toInt = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
};

// 사이트 normalizeEffects 와 같은 정리 — 모르는 상황 · 빈 값은 버린다.
//    단 id 가 비면 무작위 대신 자리 번호로 채운다(1분마다 다시 읽어도 "하루 1번" 키가 바뀌지 않게).
function cleanEffects(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.slice(0, MAX_EFFECTS).forEach((raw, i) => {
    const t = EFFECT_TRIGGERS[raw?.on];
    if (!t) return;
    const mode = t.modes.includes(raw?.mode) ? raw.mode : t.modes[0];
    const amount = toInt(raw?.amount, 0, mode === "percent" ? LIMIT.percent : LIMIT.add);
    if (!amount) return;
    const e = { id: String(raw?.id || "").slice(0, 24) || `${raw.on}-${i}`, on: raw.on, mode, amount };
    if (t.needs === "minMinutes") {
      const m = toInt(raw?.minMinutes, 1, LIMIT.minutes);
      if (!m) return;
      e.minMinutes = m;
    }
    if (t.needs === "everyN") {
      const n = toInt(raw?.everyN, 2, LIMIT.everyN);
      if (!n) return;
      e.everyN = n;
    }
    const days = Array.isArray(raw?.days) ? [...new Set(raw.days.map((d) => toInt(d, 0, 6)).filter((d) => d != null))] : [];
    if (days.length && days.length < 7) e.days = days;
    const hf = raw?.hourFrom === "" || raw?.hourFrom == null ? null : toInt(raw.hourFrom, 0, 23);
    const ht = raw?.hourTo === "" || raw?.hourTo == null ? null : toInt(raw.hourTo, 0, 24);
    if (hf != null && ht != null && hf !== ht) { e.hourFrom = hf; e.hourTo = ht; }
    if (t.channels && Array.isArray(raw?.channelIds)) {
      const ch = [...new Set(raw.channelIds.map((c) => String(c || "").trim()).filter(Boolean))].slice(0, 20);
      if (ch.length) e.channelIds = ch;
    }
    out.push(e);
  });
  return out;
}

// KST 지금 — { day: 0~6(일~토), hour: 0~23 }
export function kstNow(date = new Date()) {
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return { day: d.getUTCDay(), hour: d.getUTCHours() };
}

// 요일 · 시간대 조건 (사이트 effectTimeOk 와 같은 식)
export function effectTimeOk(e, kst) {
  if (Array.isArray(e.days) && e.days.length && !e.days.includes(kst.day)) return false;
  if (e.hourFrom != null && e.hourTo != null) {
    const h = kst.hour;
    const inRange = e.hourFrom < e.hourTo ? h >= e.hourFrom && h < e.hourTo : h >= e.hourFrom || h < e.hourTo;
    if (!inRange) return false;
  }
  return true;
}

// 채널 조건 — 그 채널 자신 · 상위 카테고리(스레드면 부모 채널 · 그 카테고리까지)가 목록에 있으면 통과
function effectChannelOk(e, channel) {
  if (!Array.isArray(e.channelIds) || !e.channelIds.length) return true;
  if (!channel) return false;
  const ids = [channel.id, channel.parentId, channel.parent?.parentId].filter(Boolean);
  return ids.some((id) => e.channelIds.includes(id));
}

// 멤버가 가진 역할들의 조건 효과 중 상황(on)이 같은 것 — roleId 를 붙여 돌려준다 ("하루 1번" 키에 쓴다)
export function heldEffects(member, on) {
  const out = [];
  if (!member?.roles?.cache) return out;
  for (const cfg of cache) {
    if (!cfg.effects?.length || !member.roles.cache.has(cfg.roleId)) continue;
    for (const e of cfg.effects) if (e.on === on) out.push({ ...e, roleId: cfg.roleId });
  }
  return out;
}

// 1회 지급에 더할 효과 XP — add 합 + (percent 합 × base / 100, 내림). 요일 · 시간대 · 채널 조건을 통과한 것만.
//    오류가 나도 0 을 돌려준다 — 효과 때문에 기존 지급이 막히면 안 된다.
export function effectXp(member, on, { base = 0, channel = null, kst = kstNow() } = {}) {
  try {
    let add = 0;
    let pct = 0;
    for (const e of heldEffects(member, on)) {
      if (!effectTimeOk(e, kst) || !effectChannelOk(e, channel)) continue;
      if (e.mode === "percent") pct += e.amount;
      else add += e.amount;
    }
    return add + Math.floor((Math.max(0, Number(base) || 0) * pct) / 100);
  } catch (e) {
    console.error(`아이템 효과 계산 오류 (${on}):`, e.message);
    return 0;
  }
}

// 출석 1회에 더할 효과 XP — "출석할 때" 합 + "출석 N번째마다"(누적 출석 수가 N 의 배수일 때) 합
export function getAttendEffectXp(member, attendCount, kst = kstNow()) {
  let total = effectXp(member, "attend", { kst });
  try {
    const n = Math.floor(Number(attendCount) || 0);
    if (n > 0) {
      for (const e of heldEffects(member, "attendEvery")) {
        if (effectTimeOk(e, kst) && n % e.everyN === 0) total += e.amount;
      }
    }
  } catch (e) {
    console.error("아이템 효과 계산 오류 (attendEvery):", e.message);
  }
  return total;
}

// 📌 "하루 1번" 자물쇠 — effectDaily.<key> 가 오늘이 아닐 때만 오늘로 바꾸는 조건부 갱신.
//    틱 · 메시지가 겹쳐도 한 번만 통과한다. 통과하면 true.
//    이미 받은 건 같은 날 다시 DB 에 묻지 않게 프로세스 안에서도 기억해 둔다(날이 바뀌면 비운다).
const claimedMemo = new Map();
let memoDay = "";
export async function claimDaily(userId, key, today = kstToday()) {
  if (memoDay !== today) {
    claimedMemo.clear();
    memoDay = today;
  }
  // Map 키에 점 · $ 가 들어가면 경로가 깨진다
  const safeKey = String(key).replace(/[.$]/g, "_");
  const memoKey = `${userId}|${safeKey}`;
  if (claimedMemo.get(memoKey) === today) return false;

  const path = `effectDaily.${safeKey}`;
  const r = await UserXp.updateOne({ userId, [path]: { $ne: today } }, { $set: { [path]: today } });
  claimedMemo.set(memoKey, today);
  return r.modifiedCount === 1;
}
