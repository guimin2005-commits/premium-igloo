// 📌 역할 이전의 기간 · 보유자 분류 · 기간 적용 계산 — 순수 함수만(DB 읽기 · 쓰기 없음).
//    관리자 역할 이전 API(app/api/admin/role-migration/route.js)가 DB 에서 읽은 기록을 넘겨 쓴다.
//    조회 조건(classifyQuery · termQuery)도 여기 두어, 미리보기 · 실행 · 점검 스크립트가 같은 기록을 같은 규칙으로 센다.
//
//    기간(period): { mode: "forever" } | { mode: "days", days: 1~3650 } | { mode: "until", until: "YYYY-MM-DD" }(그날 KST 23:59:59.999 까지)
//    기록 값: days(표시 · DM 의 일수, 0 = 무기한) · expiresAt(유일한 만료 기준, null = 무기한) — models/Purchase.js

export const MARK = "역할 이전"; // adminNote 머리 — 이 도구가 만든 기록
export const MARK_RE = /^역할 이전/;
// 📌 역할 환불 — 아이템으로 옮기지 않고 XP · 빙옥으로 돌려준 사람의 표시 기록(Purchase · itemId "grant" · status "refunded" · 낸 값 0).
//    봇의 환불 회수(processRefunds)가 이 기록으로 역할을 뗀다. 돈은 Payout(source "role-refund")이 옮긴다 — 이 기록에는 금액을 적지 않는다(원장 상쇄)
export const REFUND_MARK = "역할 환불";
export const REFUND_MARK_RE = /^역할 환불/;
// 이 도구가 남긴 기록 전부(이전 · 환불)
export const TOOL_RE = /^역할 (이전|환불)/;
export const REFUND_SOURCE = "role-refund"; // Payout.source
// 📌 역할 정리 — 구매 기간이 끝났는데 디스코드 역할이 남은 사람(보유자 분류 '기간 끝남')의 역할만 떼는 표시 기록.
//    역할 환불 표시 기록과 같은 모양(Purchase · itemId "grant" · status "refunded" · 낸 값 0 · roleDetached false)이라 봇 환불 회수(processRefunds)가
//    역할을 뗀다(낸 값이 없어 DM 없음). 아이템 · 지급은 없다 — TOOL_RE(이전 · 환불)에 넣지 않아 '환불함' · '지급 빠짐'으로 세지 않는다
export const CLEANUP_MARK = "역할 정리";
export const CLEANUP_MARK_RE = /^역할 정리/;
export const isCleanup = (p) => p?.status === "refunded" && p.itemId === "grant" && CLEANUP_MARK_RE.test(p.adminNote || "");
// 📌 1인당 환불의 끝 — 운영 상한이 아니라 소수 · 지수 표기로 숫자가 깨지지 않게 막는 한도(1조 — 퀘스트 숫자 칸과 같은 값)
//    2026-10-04 "상한을 없애고, 아주 큰 값이면 확인 창만 띄웁니다" — 예전 1인당 상한(XP 10억 · 빙옥 10만 = 10억 XP)은 막지 않고,
//    그보다 큰 값이면 관리 화면의 확인 창이 경고로 보인다(isLargeRefund)
export const REFUND_NUM_MAX = 1_000_000_000_000;
export const REFUND_MAX = Object.freeze({ xp: REFUND_NUM_MAX, point: REFUND_NUM_MAX });
export const REFUND_LARGE = Object.freeze({ xp: 1_000_000_000, point: 100_000 });
export const isLargeRefund = (r) => !!r && REFUND_LARGE[r.currency] != null && Number(r.amount) > REFUND_LARGE[r.currency];
export const REFUND_UNIT = Object.freeze({ xp: "XP", point: "빙옥" });

export const DAY = 86400000;
const HOUR = 3600000;
const KST = 9 * HOUR;
export const MAX_DAYS = 3650;
// 📌 만료가 지금 + 1시간 안이면 쓰지 않는다 — 봇(processExpiries, 30초 주기)이 곧바로 회수하고 만료 DM 을 보내지 않게
export const MIN_LEAD_MS = HOUR;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const FOREVER = Object.freeze({ mode: "forever" });

