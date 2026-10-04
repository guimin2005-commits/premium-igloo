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
  // 봇이 실제 접속 초를 20초마다 더한다(bot/src/features/voiceTime.js, 2026-10-03 — 그 전엔 음성 XP 주기마다 300초씩. lib/season.js VOICE_TIME_START 이후부터).
  voiceSeconds: { type: Number, default: 0 },
  // 오늘(KST) 음성 누적 분 — 출석 자동 지급 판정용. 날짜가 바뀌면 봇이 리셋한다.
  voiceTodayMin: { type: Number, default: 0 },
  voiceTodayDate: { type: String, default: "" },
  // 📌 진행 중인 음성 XP 바퀴 — 봇만 쓴다(bot/src/features/voiceTime.js). 사람마다 5분을 채우면 1회분, 못 채우고 나가면 머문 만큼 주고 지운다
  voiceCycle: { type: mongoose.Schema.Types.Mixed, default: undefined },
  // 📌 마지막 활동 시각 — 봇만 쓴다(bot/src/features/activity.js). 음성에 있는 동안의 마지막 채팅 · 음성 상태 바뀜 · 명령 · 버튼을 20초마다 적고 음성에서 나가면 비운다.
  //    봇이 재시작돼도 음성 XP 로그의 무활동(ctx.idle)을 이어 센다. bot/src/db.js 와 같은 칸
  lastActiveAt: { type: Date, default: null },
  // 📌 음성 XP 정지 — 관리자가 세운다(POST /api/admin/users/voice-stop). 켜져 있으면 봇이 이 사람의 음성 주기를 통째로 건너뛴다
  //    (음성 XP · voiceSeconds · 오늘 누적 분 · 자동 출석 · 하루 음성 효과). bot/src/db.js 와 같은 칸
  voiceXpOff: { type: Boolean, default: false },
  voiceXpOffAt: { type: Date, default: null },
  voiceXpOffBy: { type: String, default: "" }, // 세운 관리자 이름
  // 📌 XP 획득 중단 — 관리자가 세운다(POST /api/admin/users/xp-stop). 2026-10-04 운영자 "회수 + 타임아웃 3일 + 그 뒤 5일 전체 XP 획득 중단".
  //    xpStopFrom ≤ 지금 < xpStopUntil 이면 중단 중(끝나면 저절로 풀린다 · 시작 전이면 예약). 판정 · 문구는 lib/xpStop.js, 봇은 bot/src/xpStop.js.
  //    중단 중에는 봇이 채팅 · 음성(음성 시간 포함) · 출석 · 아이템 효과 · 지급 대기열의 자동 출처 XP 를 주지 않고 활동 횟수도 세지 않는다.
  //    사이트는 보상 받기를 막고(lib/xpStop.js denyIfXpStopped) 캐시백을 주지 않는다. 운영진 지급은 그대로. bot/src/db.js 와 같은 칸
  //    색인(xpStopUntil) — 봇이 60초마다 끝나지 않은 중단만 읽는다
  xpStopFrom: { type: Date, default: null },
  xpStopUntil: { type: Date, default: null, index: true },
  xpStopBy: { type: String, default: "" },     // 세운 관리자 이름
  xpStopReason: { type: String, default: "" }, // 사유(관리 화면에만)
  // 📌 아이템 효과(봇이 씀) — 효과별 "하루 1번" 기록("<roleId>:<effectId>" → 날짜) · 최고 도달 레벨(기록으로만 — 봇이 $max 로 적는다.
  //    2026-10-04 레벨 업 퀘스트는 이 값을 보지 않고 다시 오른 레벨도 매번 센다)
  effectDaily: { type: Map, of: String, default: {} },
  maxLevel: { type: Number, default: 0 },
  // 📌 시즌 패스 — 새 재화를 만들지 않고 "이번 시즌에 번 XP"(xp - passBaseXp)를 진행도로 쓴다.
  //    XpLog 는 TTL(100일)로 지워지므로 지난 기록에 기대지 않고, 시즌 시작 시점의 누적 XP를 찍어두고 뺀다.
  passSeason: { type: Number, default: 0 },        // SEASON.number 와 다르면 새 시즌 — 조회 시점에 다시 스냅샷한다
  passBaseXp: { type: Number, default: 0 },        // 시즌 시작 시점의 누적 XP
  passUnlocked: { type: Boolean, default: false }, // 프리미엄 트랙 해금 여부 (시즌마다 초기화)
  // 📌 고른 카드 스킨 — "" 안 고름(기본 카드 — 2026-10-04 자동 착용 없음) · "none" 끔(기본 카드) · 스킨 키. 인벤토리에서 착용 · 해제 (app/api/xp/card-skin)
  //    봇(bot/src/db.js)도 같은 칸 — 이미지 카드를 그릴 때 읽는다
  cardSkinPick: { type: String, default: "" },
  // 📌 단 프로필 배지 — 아이템 id 배열(최대 3). 칸이 없으면 안 고름(배지 없음 — 2026-10-04 자동 착용 없음), [] 는 전부 뗌.
  //    인벤토리에서 착용 · 해제 (app/api/xp/badge — 규칙은 lib/itemEffects pickBadges).
  //    default: undefined — 배열 칸은 기본값이 [] 라 그대로 두면 기존 유저가 "전부 뗌"이 된다. 봇(bot/src/db.js)도 같은 칸(/인벤토리 '착용' 표시에만 읽는다)
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
