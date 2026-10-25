import mongoose from "mongoose";

// 📌 게임 그룹 지원 — 문화상품권 번호 풀(약속 문서 .claude/mockups/goedam-group/SPEC.md). 한 줄 = 번호 한 장.
//    관리자가 붙여 넣은 번호(app/api/admin/goedam/groups POST codes-add — 없는 것만 넣는다)를 승인이 { groupId: null } 조건부로 멤버마다 하나씩 잡는다(lib/goedamGroup.js approveGroup).
//    groupId null = 아직 안 나감 · groupId = models/GoedamGroup _id 글자 · userId = 받은 멤버 디스코드 ID · assignedAt = 잡은 시각.
//    승인이 번호가 모자라 거절되면 그 그룹에 잡은 번호를 되돌린다(null). 배정된 번호는 지우지 않는다(code-delete 는 배정 안 된 것만)
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 쓰기 직전에 createIndexes() 를 한 번 부른다(lib/goedamGroup.js ensureGroupIndexes)
const GoedamGiftCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    groupId: { type: String, default: null },
    userId: { type: String, default: null },
    assignedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

GoedamGiftCodeSchema.index({ code: 1 }, { unique: true });
// 남은 번호 잡기(groupId null · 먼저 넣은 것부터) · 그룹의 번호 찾기
GoedamGiftCodeSchema.index({ groupId: 1, createdAt: 1 });
// 📌 한 그룹 · 한 멤버에 번호 한 장 — 승인을 두 번 눌러도(동시에 보내도) 같은 사람에게 두 장 잡히지 않는다. 배정된 줄만 센다(groupId 가 글자일 때)
GoedamGiftCodeSchema.index({ groupId: 1, userId: 1 }, { unique: true, partialFilterExpression: { groupId: { $type: "string" } } });

export default mongoose.models.GoedamGiftCode || mongoose.model("GoedamGiftCode", GoedamGiftCodeSchema);
