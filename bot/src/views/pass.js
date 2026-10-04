// ── /시즌패스 표시용 계산 — 현재 티어 · 진행도 · 다음 보상 · 받을 보상 · 프리미엄 여부 ──
//    ⚠️ 사이트 lib/seasonPass.js 의 getPassState · normalizeTiers · rewardsOf · rewardKeys · rewardShort · isBoosterMember 를 옮긴 사본이다.
//       봇은 별도 배포라 import 할 수 없다 — 사이트 쪽 규칙을 바꾸면 여기도 같이 고칠 것.
//    봇은 읽기만 한다. 시즌이 바뀐 문서(passSeason ≠ 지금 시즌)도 봇은 다시 찍지 않고(그건 사이트가 조회 때 한다),
//    사이트가 찍을 값과 같은 기준(시즌 시작 시점 기준선 · 해금 · 수령 초기화)으로 보여 주기만 한다.
//    📌 시즌 종료 전 미수령 DM(features/passReminder.js)도 passView 의 claimable 로 대상을 고른다 — 판정을 따로 두지 않는다
import mongoose from "mongoose";
import { UserXp, XpLog, Payout, Item } from "../db.js";
import { currentSeason } from "../leveling.js";
import { progressBar } from "../botMessages.js";

// 📌 읽기 전용 모델 — 사이트 models/SeasonPass.js 와 같은 컬렉션(seasonpasses). 인덱스 · 컬렉션을 봇이 만들지 않는다
export const SeasonPass =
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
const MAX_REWARDS = 4; // lib/seasonPass.js 의 MAX_REWARDS 와 같아야 한다
const MAX_REWARD_DAYS = 3650; // 📌 아이템 보상 기간 상한(일) — lib/seasonPass.js 와 같아야 한다
const PASS_CARD_MAX = MAX_REWARDS * 2; // 📌 이미지 카드의 다음 보상 칸 최대 — 한 티어의 무료 + 프리미엄 전부. botCards.js PASS_MAX 와 같다

