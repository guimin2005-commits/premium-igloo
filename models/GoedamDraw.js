import mongoose from "mongoose";

// 📌 괴담회 추첨 기록 — 한 줄 = 추첨권 1장을 쓴 즉석 뽑기 한 번(lib/goedam.js drawGoedam). 사이트만 쓴다.
//    순서: 추첨권 1장 소모 → 상품 고르기(나간 수 · 코드 배정) → 이 줄 → 지급(granted · error). 지급이 실패하면 granted false + error 로 남아
//    관리 › 괴담회 › 추첨 기록에서 다시 지급한다(같은 상품을 두 번 주지 않게 granted 조건부로 세운다)
//    내 당첨 기록(GET /api/goedam history)은 (eventKey, userId, createdAt -1) 인덱스로 읽는다
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 쓰기 직전에 createIndexes() 를 한 번 부른다(lib/goedam.js ensureGoedamIndexes)
const GoedamDrawSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true },
    userId: { type: String, required: true },
    userName: { type: String, default: "" },
    pid: { type: String, default: "" },       // Goedam.prizes[].pid
    prizeName: { type: String, default: "" }, // 뽑은 순간의 이름 스냅샷
    kind: { type: String, default: "none" },  // 뽑은 순간의 종류(xp · point · item · role · code · none)
    amount: { type: Number, default: 0 },     // xp · point 의 양
    count: { type: Number, default: 0 },      // item 의 개수(2026-10-25 — 다시 지급이 뽑은 순간의 개수로 준다. 옛 기록은 0 = 지금 상품 개수)
    code: { type: String, default: "" },      // code 상품이면 받은 코드(models/GoedamCode)
    ticketId: { type: String, default: "" },  // 소모한 추첨권 Purchase _id
    granted: { type: Boolean, default: false },
    error: { type: String, default: "" },     // 지급 실패 사유
    // 📌 문화상품권(code) 안내 DM — 봇이 적는다(bot/src/features/goedamWatch.js noticeGifts · 2026-10-28). 사이트는 읽지도 쓰지도 않는다
    noticeAt: { type: Date, default: null },
    noticeError: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

GoedamDrawSchema.index({ eventKey: 1, userId: 1, createdAt: -1 });

export default mongoose.models.GoedamDraw || mongoose.model("GoedamDraw", GoedamDrawSchema);
