// ── 서버 부스터 보상 — 최초 부스팅 · 연속 부스팅 (2026-10-25) ──────────────────
//    📌 최초 부스팅 — 운영자 "150,000XP + 빙옥 30개 (단, 최초 부스팅임)" · "사람당 한 번만" · 지금 이미 부스팅 중인 사람은 "지급 안 함"
//       · 기준 시각 — 이 기능이 처음 켜진 때(BoosterBonus 줄 userId "#start" 의 at). 부스트 시작일(premiumSince)이 그보다 앞이면
//         '이미 부스팅 중이던 사람'이라 baseline 줄만 남기고 주지 않는다(그 뒤에 멈췄다 다시 부스트해도 줄이 있어 안 준다)
//       · 그 뒤에 시작한 부스트면 한 사람 한 줄(userId 유니크)을 먼저 세운 쪽만 준다
//       · 디스코드는 부스트 이력을 주지 않는다 — 기능이 켜지기 전에 부스트했다가 이미 멈춘 사람은 알 수 없어, 나중에 다시 부스트하면 처음으로 친다
//    📌 연속 부스팅 — 운영자 "개월 수 보상은?" → 연속 개월(디스코드 부스트 시작일부터 — booster.js boostMonths) · 지금 부스터도 시작일부터 인정 · 단계마다 사람당 한 번
//       · 단계에 닿으면 한 사람 한 단계 한 줄(BoosterStep — userId · months 유니크)을 먼저 세운 쪽만 준다. 부스트를 멈추면 개월은 처음부터(시작일이 바뀐다), 받은 단계는 다시 안 준다
//       · 켜자마자 오래 부스팅한 사람은 닿은 단계를 한꺼번에 받는다(단계마다 기록 · 지급, DM 은 한 통)
//    📌 수치는 관리 › 레벨 설정 「서버 부스터 보상」(BotSetting — botSettings.js 1분 주기, 한 번도 못 읽었으면 주지 않는다) · 비어 있으면 booster.js 기본값(boosterRewardsOf).
//       연속 부스팅은 그 칸의 「사용」을 켜야만 준다(기본 꺼짐 — 임시 수치가 봇 반영 즉시 한꺼번에 나가지 않게)
//    📌 주는 법 — XP 는 지급 대기열(Payout source "booster" — grantQueue.js 가 레벨 · 보상 역할 · 레벨업 알림까지, 시즌 · 이벤트 패스 진행도는 안 채움),
//       빙옥은 잔액에 바로 + 원장(WalletLog kind "booster-point"). XP 획득 중단 · 레벨 비공개와 상관없이 준다(서포터즈 보상처럼 운영진 출처 — STOP_BLOCKED 에 없다)
//    📌 기록 줄은 퇴장 초기화(leaveReset.js)가 지우지 않는다 — 나갔다 들어와도 한 번뿐
//    📌 부스트 시작은 guildMemberUpdate 로 바로 본다. 개월이 차는 것 · 봇이 꺼져 있던 동안 시작한 건 켤 때(멤버 전체를 한 번 받아 온다) · 10분마다 멤버 캐시를 훑어 잡는다
//    📌 받은 사람에게 DM(관리 › 봇 메시지 「최초 부스팅 보상」 boosterBonus · 「연속 부스팅 보상」 boosterStep)
import { Events } from "discord.js";
import { BoosterBonus, BoosterStep, Payout, UserXp, isDuplicateKeyError } from "../db.js";
import { config } from "../config.js";
import { logWallet } from "../wallet.js";
import { getSettings, settingsLoaded } from "../botSettings.js";
import { buildMessage, commonVars } from "../botMessages.js";
import { recordBotError } from "./heartbeat.js";
import {
  BOOSTER_BONUS_SOURCE,
  BOOSTER_BONUS_POINT_KIND,
  BOOSTER_BONUS_LABEL,
  boosterRewardsOf,
  boosterStepLabel,
  boostMonths,
} from "../booster.js";

const SWEEP_MS = 10 * 60 * 1000;
export const START_ID = "#start";

