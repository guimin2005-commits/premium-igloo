export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { eventItemStates } from "@/lib/eventPass";
import { unitThingSet } from "@/lib/unitSale";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import {
  PRIZE_KINDS,
  MAX_SCREENINGS,
  MAX_PRIZES,
  MAX_TITLE,
  PRIZE_COUNT,
  NUM_MAX,
  SCREENING_TICKETS,
  SCREENING_RATIO,
  PRIZE_WEIGHT,
  MAX_CODE_LEN,
  MAX_CODES_PER_SAVE,
  VOICE_MINUTES,
  VOICE_TICKETS,
  normalizeScreenings,
  normalizePrizes,
  normalizeVoice,
  prizeTitle,
  loadGoedamConfig,
  getGoedamAdmin,
  goedamRoster,
  goedamDraws,
  addGoedamCodes,
  listGoedamCodes,
  writeGoedamConfig,
} from "@/lib/goedam";

// 📌 괴담회 설정(관리자) — 단일 문서(key GOEDAM_KEY). 이벤트 패스 설정(app/api/admin/event-pass)과 같은 규칙:
//    · 관리자 판정은 서버(lib/apiAuth requireAdmin — getServerSession + isAdminName)
//    · 온 칸만 덮어쓴다(빠진 칸이 통째로 지워지거나 꺼지지 않게) · 정렬 · sid/pid 발급은 서버가 한다(화면 순서를 믿지 않는다).
//      지금 문서에 없는 sid/pid 는 새로 발급한다(지운 회차 · 상품의 번호가 되살아나 옛 기록과 섞이지 않게 — lib/goedamRules.js issueIds)
//    · 설정 문서는 초안 밖이라 저장이 바로 실사이트에 뜬다(봇도 60초 안에 다시 읽는다)
//    · 아이템(추첨권 · 아이템 상품)은 실사이트 Item 이나 초안(반영 전)에 있으면 저장한다 — 어디에도 없는 새 아이템만 돌려보낸다(이미 저장된 것은 그대로).
//      아이템 상품이 반영 전이면 추첨이 그 상품을 고르지 않는다(lib/goedam.js readyOf). 켜기는 추첨권 아이템이 실사이트에 있을 때만(봇이 그 id 로 추첨권을 준다)
//    · code 상품의 코드는 prizes[].codes(줄마다 하나 — 화면이 나눠 보낸다)로 받아 GoedamCode 에 없는 것만 넣는다(이미 나간 코드는 그대로 · 지우지 않는다)
//    · 📌 2026-10-24 음성 활동(voice { enabled, minutes, tickets, startsAt, endsAt }) — 온 칸만 지금 값에 얹어 검사한 뒤 통째로 저장한다(lib/goedamRules.js normalizeVoice)
//    GET               → { success, data: { config, itemStates, stock, shop, voiceDays } } — shop: 추첨권을 파는 상품 { id, name, href } | null · voiceDays: 음성 기록이 있는 날
//    GET ?watch=<sid>  → { success, data: [{ userId, userName, seconds, pct, earned, grantedAt, granted, manual }] } — 그 회차 명단(머문 초 많은 순).
//                        sid 자리에 "voice:<YYYY-MM-DD>" 를 주면 그날 음성 명단(비율 · 달성은 지금 설정의 하루 분 기준)
//    GET ?draws=1      → { success, data: [{ id, at, userId, userName, pid, prizeName, kind, amount, code, granted, error }] } — 최근 추첨 300건
//    PUT body { enabled?, title?, channelId?, ticketItemId?, drawOpensAt?, drawClosesAt?, screenings?, voice?, prizes? }
//              → { success, data: { config, itemStates, stock, shop, voiceDays, added: { pid: 넣은 코드 수 } } }
//    실패는 { success: false, error, message }
const fail = (status, error) => NextResponse.json({ success: false, message: error, error }, { status });
const NO_ITEM = "존재하지 않는 아이템은 상품으로 저장할 수 없습니다.";
const SNOWFLAKE = /^\d{17,20}$/;
const dateOf = (v) => {
  if (v == null || v === "") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};
