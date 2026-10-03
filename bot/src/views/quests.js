// ── /퀘스트 표시용 계산 — 일일 · 주간 · 월간 진행도와 받을 보상 개수 ──
//    📌 계산은 ../questKinds.js 공용 블록의 computeQuestState(사이트 lib/questKinds.js 와 글자 하나까지 같은 사본) — 2026-10-03 부터 손으로 옮긴 사본을 없앴다.
//    봇은 읽기만 한다(수령 · 지급은 사이트에서). 절대 저장하지 않는다.
import mongoose from "mongoose";
import { UserXp, BotSetting, XpLog, Purchase, WalletLog, Payout, ActivityStat, QuestPick } from "../db.js";
import { computeQuestState, QUEST_PERIODS } from "../questKinds.js";

// 📌 읽기 전용 모델 — 사이트 models/DailyQuest.js · models/QuestClaim.js 와 같은 컬렉션(dailyquests · questclaims).
//    인덱스 · 컬렉션을 봇이 만들지 않게 autoIndex · autoCreate 를 끈다(strict false 라 새 칸도 그대로 읽힌다)
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
        days: [Number],
        channelIds: [String],
        minPeople: Number,
        live: Boolean,
        micOn: Boolean,
        dayMin: Number,
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
    new mongoose.Schema({ userId: String, date: String, questId: String, createdAt: Date }, readOnly)
  );

const PERIODS = QUEST_PERIODS;
const MODELS = { DailyQuest, QuestClaim, XpLog, UserXp, BotSetting, Purchase, WalletLog, Payout, ActivityStat, QuestPick };
// 반환: [{ period, name, reason, metric, unit, target, current, rewardXp, rewardPoint, done, claimed, claimable, ... }]
const questState = async (userId) => (await computeQuestState(MODELS, userId)).quests;

// ── KST 경계 — 다음 초기화 시각용(계산 쪽은 공용 블록) ──
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

// ── 표시 ──
const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
const esc = (s) => String(s || "").replace(/([\\*_~|`])/g, "\\$1");
const FIELD_MAX = 1000; // 필드 값 한도(1,024자) 안쪽

// 한 줄 — "`12/30회` 채팅 30회 · 1,500 XP · 빙옥 100" (사이트 화면과 같은 단위: 회 · 분 · 일 · 곳 · 건 · 개 · XP · 빙옥)
function questLine(q) {
  const unit = q.metric === "xp" ? " XP" : q.metric === "point" ? " 빙옥" : q.unit || (q.metric === "minute" ? "분" : "회");
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
