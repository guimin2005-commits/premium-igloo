import mongoose from "mongoose";

// 📌 유저 XP·레벨 — 봇이 적립(채팅/음성/출석), 사이트는 조회·연동에 사용
//    bot/src/db.js 의 UserXpSchema와 동일해야 함
const UserXpSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true }, // 디스코드 유저 ID
  username: { type: String, default: "" },
  displayName: { type: String, default: "" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  lastChatXpAt: { type: Date, default: null },
  lastAttendDate: { type: String, default: "" }, // "2026-07-05" (KST)
  attendCount: { type: Number, default: 0 },
  // 📌 POINT — 상점에서 XP 와 1:1 로 쓰는 소비 재화.
  //    레벨·등급에 영향을 주지 않으므로 봇 큐를 타지 않고 사이트가 직접 쓴다.
  point: { type: Number, default: 0 },
  // 승급 보상을 이미 지급한 최고 등급 인덱스 — 같은 등급에 두 번 주지 않기 위한 표시
  pointTierPaid: { type: Number, default: 0 },
  // 누적 음성 참여 시간(초) — 시즌이 바뀌어도 초기화하지 않는 통산 기록.
  // 봇이 음성 XP를 지급할 때 그 주기만큼 함께 더한다 (lib/season.js VOICE_TIME_START 이후부터).
  voiceSeconds: { type: Number, default: 0 },
  // 오늘(KST) 음성 누적 분 — 출석 자동 지급 판정용. 날짜가 바뀌면 봇이 리셋한다.
  voiceTodayMin: { type: Number, default: 0 },
  voiceTodayDate: { type: String, default: "" },
  // 📌 시즌 패스 — 새 재화를 만들지 않고 "이번 시즌에 번 XP"(xp - passBaseXp)를 진행도로 쓴다.
  //    XpLog 는 60일 TTL 이라 시즌 전체를 셀 수 없으므로, 시즌 시작 시점의 누적 XP를 찍어두고 뺀다.
  passSeason: { type: Number, default: 0 },        // SEASON.number 와 다르면 새 시즌 — 조회 시점에 다시 스냅샷한다
  passBaseXp: { type: Number, default: 0 },        // 시즌 시작 시점의 누적 XP
  passUnlocked: { type: Boolean, default: false }, // 프리미엄 트랙 해금 여부 (시즌마다 초기화)
  // 수령 기록은 티어의 안정 식별자(tid, "t1"·"t2" …)를 담는다. 인덱스로 담으면 시즌 도중
  // 티어를 중간에 추가할 때 뒤쪽이 밀려 이미 받은 보상을 다시 받을 수 있다 (models/SeasonPass.js 참고).
  passClaimedFree: { type: [String], default: [] }, // 수령한 무료 티어 tid
  passClaimedPaid: { type: [String], default: [] }, // 수령한 프리미엄 티어 tid
  // 사이트에서 XP·레벨을 바꿨을 때 봇이 레벨 역할을 다시 맞추도록 세우는 표시
  needsRoleSync: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.UserXp || mongoose.model("UserXp", UserXpSchema);
