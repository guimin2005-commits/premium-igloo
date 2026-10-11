import mongoose from "mongoose";

// 📌 업적 기록 — 한 사람 · 한 업적에 한 줄(userId, key 유니크). 목록 · 보상 표는 lib/achievements.js, 쓰기는 app/api/xp/achievements 만.
//    · 조건을 채운 업적을 처음 본 순간(조회) 줄을 만든다(unlockedAt) — 그 뒤 값이 내려가도(랭킹 · 최근 70일 메시지 · 시즌마다 비는 칸) 깬 채로 남는다
//    · seenAt — 화면이 "새로 깬 업적"을 보여 준 뒤 적는다. claimedAt — 보상을 받은 시각({ claimedAt: null } 조건부로 한 번만)
//    · rewardXp · rewardPoint — 받을 때 실제로 준 값(표를 나중에 바꿔도 받은 기록은 그대로)
//    ⚠️ 실사이트(Vercel)만 쓴다 — 테스트 사이트는 같은 DB 를 읽기만 한다. 그래서 모델을 불러오기만 해도 컬렉션 · 인덱스를 만들지 않게
//       autoCreate · autoIndex 를 끄고, 실사이트 라우트가 처음 쓰기 전에 createIndexes() 를 한 번 부른다
const AchievementSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true }, // 디스코드 ID
    key: { type: String, required: true },    // 업적 key (lib/achievements.js — 한 번 정하면 안 바꾼다)
    unlockedAt: { type: Date, default: null },
    seenAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    rewardXp: { type: Number, default: 0 },
    rewardPoint: { type: Number, default: 0 },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

// 중복 깨기 · 중복 받기의 마지막 방어선
AchievementSchema.index({ userId: 1, key: 1 }, { unique: true });

export default mongoose.models.Achievement || mongoose.model("Achievement", AchievementSchema);