let startAt = null; // 기준 시각(ms) — 처음 읽은 뒤로는 바뀌지 않는다
let indexJob = null;
let stepIndexJob = null;
const done = new Set(); // 최초 부스팅 줄이 있는 사람(granted · baseline) — 훑을 때마다 DB 를 묻지 않게
const stepsGot = new Map(); // userId → Set(받은 단계 개월)
let stepsLoaded = null; // 받은 단계 기록을 한 번 읽는 약속
const busy = new Set(); // 지금 처리 중 — 이벤트와 훑기가 겹쳐도 한 번만

// 📌 판정 — 부스트 시작일(ms)과 기준 시각(ms)으로 "grant" · "baseline" · null(부스터 아님)
export function bonusDecision(premiumSinceMs, startMs) {
  const since = Number(premiumSinceMs);
  if (!Number.isFinite(since) || since <= 0) return null;
  return since >= Number(startMs) ? "grant" : "baseline";
}

// 📌 줄 단계 — 부스트 시작일 · 지금 · 사다리 · 이미 받은 단계로 이번에 줄 단계들(개월 순)
export function dueSteps(sinceMs, nowMs, ladder, got) {
  const m = boostMonths(sinceMs, nowMs);
  return (Array.isArray(ladder) ? ladder : []).filter((s) => s.months <= m && !(got && got.has(s.months)));
}

const ensureIndexes = () =>
  (indexJob ||= BoosterBonus.createIndexes().catch((e) => {
    indexJob = null;
    throw e;
  }));
const ensureStepIndexes = () =>
  (stepIndexJob ||= BoosterStep.createIndexes().catch((e) => {
    stepIndexJob = null;
    throw e;
  }));

// 기준 시각 — 처음 켜질 때 한 줄 세우고, 그 뒤로는 그 줄을 읽는다(두 프로세스가 동시에 세워도 먼저 들어간 하나)
async function loadStart() {
  if (startAt != null) return startAt;
  await ensureIndexes();
  const upsert = () =>
    BoosterBonus.findOneAndUpdate(
      { userId: START_ID },
      { $setOnInsert: { status: "start", at: new Date() } },
      { upsert: true, new: true }
    ).lean();
  let doc;
  try {
    doc = await upsert();
  } catch (e) {
    if (!isDuplicateKeyError(e)) throw e;
    doc = await upsert();
  }
  startAt = new Date(doc.at).getTime();
  const rows = await BoosterBonus.find({ userId: { $ne: START_ID } }, { userId: 1 }).lean();
  for (const r of rows) done.add(r.userId);
  return startAt;
}

// 받은 단계 기록 — 처음 한 번 전부 읽어 메모리에(실패하면 다음에 다시)
const loadSteps = () =>
  (stepsLoaded ||= (async () => {
    await ensureStepIndexes();
    const rows = await BoosterStep.find({}, { userId: 1, months: 1 }).lean();
    for (const r of rows) gotOf(r.userId).add(Number(r.months));
  })().catch((e) => {
    stepsLoaded = null;
    throw e;
  }));
const gotOf = (userId) => {
  let s = stepsGot.get(userId);
  if (!s) stepsGot.set(userId, (s = new Set()));
  return s;
};

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");

// XP 큐를 먼저 넣고 빙옥을 나중에 — 빙옥에서 실패하면 봇이 아직 안 가져간 큐 문서를 지우고 던진다(부르는 쪽이 기록 줄을 지워 다음에 다시 · 서포터즈 지급과 같은 순서)
async function payReward(member, { xp, point, label }) {
  const userName = member.user?.username || member.id;
  let queued = null;
  try {
    if (xp > 0) {
      queued = await Payout.create({
        userName: member.displayName || userName,
        userId: member.id,
        amount: xp,
        reason: label,
        source: BOOSTER_BONUS_SOURCE,
        by: "bot",
      });
    }
    if (point > 0) {
      await UserXp.findOneAndUpdate({ userId: member.id }, { $inc: { point }, $set: { updatedAt: new Date() } }, { upsert: true });
      await logWallet({ userId: member.id, currency: "point", amount: point, kind: BOOSTER_BONUS_POINT_KIND, label });
    }
  } catch (e) {
    // 📌 지급 큐(grantQueue.js 30초)가 이미 집어 간 Payout 은 못 지운다 — 그때 기록 줄을 지우면 다음 훑기에 XP 가 한 번 더 나간다.
    //    못 지웠으면 keepRow — 부르는 쪽이 줄을 남기고(error 칸에 적음) 빙옥만 빠진 채 끝낸다(관리 › 유저 조회에서 손으로 맞춘다)
    if (queued) {
      const del = await Payout.deleteOne({ _id: queued._id, status: "pending" }).catch(() => null);
      if (!del?.deletedCount) e.keepRow = true;
    }
    throw e;
  }
  return queued;
}

