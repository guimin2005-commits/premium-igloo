import mongoose from "mongoose";

/* 📌 스크림 리그
   시즌(통합 시간 설정) → 팀 → 팀원 응답 → 확정 경기
   조율 기간·시간대는 팀마다 따로 두지 않고 시즌 하나로 통합해 관리한다.
   그래야 팀 간 교집합을 같은 격자 위에서 계산할 수 있다. */

const ScrimSeasonSchema = new mongoose.Schema({
  title: { type: String, default: "스크림 리그" },
  startAt: { type: Date, required: true },       // 조율 시작 날짜 (자정 기준)
  days: { type: Number, default: 7 },            // 조율 기간(일)
  fromHour: { type: Number, default: 19 },       // 하루 시작 시각
  toHour: { type: Number, default: 24 },         // 하루 종료 시각 (24 초과 = 익일)
  stepMin: { type: Number, default: 60 },        // 칸 단위(분): 60 또는 30
  dueAt: { type: Date, required: true },         // 응답 마감
  active: { type: Boolean, default: true },      // 현재 운영 중인 시즌 (하나만 true)
  createdAt: { type: Date, default: Date.now },
});

const ScrimTeamSchema = new mongoose.Schema({
  seasonId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  tag: { type: String, default: "" },            // 엠블럼에 쓰는 3글자 태그
  color: { type: String, default: "#7dd3fc" },   // 팀 고유 색
  auctionId: { type: String, default: "" },      // 경매에서 만들어진 팀이면 원본 id
  members: {
    type: [{
      discordId: { type: String, default: "" },
      name: { type: String, default: "" },
      pos: { type: String, default: "" },
      leader: { type: Boolean, default: false },
    }],
    default: [],
  },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// 개인 응답 — 시즌·팀·유저 조합당 1건
const ScrimAvailabilitySchema = new mongoose.Schema({
  seasonId: { type: String, required: true, index: true },
  teamId: { type: String, required: true, index: true },
  userId: { type: String, required: true },      // 디스코드 ID
  userName: { type: String, default: "" },
  slots: { type: [String], default: [] },        // "YYYY-MM-DD|분" 형태
  updatedAt: { type: Date, default: Date.now },
});
ScrimAvailabilitySchema.index({ seasonId: 1, teamId: 1, userId: 1 }, { unique: true });

const ScrimFixtureSchema = new mongoose.Schema({
  seasonId: { type: String, required: true, index: true },
  teamAId: { type: String, required: true },
  teamBId: { type: String, required: true },
  at: { type: Date, required: true },            // 경기 시각
  usCount: { type: Number, default: 0 },         // 확정 시점의 양 팀 가능 인원 (기록용)
  themCount: { type: Number, default: 0 },
  // 결과 — winnerId 가 비어 있으면 아직 안 치른 경기, "draw" 면 무승부
  winnerId: { type: String, default: "" },
  scoreA: { type: Number, default: 0 },
  scoreB: { type: Number, default: 0 },
  note: { type: String, default: "" },
  createdBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

export const ScrimSeason = mongoose.models.ScrimSeason || mongoose.model("ScrimSeason", ScrimSeasonSchema);
export const ScrimTeam = mongoose.models.ScrimTeam || mongoose.model("ScrimTeam", ScrimTeamSchema);
export const ScrimAvailability = mongoose.models.ScrimAvailability || mongoose.model("ScrimAvailability", ScrimAvailabilitySchema);
export const ScrimFixture = mongoose.models.ScrimFixture || mongoose.model("ScrimFixture", ScrimFixtureSchema);
