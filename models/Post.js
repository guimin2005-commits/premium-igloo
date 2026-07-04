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
  tournamentGame: { type: String, default: "" },   // 영문 부제 (예: LEAGUE OF LEGENDS)
  tournamentPrize: { type: String, default: "" },  // 보상 및 상금
  tournamentDate: { type: String, default: "" },   // 리그 일정 텍스트
  tournamentStatus: { type: String, default: "예정됨" }, // 진행중 / 예정됨 / 종료됨
  tournamentLink: { type: String, default: "" },   // 참가 신청 링크
  tournamentBracket: { type: String, default: "" },// 대진표 텍스트 (라운드명: / A vs B > 승자)
  tournamentWinner: { type: String, default: "" }, // 우승팀/우승자 (명예의 전당 표시용)

  recruitRole: { type: String, default: "" },
  recruitPeriod: { type: String, default: "" },
  recruitTasks: { type: String, default: "" },
  recruitQual: { type: String, default: "" },
  recruitExtra: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Post || mongoose.model("Post", PostSchema);