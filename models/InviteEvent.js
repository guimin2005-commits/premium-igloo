import mongoose from "mongoose";

// 📌 친구 초대(상시 이벤트 — 2026-10-25 운영자 결정, 약속 문서 scratchpad/invite/SPEC.md) 설정 — 관리자가 등록하는 단일 문서(key "invite" — lib/invite.js INVITE_KEY).
//    끝 시각이 없다(상시) — 켜기(enabled) · 시작 시각(startsAt)만. 코드 입력 조건(가입 후 일수 · 계정 나이) · 괴담회 추첨권 보너스(기간제 덤) · 누적 보상 단계를 담는다.
//    보상 kind 는 이벤트 패스(models/EventPass)와 같다 — xp | point(빙옥) | role | item(days > 0 이면 기간제). 단계 need = 누적 초대 수(1명 · 3명 …)
//    📌 이 문서는 늘 .lean() 으로 읽고 lib/invite.js 의 normalizeInviteConfig 를 거친다(스키마로 되살려 쓰지 않는다 — 이벤트 패스와 같은 규칙)
//    수령 기록은 models/InviteClaim · 초대 한 건은 models/InviteUse · 내 코드는 models/InviteCode
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 관리자 저장(쓰기) 직전에 createIndexes() 를 한 번 부른다(lib/invite.js ensureInviteIndexes)
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
    // 📌 tid — 단계의 안정 식별자("t1", "t2" …). 수령 기록(InviteClaim.ref)이 이 값을 담는다. 한 번 붙은 tid 는 바꾸지도 다시 쓰지도 않는다(이벤트 패스와 같다)
    tid: { type: String, default: "" },
    level: { type: Number, default: 1 }, // 1..N — 저장할 때 need 순서대로 다시 매긴다(표시용)
    need: { type: Number, default: 0 },  // 이 단계에 닿는 데 필요한 누적 초대 수(1 이상 · 단계마다 다르게 — 관리자 저장이 막는다)
    free: { type: [RewardSchema], default: () => [] }, // 최대 4개(lib/seasonPass.js MAX_REWARDS)
  },
  { _id: false }
);

// 📌 괴담회 추첨권 보너스 — 덤(기간제). 켜져 있고 끝 시각 전이고 괴담회 추첨이 닫히기 전이면 초대 한 건마다 초대한 사람 inviter 장 · 들어온 친구 invitee 장
const BonusSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    endsAt: { type: Date, default: null }, // 끝 시각은 들어가지 않는다(11. 9. 00:00 KST 면 11. 8. 23:59:59 까지)
    inviter: { type: Number, default: 2 },
    invitee: { type: Number, default: 1 },
  },
  { _id: false }
);

const InviteEventSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    // 관리자가 켜기 전에는 노출하지 않는다(관리자 미리보기만)
    enabled: { type: Boolean, default: false },
    // 이 시각부터 코드를 넣을 수 있다 — 이 시각 전에 서버에 들어온 사람 · 이 시각 전 XP 기록이 있는 사람은 「새 멤버」가 아니다
    startsAt: { type: Date, default: null },
    joinDays: { type: Number, default: 7 },    // 서버 가입 후 이 일수 안에만 넣는다(0 = 기한 없음)
    accountDays: { type: Number, default: 7 }, // 디스코드 계정이 이 일수 이상 된 사람만(0 = 조건 없음)
    bonus: { type: BonusSchema, default: () => ({}) },
    // 📌 들어온 친구 보상(2026-10-26) — 코드를 넣자마자 넣은 사람이 받는 묶음(최대 4개). 기본값 없음(undefined) —
    //    칸이 없는 문서는 lib/invite.js INVITE_DEFAULTS.welcome(5만 XP)으로 읽고, 빈 배열은 「보상 없음」 그대로 남는다(암묵 [] 로 덮이지 않게)
    welcome: { type: [RewardSchema], default: undefined },
    // 단계는 need 오름차순으로만 저장된다(정렬 · 검증은 lib/invite.js · app/api/admin/invite)
    tiers: { type: [TierSchema], default: [] },
    // 다음에 발급할 번호 — 지운 단계의 id 를 다시 쓰지 않으려고 문서에 들고 다닌다(EventPass.nextTid 와 같은 이유)
    nextTid: { type: Number, default: 1 },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

InviteEventSchema.index({ key: 1 }, { unique: true });

export default mongoose.models.InviteEvent || mongoose.model("InviteEvent", InviteEventSchema);
