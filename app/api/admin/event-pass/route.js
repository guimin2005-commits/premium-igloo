export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { rewardsOf, MAX_REWARD_DAYS } from "@/lib/seasonPass";
import {
  EVENT_PASS_KEY,
  EVENT_PASS_DEFAULTS,
  normalizeEventTiers,
  toAdminEventPass,
  eventItemStates,
  draftItemsMessage,
  missingItemsMessage,
} from "@/lib/eventPass";
import EventPass from "@/models/EventPass";

// 📌 이벤트 패스 설정(관리자) — 단일 문서(key EVENT_PASS_KEY). 시즌 패스 설정(app/api/admin/pass)과 같은 규칙:
//    · 관리자 판정은 서버(lib/apiAuth denyIfNotAdmin — getServerSession + isAdminName)
//    · 온 칸만 덮어쓴다(빠진 칸이 통째로 지워지거나 꺼지지 않게) · 정렬 · level · tid 발급은 서버가 한다(화면 순서를 믿지 않는다)
//    · 설정 문서는 시즌 패스처럼 초안 밖이라 저장이 바로 실사이트에 뜬다
//    📌 2026-10-17 운영자 "ㅃㄹ 바꿔" — 아이템 보상은 실사이트 Item 이나 초안(반영 전 · 삭제 예정 아님)에 있으면 저장한다(lib/eventPass.js 「아이템 보상 상태」).
//       어디에도 없는 새 아이템만 돌려보낸다(이미 저장된 단계에 있던 것은 그대로 둔다). 이름 스냅샷은 실사이트 이름, 없으면 초안 이름.
//       켜진 채 저장(켜기 · 켜져 있는 동안의 저장)은 보상 아이템이 전부 실사이트에 있을 때만 — 지급은 실사이트 Item 만 하기 때문
//    GET → { ok: true, pass, itemStates } · PUT body { enabled?, title?, startsAt?, endsAt?, tiers? } → { ok: true, pass, itemStates }
//      itemStates — 저장된 단계의 아이템 보상 id → "live" | "draft" | "missing"(관리 화면의 「반영 전」 표시 · 「사용」 잠금 · 경고 줄)
//    📌 2026-10-17 미션 폐지 — 옛 화면이 missions 를 보내도 읽지 않는다(저장하지 않는다)
//    실패는 { ok: false, error }
const NO_ITEM = "존재하지 않는 아이템은 보상으로 저장할 수 없습니다.";
const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });
// 단계 목록 → 아이템 보상 줄(빈 보상 빼고 단계마다 앞 4개 — lib/seasonPass rewardsOf)
const itemRewardsOf = (tiers) => (Array.isArray(tiers) ? tiers : []).flatMap((t) => rewardsOf(t?.free)).filter((r) => r.kind === "item");
// 응답 모양 — Map(id → { state }) → { id: state }
const statesOut = (m) => Object.fromEntries([...m].map(([id, s]) => [id, s.state]));
// 관리자 거절(401 · 403)을 이 라우트 모양으로 — 상태 · 문구는 그대로
async function relay(res) {
  let j = {};
  try {
    j = await res.clone().json();
  } catch {}
  return fail(res.status, j?.error || j?.message || "권한이 없습니다.");
}

