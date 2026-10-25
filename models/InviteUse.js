import mongoose from "mongoose";

// 📌 친구 초대 한 건 — 한 줄 = 들어온 친구(invitee) 한 사람. inviteeId 유니크가 「계정당 평생 한 번」의 마지막 방어선이다
//    (두 번 눌러도 · 동시에 보내도 두 번째 insert 가 11000 으로 튕긴다 — lib/invite.js redeemInvite).
//    초대한 사람의 누적 수 = 이 줄을 inviterId 로 센 수(누적 보상 단계 — lib/invite.js). 지우지 않는다(퇴장해도 그대로)
//    추첨권 보너스 — ticketsGrantedAt 을 { ticketsGrantedAt: null } 조건부로 세운 요청 하나만 추첨권 Purchase 를 넣는다(괴담회 GoedamWatch.grantedAt 과 같은 자물쇠).
//      넣기에 실패하면 표시를 되돌린다(관리 › 친구 초대 › 초대 기록의 「다시 지급」). 보너스 기간 밖에 들어온 줄은 ticketsGrantedAt null 그대로 +
//      ticketsSkipped 에 까닭(대상 아님) — 못 준 줄(미지급)과 갈라 미지급 수 · 「다시 지급」에서 뺀다(lib/invite.js redeemInvite · getInviteAdmin · regrantInvite)
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 처음 쓰기 직전에 createIndexes() 를 한 번 부른다(lib/invite.js ensureInviteIndexes)
const InviteUseSchema = new mongoose.Schema(
  {
    inviteeId: { type: String, required: true }, // 코드를 넣은 사람(디스코드 ID)
    inviteeName: { type: String, default: "" },
    inviterId: { type: String, required: true }, // 코드 주인(디스코드 ID)
    inviterName: { type: String, default: "" },
    code: { type: String, default: "" },         // 넣은 코드(그 순간의 코드 — 감사용)
    joinedAt: { type: Date, default: null },     // 들어온 친구의 서버 가입 시각(디스코드 joined_at — 넣은 순간 값)
    at: { type: Date, default: Date.now },       // 넣은 시각
    ticketsGrantedAt: { type: Date, default: null }, // 추첨권 보너스를 준 시각(null = 아직 · 보너스 밖)
    ticketsSkipped: { type: String, default: null },  // 추첨권 대상 아님 까닭 — "off"(넣은 순간 보너스가 안 돎) · "zero"(줄 장 수 0) · null(대상 — 줬거나 못 줌)
    inviterTickets: { type: Number, default: 0 },    // 초대한 사람에게 준 장 수
    inviteeTickets: { type: Number, default: 0 },    // 들어온 친구에게 준 장 수
    // 📌 들어온 친구 보상(2026-10-26) — 받았는지는 InviteClaim(ref "welcome") 줄이 말한다. 이 칸은 대상 아님 까닭만 —
    //    "none"(넣은 순간 보상 묶음이 비어 있음) · null(대상 — 줬거나 못 줌). 대상 아님 줄은 「다시 지급」에서 빠진다(lib/invite.js regrantInvite)
    welcomeSkipped: { type: String, default: null },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

InviteUseSchema.index({ inviteeId: 1 }, { unique: true });
// 초대한 사람의 누적 수 · 최근 친구 목록(최신순) — 같은 인덱스의 앞머리로 센다
InviteUseSchema.index({ inviterId: 1, at: -1 });

export default mongoose.models.InviteUse || mongoose.model("InviteUse", InviteUseSchema);