// 종료일("YYYY-MM-DD") → 그날 KST 23:59:59.999(ms). 없는 날짜면 NaN
export function endOfKstDay(s) {
  const m = DATE_RE.exec(String(s || ""));
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const chk = new Date(t);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return NaN;
  return t + DAY - KST - 1; // 다음 날 00:00 KST 직전
}

// 요청의 기간 — { period } | { error }. 빠지면 무기한
export function parsePeriod(raw, now) {
  const mode = raw?.mode;
  if (raw == null || mode == null || mode === "forever") return { period: FOREVER };
  if (mode === "days") {
    const n = Number(raw.days);
    if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) return { error: `기간은 1~${MAX_DAYS}일로 정해 주세요.` };
    return { period: { mode: "days", days: n } };
  }
  if (mode === "until") {
    const until = String(raw.until || "");
    const end = endOfKstDay(until);
    if (!Number.isFinite(end)) return { error: "종료일이 올바르지 않습니다." };
    if (end <= now + MIN_LEAD_MS) return { error: "종료일이 지났거나 너무 가깝습니다." };
    if (end > now + MAX_DAYS * DAY) return { error: `종료일은 ${MAX_DAYS}일 안으로 정해 주세요.` };
    return { period: { mode: "until", until } };
  }
  return { error: "기간 값이 올바르지 않습니다." };
}

// 저장된 기간 — 시각 검사 없이 모양만(지난 종료일도 그대로 보여 준다). 모르는 값은 무기한
export function storedPeriod(raw) {
  if (raw?.mode === "days" && Number.isInteger(raw.days) && raw.days >= 1 && raw.days <= MAX_DAYS) return { mode: "days", days: raw.days };
  if (raw?.mode === "until" && Number.isFinite(endOfKstDay(raw.until))) return { mode: "until", until: String(raw.until) };
  return FOREVER;
}

// 요청의 환불 — { currency: "xp" | "point", amount: 양의 정수(끝 REFUND_MAX — 숫자가 깨지지 않는 한도) } → { refund } | { error }
export function parseRefund(raw) {
  const currency = raw?.currency;
  if (currency !== "xp" && currency !== "point") return { error: "환불 화폐가 올바르지 않습니다." };
  const amount = Number(raw?.amount);
  const max = REFUND_MAX[currency];
  if (!Number.isInteger(amount) || amount < 1 || amount > max) {
    return { error: `1인당 환불은 1~${max.toLocaleString()} ${REFUND_UNIT[currency]}로 정해 주세요.` };
  }
  return { refund: { currency, amount } };
}

// 이전 표(Setting roleMigrationMap) 한 칸 — 예전 형식은 아이템 id 글자 하나(기간 없음 = 무기한), 그다음 { item, period },
//   지금은 { item, period, mode?: "refund", refund?: { currency, amount } }. mode 가 없거나 환불 값이 잘못되면 '아이템으로 옮기기'
export function mapEntry(v) {
  if (typeof v === "string") return { item: v, period: FOREVER, mode: "item", refund: null };
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const r = v.mode === "refund" ? parseRefund(v.refund) : null;
    return { item: String(v.item || ""), period: storedPeriod(v.period), mode: r?.refund ? "refund" : "item", refund: r?.refund || null };
  }
  return { item: "", period: FOREVER, mode: "item", refund: null };
}
// mapEntry 결과 → 저장할 값. 아이템으로 옮기기는 예전 모양 { item, period } 그대로(같은 값이면 다시 쓰지 않게)
export function mapValue(e) {
  const base = { item: String(e?.item || ""), period: e?.period || FOREVER };
  return e?.mode === "refund" && e.refund ? { ...base, mode: "refund", refund: { currency: e.refund.currency, amount: e.refund.amount } } : base;
}

// 이 도구가 이 역할로 이미 환불한 기록인가 — 환불 표시 기록(역할 환불) · 환불로 바꾼 이전 기록(역할 이전 · refunded)
//   📌 관리자 주문 화면의 환불은 adminNote 를 덮어써 여기 걸리지 않는다(그건 이 도구의 지급이 없다)
export const isToolRefund = (p) => p?.status === "refunded" && p.itemId === "grant" && TOOL_RE.test(p.adminNote || "");
export function toolRefundQuery({ roleIds, userIds }) {
  return {
    ...(userIds ? { userId: { $in: userIds } } : {}),
    roleId: { $in: roleIds },
    itemId: "grant",
    status: "refunded",
    adminNote: TOOL_RE,
  };
}

