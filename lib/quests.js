import DailyQuest from "@/models/DailyQuest";
import QuestClaim from "@/models/QuestClaim";
import XpLog from "@/models/XpLog";
import UserXp from "@/models/UserXp";
import BotSetting from "@/models/BotSetting";
import Purchase from "@/models/Purchase";
import WalletLog from "@/models/WalletLog";
import Payout from "@/models/Payout";
import { kstDayStart, kstWeekStart, kstMonthStart, kstToday, kstDateKey, periodKey } from "@/lib/kst";
import { questReasonOf, questSrc, questUnit, hasQuestHours, inQuestHours } from "@/lib/questKinds";
import { orderKeyOf } from "@/lib/orderGroups";

// 📌 내장 출석 퀘스트의 고정 id — 관리자가 만든 퀘스트(_id)와 절대 겹치지 않는 문자열
export const ATTEND_QUEST_ID = "attend-daily";

export const PERIODS = ["daily", "weekly", "monthly"];

// 📌 주기별 무작위 노출 — 등록된 퀘스트를 매 주기마다 섞어 정해진 개수만 내보낸다.
//    시드를 "주기:기간키"로 고정하므로 (a) 모든 유저가 같은 세트를 보고
//    (b) 새로고침해도 바뀌지 않으며 (c) 날짜가 바뀌면 저절로 다시 뽑힌다.
//    수령 검증(POST)도 이 함수를 거친 목록만 인정하므로 안 뽑힌 퀘스트는 받을 수 없다.
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

