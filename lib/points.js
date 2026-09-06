import UserXp from "@/models/UserXp";
import { getTierIndex, tierPointsBetween, VOICE_TIERS } from "@/lib/voiceTiers";

// 📌 POINT — 상점에서 XP 와 1:1 로 쓰는 소비 재화.
//    레벨·등급에 영향을 주지 않고 디스코드 부작용도 없으므로 봇 큐(Payout)를 타지 않는다.
//    큐는 "XP 지급 + 레벨 재계산 + 역할 동기화"가 한 덩어리인 파이프라 태울 이유가 없고,
//    태우면 30초 지연과 실패 재시도 상태기계만 얻는다. 사이트가 직접 쓴다.
//    (사이트가 UserXp 를 직접 쓰는 선례는 이미 상점 결제·관리자 초기화에 있다)

// 등급별 퀘스트 배율 — 등급이 높을수록 퀘스트 포인트를 더 받는다.
//   아이언 1.0 → 이글루 2.0. 소수점은 버린다.
export const tierPointMultiplier = (level) => {
  const idx = getTierIndex(level || 0);
  const step = VOICE_TIERS.length > 1 ? 1 / (VOICE_TIERS.length - 1) : 0;
  return 1 + idx * step;
};

export const applyTierMultiplier = (basePoint, level) =>
  Math.floor(Math.max(0, basePoint) * tierPointMultiplier(level));

// 잔액 더하기 — 음수도 받는다(환불·차감). 잔액이 0 아래로 내려가지 않게 막는다.
export async function addPoints(userId, delta) {
  if (!delta) return null;
  if (delta > 0) {
    return UserXp.findOneAndUpdate(
      { userId },
      { $inc: { point: delta }, $set: { updatedAt: new Date() } },
      { upsert: true, new: true, projection: { point: 1 } }
    );
  }
  // 차감은 잔액이 충분할 때만 — 조건부라 동시에 눌러도 마이너스가 되지 않는다
  return UserXp.findOneAndUpdate(
    { userId, point: { $gte: -delta } },
    { $inc: { point: delta }, $set: { updatedAt: new Date() } },
    { new: true, projection: { point: 1 } }
  );
}

// 📌 승급 보상 — 등급이 오른 만큼 한 번씩만 준다.
//    pointTierPaid 에 '이미 지급한 최고 등급'을 남겨, 조건부 갱신으로 중복을 막는다.
//    레벨이 내려가도 이 값은 낮추지 않는다 — 되돌아 올라올 때 두 번 주지 않기 위해서다.
export async function settleTierPoints(userId, level) {
  const idx = getTierIndex(level || 0);
  if (idx <= 0) return 0;

  const doc = await UserXp.findOne({ userId }, { pointTierPaid: 1 }).lean();
  const paid = doc?.pointTierPaid || 0;
  if (idx <= paid) return 0;

  const amount = tierPointsBetween(paid, idx);
  if (amount <= 0) {
    await UserXp.updateOne({ userId, pointTierPaid: paid }, { $set: { pointTierPaid: idx } });
    return 0;
  }

  // 표시부터 올리고(조건부 — 이 갱신에 성공한 요청만 지급한다) 잔액을 더한다
  const claim = await UserXp.updateOne(
    { userId, pointTierPaid: paid },
    { $set: { pointTierPaid: idx } }
  );
  if (!claim.modifiedCount) return 0;

  try {
    await UserXp.updateOne({ userId }, { $inc: { point: amount } });
  } catch (e) {
    // 잔액을 못 올렸으면 표시를 되돌려 다음 기회에 다시 시도한다
    await UserXp.updateOne({ userId, pointTierPaid: idx }, { $set: { pointTierPaid: paid } }).catch(() => {});
    throw e;
  }
  return amount;
}
