import mongoose from "mongoose";

// 📌 단체 DM 한 번(2026-11-01 운영자 "문화상품권 16개가 추가 됐거든 그거 홍보성 dm 보낼 거니까") — 관리 › 괴담회 「홍보 DM」이 만들고, 봇(bot/src/features/dmBlast.js)이 한 통씩 보낸다.
//    key: 봇 메시지 틀(goedamPromo) · vars: 틀 변수(prize · count · until) · target: 받는 사람 고르기(active 최근 30일 활동 · goedam 괴담회 참여자 · all 서버 전체)
//    recipients: 보낼 디스코드 ID(사이트가 고른 것 — all 은 비워 두고 봇이 서버 멤버로 채운다) · cursor: 봇이 여기까지 집었다(조건부로 옮긴다 — 겹친 봇에도 한 번)
//    status: queued(대기) → sending(보내는 중) → done(끝) · stopped(관리자가 멈춤). sent · failed — 보낸 수 · 못 보낸 수(DM 막힘 · 서버를 나감)
//    ⚠️ 봇 bot/src/db.js DmBlastSchema 와 칸이 같아야 한다. 테스트 사이트도 같은 DB 를 읽어 autoCreate · autoIndex 를 끈다(문서는 관리자가 보내기를 누를 때만 생긴다)
const DmBlastSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    vars: { type: mongoose.Schema.Types.Mixed, default: {} },
    target: { type: String, default: "active" },
    recipients: { type: [String], default: [] },
    total: { type: Number, default: 0 },
    cursor: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    status: { type: String, default: "queued" },
    createdBy: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    stoppedBy: { type: String, default: "" },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

export default mongoose.models.DmBlast || mongoose.model("DmBlast", DmBlastSchema);
