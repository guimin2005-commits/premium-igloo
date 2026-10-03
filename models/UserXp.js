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
  // 📌 연속 출석 — 봇 claimAttendance(bot/src/attend.js)가 씀. 어제 출석이면 +1, 끊기면 1 부터
  attendStreak: { type: Number, default: 0 },     // 지금 연속 일수
  attendBestStreak: { type: Number, default: 0 }, // 최고 연속 일수
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
  // 📌 음성 XP 정지 — 관리자가 세운다(POST /api/admin/users/voice-stop). 켜져 있으면 봇이 이 사람의 음성 주기를 통째로 건너뛴다
  //    (음성 XP · voiceSeconds · 오늘 누적 분 · 자동 출석 · 하루 음성 효과). bot/src/db.js 와 같은 칸
  voiceXpOff: { type: Boolean, default: false },
  voiceXpOffAt: { type: Date, default: null },
  voiceXpOffBy: { type: String, default: "" }, // 세운 관리자 이름
  // 📌 아이템 효과(봇이 씀) — 효과별 "하루 1번" 기록("<roleId>:<effectId>" → 날짜) · 최고 도달 레벨(레벨업 효과 중복 방지)
  effectDaily: { type: Map, of: String, default: {} },
  maxLevel: { type: Number, default: 0 },
  // 📌 시즌 패스 — 새 재화를 만들지 않고 "이번 시즌에 번 XP"(xp - passBaseXp)를 진행도로 쓴다.
  //    XpLog 는 60일 TTL 이라 시즌 전체를 셀 수 없으므로, 시즌 시작 시점의 누적 XP를 찍어두고 뺀다.
  passSeason: { type: Number, default: 0 },        // SEASON.number 와 다르면 새 시즌 — 조회 시점에 다시 스냅샷한다
  passBaseXp: { type: Number, default: 0 },        // 시즌 시작 시점의 누적 XP
  passUnlocked: { type: Boolean, default: false }, // 프리미엄 트랙 해금 여부 (시즌마다 초기화)
  // 📌 고른 카드 스킨 — "" 안 고름(가진 스킨 중 관리자 순서상 첫 번째) · "none" 끔(기본 카드) · 스킨 키. 인벤토리에서 착용 · 해제 (app/api/xp/card-skin)
  //    봇(bot/src/db.js)도 같은 칸 — 이미지 카드를 그릴 때 읽는다
  cardSkinPick: { type: String, default: "" },
  // 📌 단 프로필 배지 — 아이템 id 배열(최대 3). 칸이 없으면 안 고름(가진 배지 중 관리자 순서상 앞의 3개), [] 는 전부 뗌.
  //    인벤토리에서 착용 · 해제 (app/api/xp/badge — 규칙은 lib/itemEffects pickBadges).
  //    default: undefined — 배열 칸은 기본값이 [] 라 그대로 두면 기존 유저가 "전부 뗌"이 된다. 봇(bot/src/db.js)도 같은 칸(읽지는 않는다)
  badgePick: { type: [String], default: undefined },
  // 해금 때 낸 값 — 관리자 테스트 초기화(app/api/xp/reset)가 이만큼 돌려준다. 시즌이 바뀌면 함께 비운다
  passUnlockPaid: {
    method: { type: String, default: "" }, // "xp" | "point"
    amount: { type: Number, default: 0 },
  },
  // 수령 기록은 티어의 안정 식별자(tid, "t1"·"t2" …)를 담는다. 인덱스로 담으면 시즌 도중
  // 티어를 중간에 추가할 때 뒤쪽이 밀려 이미 받은 보상을 다시 받을 수 있다 (models/SeasonPass.js 참고).
  passClaimedFree: { type: [String], default: [] }, // 수령한 무료 티어 tid
  passClaimedPaid: { type: [String], default: [] }, // 수령한 프리미엄 티어 tid
  // 사이트에서 XP·레벨을 바꿨을 때 봇이 레벨 역할을 다시 맞추도록 세우는 표시
  needsRoleSync: { type: Boolean, default: false },
  // 📌 강화 단계 — 채팅 XP 구간·음성 XP 가산을 올린 횟수. **영구** 값이라 시즌 롤오버
  //    (lib/seasonPass getPassState)·관리자 초기화(app/api/xp/grant reset)의 $set 목록에 넣지 않는다.
  //    비용·효과 공식은 lib/enhance.js, 소비는 app/api/xp/enhance, 지급 반영은 봇 chatXp/voiceXp.
  chatEnhance: { type: Number, default: 0 },
  voiceEnhance: { type: Number, default: 0 },
  // 강화에 실제로 낸 값 누적 — 관리자 테스트 초기화(app/api/xp/reset)가 단계를 0 으로 되돌릴 때 이만큼 돌려준다
  enhancePaid: {
    xp: { type: Number, default: 0 },
    point: { type: Number, default: 0 },
  },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.UserXp || mongoose.model("UserXp", UserXpSchema);
