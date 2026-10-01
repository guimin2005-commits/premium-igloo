// ── /퀘스트 표시용 계산 — 일일 · 주간 · 월간 진행도와 받을 보상 개수 ──
//    ⚠️ 사이트 lib/quests.js 의 getQuestState(진행도 · 무작위 노출 · 수령 여부) · lib/questKinds.js(조건 종류 · 단위 · 시간대) ·
//       lib/kst.js 의 경계 계산을 옮긴 사본이다. 봇은 별도 배포라 import 할 수 없다 — 사이트 쪽 규칙을 바꾸면 여기도 같이 고칠 것.
//    봇은 읽기만 한다(수령 · 지급은 사이트에서). 절대 저장하지 않는다.
import mongoose from "mongoose";
import { UserXp, BotSetting, XpLog, Purchase, WalletLog, Payout } from "../db.js";

// 📌 읽기 전용 모델 — 사이트 models/DailyQuest.js · models/QuestClaim.js 와 같은 컬렉션(dailyquests · questclaims).
//    필요한 칸만 둔다. 인덱스 · 컬렉션을 봇이 만들지 않게 autoIndex · autoCreate 를 끈다
const readOnly = { strict: false, versionKey: false, autoIndex: false, autoCreate: false };
const DailyQuest =
  mongoose.models.DailyQuest ||
  mongoose.model(
    "DailyQuest",
    new mongoose.Schema(
      {
        name: String,
        period: String,
        desc: String,
        reason: String,
        metric: String,
        hourFrom: Number,
        hourTo: Number,
        target: Number,
        rewardXp: Number,
        rewardPoint: Number,
        enabled: Boolean,
        order: Number,
        createdAt: Date,
      },
      readOnly
    )
  );
const QuestClaim =
  mongoose.models.QuestClaim ||
  mongoose.model(
    "QuestClaim",
    new mongoose.Schema({ userId: String, date: String, questId: String }, readOnly)
  );

// ── KST 경계 — lib/kst.js 와 같아야 한다 ──
const KST = 9 * 60 * 60 * 1000;
const kstNow = () => new Date(Date.now() + KST);
const toUtc = (y, m, d) => new Date(Date.UTC(y, m, d, 0, 0, 0) - KST);
const kstDayStart = () => {
  const n = kstNow();
  return toUtc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};
const kstWeekStart = () => {
  const n = kstNow();
  const dow = (n.getUTCDay() + 6) % 7; // 월=0 … 일=6
  return toUtc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - dow);
};
const kstMonthStart = () => {
  const n = kstNow();
  return toUtc(n.getUTCFullYear(), n.getUTCMonth(), 1);
};
const kstToday = () => kstNow().toISOString().slice(0, 10);
const kstDateKey = (d) => new Date(new Date(d).getTime() + KST).toISOString().slice(0, 10);
const periodKey = (period) => {
  if (period === "monthly") return kstToday().slice(0, 7);
  if (period === "weekly") {
    const ws = new Date(kstWeekStart().getTime() + KST);
    return `${ws.getUTCFullYear()}-W${ws.toISOString().slice(5, 10).replace("-", "")}`;
  }
  return kstToday();
};

