export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { MAX_REWARD_DAYS, MAX_REWARDS, MAX_TIERS, rewardsOf } from "@/lib/seasonPass";
import { eventItemStates, draftItemsMessage, missingItemsMessage } from "@/lib/eventPass";
import {
  INVITE_DAYS,
  INVITE_TICKETS,
  INVITE_NEED_MAX,
  normalizeInviteTiers,
  loadInviteConfig,
  getInviteAdmin,
  writeInviteConfig,
} from "@/lib/invite";

// 📌 친구 초대 설정(관리자) — 단일 문서(key "invite" — lib/invite.js INVITE_KEY). 이벤트 패스 설정(app/api/admin/event-pass)과 같은 규칙:
//    · 관리자 판정은 서버(lib/apiAuth requireAdmin — getServerSession + isAdminName)
//    · 온 칸만 덮어쓴다(빠진 칸이 통째로 지워지거나 꺼지지 않게) · 정렬 · level · tid 발급은 서버가 한다(화면 순서를 믿지 않는다).
//      지금 문서에 없는 tid 는 새로 발급한다(지운 단계의 번호가 되살아나 옛 수령 기록과 섞이지 않게 — 괴담회 sid/pid 와 같은 이유)
//    · 설정 문서는 초안 밖이라 저장이 바로 실사이트에 뜬다
//    · 아이템 보상은 실사이트 Item 이나 초안(반영 전)에 있으면 저장한다 — 어디에도 없는 새 아이템만 돌려보낸다(이미 저장된 것은 그대로).
//      켜진 채 저장(켜기 · 켜져 있는 동안의 저장)은 보상 아이템이 전부 실사이트에 있을 때만 — 지급은 실사이트 Item 만 하기 때문(문구는 이벤트 패스와 같다)
//    · 단계 need = 누적 초대 수 — 1 이상 정수 · 단계마다 달라야 한다(정리 함수는 겹침을 막지 않는다 — 여기서 먼저 돌려보낸다)
//    GET → { ok, cfg, itemStates, stats: { uses, codes, ticketsPending } }
//    PUT body { enabled?, startsAt?, joinDays?, accountDays?, bonus?: { enabled?, endsAt?, inviter?, invitee? }, welcome?, tiers? } → GET 과 같은 본문
//      bonus 는 온 칸만 지금 값에 얹어 검사한 뒤 통째로 저장한다 · 일수 0~60(0 = 조건 없음 · 기한 없음) · 추첨권 0~10장
//      welcome — 들어온 친구 보상 묶음(단계 보상과 같은 검사 · 같은 정리 · 빈 배열 = 보상 없음). 아이템 존재 검사 · 켜기 막기도 단계 보상과 함께 본다
//    실패는 { ok: false, error }
const NO_ITEM = "존재하지 않는 아이템은 보상으로 저장할 수 없습니다.";
const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });
// 관리자 거절(401 · 403)을 이 라우트 모양으로 — 상태 · 문구는 그대로
async function relay(res) {
  let j = {};
  try {
    j = await res.clone().json();
  } catch {}
  return fail(res.status, j?.error || j?.message || "권한이 없습니다.");
}
const dateOf = (v) => {
  if (v == null || v === "") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};
const isInt = (v, min, max) => v !== "" && v !== null && v !== undefined && typeof v !== "boolean" && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;

// ── [조회] 친구 초대 설정 ──
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return relay(auth.deny);
    await connectToDatabase();
    return NextResponse.json({ ok: true, ...(await getInviteAdmin()) });
  } catch (e) {
    console.error("친구 초대 설정 조회 오류:", e);
    return fail(500, "조회 중 오류가 발생했습니다.");
  }
}

