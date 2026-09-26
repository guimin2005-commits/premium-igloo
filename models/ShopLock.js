import mongoose from "mongoose";

// 📌 상점 결제 자물쇠 — 한 유저의 바로 구매(purchase)·장바구니 결제(checkout)를 한 번에 하나씩만 돌린다.
//    "1인 1개" 확인(기존 구매 조회)과 구매 기록 사이에 틈이 있어, 동시에 두 번 보내면 둘 다 통과해 두 번 결제된다.
//    _id 가 유저 ID 라 동시에 잡으려 하면 두 번째 insert 가 11000(duplicate key)으로 튕긴다.
//    결제가 끝나면(성공·실패 모두) 푼다. 함수가 도중에 죽어 남은 자물쇠는 STALE_MS 가 지나면 다음 결제가 가져간다.
const STALE_MS = 30 * 1000;

const ShopLockSchema = new mongoose.Schema({
  _id: { type: String, required: true },   // userId
  token: { type: String, required: true }, // 잡은 결제의 표식 — 가져간 자물쇠를 앞선 결제가 풀지 않게
  at: { type: Date, default: Date.now },
}, { versionKey: false });

// 잡으면 { _id, token }, 다른 결제가 잡고 있으면 null
ShopLockSchema.statics.acquire = async function (userId) {
  const token = new mongoose.Types.ObjectId().toString();
  const now = new Date();
  try {
    await this.create({ _id: userId, token, at: now });
    return { _id: userId, token };
  } catch (e) {
    if (e?.code !== 11000) throw e;
  }
  const stale = await this.updateOne({ _id: userId, at: { $lt: new Date(now.getTime() - STALE_MS) } }, { $set: { token, at: now } });
  return stale.modifiedCount ? { _id: userId, token } : null;
};

// 내가 잡은 자물쇠만 푼다 — 실패해도 결제 결과는 그대로 둔다(남은 자물쇠는 STALE_MS 뒤 다음 결제가 가져간다)
ShopLockSchema.statics.release = function (lock) {
  return this.deleteOne({ _id: lock._id, token: lock.token }).catch(() => {});
};

export default mongoose.models.ShopLock || mongoose.model("ShopLock", ShopLockSchema);
