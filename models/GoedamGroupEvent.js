import mongoose from "mongoose";

// 📌 게임 그룹 지원(방구석 심야 괴담회 — 2026-10-25 운영자 결정, 약속 문서 .claude/mockups/goedam-group/SPEC.md) 설정 — 관리자가 등록하는 단일 문서(key "goedam-group" — lib/goedamGroup.js GROUP_KEY).
//    켜기(enabled) · 기간 [startsAt, endsAt) · 최소/최대 인원 · 지원 보너스 추첨권 장 수(applyTickets). 문서가 없으면 기본값(꺼짐 · 10. 25. 00:00 ~ 11. 9. 00:00 KST · 4 · 10 · 5장 — lib/goedamGroup.js GROUP_DEFAULTS)
//    📌 이 문서는 늘 .lean() 으로 읽고 lib/goedamGroup.js 의 normalizeGroupConfig 를 거친다(스키마로 되살려 쓰지 않는다 — 친구 초대와 같은 규칙)
//    그룹은 models/GoedamGroup · 1인 1그룹 자물쇠는 models/GoedamGroupMember · 문화상품권 번호 풀은 models/GoedamGiftCode. 사이트 전용(봇은 읽지 않는다)
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 관리자 저장(쓰기) 직전에 createIndexes() 를 한 번 부른다(lib/goedamGroup.js ensureGroupIndexes)
const GoedamGroupEventSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    // 관리자가 켜기 전에는 노출하지 않는다(관리자 미리보기만)
    enabled: { type: Boolean, default: false },
    // 만들기 · 참여 · 지원은 [startsAt, endsAt) 안에서만 — 끝 시각은 들어가지 않는다(11. 6. 00:00 KST 면 11. 5. 23:59:59 까지)
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    minMembers: { type: Number, default: 4 },  // 지원할 수 있는 최소 인원(2~20)
    maxMembers: { type: Number, default: 10 }, // 한 그룹 최대 인원(최소 인원~50)
    // 📌 지원 보너스 — 지원하기가 성공하면 멤버 전원에게 괴담회 추첨권 이만큼(0~20 · 0 = 안 줌 · 1인 평생 1번 — models/GoedamGroupBonus)
    applyTickets: { type: Number, default: 5 },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

GoedamGroupEventSchema.index({ key: 1 }, { unique: true });

export default mongoose.models.GoedamGroupEvent || mongoose.model("GoedamGroupEvent", GoedamGroupEventSchema);
