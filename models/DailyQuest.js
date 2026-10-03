import mongoose from "mongoose";

// 📌 일일 퀘스트 정의 — 관리자가 /admin/bot?tab=quests 에서 직접 등록·수정한다.
//    진행도는 XpLog(봇이 기록하는 XP 지급 로그)의 기간(KST) 분량으로 서버에서 계산한다(lib/quests.js).
//    남는 기록(XpLog · UserXp 연속 출석 · Purchase · WalletLog · Payout · QuestClaim)과 봇이 세는 활동 횟수(ActivityStat — 2026-10-03)가 퀘스트 대상이다.
const DailyQuestSchema = new mongoose.Schema({
  name: { type: String, required: true },              // "첫 대화"
  // 주기 — daily(매일) / weekly(매주 월요일) / monthly(매월 1일) 초기화
  period: { type: String, default: "daily", enum: ["daily", "weekly", "monthly"] },
  desc: { type: String, default: "" },                 // 유저에게 보여줄 한 줄 설명
  // 무엇을 세는가 — chat · voice · attend · effect · any 는 XpLog.reason(effect 는 effect-levelup 포함, "any"는 사유 무관 전체).
  //   📌 2026-10 추가: streak(연속 출석) · shop(ARCTIC 구매) · enhance(강화) · pass(시즌 패스 보상) — 어디서 세는지는 lib/questKinds.js
  //   📌 2026-10-03 추가: 봇이 세는 활동(act — ActivityStat) msg · reply · replied · mention · react · reacted · threadmsg · threadnew · sticker · cmd · vjoin · levelup,
  //      퀘스트 완료(quest — QuestClaim). 목록 · 뜻은 lib/questKinds.js QUEST_REASONS 하나
  reason: {
    type: String,
    default: "chat",
    enum: [
      "chat", "voice", "attend", "effect", "any", "streak", "shop", "enhance", "pass", "quest",
      "msg", "reply", "replied", "mention", "react", "reacted", "threadmsg", "threadnew", "sticker", "cmd", "vjoin", "levelup",
    ],
  },
  // 세는 방식 — count: 지급 건수 / xp: XP 합계 / minute: 실제 접속 분 / day: 서로 다른 날 수(KST)
  //   minute 은 음성에만 의미가 있다 — 음성 지급 줄마다 실제 머문 초(XpLog.sec)가 있어 그 합 ÷ 60 이 곧 접속 시간이다(2026-10-04 — 사람마다 5분 · 못 채우면 머문 만큼).
  //   음성 count 는 머문 초 ÷ 지급 주기, day · run · channel 은 그 날 · 채널에 1회분 이상 머문 것만 센다(lib/questKinds.js questMeasure)
  //   대상마다 고를 수 있는 방식은 lib/questKinds.js QUEST_REASONS.metrics (저장 때 normalizeQuestCond 가 맞춘다)
  //   📌 2026-10-03 추가: run(가장 길게 이어진 날 수) · channel(서로 다른 채널 수) · point(ARCTIC 에서 쓴 빙옥)
  metric: { type: String, default: "count", enum: ["count", "xp", "minute", "day", "run", "channel", "point"] },
  // 📌 시간대(선택 · KST 시) — 로그 대상(채팅 · 음성 · 출석 · 효과 · 전체)만. from > to 면 자정을 넘는 구간(22~2). 둘 다 null 이면 하루 종일
  hourFrom: { type: Number, default: null, min: 0, max: 23 },
  hourTo: { type: Number, default: null, min: 0, max: 24 },
  // 📌 2026-10-03 조건 칸 — 저장 정리는 lib/questKinds.js normalizeQuestCond(대상에 맞지 않는 칸은 비운다)
  days: { type: [Number], default: [] }, // 요일(0 일 … 6 토) — 비우면 매일 · 로그 · 활동 대상만
  channelIds: { type: [String], default: [] }, // 채널 · 카테고리 id(최대 20) — 비우면 모든 채널 · 채널이 남는 대상만
  minPeople: { type: Number, default: 0 }, // 음성 — 그 채널 인원(본인 포함) N명 이상일 때만(0 = 조건 없음)
  live: { type: Boolean, default: false }, // 음성 — 화면 공유 · 캠을 켠 때만
  micOn: { type: Boolean, default: false }, // 음성 — 마이크 · 헤드셋을 켠 때만
  dayMin: { type: Number, default: 0 }, // 일수 — 하루에 이만큼 이상인 날만 센다(음성은 분, 나머지는 횟수 · 0 = 기록만 있으면)
  target: { type: Number, default: 1, min: 1 },        // 목표치
  rewardXp: { type: Number, default: 0, min: 0 },      // 달성 보상 (0이면 보상 없는 목표)
  rewardPoint: { type: Number, default: 0, min: 0 },     // 달성 시 주는 POINT (지급 때 아이템 퀘스트 보너스만 더한다 — 등급 배율 없음)
  rewardPassPoint: { type: Number, default: 0, min: 0 }, // 시즌 패스 진행도
  enabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 },                 // 표시 순서 (작을수록 위)
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.DailyQuest || mongoose.model("DailyQuest", DailyQuestSchema);
