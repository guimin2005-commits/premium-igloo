// 📌 예전 '코드'(models/Code) → 보상형 쿠폰 이전 계획 — DB 없는 순수 함수. app/api/shop/coupons/migrate 가 GET(남은 일 세기) · POST(실행)에 쓴다.
//    2026-10-04 추천대로 — "예전 기록의 닉네임으로 사람을 찾아 사용 기록을 넘기거나, 이미 다 옮겼다면 '예전 코드 가져오기' 버튼을 없앤다".
//    예전에는 전체 사용 횟수(usedCount)만 이어받고 사람별 사용 기록(usedBy)은 비워, 여러 번 쓸 수 있던 코드는 예전에 쓴 사람이 쿠폰으로 한 번 더 받을 수 있었다.
//    이제 예전에 쓴 사람의 userId 를 찾아 쿠폰 usedBy 에 넣는다 — 새로 옮기는 코드는 만들 때, 이미 옮긴 쿠폰은 빠진 사람만 덧붙인다(여러 번 눌러도 한 번).
//
//    사람 찾기 — 예전 코드 사용(app/api/code, 8/12 에 닫힘)은 Code.usedBy 에 그때 닉네임(세션 이름)을 넣고,
//    역할 지급 대기열(CodeGrant { userId, userName, code }) · XP 지급(Payout { userId, userName, reason: "코드 사용: <코드>" })에 userId 를 함께 남겼다.
//      1) Payout "코드 사용: <코드>" — 예전 코드 사용에서만 생기는 사유라 그대로 그 사람(이름과 상관없이)
//      2) usedBy 의 이름마다 — 같은 코드의 CodeGrant · Payout 중 그 이름으로 남은 기록의 userId(한 사람일 때만)
//      3) 그래도 없으면 XP 기록(UserXp)의 사용자명 · 표시 이름이 그 이름인 사람(한 사람일 때만)
//      이름이 여러 사람에게 걸리거나 아무도 없으면(이름을 바꿨거나 "익명") 넘기지 않고 '찾지 못한 이름'으로 센다.
//    쿠폰의 usedCount 는 그대로 둔다 — 예전 사용 횟수에 이미 들어 있다(사람을 붙일 뿐 새 사용이 아니다).
//    이미 있는 같은 코드의 쿠폰이 보상형이 아니면 건드리지 않는다.

export const LEGACY_PAYOUT_PREFIX = "코드 사용: ";

const str = (v) => String(v ?? "");

/**
 * @param {{ codes: any[], coupons: any[], payouts: any[], grants: any[], users: any[] }} src
 *   codes   : Code 문서 전부 · coupons: 같은 code 의 Coupon 문서({ _id, code, kind, usedBy })
 *   payouts : reason 이 "코드 사용: <코드>" 인 Payout({ userId, userName, reason }) · grants: code 가 그 코드인 CodeGrant({ userId, userName, code })
 *   users   : usedBy 이름과 사용자명 · 표시 이름이 같은 UserXp({ userId, username, displayName })
 * @returns {{ create: any[], link: { couponId: string, code: string, add: string[] }[], moved: number, skipped: number, linked: number, unmatched: number }}
 *   create: 새로 만들 쿠폰 문서 · link: 이미 있는 쿠폰에 덧붙일 사람 · linked: 넘긴 사람 수(만들 것 + 덧붙일 것) · unmatched: 찾지 못한 이름 수
 */
export function planLegacyCodes({ codes = [], coupons = [], payouts = [], grants = [], users = [] } = {}) {
  const couponOf = new Map(coupons.map((c) => [str(c.code), c]));
  const payoutsOf = new Map();
  for (const p of payouts) {
    const reason = str(p.reason);
    if (!reason.startsWith(LEGACY_PAYOUT_PREFIX) || !p.userId) continue;
    const code = reason.slice(LEGACY_PAYOUT_PREFIX.length);
    if (!payoutsOf.has(code)) payoutsOf.set(code, []);
    payoutsOf.get(code).push(p);
  }
  const grantsOf = new Map();
  for (const g of grants) {
    if (!g.userId) continue;
    const code = str(g.code);
    if (!grantsOf.has(code)) grantsOf.set(code, []);
    grantsOf.get(code).push(g);
  }
  // 이름 → userId 모음(XP 기록) — 사용자명 · 표시 이름 둘 다
  const usersByName = new Map();
  for (const u of users) {
    if (!u.userId) continue;
    for (const n of [u.username, u.displayName]) {
      const k = str(n);
      if (!k) continue;
      if (!usersByName.has(k)) usersByName.set(k, new Set());
      usersByName.get(k).add(str(u.userId));
    }
  }

  const create = [];
  const link = [];
  let moved = 0;
  let skipped = 0;
  let linked = 0;
  let unmatched = 0;

  for (const c of codes) {
    const code = str(c.code);
    if (!code) continue;
    const names = Array.isArray(c.usedBy) ? c.usedBy.map(str) : [];
    const ids = new Set();
    const pays = payoutsOf.get(code) || [];
    for (const p of pays) ids.add(str(p.userId));
    const records = [...pays, ...(grantsOf.get(code) || [])];
    for (const name of names) {
      const fromRecords = new Set(records.filter((r) => name && str(r.userName) === name).map((r) => str(r.userId)));
      const pick = fromRecords.size ? fromRecords : usersByName.get(name) || new Set();
      if (pick.size === 1) ids.add([...pick][0]);
      else unmatched += 1;
    }

    const existing = couponOf.get(code);
    if (existing) {
      skipped += 1;
      if (existing.kind !== "reward") continue;
      const have = new Set((Array.isArray(existing.usedBy) ? existing.usedBy : []).map(str));
      const add = [...ids].filter((id) => !have.has(id));
      if (add.length) {
        link.push({ couponId: str(existing._id), code, add });
        linked += add.length;
      }
      continue;
    }

    moved += 1;
    linked += ids.size;
    create.push({
      code,
      name: c.reward || "보상 쿠폰",
      kind: "reward",
      reward: c.reward || "",
      rewardRoleId: c.roleId || "",
      rewardXp: c.xpAmount || 0,
      requiredRoleId: c.requiredRoleId || "",
      requiredRoleName: c.requiredRoleName || "",
      maxUses: c.maxUses ?? 1,
      // 전체 사용 횟수는 예전 기록 그대로 · 사람별 사용 기록은 찾은 사람만(1인 1회)
      usedCount: Math.max(names.length, ids.size),
      usedBy: [...ids],
      perUserLimit: 1,
      active: c.isActive !== false,
      expiresAt: c.expiresAt || undefined,
      createdAt: c.createdAt || new Date(),
    });
  }

  return { create, link, moved, skipped, linked, unmatched };
}