// ── 주기별 무작위 노출 — lib/quests.js 의 pickQuests 와 같아야 한다(같은 시드 → 사이트와 같은 세트) ──
const seedFrom = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function pickQuests(list, count, seedKey) {
  if (!count || count <= 0 || list.length <= count) return list;
  const pool = [...list].sort((a, b) => (String(a._id) < String(b._id) ? -1 : 1));
  const rand = mulberry32(seedFrom(seedKey));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

const PERIODS = ["daily", "weekly", "monthly"];

// ── 조건 종류 — lib/questKinds.js 와 같아야 한다 ──
//    src: log(XpLog) · streak(UserXp 연속 출석) · shop(Purchase) · enhance(WalletLog) · pass(Payout · Purchase · WalletLog)
const REASON_SRC = {
  chat: "log",
  voice: "log",
  attend: "log",
  effect: "log",
  any: "log",
  streak: "streak",
  shop: "shop",
  enhance: "enhance",
  pass: "pass",
};
const questSrc = (reason) => REASON_SRC[reason] || "log";
const hasQuestHours = (q) => q?.hourFrom != null && q?.hourTo != null && Number(q.hourFrom) !== Number(q.hourTo);
const inQuestHours = (h, from, to) => (from < to ? h >= from && h < to : h >= from || h < to);
function questUnit(q) {
  if (q?.metric === "xp") return "XP";
  if (q?.metric === "minute") return "분";
  if (q?.metric === "day" || q?.reason === "streak") return "일";
  if (q?.reason === "shop") return "건";
  if (q?.reason === "pass") return "개";
  return "회";
}

// ARCTIC 구매로 세는 것 — 대기 · 완료 · 만료 상태의 상점 상품(ObjectId 24자) 줄. 운영진 지급("grant") · 패스 보상("season-pass") · 환불 · 취소 제외
const SOLD_STATUS = ["pending", "completed", "expired"];
const SHOP_ID_RE = /^[0-9a-f]{24}$/i;
const PASS_ITEM_ID = "season-pass";
// 주문 내역 한 줄 키 — 사이트 lib/orderGroups.js orderKeyOf 와 같다
const orderKeyOf = (r) => (r?.orderId ? `o:${r.orderId}|${r.itemId}` : `p:${r?._id}`);
const logReason = (r) => (r === "effect-levelup" ? "effect" : r);

// 로그 대상 진행도 — logs 는 (사유 · KST 날짜 · KST 시) 묶음
function logProgress(logs, q, fromKey, tickMin) {
  const want = REASON_SRC[q.reason] ? q.reason : "any";
  const hours = hasQuestHours(q);
  const hf = Number(q.hourFrom);
  const ht = Number(q.hourTo);
  let n = 0;
  let xp = 0;
  const days = new Set();
  for (const b of logs) {
    if (b.d < fromKey) continue;
    if (want !== "any" && logReason(b.r) !== want) continue;
    if (hours && !inQuestHours(b.h, hf, ht)) continue;
    n += b.n;
    xp += b.xp;
    days.add(b.d);
  }
  if (q.metric === "xp") return xp;
  if (q.metric === "minute") return n * tickMin;
  if (q.metric === "day") return days.size;
  return n;
}
const countSince = (times, startMs) => times.reduce((s, t) => s + (t >= startMs ? 1 : 0), 0);
function shopTimes(rows) {
  const first = new Map();
  for (const p of rows) {
    if (!SHOP_ID_RE.test(String(p.itemId || ""))) continue;
    const key = orderKeyOf(p);
    const t = new Date(p.createdAt).getTime();
    if (!first.has(key) || t < first.get(key)) first.set(key, t);
  }
  return [...first.values()];
}

// 📌 퀘스트 상태 — lib/quests.js 의 getQuestState 와 같은 계산(쓰기 없음).
//    반환: [{ period, name, reason, metric, unit, target, current, rewardXp, rewardPoint, done, claimed, claimable }]
async function questState(userId) {
  const dayStart = kstDayStart();
  const weekStart = kstWeekStart();
  const monthStart = kstMonthStart();
  const keys = { daily: periodKey("daily"), weekly: periodKey("weekly"), monthly: periodKey("monthly") };
  const startMs = { daily: dayStart.getTime(), weekly: weekStart.getTime(), monthly: monthStart.getTime() };
  const startKey = { daily: kstDateKey(dayStart), weekly: kstDateKey(weekStart), monthly: kstDateKey(monthStart) };
  // 주가 지난달에 시작하면 주 시작부터 읽어야 한다 — 둘 중 이른 쪽부터
  const since = new Date(Math.min(startMs.monthly, startMs.weekly));

  const [quests, buckets, claims, user, setting] = await Promise.all([
    DailyQuest.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
    // (사유 · KST 날짜 · KST 시) 묶음 — 횟수 · XP 합 · 날 수 · 시간대를 이 한 번으로
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            r: "$reason",
            d: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "+09:00" } },
            h: { $hour: { date: "$createdAt", timezone: "+09:00" } },
          },
          n: { $sum: 1 },
          xp: { $sum: "$amount" },
        },
      },
    ]),
    QuestClaim.find({ userId, date: { $in: Object.values(keys) } }, { questId: 1, date: 1 }).lean(),
    UserXp.findOne({ userId }, { lastAttendDate: 1, attendStreak: 1 }).lean(),
    BotSetting.findOne(
      { key: "main" },
      { attendXp: 1, attendVoiceMin: 1, voiceIntervalSec: 1, questPickDaily: 1, questPickWeekly: 1, questPickMonthly: 1 }
    ).lean(),
  ]);
  const logs = buckets.map((b) => ({ r: b._id?.r || "", d: b._id?.d || "", h: Number(b._id?.h) || 0, n: b.n || 0, xp: b.xp || 0 }));
  const claimed = new Set(claims.map((c) => `${c.date}::${c.questId}`));
  const today = kstToday();
  const tickMin = Math.max(1, Math.round((setting?.voiceIntervalSec ?? 300) / 60));

  // ── 내장 출석 퀘스트 — 음성 누적 N분 또는 /출석체크 (자동 지급이라 수령 버튼 없음) ──
  const attendXp = setting?.attendXp ?? 7000;
  const targetMin = Math.max(1, setting?.attendVoiceMin ?? 60);
  const voiceMin = logProgress(logs, { reason: "voice", metric: "minute" }, startKey.daily, tickMin);
  const attendClaimed = user?.lastAttendDate === today;
  const attendQuest = {
    period: "daily",
    name: "출석",
    reason: "voice",
    metric: "minute",
    unit: "분",
    target: targetMin,
    current: Math.min(voiceMin, targetMin),
    rewardXp: attendXp,
    rewardPoint: 0,
    done: voiceMin >= targetMin || attendClaimed,
    claimed: attendClaimed,
    claimable: false,
  };

  // 📌 일일 노출 개수는 내장 출석 퀘스트를 포함한 개수 — 무작위로는 하나 덜 뽑는다(사이트 lib/quests.js 와 같다)
  const dailyPick = Math.max(0, Math.floor(Number(setting?.questPickDaily) || 0));
  const picks = {
    daily: dailyPick > 0 ? dailyPick - 1 : 0,
    weekly: setting?.questPickWeekly || 0,
    monthly: setting?.questPickMonthly || 0,
  };
  const grouped = { daily: [], weekly: [], monthly: [] };
  for (const q of quests) grouped[PERIODS.includes(q.period) ? q.period : "daily"].push(q);

  const selected = [];
  for (const per of PERIODS) {
    // 일일 1개 = 출석만 — pickQuests 는 개수 0 을 "전부"로 읽으므로 따로 비운다
    const chosen = per === "daily" && dailyPick === 1 ? [] : pickQuests(grouped[per], picks[per], `${per}:${keys[per]}`);
    chosen.sort((a, b) => (a.order || 0) - (b.order || 0) || (String(a._id) < String(b._id) ? -1 : 1));
    selected.push(...chosen);
  }

  // ── 로그 밖 기록 — 뽑힌 퀘스트가 필요로 하는 것만 한 번씩 ──
  const need = new Set(selected.map((q) => questSrc(q.reason)));
  const wantPurchase = need.has("shop") || need.has("pass");
  const wantWallet = need.has("enhance") || need.has("pass");
  const [purchases, wallet, passPayouts] = await Promise.all([
    wantPurchase
      ? Purchase.find({ userId, createdAt: { $gte: since }, status: { $in: SOLD_STATUS } }, { itemId: 1, orderId: 1, createdAt: 1 }).lean()
      : [],
    wantWallet
      ? WalletLog.find({ userId, createdAt: { $gte: since }, kind: { $in: ["enhance", "pass-point"] } }, { kind: 1, amount: 1, createdAt: 1 }).lean()
      : [],
    need.has("pass") ? Payout.find({ userId, source: "pass", createdAt: { $gte: since } }, { createdAt: 1 }).lean() : [],
  ]);
  const ms = (d) => new Date(d).getTime();
  const times = {
    shop: shopTimes(purchases),
    enhance: wallet.filter((w) => w.kind === "enhance" && w.amount < 0).map((w) => ms(w.createdAt)),
    pass: [
      ...passPayouts.map((p) => ms(p.createdAt)),
      ...purchases.filter((p) => p.itemId === PASS_ITEM_ID).map((p) => ms(p.createdAt)),
      ...wallet.filter((w) => w.kind === "pass-point" && w.amount > 0).map((w) => ms(w.createdAt)),
    ],
  };
  // 📌 연속 출석 — 이 기간 안에 출석했을 때만 마지막 출석 날의 연속 일수, 아니면 0 (사이트 lib/quests.js streakIn 과 같다)
  const streakIn = (per) =>
    user?.lastAttendDate && user.lastAttendDate >= startKey[per]
      ? Math.max(1, Math.floor(Number(user.attendStreak) || 0))
      : 0;

  const rows = selected.map((q) => {
    const per = PERIODS.includes(q.period) ? q.period : "daily";
    const src = questSrc(q.reason);
    const target = Number(q.target) || 1;
    const raw =
      src === "streak" ? streakIn(per)
      : src === "log" ? logProgress(logs, q, startKey[per], tickMin)
      : countSince(times[src] || [], startMs[per]);
    const current = Math.min(raw, target);
    const done = current >= target;
    const isClaimed = claimed.has(`${keys[per]}::${String(q._id)}`);
    const rewardXp = Number(q.rewardXp) || 0;
    const rewardPoint = Number(q.rewardPoint) || 0;
    return {
      period: per,
      name: q.name || "",
      reason: q.reason,
      metric: q.metric,
      unit: questUnit(q),
      target,
      current,
      rewardXp,
      rewardPoint,
      done,
      claimed: isClaimed,
      claimable: done && (rewardXp > 0 || rewardPoint > 0) && !isClaimed,
    };
  });

  return [attendQuest, ...rows];
}

