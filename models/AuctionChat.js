import mongoose from "mongoose";

// 📌 경매장 실시간 채팅
const AuctionChatSchema = new mongoose.Schema({
  auctionId: { type: String, required: true, index: true },
  userName: { type: String, default: "" },
  avatar: { type: String, default: "" },
  message: { type: String, required: true },
  isSystem: { type: Boolean, default: false }, // 입찰/낙찰 시스템 메시지
  createdAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.models.AuctionChat || mongoose.model("AuctionChat", AuctionChatSchema);
