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
import { addPoints } from "@/lib/points";
import { logWallet } from "@/lib/wallet";

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

// 📌 퀘스트 바꾸기(리롤) — 규칙 · 저장은 공용 블록 computeQuestState 의 "바꾸기". dry 면 저장하지 않고 바뀐 모습만(테스트 사이트).
//    paid — 유료 회차에 이미 뺀 빙옥(그 주기 값과 같아야 진행 — 아니면 402). 빙옥을 빼고 되돌리는 순서는 아래 rerollQuestPaid
export function rerollQuest(userId, questId, { dry = false, paid = 0 } = {}) {
  return computeQuestState(MODELS, userId, { reroll: String(questId || ""), dry, paid });
}

const pointOf = (doc) => (doc ? Math.max(0, Math.floor(Number(doc.point) || 0)) : null);

// 📌 바꾸기 + 빙옥(2026-10-11 "무료 다 쓰면 그다음부터 유료") — 라우트(app/api/xp/quests POST { reroll })가 부른다. 화면은 확인 창 없이 바로 부른다.
//    1) getQuestState 로 그 퀘스트 주기의 다음 값(pool[주기].reroll.price — 남은 무료가 있으면 0)을 본다.
//       바꿀 수 없는 줄(목록에 없음 · 달성 · 받음 · 후보 없음 · 다 씀)은 빼지 않고 바꾸기에 넘겨 그쪽 거절 이유를 그대로 돌려준다
//    2) dry(테스트 사이트 — 실사이트와 같은 DB): 빼지 않는다. 값이 있으면 잔액(UserXp.point)이 모자랄 때만 409, 아니면 바뀐 모습(paid: 값)
//    3) 실사이트: 값이 있으면 먼저 조건부 차감(addPoints −값 — 잔액이 모자라면 null → 409, 원장은 아직 안 남김). 그다음 바꾸기(paid: 값).
//       바꾸기가 거절(rerollError)되거나 던지면 뺀 만큼 되돌린다(동시에 두 번 눌러 한쪽이 409 인 경우 등).
//       바꾸기가 실제로 받은 값(rerolled.cost)이 뺀 값보다 작으면(그사이 주기가 바뀌어 무료가 됨) 차이를 되돌린다.
//       성공이면 원장(WalletLog) kind "quest-reroll" 한 줄 — "일일 퀘스트 바꾸기: 옛 이름 → 새 이름"
//    📌 expectedPoint — 화면이 보여 준 이번 값(pool[주기].reroll.price). 유료 회차(값 > 0)는 이 값이 같을 때만 뺀다(상점 expectedPrice · 강화 expectedCost 와 같은 가드).
//       다른 가드와 달리 값이 없으면 빼지 않는다(402 code PRICE_REQUIRED) — 값을 보여 주지 않는 화면(무료만 알던 레벨 화면)에서 누르거나,
//       다른 탭에서 무료를 먼저 써 이 화면은 아직 무료로 아는 채 누르면 모르는 사이 빠졌다. 다르면 409 code PRICE_CHANGED. 무료 회차는 보지 않는다
//    반환 { ok: true, data } · { ok: false, status, error, code?, data } — data 는 퀘스트 상태(성공이면 + balance { point }, dry 는 뺐을 때의 잔액)
//    deps — 검사용 바꿔 끼우기(state · reroll · take · refund · balance · log). take/refund 는 반영된 지갑 문서({ point }) 또는 null
export async function rerollQuestPaid(userId, questId, { dry = false, expectedPoint, deps = {} } = {}) {
  const D = {
    state: getQuestState,
    reroll: rerollQuest,
    take: (u, n) => addPoints(u, -n),
    refund: (u, n) => addPoints(u, n),
    balance: async (u) => pointOf((await UserXp.findOne({ userId: u }, { point: 1 }).lean()) || { point: 0 }),
    log: logWallet,
    ...deps,
  };
  const id = String(questId || "").trim();
  // 빈 id 는 바꾸기 없는 조회가 되어 성공처럼 보인다 — 먼저 거절
  if (!id) return { ok: false, status: 400, error: "퀘스트를 지정해 주세요." };
  const strip = (r) => {
    const { rerollError, ...data } = r;
    return data;
  };
  const refused = (r) =>
    r?.rerollError
      ? { ok: false, status: r.rerollError.status, error: r.rerollError.error, data: strip(r) }
      : { ok: false, status: 500, error: "퀘스트를 바꾸지 못했습니다.", data: r ? strip(r) : undefined };
  const short = (data) => ({ ok: false, status: 409, error: "빙옥이 부족합니다.", data });
  const readBalance = () => Promise.resolve().then(() => D.balance(userId)).catch(() => null);

  const state = await D.state(userId);
  const row = (state?.quests || []).find((q) => q.id === id);
  const price = row ? Math.max(0, Math.floor(Number(state.pool?.[row.period]?.reroll?.price) || 0)) : 0;
  const cost = row?.rerollable ? price : 0;
  if (cost > 0 && Number(expectedPoint) !== cost) {
    const none = expectedPoint == null || String(expectedPoint).trim() === "";
    return none
      ? { ok: false, status: 402, code: "PRICE_REQUIRED", error: `빙옥 ${cost.toLocaleString("ko-KR")}개가 필요합니다.`, data: state }
      : { ok: false, status: 409, code: "PRICE_CHANGED", error: "바꾸기 값이 바뀌었습니다. 다시 확인해 주세요.", data: state };
  }

  if (dry) {
    let bal = null;
    if (cost > 0) {
      bal = await D.balance(userId);
      if (!(bal >= cost)) return short({ ...state, balance: { point: bal ?? 0 } });
    }
    const r = await D.reroll(userId, id, { dry: true, paid: cost });
    if (r?.rerollError || !r?.rerolled) return refused(r);
    if (bal == null) bal = await readBalance();
    const used = Math.max(0, Number(r.rerolled?.cost) || 0);
    return { ok: true, data: { ...r, ...(bal != null ? { balance: { point: Math.max(0, bal - used) } } : {}) } };
  }

  // 되돌리기 — 실패하면 한 번 더. 그래도 안 되면 크게 남긴다(빙옥이 빠진 채로 남는다)
  const giveBack = async (n) => {
    for (let i = 0; i < 2; i++) {
      try {
        const doc = await D.refund(userId, n);
        if (doc) return pointOf(doc);
      } catch (e) {
        if (i === 1) console.error(`퀘스트 바꾸기 환불 실패 (${userId} 빙옥 ${n}):`, e);
      }
    }
    console.error(`퀘스트 바꾸기 환불 실패 (${userId} 빙옥 ${n}) — 직접 확인 필요`);
    return null;
  };

  let charged = 0;
  let bal = null;
  if (cost > 0) {
    const doc = await D.take(userId, cost);
    if (!doc) return short(state);
    charged = cost;
    bal = pointOf(doc);
  }
  let r;
  try {
    r = await D.reroll(userId, id, { paid: charged });
  } catch (e) {
    if (charged) await giveBack(charged);
    throw e;
  }
  if (r?.rerollError || !r?.rerolled) {
    if (charged) await giveBack(charged);
    return refused(r);
  }
  const used = Math.min(charged, Math.max(0, Number(r.rerolled?.cost) || 0));
  if (charged > used) bal = (await giveBack(charged - used)) ?? bal;
  if (used > 0) {
    const rd = r.rerolled;
    await Promise.resolve()
      .then(() => D.log({
        userId,
        currency: "point",
        amount: -used,
        kind: "quest-reroll",
        label: `${PERIOD_LABEL[rd.period] || "일일"} 퀘스트 바꾸기: ${rd.from?.name || ""} → ${rd.to?.name || ""}`,
        meta: { period: rd.period, from: rd.from?.id || "", to: rd.to?.id || "" },
      }))
      .catch(() => null);
  }
  if (bal == null) bal = await readBalance();
  return { ok: true, data: { ...r, ...(bal != null ? { balance: { point: bal } } : {}) } };
}