// 보상 묶음 검사(단계 · 들어온 친구 보상 공용) — 개수 상한 · 아이템 기간 상한. 괜찮으면 ""
function checkRewards(free, head) {
  if (!Array.isArray(free)) return "보상 형식이 올바르지 않습니다.";
  if (free.filter((r) => r && r.kind && r.kind !== "none").length > MAX_REWARDS) return `${head} 최대 ${MAX_REWARDS}개까지 넣을 수 있습니다.`;
  // 📌 아이템 기간(days) — 상한을 넘는 값은 조용히 깎지 않고 돌려보낸다(이벤트 패스 설정과 같다)
  if (free.some((r) => r?.kind === "item" && Number(r?.days) > MAX_REWARD_DAYS)) return `아이템 기간은 ${MAX_REWARD_DAYS.toLocaleString()}일 이하로 입력해 주십시오.`;
  return "";
}

// 단계 검사 — 정리 함수가 조용히 고치거나 빼 버릴 값을 먼저 돌려보낸다. 괜찮으면 ""
function checkTiers(list) {
  if (list.length > MAX_TIERS) return `단계는 최대 ${MAX_TIERS}개까지 등록할 수 있습니다.`;
  const seen = new Set();
  for (const t of list) {
    if (!isInt(t?.need, 1, INVITE_NEED_MAX)) return `인원은 1~${INVITE_NEED_MAX.toLocaleString()} 사이 정수로 입력해 주십시오.`;
    const need = Number(t.need);
    if (seen.has(need)) return `같은 인원(${need}명)의 단계가 이미 있습니다.`;
    seen.add(need);
    const bad = checkRewards(t?.free == null ? [] : t.free, "보상은 단계마다");
    if (bad) return bad;
  }
  return "";
}