// 최초 부스팅 — 한 사람 한 줄을 먼저 세운 쪽만 준다
async function grantStart(member, since, { xp, point }) {
  const userName = member.user?.username || member.id;
  let row;
  try {
    row = await BoosterBonus.create({ userId: member.id, userName, status: "granted", premiumSince: new Date(since), xp, point, at: new Date() });
  } catch (e) {
    if (isDuplicateKeyError(e)) return false;
    throw e;
  }
  let queued;
  try {
    queued = await payReward(member, { xp, point, label: BOOSTER_BONUS_LABEL });
  } catch (e) {
    if (e.keepRow) await BoosterBonus.updateOne({ _id: row._id }, { $set: { error: `빙옥 지급 실패: ${e.message}` } }).catch(() => {});
    else await BoosterBonus.deleteOne({ _id: row._id }).catch(() => {});
    throw e;
  }
  if (queued) await BoosterBonus.updateOne({ _id: row._id }, { $set: { payoutId: String(queued._id) } }).catch(() => {});
  console.log(`💎 최초 부스팅 보상: ${member.displayName || userName} +${fmt(xp)} XP · 빙옥 ${fmt(point)}`);
  const msg = buildMessage("boosterBonus", { ...commonVars(member, member.guild), xp: fmt(xp), point: fmt(point) });
  if (msg) member.send(msg).catch(() => {});
  return true;
}

// 연속 부스팅 한 단계 — 한 사람 한 단계 한 줄을 먼저 세운 쪽만 준다. 줬으면 true · 이미 있으면 false
async function grantStep(member, since, step) {
  const userName = member.user?.username || member.id;
  let row;
  try {
    row = await BoosterStep.create({ userId: member.id, months: step.months, userName, premiumSince: new Date(since), xp: step.xp, point: step.point, at: new Date() });
  } catch (e) {
    if (isDuplicateKeyError(e)) return false;
    throw e;
  }
  let queued;
  try {
    queued = await payReward(member, { xp: step.xp, point: step.point, label: boosterStepLabel(step.months) });
  } catch (e) {
    if (e.keepRow) await BoosterStep.updateOne({ _id: row._id }, { $set: { error: `빙옥 지급 실패: ${e.message}` } }).catch(() => {});
    else await BoosterStep.deleteOne({ _id: row._id }).catch(() => {});
    throw e;
  }
  if (queued) await BoosterStep.updateOne({ _id: row._id }, { $set: { payoutId: String(queued._id) } }).catch(() => {});
  console.log(`💎 연속 부스팅 ${step.months}개월: ${member.displayName || userName} +${fmt(step.xp)} XP · 빙옥 ${fmt(step.point)}`);
  return true;
}

async function checkStart(member, since) {
  if (done.has(member.id)) return;
  const decision = bonusDecision(since, await loadStart());
  if (decision === "baseline") {
    await BoosterBonus.updateOne(
      { userId: member.id },
      { $setOnInsert: { userName: member.user?.username || member.id, status: "baseline", premiumSince: new Date(since), at: new Date() } },
      { upsert: true }
    ).catch((e) => {
      if (!isDuplicateKeyError(e)) throw e;
    });
  } else if (decision === "grant") {
    const { start } = boosterRewardsOf(getSettings());
    // 관리자가 최초 부스팅을 0 · 0 으로 꺼 두었으면 줄도 세우지 않는다(나중에 켜면 그때 처음 본 사람부터)
    if (!(start.xp > 0 || start.point > 0)) return;
    await grantStart(member, since, start);
  }
  done.add(member.id);
}