// 없으면 기본값으로 만든다(시즌 패스 설정과 같은 방식) — 꺼짐 · 기본 제목 · 기본 기간
const ensureDoc = () =>
  EventPass.findOneAndUpdate(
    { key: EVENT_PASS_KEY },
    {
      $setOnInsert: {
        key: EVENT_PASS_KEY,
        title: EVENT_PASS_DEFAULTS.title,
        startsAt: new Date(EVENT_PASS_DEFAULTS.startsAt),
        endsAt: new Date(EVENT_PASS_DEFAULTS.endsAt),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

const dateOf = (v) => {
  if (v == null || v === "") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

// ── [조회] 이벤트 패스 설정 ──
export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return relay(deny);
    await connectToDatabase();
    const pass = toAdminEventPass(await ensureDoc());
    const states = await eventItemStates(itemRewardsOf(pass.tiers).map((r) => r.itemId));
    return NextResponse.json({ ok: true, pass, itemStates: statesOut(states) });
  } catch (e) {
    console.error("이벤트 패스 설정 조회 오류:", e);
    return fail(500, "조회 중 오류가 발생했습니다.");
  }
}

// ── [저장] 이벤트 패스 설정 ──
export async function PUT(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return relay(deny);
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));

    // 지금 문서를 먼저 확보한다 — tid 를 이어서 발급하려면 nextTid 가 필요하다
    const cur = await ensureDoc();
    const $set = { updatedAt: new Date() };

    if (b?.title !== undefined) {
      const title = String(b.title || "").trim();
      if (!title) return fail(400, "제목을 입력해 주십시오.");
      if (title.length > 40) return fail(400, "제목은 40자 이하로 입력해 주십시오.");
      $set.title = title;
    }

    // 기간 — [시작, 종료). 한쪽만 와도 저장된 다른 쪽과 견준다
    if (b?.startsAt !== undefined || b?.endsAt !== undefined) {
      const start = b?.startsAt !== undefined ? dateOf(b.startsAt) : dateOf(cur?.startsAt);
      const end = b?.endsAt !== undefined ? dateOf(b.endsAt) : dateOf(cur?.endsAt);
      if (!start || !end) return fail(400, "기간이 올바르지 않습니다.");
      if (end.getTime() <= start.getTime()) return fail(400, "종료 시각은 시작 시각 이후로 지정해 주십시오.");
      if (b?.startsAt !== undefined) $set.startsAt = start;
      if (b?.endsAt !== undefined) $set.endsAt = end;
    }

    if (Array.isArray(b?.tiers)) {
      // 📌 아이템 기간(days) — 상한을 넘는 값은 조용히 깎지 않고 돌려보낸다(시즌 패스 설정과 같다)
      if (b.tiers.some((t) => [t?.free].flat().some((r) => r?.kind === "item" && Number(r?.days) > MAX_REWARD_DAYS))) {
        return fail(400, `아이템 기간은 ${MAX_REWARD_DAYS.toLocaleString()}일 이하로 입력해 주십시오.`);
      }
      const n = normalizeEventTiers(b.tiers, cur?.nextTid);
      $set.tiers = n.tiers;
      $set.nextTid = n.nextTid;
    }

    // 📌 저장 뒤 모습(보낸 단계 · 아니면 저장된 단계)의 아이템 보상 상태 — 아래 저장 검사 · 켜기 막기 · 응답이 같이 쓴다
    //    정리를 거친 단계라 free 를 그대로 읽는다(아래 이름 스냅샷이 이 객체를 고쳐 그대로 저장된다 — rewardsOf 는 새 객체를 만든다)
    const tiersAfter = $set.tiers ?? normalizeEventTiers(cur?.tiers, cur?.nextTid).tiers;
    const rewards = tiersAfter.flatMap((t) => t.free).filter((r) => r.kind === "item");
    const states = await eventItemStates(rewards.map((r) => r.itemId));
    const stateOf = (id) => states.get(String(id || ""))?.state || "missing";

    if ($set.tiers && rewards.length) {
      // 어디에도 없는 아이템은 새로 저장하지 않는다 — 이미 저장된 단계에 있던 것은 그대로 둔다(초안을 버린 뒤에도 다른 칸을 고칠 수 있게 · 화면이 경고 줄로 알린다)
      const had = new Set(itemRewardsOf(cur?.tiers).map((r) => r.itemId));
      if (rewards.some((r) => stateOf(r.itemId) === "missing" && !had.has(r.itemId))) return fail(400, NO_ITEM);
      // 이름 스냅샷 — 실사이트 이름, 없으면 초안 이름(찾을 때만 바꾼다)
      for (const r of rewards) {
        const name = states.get(r.itemId)?.name;
        if (name) r.itemName = name;
      }
    }

    // 📌 켜기 막기 — 저장 뒤 켜져 있으면(켜기 · 켜져 있는 동안의 저장) 보상 아이템이 전부 실사이트에 있어야 한다. 끄는 저장은 늘 받는다
    const enabledAfter = b?.enabled !== undefined ? !!b.enabled : !!cur?.enabled;
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

    const doc = await EventPass.findOneAndUpdate({ key: EVENT_PASS_KEY }, { $set }, { new: true }).lean();
    return NextResponse.json({ ok: true, pass: toAdminEventPass(doc), itemStates: statesOut(states) });
  } catch (e) {
    console.error("이벤트 패스 설정 저장 오류:", e);
    return fail(500, "저장 중 오류가 발생했습니다.");
  }
}