// ── [저장] 친구 초대 설정 ──
export async function PUT(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return relay(auth.deny);
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));

    // 지금 설정을 먼저 읽는다 — tid 를 이어서 발급하려면 nextTid · 지금 tid 가 필요하다
    const cur = await loadInviteConfig();
    const $set = { updatedAt: new Date() };

    if (b?.startsAt !== undefined) {
      const d = dateOf(b.startsAt);
      if (!d) return fail(400, "시작 시각이 올바르지 않습니다.");
      $set.startsAt = d;
    }    if (b?.joinDays !== undefined) {
      if (!isInt(b.joinDays, INVITE_DAYS.min, INVITE_DAYS.max)) return fail(400, `입력 기한은 ${INVITE_DAYS.min}~${INVITE_DAYS.max}일 사이 정수로 입력해 주십시오.`);
      $set.joinDays = Number(b.joinDays);
    }
    if (b?.accountDays !== undefined) {
      if (!isInt(b.accountDays, INVITE_DAYS.min, INVITE_DAYS.max)) return fail(400, `계정 최소 나이는 ${INVITE_DAYS.min}~${INVITE_DAYS.max}일 사이 정수로 입력해 주십시오.`);
      $set.accountDays = Number(b.accountDays);
    }

    // 추첨권 보너스 — 온 칸만 지금 값에 얹는다
    if (b?.bonus !== undefined) {
      if (!b.bonus || typeof b.bonus !== "object" || Array.isArray(b.bonus)) return fail(400, "보너스 형식이 올바르지 않습니다.");
      const bo = b.bonus;
      const next = { ...cur.bonus };
      if (bo.enabled !== undefined) next.enabled = !!bo.enabled;
      if (bo.endsAt !== undefined) {
        const d = dateOf(bo.endsAt);
        if (!d) return fail(400, "보너스 끝 시각이 올바르지 않습니다.");
        next.endsAt = d;
      }
      for (const k of ["inviter", "invitee"]) {
        if (bo[k] === undefined) continue;
        if (!isInt(bo[k], INVITE_TICKETS.min, INVITE_TICKETS.max)) return fail(400, `추첨권 장 수는 ${INVITE_TICKETS.min}~${INVITE_TICKETS.max}장 사이 정수로 입력해 주십시오.`);
        next[k] = Number(bo[k]);
      }
      $set.bonus = next;
    }

    // 들어온 친구 보상 — 보낸 묶음 통째로(빈 배열 = 보상 없음)
    if (b?.welcome !== undefined) {
      const bad = checkRewards(b.welcome, "친구 보상은");
      if (bad) return fail(400, bad);
      $set.welcome = rewardsOf(b.welcome);
    }

    if (b?.tiers !== undefined) {
      if (!Array.isArray(b.tiers)) return fail(400, "단계 형식이 올바르지 않습니다.");
      const bad = checkTiers(b.tiers);
      if (bad) return fail(400, bad);
      // 지금 문서에 없는 tid 는 비워 새로 발급받는다(손으로 만든 값 · 지운 단계의 번호)
      const known = new Set(cur.tiers.map((t) => t.tid));
      const rows = b.tiers.map((t) => ({ ...t, tid: known.has(String(t?.tid || "")) ? String(t.tid) : "" }));
      const n = normalizeInviteTiers(rows, cur.nextTid);
      $set.tiers = n.tiers;
      $set.nextTid = n.nextTid;
    }

    // 📌 저장 뒤 모습(보낸 단계 · 들어온 친구 보상, 아니면 저장된 것)의 아이템 보상 상태 — 아래 저장 검사 · 켜기 막기가 같이 쓴다
    //    정리를 거친 묶음이라 그대로 읽는다(아래 이름 스냅샷이 이 객체를 고쳐 그대로 저장된다)
    const tiersAfter = $set.tiers ?? cur.tiers;
    const welcomeAfter = $set.welcome ?? cur.welcome;
    const rewards = [...tiersAfter.flatMap((t) => t.free), ...welcomeAfter].filter((r) => r.kind === "item");
    const states = await eventItemStates(rewards.map((r) => r.itemId));
    const stateOf = (id) => states.get(String(id || ""))?.state || "missing";

    if (($set.tiers || $set.welcome) && rewards.length) {
      // 어디에도 없는 아이템은 새로 저장하지 않는다 — 이미 저장된 단계 · 친구 보상에 있던 것은 그대로 둔다(화면이 경고 줄로 알린다)
      const had = new Set([...cur.tiers.flatMap((t) => t.free), ...cur.welcome].filter((r) => r.kind === "item").map((r) => r.itemId));
      if (rewards.some((r) => stateOf(r.itemId) === "missing" && !had.has(r.itemId))) return fail(400, NO_ITEM);
      // 이름 스냅샷 — 실사이트 이름, 없으면 초안 이름(찾을 때만 바꾼다)
      for (const r of rewards) {
        const name = states.get(r.itemId)?.name;
        if (name) r.itemName = name;
      }
    }

    // 📌 켜기 막기 — 저장 뒤 켜져 있으면(켜기 · 켜져 있는 동안의 저장) 보상 아이템이 전부 실사이트에 있어야 한다. 끄는 저장은 늘 받는다
    const enabledAfter = b?.enabled !== undefined ? !!b.enabled : cur.enabled;
    if (enabledAfter) {
      const ids = [...new Set(rewards.map((r) => r.itemId))];
      const draftIds = ids.filter((id) => stateOf(id) === "draft");
      if (draftIds.length) {
        const nameOf = (id) => states.get(id)?.name || rewards.find((r) => r.itemId === id)?.itemName || "이름 없음";
        return fail(400, draftItemsMessage(draftIds.map(nameOf)));
      }
      const missing = ids.filter((id) => stateOf(id) === "missing");
      if (missing.length) return fail(400, missingItemsMessage(missing.length));
    }
    if (b?.enabled !== undefined) $set.enabled = !!b.enabled;

    const cfg = await writeInviteConfig($set);
    return NextResponse.json({ ok: true, ...(await getInviteAdmin(cfg)) });
  } catch (e) {
    console.error("친구 초대 설정 저장 오류:", e);
    return fail(500, "저장 중 오류가 발생했습니다.");
  }
}