const isInt = (v, min, max) => Number.isInteger(Number(v)) && v !== "" && v !== null && Number(v) >= min && Number(v) <= max;

// ── [조회] 설정 · 회차 명단 · 추첨 기록 ──
export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    if (sp.has("watch")) {
      const rows = await goedamRoster(String(sp.get("watch") || ""));
      if (!rows) return fail(404, "존재하지 않는 회차입니다.");
      return NextResponse.json({ success: true, data: rows });
    }
    if (sp.get("draws") === "1") return NextResponse.json({ success: true, data: await goedamDraws() });
    // 📌 code 상품의 등록된 코드 목록(상품 편집 창) — ?codes=<pid>
    if (sp.has("codes")) return NextResponse.json({ success: true, data: await listGoedamCodes(String(sp.get("codes") || "").slice(0, 40)) });
    return NextResponse.json({ success: true, data: await getGoedamAdmin() });
  } catch (e) {
    console.error("괴담회 설정 조회 오류:", e);
    return fail(500, "조회 중 오류가 발생했습니다.");
  }
}

// 회차 검사 — 정리 함수가 조용히 고치거나 빼 버릴 값을 먼저 돌려보낸다. 괜찮으면 ""
function checkScreenings(list) {
  if (list.length > MAX_SCREENINGS) return `회차는 최대 ${MAX_SCREENINGS}개까지 등록할 수 있습니다.`;
  for (const [i, r] of list.entries()) {
    const title = String(r?.title ?? "").trim();
    const no = title ? `「${title}」 회차` : `${i + 1}번째 회차`;
    if (!title) return `${no}의 제목을 입력해 주십시오.`;
    if (title.length > MAX_TITLE) return `${no}의 제목은 ${MAX_TITLE}자 이하로 입력해 주십시오.`;
    const s = dateOf(r?.startsAt);
    const e = dateOf(r?.endsAt);
    if (!s || !e) return `${no}의 시작 · 종료 시각을 입력해 주십시오.`;
    if (e.getTime() <= s.getTime()) return `${no}의 종료 시각은 시작 시각 이후로 지정해 주십시오.`;
    if (!isInt(r?.tickets, SCREENING_TICKETS.min, SCREENING_TICKETS.max)) return `${no}의 장 수는 ${SCREENING_TICKETS.min}~${SCREENING_TICKETS.max} 사이로 입력해 주십시오.`;
    const ratio = Number(r?.ratio);
    if (r?.ratio === "" || r?.ratio == null || !Number.isFinite(ratio) || ratio < SCREENING_RATIO.min || ratio > SCREENING_RATIO.max) {
      return `${no}의 완청 비율은 ${SCREENING_RATIO.min * 100}~${SCREENING_RATIO.max * 100}% 사이로 입력해 주십시오.`;
    }
  }
  return "";
}

// 음성 활동 검사 — 지금 값에 온 칸을 얹은 한 벌(v)로. 괜찮으면 ""
function checkVoice(v) {
  if (v.enabled !== undefined && typeof v.enabled !== "boolean") return "음성 활동 사용 여부가 올바르지 않습니다.";
  if (!isInt(v.minutes, VOICE_MINUTES.min, VOICE_MINUTES.max)) return `하루 음성 시간은 ${VOICE_MINUTES.min}~${VOICE_MINUTES.max.toLocaleString()}분 사이로 입력해 주십시오.`;
  if (!isInt(v.tickets, VOICE_TICKETS.min, VOICE_TICKETS.max)) return `음성 활동 장 수는 ${VOICE_TICKETS.min}~${VOICE_TICKETS.max} 사이로 입력해 주십시오.`;
  const s = dateOf(v.startsAt);
  const e = dateOf(v.endsAt);
  if (!s || !e) return "음성 활동 기간이 올바르지 않습니다.";
  if (e.getTime() <= s.getTime()) return "음성 활동 종료 시각은 시작 시각 이후로 지정해 주십시오.";
  return "";
}

