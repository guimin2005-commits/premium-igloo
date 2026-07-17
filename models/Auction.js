import mongoose from "mongoose";

// 📌 선수 경매 시스템
const LeaderSchema = new mongoose.Schema({
  name: { type: String, required: true },        // 팀장(리더) 이름
  discordId: { type: String, default: "" },      // 디스코드 ID (프로필 표시 + 자동 역할 매칭)
  position: { type: String, default: "" },       // 리더 본인 슬롯: 탱커/딜러/힐러 (탱커면 1페이즈 참가 불가)
  points: { type: Number, default: 100000 },
  positionChanged: { type: Boolean, default: false }, // 경매 종료 후 1회 포지션 체인지 사용 여부
  roster: {
    type: [{
      playerIdx: Number,   // players 배열 인덱스 (-1 = 팀장 본인)
      slot: String,        // 배정 슬롯: 탱커/딜러/힐러
      price: Number,
      golden: Boolean,     // 황금카드(올포지션) 낙찰 여부
    }],
    default: [],
  },
}, { _id: false });

const PlayerSchema = new mongoose.Schema({
  alias: { type: String, required: true },       // 익명 닉네임
  discordId: { type: String, default: "" },      // 디스코드 ID (낙찰 후 프로필 공개용)
  revealed: { type: Boolean, default: false },   // 프로필 공개 여부
  peakTier: { type: String, default: "" },       // 최고 티어
  currentTier: { type: String, default: "" },    // 현재 티어
  mainPos: { type: String, default: "" },        // 주 포지션 (스카우터로만 공개)
  subPos: { type: String, default: "" },         // 부 포지션 (스카우터로만 공개)
  isAllPos: { type: Boolean, default: false },   // 황금카드 (올 포지션)
  phase: { type: Number, default: 2 },           // 1 = 탱커 가능, 2 = 일반(+황금카드)
  status: { type: String, default: "대기" },      // 대기/경매중/배정중/낙찰/유찰
  soldTo: { type: Number, default: null },
  soldPrice: { type: Number, default: null },
  scoutedBy: { type: [Number], default: [] },
}, { _id: false });

const AuctionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  status: { type: String, default: "준비중" },     // 준비중/진행중/종료
  phase: { type: Number, default: 0 },            // 0 = 시작 전, 1 = 1페이즈, 2 = 2페이즈
  settings: {
    leaderPoints: { type: Number, default: 100000 },
    basePrice: { type: Number, default: 1000 },
    goldenBasePrice: { type: Number, default: 4000 },
    scoutCost: { type: Number, default: 2000 },
    posChangeCost: { type: Number, default: 10000 },
    minIncrement: { type: Number, default: 100 },
    timerSeconds: { type: Number, default: 15 },
    scoutSeconds: { type: Number, default: 7 },   // 호명 후 공식 스카우터 타임(초)
    slotTank: { type: Number, default: 1 },
    slotDealer: { type: Number, default: 2 },
    slotHealer: { type: Number, default: 2 },
  },
  leaders: { type: [LeaderSchema], default: [] },
  players: { type: [PlayerSchema], default: [] },
  current: {
    playerIdx: { type: Number, default: null },
    price: { type: Number, default: 0 },
    leaderIdx: { type: Number, default: null },
    endsAt: { type: Date, default: null },
    scoutUntil: { type: Date, default: null },    // 스카우터 타임 종료 시각 (이 전엔 입찰 불가)
    isAllin: { type: Boolean, default: false },
  },
  // 낙찰 후 팀장의 슬롯 배정 대기 상태
  pendingAssign: {
    playerIdx: { type: Number, default: null },
    leaderIdx: { type: Number, default: null },
    price: { type: Number, default: null },
  },
  // 황금카드 초과 배정 후, 기존 선수를 옮겨야 하는 상태
  pendingOverflow: {
    leaderIdx: { type: Number, default: null },
    slot: { type: String, default: null },
  },
  reveal: {
    playerIdx: { type: Number, default: null },   // 메인 화면 프로필 공개 대상
  },
  strategyUntil: { type: Date, default: null },   // 전략 타임 종료 시각
  log: { type: [{ t: Date, msg: String }], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Auction || mongoose.model("Auction", AuctionSchema);
