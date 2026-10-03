import mongoose from "mongoose";

// 📌 XP 지급 로그 — 봇이 기록, 레벨 대시보드(로그 탭)·월간 랭킹에서 사용
//    60일 후 자동 삭제 (TTL 인덱스, DB 용량 보호 / 월간 집계에 한 달치가 온전히 남도록)
const XpLogSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  displayName: { type: String, default: "" },
  amount: { type: Number, default: 0 },
  reason: { type: String, default: "" },      // "chat" | "voice" | "attend"
  channelId: { type: String, default: "" },
  channelName: { type: String, default: "" },
  // 📌 채널의 카테고리(스레드는 부모 채널의 카테고리) — 퀘스트 채널 조건이 카테고리로도 맞추게(2026-10-03부터, 봇 bot/src/xp.js). bot/src/db.js 와 같은 칸
  pc: { type: String, default: "" },
  // 📌 스레드에서 받은 채팅이면 그 부모 채널(아니면 칸 없음) — 퀘스트 채널 조건 · 채널 수가 부모로 센다(lib/questKinds.js). bot/src/db.js 와 같은 칸
  pt: { type: String },
  // 📌 음성 지급 줄에만 — 그 주기의 음성 상황(봇 features/voiceXp.js). 예전 줄 · 채팅 · 출석 줄에는 없다. bot/src/db.js 와 같은 칸
  //    n: 그 채널의 봇 아닌 사람 수(본인 포함) · mute: 마이크 꺼짐(본인 · 서버) · deaf: 헤드셋 꺼짐(본인 · 서버)
  //    live: 화면 공유 · 캠 · idle: 마지막 활동(채팅 · 음성 상태 바뀜 · 명령 · 버튼) 뒤 지난 분
  ctx: {
    n: Number,
    mute: Boolean,
    deaf: Boolean,
    live: Boolean,
    idle: Number,
  },
  // 📌 음성 지급 줄에만 — 그 주기(초, 봇 bot/src/xp.js). 관리 › 이상 활동이 로그마다 센다(lib/adminActivity.js). bot/src/db.js 와 같은 칸
  sec: { type: Number },
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 60 } },
});

export default mongoose.models.XpLog || mongoose.model("XpLog", XpLogSchema);
