import mongoose from "mongoose";

// 📌 선수 경매 시스템
const LeaderSchema = new mongoose.Schema({
  name: { type: String, required: true },        // 팀장(리더) 이름
  discordId: { type: String, default: "" },
  position: { type: String, default: "" },       // 리더 본인 슬롯: 탱커/딜러/힐러 (탱커면 1페이즈 참가 불가)
  points: { type: Number, default: 100000 },
  positionChanged: { type: Boolean, default: false }, // 경매 종료 후 1회 포지션 체인지 사용 여부
  roster: {
    type: [{
      playerIdx: Number,   // players 배열 인덱스
      slot: String,        // 배정 슬롯: 탱커/딜러/힐러
      price: Number,
      golden: Boolean,     // 황금카드(올포지션) 낙찰 여부
    }],
    default: [],
  },
}, { _id: false });

const PlayerSchema = new mongoose.Schema({
  alias: { type: String, required: true },       // 익명 닉네임
  peakTier: { type: String, default: "" },       // 최고 티어 (공개)
  currentTier: { type: String, default: "" },    // 현재 티어 (공개)
  mainPos: { type: String, default: "" },        // 주 포지션 (스카우터로만 공개)
  subPos: { type: String, default: "" },         // 부 포지션 (스카우터로만 공개)
  isAllPos: { type: Boolean, default: false },   // 황금카드 (올 포지션)
  phase: { type: Number, default: 2 },           // 1 = 탱일까아닐까, 2 = 일반(+황금카드)
  status: { type: String, default: "대기" },      // 대기/경매중/낙찰/유찰
  soldTo: { type: Number, default: null },        // 낙찰 리더 인덱스
  soldPrice: { type: Number, default: null },
  scoutedBy: { type: [Number], default: [] },     // 스카우터 사용한 리더 인덱스
}, { _id: false });

const AuctionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  status: { type: String, default: "준비중" },     // 준비중/진행중/종료
  settings: {
    leaderPoints: { type: Number, default: 100000 },   // 리더 시작 포인트
    basePrice: { type: Number, default: 1000 },        // 기본 시작가
    goldenBasePrice: { type: Number, default: 4000 },  // 황금카드 시작가
    scoutCost: { type: Number, default: 2000 },        // 스카우터 비용
    posChangeCost: { type: Number, default: 10000 },   // 포지션 체인지 비용
    minIncrement: { type: Number, default: 100 },      // 최소 입찰 단위
    timerSeconds: { type: Number, default: 15 },       // 입찰 카운트다운(초)
    slotTank: { type: Number, default: 1 },            // 팀당 탱커 슬롯
    slotDealer: { type: Number, default: 2 },          // 딜러 슬롯
    slotHealer: { type: Number, default: 2 },          // 힐러 슬롯
  },
  leaders: { type: [LeaderSchema], default: [] },
  players: { type: [PlayerSchema], default: [] },
  current: {
    playerIdx: { type: Number, default: null },
    price: { type: Number, default: 0 },
    leaderIdx: { type: Number, default: null },  // 현재 최고 입찰 리더
    endsAt: { type: Date, default: null },
    isAllin: { type: Boolean, default: false },
  },
  // 낙찰 후 팀장의 슬롯 배정 대기 상태
  pendingAssign: {
    playerIdx: { type: Number, default: null },
    leaderIdx: { type: Number, default: null },
    price: { type: Number, default: null },
  },
  log: { type: [{ t: Date, msg: String }], default: [] }, // 입찰/시스템 로그 (최근 100개)
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Auction || mongoose.model("Auction", AuctionSchema);
