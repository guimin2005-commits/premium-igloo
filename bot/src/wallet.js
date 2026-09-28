// ── XP·빙옥 원장 한 줄 기록 (사이트 lib/wallet.js 와 같은 모양) ──
//    XpLog·Payout·Purchase 에 남지 않는 움직임만 쓴다 (연속 출석 보너스 등).
//    기록은 부가 기능이라 실패해도 throw 하지 않는다 — 이미 끝난 지급을 되돌리게 만들면 안 된다.
//    amount 0 · 숫자가 아님 · userId 없음이면 기록하지 않는다.
import { WalletLog } from "./db.js";

export async function logWallet({ userId, currency, amount, kind, label, refId = "", meta } = {}) {
  try {
    const n = Number(amount);
    if (!userId || !Number.isFinite(n) || n === 0) return null;
    return await WalletLog.create({
      userId: String(userId),
      currency: currency === "point" ? "point" : "xp",
      amount: n,
      kind: String(kind || "etc"),
      label: String(label || ""),
      refId: refId ? String(refId) : "",
      ...(meta !== undefined ? { meta } : {}),
    });
  } catch (e) {
    console.error("원장 기록 실패:", e?.message || e);
    return null;
  }
}
