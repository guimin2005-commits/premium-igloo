import mongoose from "mongoose";

// 📌 괴담회 상품별 나간 수 — 한 줄 = (이벤트 키 · 상품). 사이트만 쓴다(lib/goedam.js takeStock).
//    수량이 있는 상품은 { given: { $lt: 수량 } } 조건 $inc 로만 늘린다 — 동시에 뽑아도 수량을 넘지 않는다(넘칠 자리면 유니크가 넣기를 튕긴다).
//    code 상품의 수량은 그 순간의 코드 수(models/GoedamCode), 무제한 상품은 조건 없이 센다(관리 화면 표시용)
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 쓰기 직전에 createIndexes() 를 한 번 부른다(lib/goedam.js ensureGoedamIndexes)
const GoedamStockSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true },
    pid: { type: String, required: true },
    given: { type: Number, default: 0 },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

GoedamStockSchema.index({ eventKey: 1, pid: 1 }, { unique: true });

export default mongoose.models.GoedamStock || mongoose.model("GoedamStock", GoedamStockSchema);