export function pickQuests(list, count, seedKey) {
  if (!count || count <= 0 || list.length <= count) return list;
  // 후보 순서를 _id로 고정 — DB가 돌려주는 순서가 결과를 바꾸지 않게 한다
  const pool = [...list].sort((a, b) => (String(a._id) < String(b._id) ? -1 : 1));
  const rand = mulberry32(seedFrom(seedKey));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
export const PERIOD_LABEL = { daily: "일일", weekly: "주간", monthly: "월간" };

// 📌 ARCTIC 구매로 세는 상태 — 대기 · 완료 · 만료(팔린 뒤 기간이 끝난 것). 환불 · 취소는 되돌린 거래라 뺀다.
//    상점 상품 id(ObjectId 24자)만 구매다 — 운영진 지급 · 역할 이전("grant") · 시즌 패스 보상("season-pass")은 고정 글자라 걸러진다
//    (lib/shopRecommend.js 의 SOLD_STATUS · isShopItemId 와 같은 판정. 봇 사본 bot/src/views/quests.js 도 같다)
const SOLD_STATUS = ["pending", "completed", "expired"];
const SHOP_ID_RE = /^[0-9a-f]{24}$/i;
const PASS_ITEM_ID = "season-pass";

// XpLog 사유 → 퀘스트 대상 — 레벨업 효과 지급(effect-levelup)도 "아이템 효과"로 센다
const logReason = (r) => (r === "effect-levelup" ? "effect" : r);

// 📌 로그 대상 진행도 — logs 는 (사유 · KST 날짜 · KST 시) 묶음이라, 퀘스트마다 DB 를 다시 읽지 않고 여기서 거른다.
//    fromKey: 기간 시작의 KST 날짜("YYYY-MM-DD") — 날짜 글자끼리 견준다
function logProgress(logs, q, fromKey, tickMin) {
  // 모르는 대상(옛 문서)은 예전처럼 전체로
  const want = questReasonOf(q.reason) ? q.reason : "any";
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
  // minute 은 로그 건수를 지급 주기(분)로 환산한다 — 출석 퀘스트와 같은 방식.
  //    음소거 정책이 "차단"이면 그 시간엔 로그 자체가 안 남아 진행도에 들어가지 않는다.
  if (q.metric === "xp") return xp;
  if (q.metric === "minute") return n * tickMin;
  if (q.metric === "day") return days.size;
  return n;
}

// 시각(ms) 목록 → 기간 시작 이후 개수
const countSince = (times, startMs) => times.reduce((s, t) => s + (t >= startMs ? 1 : 0), 0);

// 📌 ARCTIC 구매 시각 — 주문 내역 한 줄(주문 묶음 + 상품 — lib/orderGroups.js orderKeyOf)이 1건.
//    1개 단위 상품을 한 결제에서 여러 개 사도 1건이다. 묶음의 첫 구매 시각으로 센다
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

// 📌 퀘스트 진행도 계산 — 조회(GET)와 수령 검증(POST)이 반드시 같은 함수를 쓴다.
//    클라이언트가 보낸 진행도는 절대 믿지 않고, 여기서 기록(XpLog 등)으로 매번 다시 센다.
//    쿼리 수는 퀘스트 수와 무관하다 — XpLog 1번 + (뽑힌 퀘스트가 필요로 할 때만) 구매 · 원장 · 패스 지급 각 1번
export async function getQuestState(userId) {
  const dayStart = kstDayStart();
  const weekStart = kstWeekStart();
  const monthStart = kstMonthStart();
  const keys = { daily: periodKey("daily"), weekly: periodKey("weekly"), monthly: periodKey("monthly") };
  const startMs = { daily: dayStart.getTime(), weekly: weekStart.getTime(), monthly: monthStart.getTime() };
  // 기간 시작의 KST 날짜 — 로그 묶음(KST 날짜)과 견준다
  const startKey = { daily: kstDateKey(dayStart), weekly: kstDateKey(weekStart), monthly: kstDateKey(monthStart) };
  // 📌 주가 지난달에 시작하면(달이 바뀌는 주) 주 시작부터 읽어야 한다 — 이번 달 1일로 자르면 월~말일치가 주간에서 빠진다.
  //    그래서 둘 중 이른 쪽부터 읽는다
  const since = new Date(Math.min(startMs.monthly, startMs.weekly));

  const [quests, buckets, claims, user, setting] = await Promise.all([
    DailyQuest.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
    // (사유 · KST 날짜 · KST 시) 묶음 — 횟수 · XP 합 · 날 수 · 시간대를 이 한 번으로 모두 센다
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
    UserXp.findOne({ userId }, { lastAttendDate: 1, attendCount: 1, attendStreak: 1 }).lean(),
    BotSetting.findOne(
      { key: "main" },
      { attendXp: 1, attendVoiceMin: 1, voiceIntervalSec: 1, questPickDaily: 1, questPickWeekly: 1, questPickMonthly: 1 }
    ).lean(),
  ]);
  const logs = buckets.map((b) => ({ r: b._id?.r || "", d: b._id?.d || "", h: Number(b._id?.h) || 0, n: b.n || 0, xp: b.xp || 0 }));

  const claimed = new Set(claims.map((c) => `${c.date}::${c.questId}`));
  const today = kstToday();
  const tickMin = Math.max(1, Math.round((setting?.voiceIntervalSec ?? 300) / 60));

  // 📌 출석은 퀘스트 목록에 넣지 않는다(2026-10-01 "일일 퀘스트에 출석이 왜 있는 거야 없애") — 출석 XP 는 봇이 그대로 준다.
  //    오늘 음성 누적 분은 화면 안내용으로만 돌려준다(voice 로그 건수 × 간격)
  const voiceMin = logProgress(logs, { reason: "voice", metric: "minute" }, startKey.daily, tickMin);

  // ── 주기별 무작위 노출 ──
  const picks = {
    daily: setting?.questPickDaily || 0,
    weekly: setting?.questPickWeekly || 0,
    monthly: setting?.questPickMonthly || 0,
  };
  const grouped = { daily: [], weekly: [], monthly: [] };
  for (const q of quests) grouped[PERIODS.includes(q.period) ? q.period : "daily"].push(q);

  const pool = {};
  const selected = [];
  for (const per of PERIODS) {
    const all = grouped[per];
    const chosen = pickQuests(all, picks[per], `${per}:${keys[per]}`);
    // 뽑은 뒤 표시 순서는 관리자가 정한 order 그대로 되돌린다
    chosen.sort((a, b) => (a.order || 0) - (b.order || 0) || (String(a._id) < String(b._id) ? -1 : 1));
    pool[per] = { total: all.length, shown: chosen.length, pick: picks[per] };
    selected.push(...chosen);
  }

  // ── 로그 밖 기록 — 뽑힌 퀘스트가 필요로 하는 것만 한 번씩 읽는다 ──
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
    // 강화 1단계 = 원장 한 줄(차감). 되돌려 준 줄(+)은 세지 않는다
    enhance: wallet.filter((w) => w.kind === "enhance" && w.amount < 0).map((w) => ms(w.createdAt)),
    // 📌 패스 보상 개수 — XP(Payout) · 역할 · 아이템(Purchase "season-pass")은 보상마다 한 줄, 빙옥은 한 번 받기에 합계 한 줄(app/api/pass/claim)
    pass: [
      ...passPayouts.map((p) => ms(p.createdAt)),
      ...purchases.filter((p) => p.itemId === PASS_ITEM_ID).map((p) => ms(p.createdAt)),
      ...wallet.filter((w) => w.kind === "pass-point" && w.amount > 0).map((w) => ms(w.createdAt)),
    ],
  };
  // 📌 연속 출석 — 이 기간 안에 출석했을 때만, 마지막 출석 날의 연속 일수(attendStreak 는 다음 출석 때까지 그 날 값 그대로다).
  //    기간 밖 출석으로는 세지 않는다 — 일일은 오늘 출석해야, 주간 · 월간은 이번 주 · 이번 달에 한 번이라도 출석해야 잡힌다
  //    (어제까지의 연속으로 오늘 출석 전에 받거나, 지난달 연속으로 이번 달 1일 0시에 바로 받는 일이 없게).
  //    기간 안에서 연속이 끊겨도 마지막 출석 날 값이 남는다. 연속 기록이 생기기 전 문서(0)는 출석한 날을 1일로 본다(봇 attend.js 와 같다)
  const streakIn = (per) =>
    user?.lastAttendDate && user.lastAttendDate >= startKey[per]
      ? Math.max(1, Math.floor(Number(user.attendStreak) || 0))
      : 0;

  const rows = selected.map((q) => {
    const per = PERIODS.includes(q.period) ? q.period : "daily";
    const src = questSrc(q.reason);
    const raw =
      src === "streak" ? streakIn(per)
      : src === "log" ? logProgress(logs, q, startKey[per], tickMin)
      : countSince(times[src] || [], startMs[per]);
    const current = Math.min(raw, q.target);
    const done = current >= q.target;
    const id = String(q._id);
    const isClaimed = claimed.has(`${keys[per]}::${id}`);
    // 화면에 적는 POINT 는 등록한 값 — 아이템 퀘스트 보너스가 붙으면 실지급액은 수령 응답(claimed.point)이 알려 준다
    const rewardPoint = q.rewardPoint || 0;
    const hours = hasQuestHours(q);
    return {
      id,
      builtin: false,
      period: per,
      name: q.name,
      desc: q.desc || "",
      reason: q.reason,
      metric: q.metric,
      // 진행/목표 뒤 단위(회 · 분 · 일 · 건 · 개 · XP) — 사이트 목록 · 봇 카드가 그대로 붙인다
      unit: questUnit(q),
      hourFrom: hours ? q.hourFrom : null,
      hourTo: hours ? q.hourTo : null,
      target: q.target,
      rewardXp: q.rewardXp,
      rewardPoint,
      current,
      done,
      claimed: isClaimed,
      // 보상이 0인 퀘스트는 '목표'일 뿐이라 수령 버튼을 띄우지 않는다.
      //    XP 든 POINT 든 하나라도 있으면 받을 수 있어야 한다 — XP 만 보면 POINT 전용 퀘스트가 영영 잠긴다.
      claimable: done && (q.rewardXp > 0 || rewardPoint > 0) && !isClaimed,
    };
  });

  return {
    date: today,
    keys,
    voiceMin, // 오늘 음성 접속 누적 분 (UI 안내용)
    attendCount: user?.attendCount || 0,
    lastAttendDate: user?.lastAttendDate || "",
    // 주기별 등록 수/노출 수 — 화면에서 "오늘의 퀘스트 3개" 같은 안내에 쓴다
    pool,
    quests: rows,
  };
}