// 기간 → 기록 값 { days, expiresAt } — from(ms)부터. 새 기록은 실행 시각, 기간 적용은 그 기록을 받은 시각.
//   종료일의 days 는 표시 · DM 용 남은 일수(올림, 최소 1)
export function termFrom(period, from) {
  if (period.mode === "days") return { days: period.days, expiresAt: new Date(from + period.days * DAY) };
  if (period.mode === "until") {
    const end = endOfKstDay(period.until);
    return { days: Math.max(1, Math.ceil((end - from) / DAY)), expiresAt: new Date(end) };
  }
  return { days: 0, expiresAt: null };
}

// 📌 이어 붙이기 — 같은 아이템(itemRef)의 살아 있는 기간제(base = 가장 늦게 끝나는 것)가 있을 때. 상점 연장(_lib/renewal.js timingOf)과 같은 모양:
//    renewOf = base, startsAt = base 만료, expiresAt = 거기에 N일. 인벤토리(my-items)가 한 칸으로 묶고, base 만료 때 봇은 이어지는 것으로 보고 DM 을 생략한다.
//    종료일이 base 만료보다 늦으면 그 사이만, 이르면(이미 base 가 덮는다) 지금부터 종료일까지 겹쳐 둔다 — 옛 역할을 떼게 할 기록이 있어야 해서.
//    겹친 기록은 끝날 때 base 가 이어지므로 만료 DM 도 · 만료 임박 DM 도 가지 않는다(봇 findContinuation)
export function appendTerm(period, base, now) {
  const end0 = new Date(base.expiresAt).getTime();
  const renewOf = String(base._id);
  if (period.mode === "days") {
    return { renewOf, startsAt: new Date(end0), expiresAt: new Date(end0 + period.days * DAY), days: period.days };
  }
  const end = endOfKstDay(period.until);
  if (end > end0) return { renewOf, startsAt: new Date(end0), expiresAt: new Date(end), days: Math.max(1, Math.ceil((end - end0) / DAY)) };
  return { renewOf, startsAt: null, expiresAt: new Date(end), days: Math.max(1, Math.ceil((end - now) / DAY)) };
}

// 상품의 기간제 옵션(일수 > 0 · 가격 > 0) — lib/shopPricing durationOptions 와 같은 거름. 빠른 선택용
export const timedDays = (s) =>
  (Array.isArray(s?.durations) ? s.durations : []).filter((d) => d && Number(d.days) > 0 && Number(d.price) > 0).map((d) => Number(d.days));

// 이 구매가 보유 판정(lib/ownedItems.js (A))에서 아이템을 찾는가 — itemRef > 상품의 연결 아이템 > (상품도 없는 옛 건만) 역할의 첫 아이템
//   ctx: { itemById: Map, shopById: Map, itemByRole: Map }
//   📌 사이트 보유로 돌릴 때 itemRef 를 채우는 건 이것이 false 인 건만 — 이미 다른 아이템으로 잡히는 구매의 물건을 바꾸지 않게
export function resolvesItem(p, ctx) {
  if (p.itemRef && ctx.itemById.has(String(p.itemRef))) return true;
  const shop = ctx.shopById.get(String(p.itemId || ""));
  if (shop?.itemId && ctx.itemById.has(String(shop.itemId))) return true;
  return !shop && !!p.roleId && ctx.itemByRole.has(p.roleId);
}