const num = (v, { min = 0, max = 1_000_000_000 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

// 아이템 보상 기간 꼬리 — " · 7일"(0 = 무기한이면 없음). lib/seasonPass.js daysTail 과 같다
const daysTail = (r) => {
  const days = r?.kind === "item" ? num(r?.days, { max: MAX_REWARD_DAYS }) : 0;
  return days > 0 ? ` · ${days.toLocaleString("ko-KR")}일` : "";
};

// 짧은 라벨 — lib/seasonPass.js 의 rewardShort 와 같아야 한다
const rewardShort = (r) => {
  const amount = num(r?.amount);
  if (r?.kind === "xp") return `${amount.toLocaleString("ko-KR")} XP`;
  if (r?.kind === "point") return `${amount.toLocaleString("ko-KR")} 빙옥`;
  if (r?.kind === "role") return r?.roleName || "역할";
  if (r?.kind === "item") return `${r?.itemName || "아이템"}${daysTail(r)}`;
  return "-";
};

const blankReward = () => ({ kind: "none", amount: 0, roleId: "", roleName: "", itemId: "", itemName: "", days: 0 });

const normalizeReward = (r) => {
  const kind = REWARD_KINDS.includes(r?.kind) ? r.kind : "none";
  if (kind === "role") {
    const roleId = String(r?.roleId || "").trim();
    if (!roleId) return blankReward();
    return { kind, amount: 0, roleId, roleName: String(r?.roleName || "").trim(), itemId: "", itemName: "", days: 0 };
  }
  if (kind === "item") {
    const itemId = String(r?.itemId || "").trim();
    if (!itemId) return blankReward();
    return { kind, amount: 0, roleId: "", roleName: "", itemId, itemName: String(r?.itemName || "").trim(), days: num(r?.days, { max: MAX_REWARD_DAYS }) };
  }
  if (kind === "xp" || kind === "point") {
    const amount = num(r?.amount);
    if (amount <= 0) return blankReward();
    return { kind, amount, roleId: "", roleName: "", itemId: "", itemName: "", days: 0 };
  }
  return blankReward();
};

// 한 칸(트랙)의 보상 목록 — lib/seasonPass.js 의 rewardsOf 와 같아야 한다 (옛 문서의 객체 하나도 [객체] 로)
const rewardsOf = (v) => {
  const list = Array.isArray(v) ? v : v && typeof v === "object" ? [v] : [];
  return list.map(normalizeReward).filter((r) => r.kind !== "none").slice(0, MAX_REWARDS);
};

// 보상 하나의 부분 수령 표시 키 — lib/seasonPass.js 의 rewardKeys 와 같아야 한다
function rewardKeys(tid, list) {
  const seen = new Map();
  return list.map((r) => {
    const base = `${r.kind}:${r.kind === "item" ? r.itemId : r.kind === "role" ? r.roleId : num(r.amount)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return `${tid}#${base}${n > 1 ? `~${n}` : ""}`;
  });
}

// 📌 서버 부스터 — lib/seasonPass.js 의 isBoosterMember 와 같은 규칙(부스터 역할 DISCORD_BOOSTER_ROLE_ID 또는 부스트 시작일).
//    discord.js GuildMember(premiumSinceTimestamp · roles.cache)와 캐시 안 된 날것(premium_since · roles 배열)을 다 받는다.
function isBoosterMember(member) {
  if (!member) return false;
  const roleId = process.env.DISCORD_BOOSTER_ROLE_ID;
  const hasRole = roleId
    ? member.roles?.cache
      ? member.roles.cache.has(roleId)
      : Array.isArray(member.roles) && member.roles.includes(roleId)
    : false;
  return hasRole || !!(member.premiumSinceTimestamp || member.premiumSince || member.premium_since);
}

// 📌 티어 정리 — lib/seasonPass.js 의 normalizeTiers 와 같아야 한다.
//    tid 가 없는 옛 티어에 붙는 번호까지 같아야 수령 기록(passClaimed*)이 사이트와 같게 맞는다
export function normalizeTiers(tiers, startTid = 1) {
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
      return { tid, need: num(t?.need), free: rewardsOf(t?.free), paid: rewardsOf(t?.paid) };
    })
    .sort((a, b) => a.need - b.need)
    .map((t, i) => ({ tid: t.tid, level: i + 1, need: t.need, free: t.free, paid: t.paid }));
}

// 📌 시즌 시작 시점 기준선 — lib/seasonPass.js 의 seasonStartBaseXp 와 같은 식(시즌 시작 뒤 봇 지급 로그 + 패스 보상 뺀 지급 대기열, 둘 다 가속분 포함).
//    사이트 쪽 집계 식은 lib/season.js passEarnedPipelines 하나 — 바꾸면 같이
//    세는 구간은 시즌 시작과 지금 문서가 생긴 시각(_id) 중 늦은 쪽부터 — 퇴장 초기화로 지운 문서 시절 로그는 넣지 않는다
async function seasonStartBaseXp(userId, xp, season, docId) {
  const seasonStart = new Date(`${season.start}T00:00:00+09:00`).getTime();
  const born = docId?.getTimestamp?.()?.getTime?.() || 0;
  const since = new Date(Math.max(seasonStart, born));
  const [logs, pays] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: since } } },
      // 📌 패스 가속(아이템 효과 passBoost)으로 더 오른 진행도도 이번 시즌에 번 것으로 친다
      { $group: { _id: null, s: { $sum: { $add: ["$amount", { $ifNull: ["$passBoost", 0] }] } } } },
    ]),
    // 📌 패스 보상 · 역할 환불(role-refund)은 뺀다 — 지급할 때 기준선도 같이 올리는 지급(grantQueue PASS_NEUTRAL). 사이트 lib/seasonPass.js 와 같게
    //    📌 퀘스트 보상의 패스 가속(Payout.passBoost — grantQueue PASS_BOOSTED)도 XpLog 처럼 더한다 — 빠지면 기준선을 되짚을 때 가속분이 사라진다
    Payout.aggregate([
      { $match: { userId, status: "paid", currency: { $ne: "point" }, source: { $nin: ["pass", "role-refund"] }, paidAt: { $gte: since } } },
      { $group: { _id: null, s: { $sum: { $add: ["$amount", { $ifNull: ["$passBoost", 0] }] } } } },
    ]),
  ]);
  const earned = (Number(logs[0]?.s) || 0) + (Number(pays[0]?.s) || 0);
  // 가속분이 있으면 기준선이 0 아래일 수 있다 — 잘라 내면 가속으로 오른 진행도가 사라진다
  return Math.min(xp, xp - earned);
}