// 상품 검사 — 같은 규칙. codes 는 code 상품만 · 한 장 MAX_CODE_LEN 자 · 한 번에 MAX_CODES_PER_SAVE 장까지
function checkPrizes(list) {
  if (list.length > MAX_PRIZES) return `상품은 최대 ${MAX_PRIZES}개까지 등록할 수 있습니다.`;
  let codeCount = 0;
  for (const [i, r] of list.entries()) {
    const name = String(r?.name ?? "").trim();
    const no = name ? `「${name}」` : `${i + 1}번째 상품`;
    if (name.length > MAX_TITLE) return `${no}의 이름은 ${MAX_TITLE}자 이하로 입력해 주십시오.`;
    const kind = r?.kind;
    if (!PRIZE_KINDS.includes(kind)) return `${no}의 종류가 올바르지 않습니다.`;
    if ((kind === "xp" || kind === "point") && !isInt(r?.amount, 1, NUM_MAX)) return `${no}의 수량을 1 이상 10억 이하로 입력해 주십시오.`;
    if (kind === "item") {
      if (!String(r?.itemId || "").trim()) return `${no}의 아이템을 선택해 주십시오.`;
      if (r?.count != null && r?.count !== "" && !isInt(r.count, PRIZE_COUNT.min, PRIZE_COUNT.max)) return `${no}의 개수는 ${PRIZE_COUNT.min}~${PRIZE_COUNT.max} 사이로 입력해 주십시오.`;
    }
    if (kind === "role" && !SNOWFLAKE.test(String(r?.roleId || "").trim())) return `${no}의 역할을 선택해 주십시오.`;
    if (kind !== "code" && r?.qty != null && r?.qty !== "" && !isInt(r.qty, 0, NUM_MAX)) return `${no}의 수량은 0 이상의 정수로 입력해 주십시오(빈칸 = 무제한).`;
    if (!isInt(r?.weight, PRIZE_WEIGHT.min, PRIZE_WEIGHT.max)) return `${no}의 비중은 ${PRIZE_WEIGHT.min}~${PRIZE_WEIGHT.max.toLocaleString()} 사이의 정수로 입력해 주십시오.`;
    if (r?.codes !== undefined) {
      if (!Array.isArray(r.codes)) return `${no}의 코드 목록이 올바르지 않습니다.`;
      if (r.codes.length && kind !== "code") return `${no}은(는) 코드 상품이 아닙니다.`;
      const codes = r.codes.map((c) => String(c ?? "").trim()).filter(Boolean);
      if (codes.some((c) => c.length > MAX_CODE_LEN)) return `${no}의 코드는 한 줄에 ${MAX_CODE_LEN}자 이하로 입력해 주십시오.`;
      codeCount += codes.length;
    }
  }
  if (codeCount > MAX_CODES_PER_SAVE) return `코드는 한 번에 ${MAX_CODES_PER_SAVE.toLocaleString()}개까지 추가할 수 있습니다.`;
  return "";
}

