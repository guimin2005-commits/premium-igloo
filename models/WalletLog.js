import mongoose from "mongoose";

// 📌 XP·빙옥 입출금 원장(보충분) — 다른 기록에 남지 않는 움직임만 쓴다.
//    채팅·음성·출석 XP 는 XpLog, 운영진 지급·패스·퀘스트 보상은 Payout, 상점 결제·환불은 Purchase 가 이미 센다.
//    여기는 강화 비용 · 패스 해금 비용 · 승급 빙옥(lib/points) · 연속 출석 보너스 등. 같은 움직임을 두 곳에 쓰지 않는다.
//    기록은 lib/wallet.js(사이트) · bot/src/wallet.js(봇)의 logWallet 으로만. bot/src/db.js 의 WalletLogSchema 와 같아야 한다
const WalletLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },   // 디스코드 ID — 아래 (userId, createdAt) 인덱스의 앞머리로 조회된다
  currency: { type: String, default: "xp" },   // "xp" | "point"(빙옥)
  amount: { type: Number, default: 0 },        // + 들어옴 / - 나감
  // enhance | pass-unlock | pass-point | tier-point | attend-point | streak | quest-point | admin | etc
  kind: { type: String, default: "etc" },
  label: { type: String, default: "" },        // 내역에 그대로 보이는 한 줄
  refId: { type: String, default: "" },        // 관련 문서 id (선택)
  meta: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true },
});
// 내 내역 — userId 로 최신순
WalletLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.WalletLog || mongoose.model("WalletLog", WalletLogSchema);