async function checkLadder(member, since) {
  const { ladder } = boosterRewardsOf(getSettings());
  if (!ladder.length || boostMonths(since) < ladder[0].months) return;
  await loadSteps();
  const got = gotOf(member.id);
  const due = dueSteps(since, Date.now(), ladder, got);
  if (!due.length) return;
  let xp = 0, point = 0, top = 0, err = null;
  for (const s of due) {
    try {
      if (await grantStep(member, since, s)) {
        xp += s.xp;
        point += s.point;
        top = Math.max(top, s.months);
      }
      got.add(s.months); // 줬거나 이미 있었다(유니크) — 다시 묻지 않는다
    } catch (e) {
      err = e; // 이 단계는 기록 줄까지 지웠다 — 다음 훑기에 다시. 뒤 단계도 그때 같이(개월 순서를 지킨다)
      break;
    }
  }
  // 이번에 준 것만 한 통 — 중간에 실패해도 앞서 준 단계는 알린다
  if (top) {
    const msg = buildMessage("boosterStep", { ...commonVars(member, member.guild), months: top, xp: fmt(xp), point: fmt(point) });
    if (msg) member.send(msg).catch(() => {});
  }
  if (err) throw err;
}

// 멤버 한 명 — 부스터가 아니면 그냥 지나간다. 최초 부스팅 · 연속 부스팅을 차례로 본다(하나가 실패해도 다른 하나는 본다)
export async function checkBoost(member) {
  if (!member || member.user?.bot || member.guild?.id !== config.guildId) return;
  const since = member.premiumSinceTimestamp;
  // 📌 봇 설정을 한 번도 못 읽었으면 지나간다 — 기본값으로 나가지 않게. 10분 훑기가 나중에 잡는다
  if (!since || busy.has(member.id) || !settingsLoaded()) return;
  busy.add(member.id);
  let err = null;
  try {
    await checkStart(member, since).catch((e) => { err = e; });
    await checkLadder(member, since).catch((e) => { err ||= e; });
  } finally {
    busy.delete(member.id);
  }
  if (err) throw err;
}

async function sweep(client, { full = false } = {}) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;
  try {
    // 켤 때 한 번 — 캐시에 없는 멤버까지(꺼져 있던 동안 부스트를 시작한 사람)
    if (full) await guild.members.fetch().catch((e) => console.error("부스터 보상(멤버 받기) 오류:", e.message));
    for (const m of guild.members.cache.values()) {
      if (!m.premiumSinceTimestamp) continue;
      await checkBoost(m).catch((e) => {
        console.error(`부스터 보상 오류 (${m.displayName}):`, e.message);
        recordBotError(e);
      });
    }
  } catch (e) {
    console.error("부스터 보상 훑기 오류:", e.message);
    recordBotError(e);
  }
}

export function registerBoosterBonus(client) {
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    // 부스트가 새로 붙었을 때만 — 옛 값을 모르는(partial) 경우도 본다(이미 본 사람은 checkBoost 가 바로 지나간다). 개월이 차는 건 10분 훑기가 잡는다
    if (!newMember?.premiumSinceTimestamp) return;
    if (!oldMember?.partial && oldMember?.premiumSinceTimestamp === newMember.premiumSinceTimestamp) return;
    checkBoost(newMember).catch((e) => {
      console.error(`부스터 보상 오류 (${newMember.displayName}):`, e.message);
      recordBotError(e);
    });
  });
}

let started = false;
export function startBoosterBonus(client) {
  if (started) return;
  started = true;
  // 📌 기준 시각("#start")을 훑기 전에 먼저 세운다 — 부스터가 한 명도 없을 때 늦게 세워져, 그 사이 처음 부스트한 사람이 baseline 으로 빠지지 않게
  loadStart()
    .catch((e) => {
      console.error("부스터 보상(기준 시각) 오류:", e.message);
      recordBotError(e);
    })
    .finally(() => sweep(client, { full: true }));
  setInterval(() => sweep(client), SWEEP_MS);
  console.log("✅ 서버 부스터 보상 시작 (최초 부스팅 · 연속 부스팅 — 부스트 시작 즉시 · 10분 주기 훑기)");
}