// ── 보유자 분류 ──
//    근거: 대기 · 완료 · 만료 상태, 소모 안 된 것(취소 · 환불 · 소모는 근거가 아니다 — 예전과 같게 '기록 없음'). 이 도구가 앞서 만든 기록도 근거다(다시 눌러도 하나).
//          + 봇이 아직 역할을 떼지 않은 환불 건(refunded · roleDetached 아님) — 같은 역할이면 '환불 대기'로 건너뛴다(아래)
//          + 명단을 받은 무렵(since 이후) 환불한 건 — 봇이 이미 뗐어도 받아 둔 명단(최대 5분)에는 아직 그 역할이 있을 수 있다
//          + 이 도구가 한 환불(isToolRefund) — 봇이 떼기를 끝냈어도(또는 못 떼어 역할이 남아도) '환불함'으로 건너뛴다(같은 역할로 두 번 주지 않게)
//    살아 있음 = 대기 · 완료이면서 기간이 없거나 남은 것(lib/ownedItems.js 와 같은 기준)
export const CLASSIFY_FIELDS = { userId: 1, roleId: 1, itemRef: 1, itemId: 1, itemType: 1, status: 1, siteOnly: 1, roleDetached: 1, expiresAt: 1, adminNote: 1 };
export const REFUND_LAG_MS = 10 * 60 * 1000; // 명단 시각에서 이만큼 앞의 환불까지(봇이 떼는 데 걸리는 시간 여유)
export function classifyQuery({ userIds, roleIds, refs, since }) {
  const refund = [{ roleDetached: { $ne: true } }, ...(Number.isFinite(since) ? [{ revokedAt: { $gte: new Date(since) } }] : [])];
  return {
    userId: { $in: userIds },
    consumedAt: null,
    $and: [
      { $or: [{ roleId: { $in: roleIds } }, ...(refs.length ? [{ itemRef: { $in: refs } }] : [])] },
      {
        $or: [
          { status: { $in: ["pending", "completed", "expired"] } },
          { status: "refunded", $or: refund },
          { status: "refunded", itemId: "grant", adminNote: TOOL_RE },
        ],
      },
    ],
  };
}