// ── [저장] 괴담회 설정 ──
export async function PUT(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));

    // 지금 문서를 먼저 읽는다 — sid/pid 를 이어서 발급하려면 nextSid · nextPid · 지금 번호가 필요하다(문서가 없으면 기본값)
    const cur = await loadGoedamConfig();
    const $set = { updatedAt: new Date() };

    if (b?.title !== undefined) {
      const title = String(b.title || "").trim();
      if (!title) return fail(400, "제목을 입력해 주십시오.");
      if (title.length > MAX_TITLE) return fail(400, `제목은 ${MAX_TITLE}자 이하로 입력해 주십시오.`);
      $set.title = title;
    }

    if (b?.channelId !== undefined) {
      const ch = String(b.channelId || "").trim();
      if (ch && !SNOWFLAKE.test(ch)) return fail(400, "스테이지 채널 ID가 올바르지 않습니다.");
      $set.channelId = ch;
    }

    if (b?.ticketItemId !== undefined) $set.ticketItemId = String(b.ticketItemId || "").trim();

    // 추첨 기간 — [열림, 닫힘). 한쪽만 와도 저장된 다른 쪽과 견준다
    if (b?.drawOpensAt !== undefined || b?.drawClosesAt !== undefined) {
      const open = b?.drawOpensAt !== undefined ? dateOf(b.drawOpensAt) : cur.drawOpensAt;
      const close = b?.drawClosesAt !== undefined ? dateOf(b.drawClosesAt) : cur.drawClosesAt;
      if (!open || !close) return fail(400, "추첨 기간이 올바르지 않습니다.");
      if (close.getTime() <= open.getTime()) return fail(400, "추첨 종료 시각은 시작 시각 이후로 지정해 주십시오.");
      if (b?.drawOpensAt !== undefined) $set.drawOpensAt = open;
      if (b?.drawClosesAt !== undefined) $set.drawClosesAt = close;
    }

    if (b?.screenings !== undefined) {
      if (!Array.isArray(b.screenings)) return fail(400, "회차 목록이 올바르지 않습니다.");
      const err = checkScreenings(b.screenings);
      if (err) return fail(400, err);
      const n = normalizeScreenings(b.screenings, cur.nextSid, new Set(cur.screenings.map((s) => s.sid)));
      $set.screenings = n.screenings;
      $set.nextSid = n.nextSid;
    }

    // 음성 활동 — 온 칸만 지금 값에 얹는다(빠진 칸이 기본값으로 돌아가지 않게). 시각은 ISO 글자 · Date 둘 다 받는다
    if (b?.voice !== undefined) {
      if (!b.voice || typeof b.voice !== "object" || Array.isArray(b.voice)) return fail(400, "음성 활동 설정이 올바르지 않습니다.");
      const pick = (k) => (b.voice[k] !== undefined ? b.voice[k] : cur.voice[k]);
      const v = { enabled: pick("enabled"), minutes: pick("minutes"), tickets: pick("tickets"), startsAt: pick("startsAt"), endsAt: pick("endsAt") };
      const err = checkVoice(v);
      if (err) return fail(400, err);
      $set.voice = normalizeVoice({ ...v, startsAt: dateOf(v.startsAt), endsAt: dateOf(v.endsAt) });
    }

    // 붙여 넣은 코드 — 정리된 상품과 같은 자리(정리 함수는 상품 줄을 빼거나 옮기지 않는다)
    let codesAt = [];
    if (b?.prizes !== undefined) {
      if (!Array.isArray(b.prizes)) return fail(400, "상품 목록이 올바르지 않습니다.");
      const err = checkPrizes(b.prizes);
      if (err) return fail(400, err);
      const n = normalizePrizes(b.prizes, cur.nextPid, new Set(cur.prizes.map((p) => p.pid)));
      $set.prizes = n.prizes;
      $set.nextPid = n.nextPid;
      codesAt = b.prizes.map((r) => (Array.isArray(r?.codes) ? r.codes : []));
    }

    // 📌 저장 뒤 모습의 아이템 상태(추첨권 · 아이템 상품) — 아래 저장 검사 · 이름 스냅샷 · 켜기 막기가 같이 쓴다
    const ticketAfter = $set.ticketItemId ?? cur.ticketItemId;
    const prizesAfter = $set.prizes ?? cur.prizes;
    const states = await eventItemStates([...(ticketAfter ? [ticketAfter] : []), ...prizesAfter.filter((p) => p.kind === "item").map((p) => p.itemId)]);
    const stateOf = (id) => states.get(String(id || ""))?.state || "missing";

    if ($set.prizes) {
      // 어디에도 없는 아이템은 새로 저장하지 않는다 — 이미 저장된 상품에 있던 것은 그대로 둔다(초안을 버린 뒤에도 다른 칸을 고칠 수 있게)
      const had = new Set(cur.prizes.filter((p) => p.kind === "item").map((p) => p.itemId));
      if ($set.prizes.some((p) => p.kind === "item" && stateOf(p.itemId) === "missing" && !had.has(p.itemId))) return fail(400, NO_ITEM);
      // 이름 스냅샷 — 실사이트 이름, 없으면 초안 이름(찾을 때만 바꾼다)
      for (const p of $set.prizes) {
        const name = p.kind === "item" ? states.get(p.itemId)?.name : "";
        if (name) p.itemName = name;
      }
      // 📌 2026-10-25 아이템 개수 — 2개 이상은 쌓이는 아이템만: 추첨권 아이템, 또는 1개 단위로 파는 상품이 가리키거나 소모형
      //    (lib/unitSale.js unitThingSet — 관리자 수동 지급 · /api/admin/items stackable 과 같은 판정. 아니면 같은 물건이 따로 여러 장 생긴다).
      //    실사이트 Item · 상품으로 본다(지급 lib/goedam.js itemPrizeFacts 와 같은 자료 — 초안에만 있는 1개 단위 상품으로는 풀리지 않는다).
      //    새로 넣었거나 아이템 · 개수를 바꾼(늘린) 상품만 본다 — 저장된 그대로인 상품은 그 뒤 상점이 바뀌어도 다른 칸 저장 · 끄기를 막지 않는다(지급이 그때 1개로 준다)
      const prev = new Map(cur.prizes.filter((p) => p.kind === "item").map((p) => [p.pid, p]));
      const multi = $set.prizes.filter((p) => {
        if (p.kind !== "item" || p.count <= 1 || p.itemId === ticketAfter) return false;
        const old = prev.get(p.pid);
        return !(old && old.itemId === p.itemId && old.count >= p.count);
      });
      const multiIds = [...new Set(multi.map((p) => p.itemId))].filter((id) => mongoose.isValidObjectId(id));
      if (multi.length) {
        const [items, shops] = await Promise.all([
          multiIds.length ? Item.find({ _id: { $in: multiIds } }).lean() : [],
          multiIds.length ? ShopItem.find({ itemId: { $in: multiIds } }, { type: 1, roleId: 1, itemId: 1, unitSale: 1, durations: 1 }).lean() : [],
        ]);
        const units = unitThingSet(shops, items);
        const one = multi.find((p) => !units.has(`i:${p.itemId}`));
        if (one) return fail(400, `「${prizeTitle({ ...one, count: 1 })}」은(는) 1개만 줄 수 있는 아이템입니다.`);
      }
    }
    if (ticketAfter) {
      if ($set.ticketItemId !== undefined && stateOf(ticketAfter) === "missing" && ticketAfter !== cur.ticketItemId) {
        return fail(400, "존재하지 않는 아이템은 추첨권으로 지정할 수 없습니다.");
      }
      // 봇이 추첨권 Purchase.itemName 으로 쓰는 스냅샷 — 이름이 바뀌었으면 같이 맞춘다
      const name = states.get(ticketAfter)?.name;
      if (name && name !== cur.ticketItemName) $set.ticketItemName = name;
    } else if ($set.ticketItemId === "") {
      $set.ticketItemName = "";
    }

    // 📌 켜기 막기 — 저장 뒤 켜져 있으면(켜기 · 켜져 있는 동안의 저장) 추첨권 아이템이 실사이트에 있어야 한다. 끄는 저장은 늘 받는다
    const enabledAfter = b?.enabled !== undefined ? !!b.enabled : cur.enabled;
    if (enabledAfter) {
      if (!ticketAfter) return fail(400, "추첨권 아이템을 지정한 뒤 켤 수 있습니다.");
      const st = stateOf(ticketAfter);
      if (st === "draft") return fail(400, "추첨권 아이템이 반영 전입니다 — 상점 관리에서 실사이트 반영 후 켤 수 있습니다.");
      if (st === "missing") return fail(400, "추첨권 아이템을 찾을 수 없습니다 — 다시 지정해 주십시오.");
    }
    if (b?.enabled !== undefined) $set.enabled = !!b.enabled;

    const saved = await writeGoedamConfig($set);

    // 코드 — 저장된 상품(pid 발급 뒤)의 같은 자리에 넣는다. 상품을 저장하지 않은 요청이면 codesAt 이 비어 있다
    const added = {};
    for (const [i, codes] of codesAt.entries()) {
      const p = $set.prizes?.[i];
      if (!p || p.kind !== "code" || !codes.length) continue;
      added[p.pid] = await addGoedamCodes(p.pid, codes);
    }
    return NextResponse.json({ success: true, data: { ...(await getGoedamAdmin(saved)), added } });
  } catch (e) {
    console.error("괴담회 설정 저장 오류:", e);
    return fail(500, "저장 중 오류가 발생했습니다.");
  }
}
