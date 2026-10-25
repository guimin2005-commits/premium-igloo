import mongoose from "mongoose";

// 📌 게임 그룹 지원 — 한 줄 = 그룹 하나(약속 문서 .claude/mockups/goedam-group/SPEC.md). 만들기 · 참여 · 나가기 · 내보내기 · 지원 · 심사는 전부 lib/goedamGroup.js 가 한다.
//    code — 참여 코드 6자(lib/invite.js CODE_ALPHABET 글자판 · 겹치면 다시 뽑는다). 참여 링크 = /level?gg=CODE
//    members — 멤버 0번 = 그룹장(leaderId 와 같은 사람). 한 사람은 그룹 하나에만(models/GoedamGroupMember 자물쇠가 먼저 막는다)
//    status — open(모집 중) → review(심사 중 — 멤버 · 내용 변경 · 나가기 · 해체 막음) → approved(승인 — 멤버마다 문화상품권 번호, models/GoedamGiftCode) | rejected(반려 — reason · 고쳐서 다시 지원)
//    ⚠️ 화면(유저 API)에는 멤버 디스코드 ID 를 내보내지 않는다 — mid(lib/goedamGroup.js memberMid)로 가리킨다
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 처음 쓰기 직전에 createIndexes() 를 한 번 부른다(lib/goedamGroup.js ensureGroupIndexes)
const MemberSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true }, // 디스코드 ID
    name: { type: String, default: "" },      // 표시 이름 스냅샷(참여한 순간)
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const GoedamGroupSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },     // 대문자 6자
    name: { type: String, required: true },     // 그룹 이름 1~20자
    game: { type: String, required: true },     // 함께 할 게임 1~30자
    when: { type: Date, default: null },        // 언제(선택)
    leaderId: { type: String, required: true }, // 그룹장 디스코드 ID(= members[0].userId)
    members: { type: [MemberSchema], default: [] },
    status: { type: String, default: "open", enum: ["open", "review", "approved", "rejected"] },
    reason: { type: String, default: "" },      // 반려 사유(지원하면 비운다)
    submittedAt: { type: Date, default: null }, // 마지막으로 지원한 시각
    reviewedAt: { type: Date, default: null },  // 승인 · 반려한 시각
    reviewedBy: { type: String, default: "" },  // 승인 · 반려한 관리자 이름
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

GoedamGroupSchema.index({ code: 1 }, { unique: true });
// 관리 목록(심사 중 먼저 · 최근 순)
GoedamGroupSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.GoedamGroup || mongoose.model("GoedamGroup", GoedamGroupSchema);
