import mongoose from "mongoose";

// 📌 이벤트 패스 수령 기록 — 한 줄 = (유저 · 이벤트 키 · 종류 · 대상). (userId, eventKey, kind, ref) 유니크가 중복 수령의 마지막 방어선이다.
//    두 번 눌러도 · 동시에 보내도 두 번째 insert 가 11000(duplicate key)으로 튕긴다(QuestClaim · Achievement 와 같은 방식).
//    kind — "tier"   : 단계 받기(ref = tid). 줄을 먼저 넣고(자물쇠) 그다음 지급한다(lib/eventPass.js claimTier)
//           "part"   : 지급 도중 일부만 줬을 때 받은 보상 하나(ref = "t3#item:<id>" — lib/seasonPass.js rewardKeys). 단계 줄은 풀어 다시 받기가 남은 보상만 주게
//                      (시즌 패스의 부분 수령 표시 · 자물쇠 풀기와 같은 순서)
//    📌 2026-10-17 미션 폐지 — 예전 "mission" 줄이 남아 있어도 계산은 "tier" · "part" 만 읽는다(lib/eventPass.js computeState)
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — 모델을 불러오기만 해도 컬렉션 · 인덱스를 만들지 않게 autoCreate · autoIndex 를 끄고,
//       수령(쓰기) 직전에 createIndexes() 를 한 번 부른다(lib/eventPass.js ensureClaimIndexes — models/Achievement 와 같은 방식)
const EventPassClaimSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true }, // 디스코드 ID
    eventKey: { type: String, required: true }, // EventPass.key
    kind: { type: String, required: true, enum: ["tier", "part"] },
    ref: { type: String, required: true },
    level: { type: Number, default: 0 },        // tier — 받은 순간의 단계 번호(표시 · 감사용)
    labels: { type: [String], default: () => [] }, // 받은 보상 라벨(감사용)
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

// 중복 받기의 마지막 방어선 — 한 사람의 수령 목록 읽기(userId, eventKey, kind)도 이 인덱스의 앞머리로 읽는다
EventPassClaimSchema.index({ userId: 1, eventKey: 1, kind: 1, ref: 1 }, { unique: true });

export default mongoose.models.EventPassClaim || mongoose.model("EventPassClaim", EventPassClaimSchema);
