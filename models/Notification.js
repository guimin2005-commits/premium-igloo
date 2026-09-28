import mongoose from "mongoose";

// 📌 관리자 → 특정 유저 알림(사이트 알림함의 원본)
//  · 사이트 알림함이 본문/기록의 원본이며, 디스코드 DM은 "새 알림 도착" 핑 용도
const NotificationSchema = new mongoose.Schema({
  recipientName: { type: String, required: true, index: true }, // 디스코드 사용자명(수신자) — 표시용
  // 📌 디스코드 ID — 발송 때 반드시 채운다(app/api/notifications). 내 알림은 ID 로 찾고, ID 가 없는 옛 문서만 이름으로 찾는다
  recipientId: { type: String, index: true },
  type: { type: String, default: "안내" },                       // 경고 | 제재 | 안내 | 축하 | 일반
  title: { type: String, required: true },
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  dmSent: { type: Boolean, default: false },                    // 디스코드 DM 발송 성공 여부
  sentBy: { type: String },                                     // 발송한 관리자 닉네임
  // 📌 유저가 알림함에서 '전체 삭제'한 시각 — 기록은 지우지 않고 유저 화면에서만 뺀다.
  //    경고 · 제재 발송 기록이 유저 손으로 사라지면 안 된다. 관리자 발송 이력(?sent=1)에는 그대로 남는다.
  hiddenAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