// active: 계획의 역할들(실행 순서) — { roleId, item(없으면 새로 만들 것), keepRole, period, term, holders: [{ id, name }], refund? } 에
//         결과 칸(insert · convert · fill · payees · cleanup · convertUsers · skipped · cls · roleLeft)을 채운다. recs: classifyQuery 로 읽은 기록
//         insert: [{ h, id, term }] — id 는 새 기록의 _id(미리 정한다 — 같은 계획의 뒤 역할이 이 기록 뒤에 이어 붙을 수 있게. 실행은 이 id 로 넣는다)
//         refund 가 있는 역할(환불) — 아이템 · 기록을 주지 않고 '기록 없음'만 payees 로 모은다(1인당 금액은 실행이 지급).
//           사이트에 이미 가진 사람(같은 역할 · 같은 아이템의 살아 있는 기록) · 지급 대기 · 환불 대기 · 환불함은 수만 센다(기간 끝남은 역할만 뗀다 — cleanup).
//           이미 가진 완료 구매를 사이트 보유로 돌리지 않는다(환불은 그 사람과 무관). item 은 같은 아이템 판정용(연결 · 이전 표 아이템, 없으면 역할만)
//      환불함   — 이 도구가 이 역할로 이미 환불했다(isToolRefund) → 건너뜀. 아이템으로 옮기기에서도 같다(환불받은 사람에게 아이템까지 주지 않게)
//                 📌 단 그 뒤 같은 역할을 주는 살아 있는 기록(환불 뒤 다시 산 구매 등)이 있으면 '환불함'이 아니다 — 아래 같은 역할 갈래로
//                    (기간제 · 무기한으로 세고, 아이템으로 옮기기면 그 구매도 사이트 보유로 돌려 봇이 역할을 뗀다). 다른 역할의 같은 아이템 · 이번 계획의
//                    앞 역할이 줄 기록은 이 역할의 근거가 아니라 '환불함' 그대로(환불받은 역할로 기간을 또 붙이지 않게)
//      환불 대기 — 같은 역할의 환불 건(이 도구의 환불 말고)을 봇이 아직 처리하지 않았다 → 건너뜀(지금 기록을 주면 그 기록이 역할의 근거가 되어 환불 회수가 막힌다)
//      지급 대기 — 살아 있는 근거 중 pending 이 있다 → 건너뜀(봇이 지급하며 역할을 붙인다. 지금 돌리면 그 뒤 붙은 역할이 남는다 — 다음 실행에서)
//      같은 역할의 근거
//        살아 있음 → 새 기록 없음, 기간 그대로(기간제 · 무기한으로 셈). 역할을 뗄 계획이면 완료 건을 사이트 보유로(아이템을 못 찾는 건은 itemRef 채움).
//                    권한이면 그대로(만료 때 봇이 회수)
//        전부 끝남 → 기간 끝남 · 역할만 뗀다(cleanup — 아이템 · 환불은 주지 않는다. 새 기록이 끝난 기간을 되살리지 않게).
//                    📌 2026-10-04 "아이템은 주지 않고 역할만 떼어 정리합니다" — 실행이 역할 정리 표시 기록(isCleanup)을 남겨 봇 환불 회수가 뗀다.
//                       권한(역할 유지)이어도 뗀다 — 기간이 끝난 권한은 원래 봇 만료 처리가 떼는 역할이다.
//                       그 표시 기록이 아직 처리 전(또는 명단을 받은 무렵 처리됨)이면 기간 끝남으로 세고 건너뛴다(다시 눌러도 하나)
//      같은 아이템만(다른 역할로 받은 살아 있는 기록, 또는 이번 계획의 앞 역할이 주는 기록)
//        📌 다른 역할의 '끝난' 기록은 이 역할과 무관하다 — 기간 끝남이 아니라 아래 '기록 없음'으로 본다
//        무기한이 있음 → 건너뜀(이미 영구 보유. 옛 역할을 담은 기록이 없어 역할은 남는다 — roleLeft)
//        전부 기간제 → 이어 붙인 새 기록(appendTerm — 가장 늦게 끝나는 것 뒤. 무기한을 골랐으면 상점 업그레이드처럼 새 무기한 기록) — 옛 역할을 담아 봇이 떼게
//      기록 없음 — 고른 기간으로 새 기록
//    newId: 새 기록 _id 를 만드는 함수(API 는 ObjectId). 없으면 임시 id(점검 스크립트용 — DB 에 쓰지 않는 곳만)
export function classifyHolders(active, recs, ctx, now, newId) {
  let seq = 0;
  const makeId = newId || (() => `plan${String(++seq).padStart(20, "0")}`);
  const byUser = new Map();
  for (const p of recs) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId).push(p);
  }
  const endOf = (p) => (p.expiresAt ? new Date(p.expiresAt).getTime() : Infinity);
  const isLiveRec = (p) => (p.status === "pending" || p.status === "completed") && (!p.expiresAt || endOf(p) > now);

  // 📌 이번 계획이 주는 기록 — `${유저}|${아이템}` → [{ _id, expiresAt }]. 같은 기존 아이템을 여러 역할에 골랐을 때
  //    뒤 역할은 앞 역할이 줄 기록을 DB 기록처럼 본다(아직 DB 에 없어 위 조회로는 안 잡힌다) — 기간제면 그 뒤에 이어 붙이고, 무기한이면 건너뛴다
  const planned = new Map();
  const give = (e, h, ref, term) => {
    const id = String(makeId());
    e.insert.push({ h, id, term });
    if (ref) {
      const key = `${h.id}|${ref}`;
      if (!planned.has(key)) planned.set(key, []);
      planned.get(key).push({ _id: id, expiresAt: term.expiresAt });
    }
  };

  for (const e of active) {
    const ref = e.item ? String(e.item._id) : "";
    const refund = !!e.refund;
    if (!e.payees) e.payees = [];
    if (!e.cleanup) e.cleanup = [];
    if (e.cls.refunded == null) e.cls.refunded = 0;
    for (const h of e.holders) {
      const rel = (byUser.get(h.id) || []).filter((p) => p.roleId === e.roleId || (ref && p.itemRef === ref));
      const rec = rel.filter((p) => p.status !== "refunded"); // 다른 역할의 환불 건은 이 역할과 무관
      const live = rec.filter(isLiveRec);
      const same = live.filter((p) => p.roleId === e.roleId);

      // 환불함 — 같은 역할의 살아 있는 근거가 없을 때만(위 설명). 환불 대기는 이 도구의 환불을 빼고 본다(그건 '환불함'이 맡는다)
      if (!same.length && rel.some((p) => p.roleId === e.roleId && isToolRefund(p))) { e.cls.refunded++; e.skipped++; continue; }
      // 역할 정리 중 — 같은 역할의 정리 표시 기록이 처리 전이거나 명단을 받은 무렵 처리됐다(classifyQuery 가 그런 환불 건만 읽는다)
      if (!same.length && rel.some((p) => p.roleId === e.roleId && isCleanup(p))) { e.cls.ended++; e.skipped++; continue; }
      if (rel.some((p) => p.status === "refunded" && p.roleId === e.roleId && !isToolRefund(p))) { e.cls.refund++; e.skipped++; continue; }

      if (live.some((p) => p.status === "pending")) { e.cls.pending++; e.skipped++; continue; }

      if (same.length) {
        e.cls[same.some((p) => !p.expiresAt) ? "forever" : "timed"]++;
        // 아직 사이트 보유가 아닌(또는 봇이 이미 처리했는데 역할이 남은) 완료 구매를 다시 큐에 올린다 — 기간(expiresAt)은 건드리지 않는다
        //   📌 환불 역할은 돌리지 않는다 — 이 사람은 사이트에 이미 가졌고, 환불은 '기록 없음'만
        if (!e.keepRole && !refund) {
          const conv = same.filter((p) => p.itemType !== "perk" && (p.siteOnly !== true || p.roleDetached === true));
          if (conv.length) {
            for (const p of conv) {
              e.convert.push(String(p._id));
              if (!p.itemRef && !resolvesItem(p, ctx)) e.fill.push(String(p._id));
            }
            e.convertUsers++;
            continue;
          }
        }
        e.skipped++;
        continue;
      }
      if (rec.some((p) => p.roleId === e.roleId)) { e.cls.ended++; e.cleanup.push(h); continue; }

      // 같은 아이템 — DB 의 살아 있는 기록(전부 다른 역할) + 이번 계획의 앞 역할이 줄 기록
      const holds = [...live, ...(ref ? planned.get(`${h.id}|${ref}`) || [] : [])];
      if (holds.length) {
        const forever = holds.some((p) => !p.expiresAt);
        e.cls[forever ? "forever" : "timed"]++;
        // 옛 역할이 남는 사람 — 역할을 뗄 계획일 때만 센다(권한은 원래 역할을 남긴다).
        //   📌 환불 역할도 같다 — 같은 아이템을 사이트에 가져 환불하지 않으니, 옛 역할을 담은 기록이 없어 역할이 남는다
        if (forever || refund) { if (!e.keepRole) e.roleLeft++; e.skipped++; continue; }
        const base = holds.reduce((a, b) => (endOf(b) > endOf(a) ? b : a));
        give(e, h, ref, e.period.mode === "forever" ? e.term : appendTerm(e.period, base, now));
        continue;
      }

      e.cls.none++;
      if (refund) { e.payees.push(h); continue; }
      give(e, h, ref, e.term);
    }
  }
}

