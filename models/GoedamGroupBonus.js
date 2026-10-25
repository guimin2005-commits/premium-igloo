import mongoose from "mongoose";

// 📌 게임 그룹 지원 — 지원 보너스 추첨권 자물쇠(약속 문서 .claude/mockups/goedam-group/SPEC.md §6b). 한 줄 = 보너스를 받은 사람 한 명.
//    userId 유니크가 「1인 평생 1번」의 마지막 방어선이다 — 반려 뒤 다시 지원해도, 다른 그룹으로 다시 지원해도 또 안 준다.
//    지원하기(submit)가 성공하면 멤버마다 이 줄을 먼저 넣고(겹치면 이미 받음 → 건너뜀) 괴담회 추첨권 Purchase 를 넣는다(lib/goedamGroup.js grantApplyBonus).
//    추첨권을 못 넣으면(아이템 없음 · 꺼짐 · 오류) 그 사람 줄을 지운다 — 관리 › 그룹 지원 상세 「추첨권 다시 지급」(POST { action: "regrant", id })이 줄 없는 멤버에게 다시 준다
//    groupId — 보너스를 받은 그 그룹(models/GoedamGroup _id 글자 24자) · tickets — 그때 설정의 장 수(applyTickets) · grantedAt — 줄을 넣은 시각
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 처음 쓰기 직전에 createIndexes() 를 한 번 부른다(lib/goedamGroup.js ensureGroupIndexes)
const GoedamGroupBonusSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true }, // 디스코드 ID
    groupId: { type: String, required: true },
    tickets: { type: Number, default: 0 },
    grantedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

GoedamGroupBonusSchema.index({ userId: 1 }, { unique: true });

export default mongoose.models.GoedamGroupBonus || mongoose.model("GoedamGroupBonus", GoedamGroupBonusSchema);
