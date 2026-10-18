import mongoose from "mongoose";

// 📌 이벤트 패스 설정 — 관리자가 등록하는 단일 문서(key: 이벤트 키 "ghost-2026" — lib/eventPass.js EVENT_PASS_KEY). 시즌 패스(models/SeasonPass)와 같은 방식.
//    진행도 = 패스 XP = 이벤트 기간에 번 XP 만(시즌 패스와 같은 셈). 📌 2026-10-17 미션 폐지 — 예전 문서에 남은 missions · nextMid 는 읽지 않는다(normalizeEventConfig).
//    트랙은 무료 하나뿐(프리미엄 없음). 보상 kind 는 시즌 패스와 같다 — xp | point(빙옥) | role | item(days > 0 이면 기간제)
//    📌 이 문서는 늘 .lean() 으로 읽고 lib/eventPass.js 의 normalizeEventConfig 를 거친다(스키마로 되살려 쓰지 않는다 — 시즌 패스와 같은 규칙)
//    수령 기록은 이 문서가 아니라 models/EventPassClaim(유저 · 이벤트 키 · 종류 · 대상 유니크)에 남는다
const RewardSchema = new mongoose.Schema(
  {
    kind: { type: String, default: "none", enum: ["none", "xp", "point", "role", "item"] },
    amount: { type: Number, default: 0 },    // xp · point 일 때 지급량
    roleId: { type: String, default: "" },   // role 일 때 지급할 역할
    roleName: { type: String, default: "" }, // 표시용 스냅샷
    itemId: { type: String, default: "" },   // item 일 때 지급할 아이템(models/Item)
    itemName: { type: String, default: "" }, // 표시용 스냅샷(관리자 저장 때 실사이트 이름으로 채운다)
    days: { type: Number, default: 0 },      // item 일 때 기간(일) — 0 = 무기한. 상한은 lib/seasonPass.js 의 MAX_REWARD_DAYS
  },
  { _id: false }
);

const TierSchema = new mongoose.Schema(
  {
    // 📌 tid — 단계의 안정 식별자("t1", "t2" …). 수령 기록(EventPassClaim.ref)이 이 값을 담는다.
    //    시즌 패스 tid 와 같은 이유로 인덱스 · level 을 쓰지 않고, 한 번 붙은 tid 는 바꾸지도 다시 쓰지도 않는다(lib/eventPass.js normalizeEventTiers)
    tid: { type: String, default: "" },
    level: { type: Number, default: 1 }, // 1..N — 저장할 때 need 순서대로 다시 매긴다(표시용)
    need: { type: Number, default: 0 },  // 이 단계에 닿는 데 필요한 누적 패스 XP
    free: { type: [RewardSchema], default: () => [] }, // 최대 4개(lib/seasonPass.js MAX_REWARDS)
  },
  { _id: false }
);

const EventPassSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  // 관리자가 켜기 전에는 노출하지 않는다 — 시즌 패스와 같은 기본 꺼짐
  enabled: { type: Boolean, default: false },
  title: { type: String, default: "" },
  // 기간 — [startsAt, endsAt). 끝 시각은 들어가지 않는다(2026-11-01 00:00 KST 면 10. 31. 23:59:59 까지)
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  // 단계는 need 오름차순으로만 저장된다(정렬 · 검증은 lib/eventPass.js)
  tiers: { type: [TierSchema], default: [] },
  // 다음에 발급할 번호 — 지운 단계의 id 를 다시 쓰지 않으려고 문서에 들고 다닌다(SeasonPass.nextTid 와 같은 이유)
  nextTid: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.EventPass || mongoose.model("EventPass", EventPassSchema);