// ── 기간 적용 — 이 도구가 만든 이전 기록(역할 하나)에 기간을 붙이거나 무기한으로 되돌린다 ──
//    대상: itemId "grant" · adminNote "역할 이전…" · 그 역할의 roleId · 완료 · 소모 안 됨 · 이어 붙인 것 아님(renewOf 없음 — 그건 앞 기록에 매여 있다)
//          (이전 기록은 아이템 유형과 무관하게 옛 역할 id 를 roleId 로 담는다)
export const TERM_FIELDS = { createdAt: 1, processedAt: 1, expiresAt: 1, days: 1, reminderSentAt: 1 };
export function termQuery(roleId) {
  return { roleId, itemId: "grant", adminNote: MARK_RE, status: "completed", consumedAt: null, renewOf: { $in: ["", null] } };
}
// 📌 뒤에 이어 붙은 살아 있는 기록(상점 연장 · 이 도구의 이어 붙이기) — 대기 · 완료, 소모 안 됨. renewOf 로 distinct 해 '연장 있음' 기록 id 를 얻는다
export function liveChildQuery(ids) {
  return { renewOf: { $in: ids }, status: { $in: ["pending", "completed"] }, consumedAt: null };
}

//    값: N일 → 받은 시각(createdAt) + N일 · 종료일 → 그날 KST 끝 · 무기한 → 만료 없음. days 도 함께, 만료가 바뀌면 만료 임박 알림 표시(reminderSentAt)를 비운다
//    제외: 지금 만료가 1시간 안이거나 이미 지났다(봇 회수와 겹치지 않게) · 새 만료가 지금 + 1시간 안이다(과거 시각을 쓰지 않는다)
//    연장 있음: 뒤에 살아 있는 연장이 붙은 기록(chained — liveChildQuery 로 읽은 renewOf 모음)은 바꾸지 않는다 —
//              앞 기록만 늘리면 결제한 연장분이 그 안에 묻히고, 무기한으로 되돌리면 연장분이 의미를 잃는다. 줄이면 연장분이 시작 전부터 보유로 잡힌다
//    같은 값이면 '그대로'(다시 눌러도 바뀜 0 — 연장이 붙은 기록도 값이 같으면 그대로로 센다)
export function termPlanFrom(rows, period, now, chained = new Set()) {
  const out = { total: rows.length, change: [], same: 0, excluded: 0, chained: 0, minEnd: null, maxEnd: null };
  for (const p of rows) {
    const cur = p.expiresAt ? new Date(p.expiresAt).getTime() : null;
    if (cur != null && cur <= now + MIN_LEAD_MS) { out.excluded++; continue; }
    const from = new Date(p.createdAt || p.processedAt).getTime();
    if (!Number.isFinite(from)) { out.excluded++; continue; }
    const t = termFrom(period, from);
    const next = t.expiresAt ? t.expiresAt.getTime() : null;
    if (next != null && next <= now + MIN_LEAD_MS) { out.excluded++; continue; }
    if (next === cur && (Number(p.days) || 0) === t.days) { out.same++; continue; }
    if (chained.has(String(p._id))) { out.chained++; continue; }
    out.change.push({
      _id: p._id,
      cur: p.expiresAt ? new Date(p.expiresAt) : null,
      // 되돌릴 때(쓰는 사이 연장이 붙은 경우) 쓸 원래 값
      prev: { expiresAt: p.expiresAt ? new Date(p.expiresAt) : null, days: Number(p.days) || 0, reminderSentAt: p.reminderSentAt ?? null },
      set: { expiresAt: t.expiresAt, days: t.days, ...(next !== cur ? { reminderSentAt: null } : {}) },
    });
    if (next != null) {
      if (out.minEnd == null || next < out.minEnd) out.minEnd = next;
      if (out.maxEnd == null || next > out.maxEnd) out.maxEnd = next;
    }
  }
  return out;
}

