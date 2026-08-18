import mongoose from "mongoose";

// 📌 선수 경매 시스템
const LeaderSchema = new mongoose.Schema({
  name: { type: String, required: true },        // 리더 이름
  discordId: { type: String, default: "" },      // 디스코드 ID (프로필 표시 + 자동 역할 매칭)
  position: { type: String, default: "" },       // 리더 본인 슬롯: 탱커/딜러/힐러 (탱커면 1페이즈 참가 불가)
  points: { type: Number, default: 100000 },
  ready: { type: Boolean, default: false },           // 리더 준비 완료 여부 (전원 준비 시 시작 가능)
  positionChanged: { type: Boolean, default: false }, // 포지션 체인지 1회 사용 여부 (경매 진행 중 사용, 종료 후 불가)
  selfPosChanged: { type: Boolean, default: false },   // 리더 본인 포지션 재지정 1회 사용 여부
  invExtra: { type: Number, default: 0 },             // 인벤토리 플러스로 늘린 추가 칸 수
  roster: {
    type: [{
      playerIdx: Number,   // players 배열 인덱스 (-1 = 리더 본인)
      slot: String,        // 배정 슬롯: 탱커/딜러/힐러 등 게임 역할
      price: Number,
      golden: Boolean,     // 황금카드(올포지션) 낙찰 여부
    }],
    default: [],
  },
  // 📌 인벤토리 모드: 낙찰했지만 아직 슬롯 미배정인 선수 카드(소지)
  inventory: {
    type: [{
      playerIdx: Number,
      price: Number,
      golden: Boolean,
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
  mostChampions: { type: [String], default: [] }, // 모스트 챔피언(롤 등, 스카우터로만 공개)
  isAllPos: { type: Boolean, default: false },   // 황금카드 (올 포지션)
  phase: { type: Number, default: 2 },           // 1 = 탱커 가능, 2 = 일반(+황금카드)
  status: { type: String, default: "대기" },      // 대기/경매중/배정중/낙찰/유찰
  soldTo: { type: Number, default: null },
  soldPrice: { type: Number, default: null },
  scoutedBy: { type: [Number], default: [] },
}, { _id: false });

const AuctionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  game: { type: String, default: "오버워치" },     // 종목 (오버워치/롤/발로란트/배그/커스텀)
  isTest: { type: Boolean, default: false },      // 테스트 방 (관리자 전용 · 목록/화면에 표기)
  isPrivate: { type: Boolean, default: false },   // 비공개 방 (목록에 뜨지 않는다 · 링크로만 입장)
  status: { type: String, default: "준비중" },     // 준비중/진행중/종료
  phase: { type: Number, default: 0 },            // 0 = 시작 전, 1 = 1페이즈, 2 = 2페이즈
  settings: {
    leaderPoints: { type: Number, default: 100000 },
    basePrice: { type: Number, default: 1000 },
    goldenBasePrice: { type: Number, default: 4000 },
    scoutCost: { type: Number, default: 2000 },
    goldenScoutCost: { type: Number, default: 4000 }, // 황금카드 스카우터 비용 (모스트만 공개)
    ownedScoutCost: { type: Number, default: 2900 },  // 낙찰 후 뒤늦게 쓰는 스카우터 — 경매 중보다 비싸다
    ownedGoldenScoutCost: { type: Number, default: 4900 }, // 낙찰 후 스카우터 — 황금카드(올 포지션)
    posChangeCost: { type: Number, default: 10000 },
    invCapacity: { type: Number, default: 1 },    // 인벤토리 기본 용량(칸). 초과 소지 시 배정 전까지 입찰 불가
    invPlusCost: { type: Number, default: 5000 }, // 인벤토리 플러스 — 용량 +1칸 구매 비용
    minIncrement: { type: Number, default: 100 },
    timerSeconds: { type: Number, default: 15 },
    scoutSeconds: { type: Number, default: 7 },   // 호명 후 공식 스카우터 타임(초)
    // 📌 일반화된 역할/슬롯 (게임별). 비어 있으면 아래 legacy 슬롯으로 해석(하위호환)
    roles: { type: [{ name: String, count: Number }], default: [] },
    phase1Role: { type: String, default: "" },    // 선경매(1페이즈) 포지션. 빈 값이면 단일 페이즈
    assignMode: { type: String, default: "instant" }, // instant(즉시 배정) / inventory(인벤토리 후 배정)
    reveal: { type: [String], default: ["mainPos", "subPos"] }, // 스카우터 공개 정보 (mainPos/subPos/champions)
    // legacy (오버워치 전용) — 하위호환용
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
  // 낙찰 후 리더의 슬롯 배정 대기 상태
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
  assignUntil: { type: Date, default: null },     // 인벤토리 모드: 팀원 배정 시간 종료 시각
  log: { type: [{ t: Date, msg: String }], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Auction || mongoose.model("Auction", AuctionSchema);
