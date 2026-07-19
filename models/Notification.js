import mongoose from "mongoose";

// 📌 관리자 → 특정 유저 알림(사이트 알림함의 원본)
//  · 사이트 알림함이 본문/기록의 원본이며, 디스코드 DM은 "새 알림 도착" 핑 용도
const NotificationSchema = new mongoose.Schema({
  recipientName: { type: String, required: true, index: true }, // 디스코드 닉네임(수신자)
  recipientId: { type: String, index: true },                   // 디스코드 ID (조회되면 DM/매칭에 사용)
  type: { type: String, default: "안내" },                       // 경고 | 제재 | 안내 | 축하 | 일반
  title: { type: String, required: true },
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  dmSent: { type: Boolean, default: false },                    // 디스코드 DM 발송 성공 여부
  sentBy: { type: String },                                     // 발송한 관리자 닉네임
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