// ── 환불로 바꾸기 — 이 도구가 만든 이전 기록(역할 하나)을 환불로 돌리고 1인당 금액을 지급한다 ──
//    대상: termQuery 와 같은 기록(이전 · 완료 · 소모 안 됨 · 이어 붙인 것 아님)
//    제외(수만): 기간 끝남(만료 시각이 지났는데 봇이 아직 expired 로 안 바꿈) · 연장 있음(뒤에 살아 있는 연장 — 결제한 연장분이 묶여 있다) ·
//               환불함(이 역할로 이 도구가 이미 환불한 사람 — doneUsers)
//    📌 사람 단위로 묶는다 — 한 사람의 같은 역할 기록이 둘이어도 지급은 한 번(실행은 기록마다 조건부로 바꾸고, 하나라도 바뀐 사람만 지급)
//    detached: 이미 봇이 역할을 뗀 사이트 보유 기록(siteOnly · roleDetached) — 환불 회수를 다시 걸지 않는다(f174d4f 만료와 같은 이유)
//    members: 서버에 있는 사람(Set) — 주면 없는 사람은 대상에서 빼고 gone(사람 수)으로 센다.
//             📌 퇴장 초기화(resetOnLeave)는 지갑(UserXp)만 지우고 이전 기록은 남긴다 — 지급하면 upsert 가 지운 지갑을 되살린다
export const REFUND_FIELDS = { userId: 1, userName: 1, siteOnly: 1, roleDetached: 1, expiresAt: 1, adminNote: 1 };
export function refundPlanFrom(rows, now, chained = new Set(), doneUsers = new Set(), members = null) {
  const out = { total: rows.length, ended: 0, chained: 0, done: 0, gone: 0, people: [] };
  const byUser = new Map();
  const goneUsers = new Set();
  for (const p of rows) {
    if (p.expiresAt && new Date(p.expiresAt).getTime() <= now) { out.ended++; continue; }
    if (chained.has(String(p._id))) { out.chained++; continue; }
    if (doneUsers.has(p.userId)) { out.done++; continue; }
    if (members && !members.has(p.userId)) { goneUsers.add(p.userId); continue; }
    if (!byUser.has(p.userId)) byUser.set(p.userId, { id: p.userId, name: p.userName || "", recs: [] });
    byUser.get(p.userId).recs.push({ _id: p._id, detached: p.siteOnly === true && p.roleDetached === true });
  }
  out.gone = goneUsers.size;
  out.people = [...byUser.values()];
  return out;
}

