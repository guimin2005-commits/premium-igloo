// 📌 역할 이전의 기간 · 보유자 분류 · 기간 적용 계산 — 순수 함수만(DB 읽기 · 쓰기 없음).
//    관리자 역할 이전 API(app/api/admin/role-migration/route.js)가 DB 에서 읽은 기록을 넘겨 쓴다.
//    조회 조건(classifyQuery · termQuery)도 여기 두어, 미리보기 · 실행 · 점검 스크립트가 같은 기록을 같은 규칙으로 센다.
//
//    기간(period): { mode: "forever" } | { mode: "days", days: 1~3650 } | { mode: "until", until: "YYYY-MM-DD" }(그날 KST 23:59:59.999 까지)
//    기록 값: days(표시 · DM 의 일수, 0 = 무기한) · expiresAt(유일한 만료 기준, null = 무기한) — models/Purchase.js

export const MARK = "역할 이전"; // adminNote 머리 — 이 도구가 만든 기록
export const MARK_RE = /^역할 이전/;

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

// 이전 표(Setting roleMigrationMap) 한 칸 — 예전 형식은 아이템 id 글자 하나(기간 없음 = 무기한), 지금은 { item, period }
export function mapEntry(v) {
  if (typeof v === "string") return { item: v, period: FOREVER };
  if (v && typeof v === "object" && !Array.isArray(v)) return { item: String(v.item || ""), period: storedPeriod(v.period) };
  return { item: "", period: FOREVER };
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
//    살아 있음 = 대기 · 완료이면서 기간이 없거나 남은 것(lib/ownedItems.js 와 같은 기준)
export const CLASSIFY_FIELDS = { userId: 1, roleId: 1, itemRef: 1, itemId: 1, itemType: 1, status: 1, siteOnly: 1, roleDetached: 1, expiresAt: 1 };
export const REFUND_LAG_MS = 10 * 60 * 1000; // 명단 시각에서 이만큼 앞의 환불까지(봇이 떼는 데 걸리는 시간 여유)
export function classifyQuery({ userIds, roleIds, refs, since }) {
  const refund = [{ roleDetached: { $ne: true } }, ...(Number.isFinite(since) ? [{ revokedAt: { $gte: new Date(since) } }] : [])];
  return {
    userId: { $in: userIds },
    consumedAt: null,
    $and: [
      { $or: [{ roleId: { $in: roleIds } }, ...(refs.length ? [{ itemRef: { $in: refs } }] : [])] },
      { $or: [{ status: { $in: ["pending", "completed", "expired"] } }, { status: "refunded", $or: refund }] },
    ],
  };
}

// active: 계획의 역할들(실행 순서) — { roleId, item(없으면 새로 만들 것), keepRole, period, term, holders: [{ id, name }] } 에
//         결과 칸(insert · convert · fill · convertUsers · skipped · cls · roleLeft)을 채운다. recs: classifyQuery 로 읽은 기록
//         insert: [{ h, id, term }] — id 는 새 기록의 _id(미리 정한다 — 같은 계획의 뒤 역할이 이 기록 뒤에 이어 붙을 수 있게. 실행은 이 id 로 넣는다)
//      환불 대기 — 같은 역할의 환불 건을 봇이 아직 처리하지 않았다 → 건너뜀(지금 기록을 주면 그 기록이 역할의 근거가 되어 환불 회수가 막힌다)
//      지급 대기 — 살아 있는 근거 중 pending 이 있다 → 건너뜀(봇이 지급하며 역할을 붙인다. 지금 돌리면 그 뒤 붙은 역할이 남는다 — 다음 실행에서)
//      같은 역할의 근거
//        살아 있음 → 새 기록 없음, 기간 그대로(기간제 · 무기한으로 셈). 역할을 뗄 계획이면 완료 건을 사이트 보유로(아이템을 못 찾는 건은 itemRef 채움).
//                    권한이면 그대로(만료 때 봇이 회수)
//        전부 끝남 → 기간 끝남 · 건너뜀(아이템을 주지 않는다 — 새 기록이 끝난 기간을 되살리지 않게. 역할을 떼는 봇 경로가 없다)
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
    for (const h of e.holders) {
      const rel = (byUser.get(h.id) || []).filter((p) => p.roleId === e.roleId || (ref && p.itemRef === ref));

      if (rel.some((p) => p.status === "refunded" && p.roleId === e.roleId)) { e.cls.refund++; e.skipped++; continue; }
      const rec = rel.filter((p) => p.status !== "refunded"); // 다른 역할의 환불 건은 이 역할과 무관
      const live = rec.filter(isLiveRec);

      if (live.some((p) => p.status === "pending")) { e.cls.pending++; e.skipped++; continue; }

      const same = live.filter((p) => p.roleId === e.roleId);
      if (same.length) {
        e.cls[same.some((p) => !p.expiresAt) ? "forever" : "timed"]++;
        // 아직 사이트 보유가 아닌(또는 봇이 이미 처리했는데 역할이 남은) 완료 구매를 다시 큐에 올린다 — 기간(expiresAt)은 건드리지 않는다
        if (!e.keepRole) {
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
      if (rec.some((p) => p.roleId === e.roleId)) { e.cls.ended++; e.skipped++; continue; }

      // 같은 아이템 — DB 의 살아 있는 기록(전부 다른 역할) + 이번 계획의 앞 역할이 줄 기록
      const holds = [...live, ...(ref ? planned.get(`${h.id}|${ref}`) || [] : [])];
      if (holds.length) {
        const forever = holds.some((p) => !p.expiresAt);
        e.cls[forever ? "forever" : "timed"]++;
        // 옛 역할이 남는 사람 — 역할을 뗄 계획일 때만 센다(권한은 원래 역할을 남긴다)
        if (forever) { if (!e.keepRole) e.roleLeft++; e.skipped++; continue; }
        const base = holds.reduce((a, b) => (endOf(b) > endOf(a) ? b : a));
        give(e, h, ref, e.period.mode === "forever" ? e.term : appendTerm(e.period, base, now));
        continue;
      }

      e.cls.none++;
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
