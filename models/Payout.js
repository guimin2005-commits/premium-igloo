import mongoose from "mongoose";

const PayoutSchema = new mongoose.Schema({
  userName: { type: String, required: true },  // 지급 대상 디스코드 닉네임
  userId: { type: String, default: "" },        // 디스코드 고유 ID (슬래시 멘션용)
  amount: { type: Number, required: true },      // 지급할 XP 수량
  reason: { type: String, default: "" },         // 지급 사유 (예: 친구 초대 보상)
  source: { type: String, default: "etc" },      // referral | code | manual | etc
  status: { type: String, default: "pending" },  // pending | paid
  // 📌 지급 재화 — "xp"(봇 큐가 반영) | "point"(빙옥, 사이트가 즉시 반영하고 paid 로만 남긴다). bot/src/db.js 와 같아야 한다
  currency: { type: String, default: "xp" },
  // 📌 기록 종류 — "reset" 은 초기화 기록. 원장(/api/xp/ledger)은 이 줄을 보이지 않는다. 비어 있으면 보통 지급. bot/src/db.js 와 같아야 한다
  //    · 관리자 초기화(app/api/xp/grant mode reset) — source 는 그대로 "manual" 이라 관리자 지급 이력 · 패스 기준선 셈은 예전과 같다
  //    · 퇴장 초기화(봇 bot/src/features/leaveReset.js) — source "etc" · 금액 0 · by "bot". 이번 달 랭킹이 그 시각까지를 0 으로 친다
  kind: { type: String, default: "" },
  // 📌 처리한 관리자 이름 — 감사용(퇴장 초기화는 "bot"). 유저 화면(원장 · 봇 DM)에는 내보내지 않는다(사유 문구에도 넣지 않는다)
  by: { type: String, default: "" },
  // 📌 시즌 패스 가속(아이템 효과 passBoost) — 이 지급과 함께 passBaseXp 를 낮춘 폭(진행도에만 더해진 XP). 없으면 0.
  //    봇 지급 대기열의 퀘스트 보상(source "quest")만 붙는다(bot/src/features/grantQueue.js — 2026-10-04, 운영진 지급은 빼고). XpLog.passBoost 와 같은 뜻.
  //    시즌 기준선을 로그로 되짚을 때(lib/season.js passEarnedPipelines · 봇 views/pass.js) amount 와 함께 더해야 가속분이 사라지지 않는다. bot/src/db.js 와 같은 칸
  passBoost: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
});

// 📌 내 XP · 빙옥 내역(/api/xp/ledger)과 관리자 유저 조회가 한 사람의 지급 기록을 최신순으로 읽는다 — 없으면 매번 전체를 훑는다
PayoutSchema.index({ userId: 1, status: 1, paidAt: -1 });

export default mongoose.models.Payout || mongoose.model("Payout", PayoutSchema);
