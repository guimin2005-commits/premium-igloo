// ── /시즌패스 표시용 계산 — 현재 티어 · 진행도 · 다음 보상 · 받을 보상 · 프리미엄 여부 ──
//    ⚠️ 사이트 lib/seasonPass.js 의 getPassState · normalizeTiers · rewardLabel 을 옮긴 사본이다.
//       봇은 별도 배포라 import 할 수 없다 — 사이트 쪽 규칙을 바꾸면 여기도 같이 고칠 것.
//    봇은 읽기만 한다. 시즌이 바뀐 문서(passSeason ≠ 지금 시즌)도 봇은 다시 찍지 않고(그건 사이트가 조회 때 한다),
//    사이트가 찍을 값과 같은 기준(시즌 시작 시점 기준선 · 해금 · 수령 초기화)으로 보여 주기만 한다.
import mongoose from "mongoose";
import { UserXp, XpLog, Payout } from "../db.js";
import { currentSeason } from "../leveling.js";
import { progressBar } from "../botMessages.js";

// 📌 읽기 전용 모델 — 사이트 models/SeasonPass.js 와 같은 컬렉션(seasonpasses). 인덱스 · 컬렉션을 봇이 만들지 않는다
const SeasonPass =
  mongoose.models.SeasonPass ||
  mongoose.model(
    "SeasonPass",
    new mongoose.Schema(
      { key: String, enabled: Boolean, unlockPrice: Number, tiers: [mongoose.Schema.Types.Mixed], nextTid: Number },
      { strict: false, versionKey: false, autoIndex: false, autoCreate: false }
    )
  );

const REWARD_KINDS = ["none", "xp", "point", "role", "item"];
const MAX_TIERS = 100;

const num = (v, { min = 0, max = 1_000_000_000 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

// 보상 라벨 — lib/seasonPass.js 의 rewardLabel 과 같아야 한다
const rewardLabel = (r) => {
  const amount = num(r?.amount);
  if (r?.kind === "xp") return amount > 0 ? `XP ${amount.toLocaleString("ko-KR")}` : "-";
  if (r?.kind === "point") return amount > 0 ? `빙옥 ${amount.toLocaleString("ko-KR")}` : "-";
  if (r?.kind === "role") return r?.roleId ? `역할 · ${r.roleName || "역할"}` : "-";
  if (r?.kind === "item") return r?.itemId ? `아이템 · ${r.itemName || "아이템"}` : "-";
  return "-";
};

const blankReward = () => ({ kind: "none", amount: 0, roleId: "", roleName: "", itemId: "", itemName: "" });

const normalizeReward = (r) => {
  const kind = REWARD_KINDS.includes(r?.kind) ? r.kind : "none";
  if (kind === "role") {
    const roleId = String(r?.roleId || "").trim();
    if (!roleId) return blankReward();
    return { kind, amount: 0, roleId, roleName: String(r?.roleName || "").trim(), itemId: "", itemName: "" };
  }
  if (kind === "item") {
    const itemId = String(r?.itemId || "").trim();
    if (!itemId) return blankReward();
    return { kind, amount: 0, roleId: "", roleName: "", itemId, itemName: String(r?.itemName || "").trim() };
  }
  if (kind === "xp" || kind === "point") {
    const amount = num(r?.amount);
    if (amount <= 0) return blankReward();
    return { kind, amount, roleId: "", roleName: "", itemId: "", itemName: "" };
  }
  return blankReward();
};

// 📌 티어 정리 — lib/seasonPass.js 의 normalizeTiers 와 같아야 한다.
//    tid 가 없는 옛 티어에 붙는 번호까지 같아야 수령 기록(passClaimed*)이 사이트와 같게 맞는다
function normalizeTiers(tiers, startTid = 1) {
  const rows = Array.isArray(tiers) ? tiers : [];
  const kept = rows.slice(0, MAX_TIERS);
  const used = new Set();
  let maxUsed = 0;
  for (const t of kept) {
    const tid = String(t?.tid || "").trim();
    if (!tid) continue;
    used.add(tid);
    const m = /^t(\d+)$/.exec(tid);
    if (m) maxUsed = Math.max(maxUsed, Number(m[1]));
  }
  let nextTid = Math.max(1, Math.floor(Number(startTid) || 1), maxUsed + 1);
  const allocTid = () => {
    let tid = `t${nextTid++}`;
    while (used.has(tid)) tid = `t${nextTid++}`;
    used.add(tid);
    return tid;
  };
  const seen = new Set();
  return kept
    .map((t) => {
      let tid = String(t?.tid || "").trim();
      if (!tid || seen.has(tid)) tid = allocTid();
      seen.add(tid);
      return { tid, need: num(t?.need), free: normalizeReward(t?.free), paid: normalizeReward(t?.paid) };
    })
    .sort((a, b) => a.need - b.need)
    .map((t, i) => ({ tid: t.tid, level: i + 1, need: t.need, free: t.free, paid: t.paid }));
}

// 📌 시즌 시작 시점 기준선 — lib/seasonPass.js 의 seasonStartBaseXp 와 같은 식(시즌 시작 뒤 봇 지급 로그 + 패스 보상 뺀 지급 대기열)
async function seasonStartBaseXp(userId, xp, season) {
  const since = new Date(`${season.start}T00:00:00+09:00`);
  const [logs, pays] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: since } } },
      { $group: { _id: null, s: { $sum: "$amount" } } },
    ]),
    Payout.aggregate([
      { $match: { userId, status: "paid", currency: { $ne: "point" }, source: { $ne: "pass" }, paidAt: { $gte: since } } },
      { $group: { _id: null, s: { $sum: "$amount" } } },
    ]),
  ]);
  const earned = (Number(logs[0]?.s) || 0) + (Number(pays[0]?.s) || 0);
  return Math.min(xp, Math.max(0, xp - earned));
}