// 기록 메모(adminNote "역할 이전 · <역할>" · "역할 환불 · <역할>" · "역할 정리 · <역할>")의 역할 이름 — 디스코드에서 지운 역할도 이 이름으로 보인다
export const roleNameOf = (note) => String(note || "").replace(TOOL_RE, "").replace(CLEANUP_MARK_RE, "").replace(/^\s*·\s*/, "").trim();
// 지급 사유 — 원장 줄 이름. 표시 기록의 메모와 같은 글자(역할 환불 · <역할>)
export const refundReason = (roleName) => `${REFUND_MARK} · ${roleName}`.slice(0, 120);

// ── 지급 빠짐 — 이 도구의 환불 근거(isToolRefund)는 있는데 지급 기록(Payout)이 없는 사람 ──
//    📌 근거와 지급은 Payout._id = 근거 기록(Purchase)의 _id 로 잇는다 — 환불은 표시 기록, 환불로 바꾸기는 그 사람의 바꾼 기록 중 첫 건.
//       같은 _id 는 두 번 들어가지 않아 다시 눌러도 · 겹쳐도 한 묶음에 지급 하나다.
//    한 번의 실행 = (역할, 사람, revokedAt) 묶음 — 묶음의 기록 중 하나라도 같은 _id 의 Payout 이 있으면 지급된 것(상태 무관 — 대기 · 처리 중도 봇 · 관리자 몫).
//    빙옥 '처리 중'(사이트가 지급 전에 먼저 적는 자리 — 반영됐는지 모름)은 '확인 필요'로 따로 센다.
//    없으면 '지급 빠짐' — 빠진 지급은 묶음의 가장 작은 _id 로 지급한다(key). at = 근거 기록의 revokedAt(ms)
//    recs: [{ _id, roleId, userId, userName, revokedAt, adminNote }], payouts: Map(_id 문자열 → { status, currency })
export function refundGapsFrom(recs, payouts) {
  const groups = new Map();
  for (const p of recs) {
    const at = p.revokedAt ? new Date(p.revokedAt).getTime() : 0;
    const k = `${p.roleId}|${p.userId}|${at}`;
    if (!groups.has(k)) groups.set(k, { roleId: p.roleId, id: p.userId, name: p.userName || "", at, ids: [], note: p.adminNote || "" });
    groups.get(k).ids.push(String(p._id));
  }
  const out = { groups: groups.size, paid: 0, unsure: [], unpaid: [] };
  for (const g of groups.values()) {
    g.ids.sort();
    const hit = g.ids.map((id) => payouts.get(id)).find(Boolean);
    const one = { roleId: g.roleId, id: g.id, name: g.name, key: g.ids[0], at: g.at, note: g.note };
    if (!hit) out.unpaid.push(one);
    else if (hit.status === "processing" && hit.currency === "point") out.unsure.push(one);
    else out.paid++;
  }
  return out;
}

// 확인 창에 보인 대상과 실행 대상을 맞춰 보는 짧은 값 — 같은 값을 넣으면 같은 글자(FNV-1a 두 벌, 16자리). 보안용이 아니라 바뀜 감지용
export function keyOf(v) {
  const s = JSON.stringify(v);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
    b = (b + (a >>> 7)) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
