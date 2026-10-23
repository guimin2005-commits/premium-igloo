import mongoose from "mongoose";

// 📌 괴담회 회차별 머문 시간 — 한 줄 = (이벤트 키 · 회차 · 유저). 봇이 스테이지 채널 입 · 퇴장과 20초 반영으로 seconds 를 $inc(upsert)한다
//    (bot/src/features/goedamWatch.js — 회차 창 [startsAt, endsAt] 과 겹친 초만, 잠깐 나갔다 와도 합산).
//    지급 — 회차 끝 + 60초가 지나면 봇이 seconds ≥ ratio × 회차 길이 이고 grantedAt: null 인 줄을 { grantedAt: null } 조건부로 세운 뒤 추첨권 Purchase N건을 넣는다.
//    관리자 수동 지급(app/api/admin/goedam/grant)도 같은 조건으로 세운다(manual: true) — 봇 · 관리자 중 한쪽만 이긴다
//    ⚠️ 봇 bot/src/db.js 에 같은 칸 · 같은 유니크가 있어야 한다
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 사이트가 쓰기(수동 지급) 직전에 createIndexes() 를 한 번 부른다(lib/goedam.js ensureGoedamIndexes)
const GoedamWatchSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true }, // Goedam.key
    sid: { type: String, required: true },      // Goedam.screenings[].sid
    userId: { type: String, required: true },   // 디스코드 ID
    userName: { type: String, default: "" },
    seconds: { type: Number, default: 0 },      // 회차 창 안에서 머문 초 합
    grantedAt: { type: Date, default: null },   // 추첨권을 준 시각(null = 아직)
    granted: { type: Number, default: 0 },      // 준 장 수
    manual: { type: Boolean, default: false },  // 관리자 수동 지급
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

// 한 회차에 한 사람 한 줄 — 회차 명단 읽기(eventKey, sid)도 이 인덱스의 앞머리로 읽는다
GoedamWatchSchema.index({ eventKey: 1, sid: 1, userId: 1 }, { unique: true });

export default mongoose.models.GoedamWatch || mongoose.model("GoedamWatch", GoedamWatchSchema);