/**
 * @param {string} userId
 * @param {import("discord.js").GuildMember | object | null} [member] 명령을 쓴 멤버(interaction.member) — 서버 부스터 자동 해금 판정용.
 *   안 주면 구매한 해금만 본다.
 * @returns {Promise<{ enabled: false } | { enabled: true, season: number, seasonName: string, passTier: number, passMax: number,
 *   passProgressBar: string, nextReward: string, claimable: number, premium: "해금" | "미해금", premiumBy: "purchase" | "booster" | null }>}
 */
export async function passView(userId, member = null) {
  const season = currentSeason();
  const [cfg, user] = await Promise.all([
    SeasonPass.findOne({ key: "main" }).lean(),
    UserXp.findOne(
      { userId },
      // _id — 문서가 생긴 시각을 기준선 계산에 쓴다(사이트 getPassState 와 같다)
      { _id: 1, xp: 1, passSeason: 1, passBaseXp: 1, passUnlocked: 1, passClaimedFree: 1, passClaimedPaid: 1 }
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
    baseXp = await seasonStartBaseXp(userId, xp, season, user._id);
    unlocked = false;
    claimedFree = [];
    claimedPaid = [];
  }

  // 프리미엄 — 산 사람은 부스트와 무관하게 유지, 아니면 지금 부스팅 중인 서버 부스터(사이트 getPassState 와 같다)
  const premiumBy = unlocked ? "purchase" : isBoosterMember(member) ? "booster" : null;

  const progress = Math.max(0, xp - baseXp);
  const freeSet = new Set(claimedFree.map(String));
  const paidSet = new Set(claimedPaid.map(String));
  // 받을 게 남은 칸 — 칸 전체 수령(tid)이 없고, 부분 수령 표시(rewardKeys)로 다 덮이지 않은 보상이 있으면
  const pending = (t, list, set) => !set.has(t.tid) && rewardKeys(t.tid, list).some((k) => !set.has(k));

  let tierIndex = -1;
  let claimable = 0; // 받기 단위(티어 · 트랙) 개수 — 사이트 "받을 보상" 탭 수와 같다
  let claimFree = 0; // 그중 무료 트랙 · 프리미엄 트랙 (이미지 카드)
  let claimPaid = 0;
  tiers.forEach((t, i) => {
    if (progress < t.need) return;
    tierIndex = i; // need 오름차순 — 마지막으로 넘은 인덱스가 남는다
    if (pending(t, t.free, freeSet)) {
      claimable += 1;
      claimFree += 1;
    }
    if (premiumBy && pending(t, t.paid, paidSet)) {
      claimable += 1;
      claimPaid += 1;
    }
  });

  // 진행 막대 — 사이트 패스 창의 링과 같다: 지금 티어에서 다음 티어까지 얼마나 찼나 (다 넘었으면 가득)
  const prevNeed = tierIndex >= 0 ? tiers[tierIndex].need : 0;
  const nextTier = tiers[tierIndex + 1];
  const ratio = nextTier ? (progress - prevNeed) / Math.max(1, nextTier.need - prevNeed) : tiers.length ? 1 : 0;

  // 📌 다음 보상 — 지금 향해 가는 티어(nextTier) 하나의 보상 전부. 무료 → 프리미엄 순으로 " · " 로 잇고
  //    프리미엄 첫 보상 앞에 "프리미엄" 을 붙인다. 접지 않는다("외 N개" 없음). 그 티어에 보상이 없거나 다 넘었으면 빈 글자
  const nextParts = nextTier
    ? [...nextTier.free.map(rewardShort), ...nextTier.paid.map((r, j) => (j === 0 ? `프리미엄 ${rewardShort(r)}` : rewardShort(r)))]
    : [];
  const nextReward = nextParts.length ? `T${nextTier.level} · ${nextParts.join(" · ")}` : "";

  // 📌 다음 보상 칸 — 같은 티어의 무료 → 프리미엄 전부(트랙마다 최대 MAX_REWARDS, 합쳐 PASS_CARD_MAX) (이미지 카드)
  const upcoming = nextTier
    ? [...nextTier.free.map((r) => [r, false]), ...nextTier.paid.map((r) => [r, true])]
        .slice(0, PASS_CARD_MAX)
        .map(([r, premium]) => ({
          tier: nextTier.level,
          kind: r.kind,
          amount: r.amount,
          label: r.kind === "role" ? r.roleName : r.kind === "item" ? `${r.itemName}${daysTail(r)}` : "",
          itemId: r.itemId,
          premium,
        }))
    : [];

  return {
    enabled: true,
    season: season.number,
    seasonName: season.name,
    passTier: tierIndex >= 0 ? tiers[tierIndex].level : 0,
    passMax: tiers.length,
    passProgressBar: progressBar(ratio),
    nextReward,
    claimable,
    premium: premiumBy ? "해금" : "미해금", // 부스터 자동 해금도 "해금"
    premiumBy,
    // ── 이미지 카드용(passCardData) ──
    ratio,
    need: nextTier ? Math.max(0, nextTier.need - progress) : 0,
    claimFree,
    claimPaid,
    nextTier: nextTier ? nextTier.level : 0, // 다음 보상 티어 — 다 넘었으면 0
    upcoming,
  };
}

/**
 * 📌 /시즌패스 이미지 카드 data(botCards.js cmdPass 모양) — passView 결과로 만든다(같은 계산 · 읽기만).
 *    아이템 보상은 등록 아이템(Item)의 아이콘 · 이미지로 — 이미지는 1.5초 · 캐시, 못 받으면 유형 기본 아이콘
 * @param {object} v passView 결과(enabled true)
 * @param {object} cards 그림 모듈(botCards.js) — buildMessageWithCard 가 넘겨준다
 */
export async function passCardData(v, cards) {
  const ids = [...new Set(v.upcoming.filter((r) => r.kind === "item" && mongoose.isValidObjectId(r.itemId)).map((r) => r.itemId))];
  const docs = ids.length ? await Item.find({ _id: { $in: ids } }, { name: 1, type: 1, icon: 1, imageUrl: 1, color: 1 }).lean() : [];
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const next = await Promise.all(
    v.upcoming.map(async (r) => {
      if (r.kind !== "item") return r;
      const it = byId.get(String(r.itemId));
      if (!it) return { ...r, type: "item" };
      const image = it.imageUrl && cards?.fetchImageDataUri ? await cards.fetchImageDataUri(it.imageUrl).catch(() => null) : null;
      return { ...r, label: r.label || it.name || "", type: it.type || "item", color: it.color || "", icon: it.imageUrl && !image ? "" : it.icon || "", image };
    })
  );
  return {
    season: v.season,
    seasonName: v.seasonName,
    tier: v.passTier,
    maxTier: v.passMax,
    progress: v.ratio,
    need: v.need,
    claimFree: v.claimFree,
    claimPaid: v.claimPaid,
    premium: !!v.premiumBy,
    nextTier: v.nextTier,
    next,
  };
}