/**
 * @param {string} userId
 * @returns {Promise<{ enabled: false } | { enabled: true, season: number, seasonName: string, passTier: number, passMax: number,
 *   passProgressBar: string, nextReward: string, claimable: number, premium: "해금" | "미해금" }>}
 */
export async function passView(userId) {
  const season = currentSeason();
  const [cfg, user] = await Promise.all([
    SeasonPass.findOne({ key: "main" }).lean(),
    UserXp.findOne(
      { userId },
      { xp: 1, passSeason: 1, passBaseXp: 1, passUnlocked: 1, passClaimedFree: 1, passClaimedPaid: 1 }
    ).lean(),
  ]);
  if (!cfg?.enabled) return { enabled: false };

  const tiers = normalizeTiers(cfg.tiers, cfg.nextTid);
  const xp = user?.xp || 0;
  let baseXp = user?.passBaseXp || 0;
  let unlocked = !!user?.passUnlocked;
  let claimedFree = Array.isArray(user?.passClaimedFree) ? user.passClaimedFree : [];
  let claimedPaid = Array.isArray(user?.passClaimedPaid) ? user.passClaimedPaid : [];
  // 새 시즌인데 사이트가 아직 다시 찍지 않은 문서 — 사이트가 찍을 값으로 본다
  if (user && (user.passSeason || 0) !== season.number) {
    baseXp = await seasonStartBaseXp(userId, xp, season);
    unlocked = false;
    claimedFree = [];
    claimedPaid = [];
  }

  const progress = Math.max(0, xp - baseXp);
  const freeSet = new Set(claimedFree.map(String));
  const paidSet = new Set(claimedPaid.map(String));

  let tierIndex = -1;
  let claimable = 0;
  tiers.forEach((t, i) => {
    if (progress < t.need) return;
    tierIndex = i; // need 오름차순 — 마지막으로 넘은 인덱스가 남는다
    if (t.free.kind !== "none" && !freeSet.has(t.tid)) claimable += 1;
    if (unlocked && t.paid.kind !== "none" && !paidSet.has(t.tid)) claimable += 1;
  });

  // 진행 막대 — 사이트 패스 창의 링과 같다: 지금 티어에서 다음 티어까지 얼마나 찼나 (다 넘었으면 가득)
  const prevNeed = tierIndex >= 0 ? tiers[tierIndex].need : 0;
  const nextTier = tiers[tierIndex + 1];
  const ratio = nextTier ? (progress - prevNeed) / Math.max(1, nextTier.need - prevNeed) : tiers.length ? 1 : 0;

  // 다음 보상 — 아직 못 넘은 티어 중 보상이 있는 첫 티어. 프리미엄 칸은 "프리미엄" 을 앞에 붙인다
  let nextReward = "";
  for (let i = tierIndex + 1; i < tiers.length && !nextReward; i++) {
    const t = tiers[i];
    const parts = [];
    if (t.free.kind !== "none") parts.push(rewardLabel(t.free));
    if (t.paid.kind !== "none") parts.push(`프리미엄 ${rewardLabel(t.paid)}`);
    if (parts.length) nextReward = `T${t.level} · ${parts.join(" · ")}`;
  }

  return {
    enabled: true,
    season: season.number,
    seasonName: season.name,
    passTier: tierIndex >= 0 ? tiers[tierIndex].level : 0,
    passMax: tiers.length,
    passProgressBar: progressBar(ratio),
    nextReward,
    claimable,
    premium: unlocked ? "해금" : "미해금",
  };
}
