import mongoose from "mongoose";

const PostSchema = new mongoose.Schema({
  author: { type: String, required: true },
  category: { type: String, required: true },
  recruitSubCategory: { type: String, default: "staff" },
  title: { type: String, required: true },
  content: { type: String, default: "" },
  
  // 📌 공지사항 전용 데이터 항목 추가
  isImportant: { type: Boolean, default: false }, // 기존 데이터 호환용
  noticeTag: { type: String, default: "NONE" }, // "NONE", "필독", "중요"
  isPinned: { type: Boolean, default: false }, // 최상단 고정 여부
  
  eventTag: { type: String, default: "NONE" },
  bannerUrl: { type: String, default: "" },
  eventPeriod: { type: String, default: "" },

  // 📌 대회 전용 데이터 항목
  // ⚠️ tournamentType 은 남겨두되 새 글에서는 쓰지 않는다 — 대회 하나를 글 두 개로 쪼개던 원인.
  //    값이 없으면 아래 phase 를 이 값에서 유추한다 (모집→접수, 대진표→진행).
  tournamentType: { type: String, default: "모집" },
  // 📌 대회는 글 하나가 단계를 따라 진행된다: 접수 → 팀배정 → 연습 → 당일 → 종료
  tournamentPhase: { type: String, default: "" },
  tournamentTeamDay: { type: String, default: "" },  // 팀 배정일 (경매하는 날)
  tournamentEventDay: { type: String, default: "" }, // 대회 당일 (8강~결승을 하루에)
  tournamentAuctionId: { type: String, default: "" },// 팀을 만든 경매
  tournamentSchedule: {
    type: [{ label: String, start: String, end: String }], // 리그 상세 일정 (팀원 배정, 스크림, 본선 등)
    default: [],
  },
  tournamentGame: { type: String, default: "" },   // 영문 부제 (예: LEAGUE OF LEGENDS)
  tournamentPrize: { type: String, default: "" },  // 보상 및 상금
  tournamentDate: { type: String, default: "" },   // 리그 일정 텍스트
  tournamentStatus: { type: String, default: "예정됨" }, // 진행중 / 예정됨 / 종료됨
  tournamentLink: { type: String, default: "" },   // 참가 신청 링크
  tournamentBracket: { type: String, default: "" },// 대진표 텍스트 (라운드명: / A vs B > 승자)
  // 📌 대회 참가 설문 (구글폼 형식) — 질문/선택지/필수 여부
  survey: {
    enabled: { type: Boolean, default: false },
    title: { type: String, default: "" },
    desc: { type: String, default: "" },
    closed: { type: Boolean, default: false },   // 접수 마감
    questions: {
      type: [{
        qid: String,                              // 질문 고유 id
        type: { type: String, default: "short" }, // short(단답) / long(장문) / single(객관식) / multi(복수선택) / note(설명만)
        label: String,
        desc: { type: String, default: "" },      // 문항 부가 설명 (note 타입은 본문)
        required: { type: Boolean, default: false },
        options: { type: [String], default: [] }, // 객관식 선택지
        etc: { type: Boolean, default: false },   // '기타(직접 입력)' 허용
      }],
      default: [],
    },
  },
  tournamentWinner: { type: String, default: "" }, // 우승팀/우승자 (명예의 전당 표시용)
  tournamentWinnerId: { type: String, default: "" }, // 우승자 디스코드 사용자 ID (복사용)

  recruitRole: { type: String, default: "" },
  recruitPeriod: { type: String, default: "" },
  recruitTasks: { type: String, default: "" },
  recruitQual: { type: String, default: "" },
  recruitExtra: { type: String, default: "" },
  publishAt: { type: Date, default: null }, // 📌 예약 발행 시각 (null이면 즉시 공개)
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Post || mongoose.model("Post", PostSchema);