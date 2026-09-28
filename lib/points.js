import UserXp from "@/models/UserXp";
import { getTierIndex, tierPointsBetween, VOICE_TIERS } from "@/lib/voiceTiers";
import { logWallet } from "@/lib/wallet";
// 환율은 클라이언트도 쓰므로 모델 의존 없는 파일에 둔다 — 서버 코드는 여기서 같이 가져가도 된다
export { POINT_RATE, xpToPoint, pointToXp } from "@/lib/pointRate";

// 📌 POINT(빙옥) — 상점 · 강화 · 시즌 패스에서 XP 대신 쓰는 소비 재화. 1 빙옥 = 1,000 XP (lib/pointRate.js).
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
//    📌 log({ kind, label, refId, meta })를 주면 실제로 반영된 경우에만 원장(WalletLog)에 한 줄 남긴다.
//       Payout · Purchase 에 이미 기록되는 움직임(관리자 빙옥 지급 · 상점 결제 등)에는 주지 않는다 — 내역에 두 번 보인다.
//       뒤에서 되돌릴 수 있는 차감(해금처럼 다음 단계가 실패하면 환불하는 것)은 여기서 남기지 말고 확정된 뒤 호출부가 남긴다
export async function addPoints(userId, delta, log) {
  if (!delta) return null;
  let doc;
  if (delta > 0) {
    doc = await UserXp.findOneAndUpdate(
      { userId },
      { $inc: { point: delta }, $set: { updatedAt: new Date() } },
      { upsert: true, new: true, projection: { point: 1 } }
    );
  } else {
    // 차감은 잔액이 충분할 때만 — 조건부라 동시에 눌러도 마이너스가 되지 않는다
    doc = await UserXp.findOneAndUpdate(
      { userId, point: { $gte: -delta } },
      { $inc: { point: delta }, $set: { updatedAt: new Date() } },
      { new: true, projection: { point: 1 } }
    );
  }
  if (doc && log) await logWallet({ ...log, userId, currency: "point", amount: delta });
  return doc;
}

// 📌 승급 보상 — 등급이 오른 만큼 한 번씩만 준다.
//    pointTierPaid 에 '이미 지급한 최고 등급'을 남겨, 조건부 갱신으로 중복을 막는다.
//    레벨이 내려가도 이 값은 낮추지 않는다 — 되돌아 올라올 때 두 번 주지 않기 위해서다.
export async function settleTierPoints(userId, level) {
  const idx = getTierIndex(level || 0);

  const doc = await UserXp.findOne({ userId }, { pointTierPaid: 1 }).lean();
  // 📌 pointTierPaid 가 생기기 전(2026-09-06) 문서에는 필드 자체가 없다 — 아래 { pointTierPaid: 0 } 조건에
  //    영영 걸리지 않아 승급 보상이 멈춰 있었다. 지난 등급을 한꺼번에 소급 지급하지 않고,
  //    지금 등급을 지급한 것으로 찍어 두어 앞으로의 승급부터 지급한다. (null 조건은 필드 없음도 함께 잡는다)
  if (doc && doc.pointTierPaid == null) {
    await UserXp.updateOne({ userId, pointTierPaid: null }, { $set: { pointTierPaid: idx } });
    return 0;
  }
  if (idx <= 0) return 0;
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
  // 승급 빙옥은 Payout 을 타지 않으므로 원장에 따로 남긴다 (지급이 확정된 뒤에만)
  await logWallet({
    userId,
    currency: "point",
    amount,
    kind: "tier-point",
    label: `승급 보상 · ${VOICE_TIERS[idx]?.name || `${idx + 1}등급`}`,
    meta: { from: paid, to: idx },
  });
  return amount;
}
