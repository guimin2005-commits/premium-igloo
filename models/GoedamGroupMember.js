import mongoose from "mongoose";

// 📌 게임 그룹 지원 — 1인 1그룹 자물쇠(약속 문서 .claude/mockups/goedam-group/SPEC.md). 한 줄 = 그룹에 든 사람 한 명(그룹장 포함).
//    userId 유니크가 「1인당 그룹 1개(만들기 또는 참여)」의 마지막 방어선이다 — 만들기 · 참여는 이 줄을 먼저 넣고(겹치면 거절) 그룹을 고친다.
//    그룹 쓰기가 실패하면 넣은 줄을 지운다. 나가기 · 내보내기는 그 사람 줄을, 해체는 그 그룹 줄을 전부 지운다(lib/goedamGroup.js)
//    groupId — models/GoedamGroup _id 글자(24자)
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 처음 쓰기 직전에 createIndexes() 를 한 번 부른다(lib/goedamGroup.js ensureGroupIndexes)
const GoedamGroupMemberSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },  // 디스코드 ID
    groupId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

GoedamGroupMemberSchema.index({ userId: 1 }, { unique: true });
// 해체 때 그 그룹 줄을 한꺼번에 지운다
GoedamGroupMemberSchema.index({ groupId: 1 });

export default mongoose.models.GoedamGroupMember || mongoose.model("GoedamGroupMember", GoedamGroupMemberSchema);
