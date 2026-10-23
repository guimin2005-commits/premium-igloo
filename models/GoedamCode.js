import mongoose from "mongoose";

// 📌 괴담회 code 상품의 코드 풀 — 한 줄 = 코드 한 장. 관리자가 붙여 넣은 코드(app/api/admin/goedam PUT — 없는 것만 넣는다)를
//    추첨이 { userId: null } 조건부로 하나씩 배정한다(lib/goedam.js pickPrize). 이미 나간 코드는 그대로 남는다(지우지 않는다)
//    userId null = 아직 안 나감 · drawId = 배정한 추첨 기록(models/GoedamDraw _id 글자) · at = 배정 시각
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — autoCreate · autoIndex 를 끄고, 쓰기 직전에 createIndexes() 를 한 번 부른다(lib/goedam.js ensureGoedamIndexes)
const GoedamCodeSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true },
    pid: { type: String, required: true },
    code: { type: String, required: true },
    userId: { type: String, default: null },
    drawId: { type: String, default: "" },
    at: { type: Date, default: null },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

// 같은 상품에 같은 코드는 한 장 — 배정(eventKey, pid, userId null)도 이 인덱스의 앞머리로 찾는다
GoedamCodeSchema.index({ eventKey: 1, pid: 1, code: 1 }, { unique: true });

export default mongoose.models.GoedamCode || mongoose.model("GoedamCode", GoedamCodeSchema);
