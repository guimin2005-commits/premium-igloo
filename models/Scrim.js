import mongoose from "mongoose";

/* 📌 대회 룸 (구 스크림 리그)
   ⚠️ 컬렉션 이름(Scrim*)은 그대로 둔다 — 바꾸면 이미 쌓인 문서와 끊긴다.
   화면과 경로는 '대회 룸'으로 부르고, 저장소 이름만 과거를 유지한다.
  
   시즌(통합 시간 설정) → 팀 → 팀원 응답 → 확정 경기
   조율 기간·시간대는 팀마다 따로 두지 않고 시즌 하나로 통합해 관리한다.
   그래야 팀 간 교집합을 같은 격자 위에서 계산할 수 있다. */

const ScrimSeasonSchema = new mongoose.Schema({
  title: { type: String, default: "대회 룸" },
  tournamentId: { type: String, default: "" },  // 연동한 대회 글 id (겹치는 대회가 없으므로 하나만 활성)
  notice: { type: String, default: "" },        // 룸 상단에 띄우는 운영 공지
  startAt: { type: Date, required: true },       // 조율 시작 날짜 (자정 기준)
  days: { type: Number, default: 7 },            // 조율 기간(일)
  fromHour: { type: Number, default: 19 },       // 하루 시작 시각
  toHour: { type: Number, default: 24 },         // 하루 종료 시각 (24 초과 = 익일)
  stepMin: { type: Number, default: 60 },        // 칸 단위(분): 60 또는 30
  dueAt: { type: Date, required: true },         // 응답 마감
  active: { type: Boolean, default: true },      // 현재 운영 중인 시즌 (하나만 true)
  /* 📌 미제출자 DM 재촉 — 자동으로 돌리지 않고 사람이 눌러서 보낸다.
     네 칸 모두 비우면 기본 문구로 돌아간다 (lib/nudgeMessage.js) */
  nudge: {
    title: { type: String, default: "" },        // 임베드 제목
    message: { type: String, default: "" },      // 임베드 본문
    footer: { type: String, default: "" },       // 임베드 아래 작은 글씨
    cta: { type: String, default: "" },          // 링크 버튼 문구
  },
  // 경기 일정 알림 문구 — 비면 기본 문구 (lib/nudgeMessage.js 의 FIXTURE_DEFAULTS)
  fixtureMsg: {
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    footer: { type: String, default: "" },
    cta: { type: String, default: "" },
  },
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
  intro: { type: String, default: "" },        // 팀 소개 — 룸 상단에 한 문단
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
  kind: { type: String, default: "scrim" },      // scrim(연습) / official(공식)
  at: { type: Date, required: true },            // 경기 시각
  usCount: { type: Number, default: 0 },         // 확정 시점의 양 팀 가능 인원 (기록용)
  themCount: { type: Number, default: 0 },
  // 📌 이 경기에 쓸 수 있는 용병 수 (팀당). 0이면 용병 없이 치른다.
  mercs: { type: Number, default: 0 },
  // 결과 — winnerId 가 비어 있으면 아직 안 치른 경기, "draw" 면 무승부
  winnerId: { type: String, default: "" },
  scoreA: { type: Number, default: 0 },
  scoreB: { type: Number, default: 0 },
  note: { type: String, default: "" },
  createdBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});


/* 📌 대회 공지 — 사이트 소식(Notice)과는 다른 개념이다.
   소식은 서버 전체에 알리는 글이고, 이건 이 대회에 참가한 팀만 보는 운영 공지다.
   공개 날짜를 따로 두어 미리 써두고 그날부터 뜨게 할 수 있다. */
const ScrimNoticeSchema = new mongoose.Schema({
  seasonId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, default: "" },
  pinned: { type: Boolean, default: false },    // 룸 상단 고정
  important: { type: Boolean, default: false }, // 중요 표시(붉게)
  publishAt: { type: Date, default: Date.now }, // 이 시각부터 팀에 보인다
  authorName: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

/* 📌 DM 재촉 대기열
   사이트는 디스코드로 DM 을 못 보낸다. 보낼 것을 여기 쌓아두면 봇이 가져가 보낸다.
   (상점 역할 지급이 Purchase 를 통해 도는 것과 같은 방식) */
const ScrimNudgeSchema = new mongoose.Schema({
  seasonId: { type: String, required: true, index: true },
  teamId: { type: String, default: "" },
  teamName: { type: String, default: "" },
  userId: { type: String, required: true, index: true }, // 디스코드 ID
  userName: { type: String, default: "" },
  kind: { type: String, default: "manual" },             // manual(사람이 누름) | test(시험 발송)
  // 무엇을 알리는 DM 인가 — nudge(캘린더 재촉) | fixture(확정된 경기)
  type: { type: String, default: "nudge" },
  fixtureId: { type: String, default: "" },              // 같은 경기를 두 번 알리지 않도록
  oppName: { type: String, default: "" },                // 상대 팀
  matchKind: { type: String, default: "" },              // scrim | official
  at: { type: Date, default: null },                     // 경기 시각
  // 보낼 때의 문구를 그대로 굳혀 둔다 — 나중에 설정을 바꿔도 이미 보낸 건 안 흔들린다
  title: { type: String, default: "" },
  message: { type: String, default: "" },
  footer: { type: String, default: "" },
  cta: { type: String, default: "" },
  url: { type: String, default: "" },                    // 팀 룸 바로가기 (임베드 버튼)
  dueAt: { type: Date, default: null },                  // 보낼 때의 마감 시각 (임베드에 표시)
  // 📌 예약 발송 — 비어 있으면 바로, 시각이 있으면 그때가 지나야 봇이 가져간다
  sendAt: { type: Date, default: null, index: true },
  status: { type: String, default: "pending", index: true }, // pending | sent | failed
  error: { type: String, default: "" },
  byName: { type: String, default: "" },                 // 수동일 때 누른 사람
  createdAt: { type: Date, default: Date.now, index: true },
  sentAt: { type: Date, default: null },
});

export const ScrimSeason = mongoose.models.ScrimSeason || mongoose.model("ScrimSeason", ScrimSeasonSchema);
export const ScrimNudge = mongoose.models.ScrimNudge || mongoose.model("ScrimNudge", ScrimNudgeSchema);
export const ScrimTeam = mongoose.models.ScrimTeam || mongoose.model("ScrimTeam", ScrimTeamSchema);
export const ScrimAvailability = mongoose.models.ScrimAvailability || mongoose.model("ScrimAvailability", ScrimAvailabilitySchema);
export const ScrimFixture = mongoose.models.ScrimFixture || mongoose.model("ScrimFixture", ScrimFixtureSchema);
export const ScrimNotice = mongoose.models.ScrimNotice || mongoose.model("ScrimNotice", ScrimNoticeSchema);