// ── 표시 ──
const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
const esc = (s) => String(s || "").replace(/([\\*_~|`])/g, "\\$1");
const FIELD_MAX = 1000; // 필드 값 한도(1,024자) 안쪽

// 한 줄 — "`12/30회` 채팅 30회 · 1,500 XP · 빙옥 100" (사이트 화면과 같은 단위: 회 · 분 · 일 · 건 · 개 · XP)
function questLine(q) {
  const unit = q.metric === "xp" ? " XP" : q.unit || (q.metric === "minute" ? "분" : "회");
  const badge = q.claimed ? "완료" : q.claimable ? "달성" : q.done ? "완료" : `${fmt(q.current)}/${fmt(q.target)}${unit}`;
  const reward = [q.rewardXp > 0 ? `${fmt(q.rewardXp)} XP` : "", q.rewardPoint > 0 ? `빙옥 ${fmt(q.rewardPoint)}` : ""].filter(Boolean);
  return `\`${badge}\` ${esc(q.name)}${reward.length ? ` · ${reward.join(" · ")}` : ""}`;
}

// 여러 줄 — 필드 한도를 넘으면 뒤를 "외 N개" 로 줄인다. 퀘스트가 없으면 빈 글(그 필드는 빠진다)
function listText(rows) {
  const out = [];
  let len = 0;
  for (let i = 0; i < rows.length; i++) {
    const line = questLine(rows[i]);
    if (len + line.length + 1 > FIELD_MAX - 12) {
      out.push(`외 ${fmt(rows.length - i)}개`);
      break;
    }
    out.push(line);
    len += line.length + 1;
  }
  return out.join("\n");
}

// 다음 초기화 시각(ms) — 일일: 다음 KST 자정 · 주간: 다음 월요일 0시 · 월간: 다음 달 1일 0시 (lib/kst.js 경계와 같다)
function nextResets() {
  const n = kstNow();
  return {
    daily: kstDayStart().getTime() + 86400000,
    weekly: kstWeekStart().getTime() + 7 * 86400000,
    monthly: toUtc(n.getUTCFullYear(), n.getUTCMonth() + 1, 1).getTime(),
  };
}

/**
 * @param {string} userId
 * @returns {Promise<{ daily: string, weekly: string, monthly: string, claimable: number, list: object[], resets: { daily: number, weekly: number, monthly: number } }>}
 *   list · resets — 이미지 카드용(questCardData). 글(템플릿 변수)은 daily · weekly · monthly · claimable
 */
export async function questView(userId) {
  const list = await questState(userId);
  const of = (per) => list.filter((q) => q.period === per);
  return {
    daily: listText(of("daily")),
    weekly: listText(of("weekly")),
    monthly: listText(of("monthly")),
    claimable: list.filter((q) => q.claimable).length,
    list,
    resets: nextResets(),
  };
}

// 📌 /퀘스트 이미지 카드 data(botCards.js cmdQuest 모양) — questView 결과 그대로(같은 계산 · 읽기만). 남은 시간은 지금 기준
export function questCardData(v, name) {
  const now = Date.now();
  return {
    name,
    claimable: v.claimable,
    periods: PERIODS.map((key) => ({
      key,
      left: Math.max(0, (v.resets?.[key] || now) - now),
      quests: (v.list || []).filter((q) => q.period === key),
    })),
  };
}
