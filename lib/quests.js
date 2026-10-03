import DailyQuest from "@/models/DailyQuest";
import QuestClaim from "@/models/QuestClaim";
import XpLog from "@/models/XpLog";
import UserXp from "@/models/UserXp";
import BotSetting from "@/models/BotSetting";
import Purchase from "@/models/Purchase";
import WalletLog from "@/models/WalletLog";
import Payout from "@/models/Payout";
import ActivityStat from "@/models/ActivityStat";
import QuestPick from "@/models/QuestPick";
import { computeQuestState, pickQuests as pickQuestsCore, QUEST_PERIODS } from "@/lib/questKinds";

// 📌 퀘스트 진행도 — 계산은 lib/questKinds.js 공용 블록의 computeQuestState 하나(봇 /퀘스트도 같은 블록 사본을 쓴다).
//    여기는 사이트 모델을 넘겨 주는 자리다. 조회(GET)와 수령 검증(POST)이 반드시 이 함수를 같이 쓴다

// 📌 내장 출석 퀘스트의 고정 id — 관리자가 만든 퀘스트(_id)와 절대 겹치지 않는 문자열
export const ATTEND_QUEST_ID = "attend-daily";

export const PERIODS = QUEST_PERIODS;
export const pickQuests = pickQuestsCore;
export const PERIOD_LABEL = { daily: "일일", weekly: "주간", monthly: "월간" };

const MODELS = { DailyQuest, QuestClaim, XpLog, UserXp, BotSetting, Purchase, WalletLog, Payout, ActivityStat, QuestPick };

export function getQuestState(userId) {
  return computeQuestState(MODELS, userId);
}
