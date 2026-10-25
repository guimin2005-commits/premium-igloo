import mongoose from "mongoose";

// 📌 친구 초대 — 사람마다 하나인 초대 코드(6자, 헷갈리는 글자 뺀 32자 — lib/invite.js CODE_ALPHABET). 사이트가 처음 볼 때 만든다(lib/invite.js ensureInviteCode).
//    userId 유니크(한 사람 한 코드) · code 유니크(겹치면 다시 뽑는다). 옛 초대 이벤트(models/Referral)와는 따로 — 그 문서는 기록 보존용이라 건드리지 않는다
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 처음 만들기(쓰기) 직전에 createIndexes() 를 한 번 부른다(lib/invite.js ensureInviteIndexes)
const InviteCodeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },  // 디스코드 ID
    code: { type: String, required: true },    // 대문자 6자
    userName: { type: String, default: "" },   // 표시 이름 스냅샷(코드를 넣은 친구에게 「○○님의 초대」로 보인다 — 사이트에 올 때마다 맞춘다)
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

InviteCodeSchema.index({ userId: 1 }, { unique: true });
InviteCodeSchema.index({ code: 1 }, { unique: true });

export default mongoose.models.InviteCode || mongoose.model("InviteCode", InviteCodeSchema);
