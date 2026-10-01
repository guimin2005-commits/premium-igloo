import UserXp from "@/models/UserXp";
import { getTierIndex, VOICE_TIERS } from "@/lib/voiceTiers";
import { logWallet } from "@/lib/wallet";
// 환율은 클라이언트도 쓰므로 모델 의존 없는 파일에 둔다 — 서버 코드는 여기서 같이 가져가도 된다
export { POINT_RATE, xpToPoint, pointToXp } from "@/lib/pointRate";

// 📌 POINT(빙옥) — 상점 · 강화 · 시즌 패스에서 XP 대신 쓰는 소비 재화. 1 빙옥 = 10,000 XP (lib/pointRate.js).
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
