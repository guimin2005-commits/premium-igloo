export const dynamic = "force-dynamic";
// 📌 디스코드 멤버 명단을 읽고 수백 건을 쓰는 큰 작업 — 플랫폼 기본 시간 제한보다 넉넉히
export const maxDuration = 60;

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { getGuildRoster } from "@/lib/guildRoster";
import { normalizeItemPayload, normalizeColor } from "@/lib/items";
import {
  MARK, MARK_RE, FOREVER, parsePeriod, mapEntry, mapValue, termFrom, timedDays,
  CLASSIFY_FIELDS, REFUND_LAG_MS, classifyQuery, classifyHolders, TERM_FIELDS, termQuery, liveChildQuery, termPlanFrom,
  TOOL_RE, REFUND_SOURCE, parseRefund, toolRefundQuery, isToolRefund, REFUND_FIELDS, refundPlanFrom,
  roleNameOf, refundReason, refundGapsFrom, keyOf, CLEANUP_MARK, CLEANUP_MARK_RE, isCleanup,
} from "@/lib/roleMigrationTerms";
import { addPoints } from "@/lib/points";
import Item from "@/models/Item";
import Purchase from "@/models/Purchase";
import Payout from "@/models/Payout";
import ShopItem from "@/models/ShopItem";
import BotSetting from "@/models/BotSetting";
import RoleConfig from "@/models/RoleConfig";
import Setting from "@/models/Setting";

// ── [관리자] 역할 → 인벤토리 이전 ──
//    지난 시즌 디스코드 역할을 사이트 아이템으로 옮긴다. 이 라우트는 디스코드 역할을 직접 건드리지 않는다(읽기만).
//    (1) 역할마다 아이템을 정한다 — 새로 만들기(역할 이름 · 색, 아이템 · 꾸미기 · 권한) 또는 기존 아이템.
//        새로 만들 때 같은 역할에 이미 연결 · 이전된 아이템이 있으면 그것을 쓴다(중복 생성 금지 — 여러 번 눌러도 하나).
//        아이템 · 권한 유형은 roleId 를 연결한다. 꾸미기는 역할 없는 유형이라 연결 대신 이전 표(Setting roleMigrationMap)에만 적는다.
//    (2) 그 역할을 지금 가진 사람(봇 제외)마다 Purchase 기록을 만든다 — 운영진 지급과 같은 모양(itemId "grant" · itemRef · price 0 · completed),
//        adminNote "역할 이전 · <역할 이름>" 로 출처를 남긴다. 기간은 역할마다 고른다 — 무기한(기본) · N일(실행 시각부터) · 종료일(그날 KST 끝).
//        보유자는 lib/roleMigrationTerms.js classifyHolders 하나로 나눈다(미리보기 · 실행 공통):
//          환불 대기(같은 역할의 환불 건 · 봇이 아직 안 뗌) — 건너뛴다. 기록을 주면 환불 회수가 막힌다
//          지급 대기(pending 근거)   — 건너뛴다. 봇이 지급한 뒤 다음 실행에서 본다
//          같은 역할의 살아 있는 근거 — 새 기록 없이 그 기록의 기간을 그대로 쓴다(아이템 · 꾸미기는 완료 건을 사이트 보유로 · 아이템을 못 찾는 건은 itemRef 채움)
//          같은 역할의 근거가 전부 끝남(기간 끝남) — 아이템을 주지 않는다(새 무기한 기록이 끝난 기간을 되살리지 않게). 역할만 뗀다(아래 (8))
//          같은 아이템(itemRef)만 — 다른 역할로 받은 살아 있는 기록 · 이번 계획의 앞 역할이 줄 기록.
//                                   무기한이면 건너뜀(옛 역할 남음으로 센다). 기간제면 상점 연장과 같은 모양으로 이어 붙인 기록(renewOf)을 만든다 —
//                                   옛 역할을 담은 기록이 있어야 봇이 그 역할을 뗀다(없으면 옛 역할이 디스코드에 영영 남는다)
//          기록 없음                 — 고른 기간으로 새 기록(다른 역할의 끝난 기록만 있어도 여기)
//    (3) 역할 처리 — 아이템 · 꾸미기는 siteOnly: true · roleDetached: false 로 세워, 봇 큐(processDetachments)가 30초마다 차례로 역할을 뗀다.
//        떼도 소유는 기록으로 남는다(lib/ownedItems.js (A)). 권한(perk)은 역할이 곧 디스코드 기능이라 siteOnly 를 세우지 않는다 — 기록만, 역할 유지.
//        기간이 있는 권한 기록은 만료 때 봇(processExpiries)이 역할을 회수한다(같은 역할의 다른 살아 있는 근거가 없을 때).
//        이미 가진 완료 구매(같은 역할 · 권한 아닌 것)는 시즌 전환(app/api/season/detach)과 같은 방식으로 사이트 보유로 돌린다 — 안 돌리면 그 구매가
//        '살아 있는 근거'가 되어 봇이 역할을 남긴다.
//    (4) 기간 적용 — 이미 옮긴 기록(이 도구의 grant · 완료 · 이어 붙인 것 아님)에 역할마다 기간을 붙이거나(받은 시각 + N일 · 종료일) 무기한으로 되돌린다.
//        결과 만료가 지금 + 1시간 안이면(또는 지금 만료 처리 중이면) 건드리지 않고 '제외'로 센다 — 과거 시각을 쓰면 봇이 곧바로 회수하고 만료 DM 을 보낸다.
//        뒤에 살아 있는 연장(renewOf)이 붙은 기록도 바꾸지 않고 '연장 있음'으로 센다 — 결제한 연장분이 묻히거나 의미를 잃지 않게.
//        변경 DM 은 없다(만료 24시간 전 알림 · 만료 DM 은 봇의 기존 흐름).
//    (5) 환불 — 역할마다 '아이템으로 옮기기' 대신 XP · 빙옥 1인당 금액으로 돌려준다. 대상은 보유자 분류의 '기록 없음'(역할만 가진 사람)뿐 —
//        사이트에 이미 가진 사람 · 지급 대기 · 환불 대기 · 환불함(이 도구가 이미 환불)은 수만 센다(기간 끝남은 역할만 뗀다 — (8)).
//        사람마다: 표시 기록(Purchase — itemId "grant" · status "refunded" · 낸 값 0 · roleDetached false · adminNote "역할 환불 · <역할>")을 먼저 넣고,
//        들어간 사람에게만 지급한다(표시 기록이 '이미 환불'의 근거 — 다시 눌러도 · 중간에 끊겨도 두 번 나가지 않는다).
//        지급은 관리자 수동 지급(app/api/xp/grant)과 같은 길 — XP 는 Payout(대기, source "role-refund") → 봇이 반영 · 레벨 재계산
//        (시즌 패스 진행은 올리지 않는다 — 봇 processPayouts 가 passBaseXp 를 같은 폭으로 · 보상 역할은 알림 없이),
//        빙옥은 지급 자리(Payout processing, currency "point") → addPoints 즉시 → paid. Payout._id = 근거 기록 _id(두 번 들어가지 않는다).
//        원장(app/api/xp/ledger)에는 Payout 줄 "역할 환불 · <역할> +X" 하나만 — 표시 기록은 낸 값이 0 이라 구매 · 환불 줄이 생기지 않는다.
//        역할은 봇 환불 회수(processRefunds)가 뗀다(권한 역할 포함). 낸 값이 없어 환불 DM 은 가지 않는다.
//    (6) 환불로 바꾸기 — 이미 옮긴 이전 기록(역할 하나)을 completed → refunded 로 조건부로 바꾸고, 바뀐 사람에게 (5)와 같은 지급.
//        인벤토리에서 빠지고 효과는 봇 · 사이트 캐시가 돌면 꺼진다. 이미 뗀 사이트 보유 기록은 회수를 다시 걸지 않는다(roleDetached 그대로)
//        📌 서버에 없는 사람(디스코드 명단에 없음)은 바꾸지도 주지도 않는다 — 퇴장 초기화로 지운 지갑을 되살리지 않게. 명단을 못 받으면 막는다
//    (7) 빠진 지급 — 이 도구의 환불 근거는 있는데 지급 기록이 없는 사람(중간에 끊긴 실행)에게만 지급한다(lib refundGapsFrom).
//        근거와 지급은 Payout._id = 근거 기록 _id 로 이어, 같은 묶음에 두 번 들어가지 않는다. 서버에 없는 사람은 주지 않는다
//    (8) 역할 정리 — 📌 2026-10-04 "아이템은 주지 않고 역할만 떼어 정리합니다". 보유자 분류의 '기간 끝남'(구매 기간이 끝났는데 역할이 남은 사람)마다
//        역할 정리 표시 기록(Purchase — itemId "grant" · status "refunded" · 낸 값 0 · roleDetached false · adminNote "역할 정리 · <역할>")을 넣어
//        봇 환불 회수(processRefunds)가 역할을 뗀다(같은 역할의 살아 있는 다른 구매가 있으면 남긴다 · 낸 값이 없어 DM 없음). 아이템 · 지급은 없다.
//        처리(아이템 · 환불) · 역할 유지(권한)와 무관하게 한다. 진행 탭은 이 기록도 뗌 · 남음 · 실패에 함께 센다
//    📌 확인 창의 대상 그대로일 때만 쓴다 — 환불이 든 실행 · 환불로 바꾸기 · 빠진 지급은 미리보기의 key(대상 · 1인당 금액의 요약)를
//       expect 로 보내야 하고, 실행 때 다시 센 대상이 다르면 쓰지 않고 409(code "stale") + 새 미리보기를 돌려준다
//    제외: @everyone · 연동(봇 · 부스터) · 보호 역할(펭귄 — BotSetting.protectedRoleIds) · 레벨 보상(RoleConfig.rewardLevel) ·
//          시스템 역할(인증 · 미인증 · 내전 · 부스터 · 서포터즈 · RANKER) · 운영 권한 역할 · 봇보다 위(봇이 뗄 수 없음)
//          (계획에서만) 지금 가진 사람이 없는 역할 — 아이템을 만들지 않는다
//    GET              — 역할 목록 · 보유 인원 · 연결 아이템 · 저장된 기간 · 연결 상품의 기간 옵션 (?refresh=1 이면 디스코드 명단을 새로 받는다)
//    GET ?status=1    — 이전한 역할별 진행(봇이 뗀 수 · 남은 수 · 영구 실패 · 지금 디스코드 보유자 · 이전 기록의 기간)
//    POST { dryRun, plan: [{ roleId, itemId? | create: { name, type, color } | refund: { currency, amount }, period? }] }
//    POST { action: "term", dryRun, roleId, period }  — 기간 적용
//    POST { action: "refund", dryRun, roleId, refund, expect? } — 환불로 바꾸기
//    POST { action: "repay", dryRun, roleId, refund, expect? }  — 빠진 지급
//                     — 모두 dryRun 을 false 로 명시해야만 쓴다(기본은 미리보기). 실행은 잠금(Setting roleMigrationLock)으로 하나씩.
//    period: { mode: "forever" } | { mode: "days", days: 1~3650 } | { mode: "until", until: "YYYY-MM-DD" } — 빠지면 무기한
//    refund: { currency: "xp" | "point", amount: 1 이상 정수(끝은 숫자가 깨지지 않는 한도 1조 — lib REFUND_MAX) }

// 📌 기간 · 보유자 분류 · 기간 적용 · 환불 계산은 lib/roleMigrationTerms.js(순수 함수) — 이 라우트는 읽고 쓰기만 한다
// Setting.value = { 역할 id: { item: 아이템 id, period, mode?: "refund", refund? } } — 예전 형식 { 역할 id: 아이템 id }(기간 없음)는 무기한,
//   mode 가 없으면 아이템으로 옮기기로 읽는다(mapEntry).
//   📌 이 표를 읽는 곳은 이 라우트뿐이다(실사이트 master 에는 이 도구가 없다)
const MAP_KEY = "roleMigrationMap";
const LOCK_KEY = "roleMigrationLock"; // Setting.value = { token, by, until } | null
const LOCK_MS = 5 * 60 * 1000;
const MAX_PLAN = 100;
const INSERT_CHUNK = 500;
const NEW_TYPES = ["item", "cosmetic", "perk"];
const ROLE_ID_RE = /^\d{5,25}$/;
const PERM_FAIL_RE = /^영구 실패/;
// 📌 10011(Unknown Role) — 디스코드에서 역할을 이미 지웠다. 뗄 것이 없으니 실패가 아니라 뗀 것으로 센다(이전 후 역할 삭제는 정상 흐름)
const ROLE_GONE_RE = /^영구 실패\(10011\)/;

// 운영 권한 — 추방 · 차단 · 관리자 · 채널 관리 · 서버 관리 · 메시지 관리 · 역할 관리 · 타임아웃 중 하나라도 있으면 운영진 역할로 보고 뺀다
const STAFF_PERMS = (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 5n) | (1n << 13n) | (1n << 28n) | (1n << 40n);

const hexOf = (n) => (Number(n) > 0 ? `#${Number(n).toString(16).padStart(6, "0")}` : "");
const fail = (message, status = 400) => NextResponse.json({ success: false, message, error: message }, { status });
// 확인 창의 대상과 실행 대상이 다르다 — 쓰지 않고 새 미리보기를 돌려준다(화면이 확인 창 숫자를 바꿔 다시 묻는다)
const stale = (data) =>
  NextResponse.json({ success: false, code: "stale", message: "대상이 바뀌었습니다. 다시 확인해 주세요.", data }, { status: 409 });
// 서버에 있는 사람(봇 제외) — 환불로 바꾸기 · 빠진 지급이 쓴다. 미리보기 · 실행이 같은 명단을 보게 1분 안에 받은 것은 그대로
async function memberIds() {
  const roster = await getGuildRoster({ maxAgeMs: 60_000 });
  return new Set(roster.members.filter((m) => !m.bot).map((m) => m.id));
}

// 연결 상품의 기간제 옵션(빠른 선택) — 역할을 주는 상품 · 그 아이템을 파는 상품
function durationsFor(roleId, item, ctx) {
  const ref = item ? String(item._id) : "";
  const set = new Set();
  for (const s of ctx.shopItems) {
    if ((roleId && s.roleId === roleId) || (ref && String(s.itemId || "") === ref)) for (const d of timedDays(s)) set.add(d);
  }
  return [...set].sort((a, b) => a - b);
}

// 연결 상품의 정가(빠른 선택 · 환불 금액) — [{ days: 0(무제한) | N, xp }]. 기간제는 기간 옵션(무제한 포함), 아니면 상품 가격(무제한).
//   lib/shopPricing durationOptions 와 같은 거름(가격 > 0). 할인은 보지 않는다. 무제한 먼저, 그다음 긴 기간부터
function pricesFor(roleId, item, ctx) {
  const ref = item ? String(item._id) : "";
  const out = [];
  const seen = new Set();
  for (const s of ctx.shopItems) {
    if (!((roleId && s.roleId === roleId) || (ref && String(s.itemId || "") === ref))) continue;
    const opts = Array.isArray(s.durations) && s.durations.length
      ? s.durations.filter((d) => d && Number(d.days) >= 0 && Number(d.price) > 0).map((d) => ({ days: Number(d.days), xp: Number(d.price) }))
      : Number(s.price) > 0 ? [{ days: 0, xp: Number(s.price) }] : [];
    for (const o of opts) {
      const k = `${o.days}|${o.xp}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(o);
    }
  }
  return out.sort((a, b) => (a.days === 0 ? -1 : b.days === 0 ? 1 : b.days - a.days) || a.xp - b.xp).slice(0, 6);
}

// ── 공통 읽기 — 제외 판정 · 아이템 · 상품 · 이전 표 ──
async function loadContext() {
  const [setting, roleConfigs, items, shopItems, mapDoc] = await Promise.all([
    BotSetting.findOne({ key: "main" }, { protectedRoleIds: 1, rankerRoleId: 1, supporterRoleId: 1 }).lean(),
    RoleConfig.find({}, { roleId: 1, rewardLevel: 1, buffXp: 1, attendBuffXp: 1 }).lean(),
    Item.find({}, { name: 1, type: 1, roleId: 1, color: 1, visible: 1, sortOrder: 1, createdAt: 1 }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    ShopItem.find({}, { itemId: 1, roleId: 1, durations: 1, price: 1 }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    Setting.findOne({ key: MAP_KEY }, { value: 1 }).lean(),
  ]);
  const itemById = new Map(items.map((i) => [String(i._id), i]));
  // 역할 → 첫 아이템(정렬 순 — 보유 판정 lib/ownedItems.js 와 같은 순서)
  const itemByRole = new Map();
  for (const i of items) if (i.roleId && !itemByRole.has(i.roleId)) itemByRole.set(i.roleId, i);
  const env = process.env;
  return {
    items,
    itemById,
    itemByRole,
    shopItems,
    shopById: new Map(shopItems.map((s) => [String(s._id), s])),
    map: mapDoc?.value && typeof mapDoc.value === "object" && !Array.isArray(mapDoc.value) ? mapDoc.value : {},
    protectedIds: new Set(setting?.protectedRoleIds || []),
    levelIds: new Set(roleConfigs.filter((c) => c.rewardLevel != null).map((c) => c.roleId)),
    buffIds: new Set(roleConfigs.filter((c) => (c.buffXp || 0) > 0 || (c.attendBuffXp || 0) > 0).map((c) => c.roleId)),
    systemIds: new Set(
      [
        env.DISCORD_AUTH_ROLE_ID, env.DISCORD_UNAUTH_ROLE_ID, env.DISCORD_SCRIM_ROLE_ID, env.DISCORD_BOOSTER_ROLE_ID,
        env.DISCORD_SUPPORTER_ROLE_ID, setting?.supporterRoleId, setting?.rankerRoleId,
      ].filter(Boolean).map(String)
    ),
  };
}

// 제외 사유 — "" 이면 이전 대상
function exclusionOf(role, roster, ctx) {
  if (role.id === roster.guildId) return "everyone";
  if (role.managed) return "managed";
  if (ctx.protectedIds.has(role.id)) return "protected";
  if (ctx.levelIds.has(role.id)) return "level";
  if (ctx.systemIds.has(role.id)) return "system";
  let perms = 0n;
  try { perms = BigInt(role.permissions || "0"); } catch { perms = 0n; }
  if (perms & STAFF_PERMS) return "staff";
  if (role.position >= roster.botTop) return "above";
  return "";
}

// 이 역할에 이미 정해진 아이템 — 연결(Item.roleId) > 이전 표. 기프트카드 · 다른 역할에 연결된 것은 쓰지 않는다
function mappedItem(roleId, ctx) {
  const linked = ctx.itemByRole.get(roleId);
  if (linked) return linked;
  const it = ctx.itemById.get(mapEntry(ctx.map[roleId]).item);
  if (!it || it.type === "physical" || (it.roleId && it.roleId !== roleId)) return null;
  return it;
}

const itemView = (it) => (it ? { id: String(it._id), name: it.name, type: it.type, visible: it.visible !== false, linked: !!it.roleId } : null);
const isLive = (now) => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] });

// ── [조회] ──
export async function GET(request) {
  try {
    const { deny } = await requireAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    if (sp.get("status") === "1") return NextResponse.json({ success: true, data: await statusData() });

    const roster = await getGuildRoster({ fresh: sp.get("refresh") === "1" });
    const ctx = await loadContext();
    const holders = new Map();
    let humans = 0;
    for (const m of roster.members) {
      if (m.bot) continue;
      humans++;
      for (const r of m.roles) holders.set(r, (holders.get(r) || 0) + 1);
    }

    const roleIds = roster.roles.map((r) => r.id);
    const now = new Date();
    const [liveAgg, migAgg, refAgg] = await Promise.all([
      // 그 역할로 살아 있는 구매 기록(대기 · 완료, 소모 안 됨, 기간 남음)
      Purchase.aggregate([
        { $match: { roleId: { $in: roleIds }, status: { $in: ["pending", "completed"] }, consumedAt: null, ...isLive(now) } },
        { $group: { _id: "$roleId", n: { $sum: 1 } } },
      ]),
      // 이 도구가 만든 이전 기록(환불로 바꾼 것은 아래 환불로 센다)
      Purchase.aggregate([
        { $match: { roleId: { $in: roleIds }, itemId: "grant", adminNote: MARK_RE, status: { $ne: "refunded" } } },
        { $group: { _id: "$roleId", n: { $sum: 1 } } },
      ]),
      // 이 도구가 한 환불(표시 기록 · 환불로 바꾼 이전 기록)
      Purchase.aggregate([
        { $match: toolRefundQuery({ roleIds }) },
        { $group: { _id: "$roleId", n: { $sum: 1 } } },
      ]),
    ]);
    const liveOf = new Map(liveAgg.map((g) => [g._id, g.n]));
    const migOf = new Map(migAgg.map((g) => [g._id, g.n]));
    const refOf = new Map(refAgg.map((g) => [g._id, g.n]));

    const roles = [...roster.roles]
      .sort((a, b) => b.position - a.position)
      .map((r) => {
        const item = mappedItem(r.id, ctx);
        const saved = mapEntry(ctx.map[r.id]);
        return {
          id: r.id,
          name: r.name,
          color: hexOf(r.color),
          position: r.position,
          holders: holders.get(r.id) || 0,
          excluded: exclusionOf(r, roster, ctx),
          buff: ctx.buffIds.has(r.id),
          item: itemView(item),
          live: liveOf.get(r.id) || 0,
          migrated: migOf.get(r.id) || 0,
          refunded: refOf.get(r.id) || 0,
          // 지난번에 고른 기간 · 처리(이전 표) · 연결 상품의 기간 옵션 · 정가(빠른 선택)
          period: saved.period,
          mode: saved.mode,
          refund: saved.refund,
          durations: durationsFor(r.id, item, ctx),
          prices: pricesFor(r.id, item, ctx),
        };
      });
    const items = ctx.items
      .filter((i) => i.type !== "physical")
      .map((i) => ({
        id: String(i._id), name: i.name, type: i.type, roleId: i.roleId || "", color: i.color || "", visible: i.visible !== false,
        durations: durationsFor("", i, ctx),
      }));

    return NextResponse.json({
      success: true,
      data: { at: roster.at, members: humans, bots: roster.members.length - humans, botTop: roster.botTop, roles, items },
    });
  } catch (e) {
    console.error("역할 이전 조회 오류:", e);
    return fail(e?.message?.startsWith("디스코드") || e?.message?.startsWith("봇") ? e.message : "조회 중 오류가 발생했습니다.", 500);
  }
}

// ── 진행 — 이전 · 환불한 역할(이전 표 + 이 도구의 기록)별로 봇이 뗀 수 · 남은 수 ──
//    환불(표시 기록 · 환불로 바꾼 이전 기록)은 '환불'로 세고, 봇 환불 회수가 역할을 뗐는지(roleDetached)를 뗌 · 남음 · 실패에 함께 센다
async function statusData() {
  const ctx = await loadContext();
  // 이 도구의 기록 — 이전 · 환불 · 역할 정리(정리만 한 역할도 진행에 보이게)
  const fromRecords = await Purchase.distinct("roleId", { itemId: "grant", $or: [{ adminNote: TOOL_RE }, { adminNote: CLEANUP_MARK_RE }] });
  const ids = [...new Set([...Object.keys(ctx.map), ...fromRecords.map(String)])].filter(Boolean);
  if (ids.length === 0) return { at: null, roles: [] };

  const rows = await Purchase.find(
    {
      roleId: { $in: ids },
      $or: [
        { status: "completed" },
        toolRefundQuery({ roleIds: ids }),
        { itemId: "grant", status: "refunded", adminNote: CLEANUP_MARK_RE },
      ],
    },
    {
      roleId: 1, status: 1, siteOnly: 1, roleDetached: 1, error: 1, itemId: 1, adminNote: 1, expiresAt: 1, renewOf: 1, consumedAt: 1,
      userId: 1, userName: 1, revokedAt: 1,
    }
  ).lean();
  // 이 도구의 환불 근거와 지급(Payout._id = 근거 기록 _id) — 역할마다 지급 빠짐 · 확인 필요(lib refundGapsFrom)
  const toolRows = rows.filter(isToolRefund);
  const pays = toolRows.length ? await Payout.find({ _id: { $in: toolRows.map((p) => p._id) } }, { status: 1, currency: 1 }).lean() : [];
  const gaps = refundGapsFrom(toolRows, new Map(pays.map((p) => [String(p._id), p])));
  const unpaidOf = new Map();
  const unsureOf = new Map();
  for (const g of gaps.unpaid) unpaidOf.set(g.roleId, (unpaidOf.get(g.roleId) || 0) + 1);
  for (const g of gaps.unsure) unsureOf.set(g.roleId, (unsureOf.get(g.roleId) || 0) + 1);
  // 지금 디스코드 보유자 — 30초 안에 받은 명단이면 그대로. 못 받으면 칸만 비운다(진행 숫자는 DB 기준이라 그대로 보여 준다)
  let roster = null;
  try { roster = await getGuildRoster({ maxAgeMs: 30_000 }); } catch (e) { console.error("역할 이전 진행 — 명단 조회 실패:", e?.message || e); }
  const roleById = new Map((roster?.roles || []).map((r) => [r.id, r]));
  const holders = new Map();
  for (const m of roster?.members || []) {
    if (m.bot) continue;
    for (const r of m.roles) holders.set(r, (holders.get(r) || 0) + 1);
  }

  const stat = new Map(ids.map((id) => [id, {
    records: 0, kept: 0, waiting: 0, retrying: 0, detached: 0, failed: 0, refunded: 0, note: "",
    // 기간 적용 대상(이 도구의 기록 · 이어 붙인 것 아님 · 소모 안 됨)의 기간 — 무기한 수 · 기간제 수 · 가장 이른 / 늦은 만료
    terms: { forever: 0, timed: 0, minEnd: null, maxEnd: null },
  }]));
  const countDetach = (s, p) => {
    if (p.roleDetached !== true) {
      s.waiting++;
      if (p.error) s.retrying++;
    } else if (PERM_FAIL_RE.test(p.error || "") && !ROLE_GONE_RE.test(p.error || "")) s.failed++;
    else s.detached++;
  };
  for (const p of rows) {
    const s = stat.get(p.roleId);
    if (!s) continue;
    if (isCleanup(p)) {
      // 역할 정리 — 아이템 · 지급 없이 역할만 뗀다. 봇 환불 회수가 뗐는지만 센다
      if (!s.note) s.note = String(p.adminNote || "");
      countDetach(s, p);
      continue;
    }
    if (p.status === "refunded") {
      // 이 도구의 환불 — 표시 기록 · 환불로 바꾼 이전 기록
      s.refunded++;
      if (!s.note) s.note = String(p.adminNote || "");
      countDetach(s, p);
      continue;
    }
    const mine = p.itemId === "grant" && MARK_RE.test(p.adminNote || "");
    if (mine) {
      s.records++;
      if (!s.note) s.note = String(p.adminNote || "");
      if (!p.siteOnly) s.kept++;
      if (!p.renewOf && !p.consumedAt) {
        const t = p.expiresAt ? new Date(p.expiresAt).getTime() : null;
        if (t == null) s.terms.forever++;
        else {
          s.terms.timed++;
          if (s.terms.minEnd == null || t < s.terms.minEnd) s.terms.minEnd = t;
          if (s.terms.maxEnd == null || t > s.terms.maxEnd) s.terms.maxEnd = t;
        }
      }
    }
    if (!p.siteOnly) continue;
    countDetach(s, p);
  }

  const roles = ids.map((id) => {
    const r = roleById.get(id);
    const s = stat.get(id);
    const item = mappedItem(id, ctx);
    const saved = mapEntry(ctx.map[id]);
    return {
      roleId: id,
      // 디스코드에서 지운 역할은 기록에 남긴 이름으로
      name: r?.name || roleNameOf(s.note) || id,
      color: hexOf(r?.color),
      gone: !!roster && !r,
      item: itemView(item),
      period: saved.period,
      refund: saved.refund,
      durations: durationsFor(id, item, ctx),
      prices: pricesFor(id, item, ctx),
      terms: s.terms,
      records: s.records,
      kept: s.kept,
      waiting: s.waiting,
      retrying: s.retrying,
      detached: s.detached,
      failed: s.failed,
      refunded: s.refunded,
      // 지급 빠짐(사람 · 실행 묶음) · 확인 필요(빙옥 처리 중)
      unpaid: unpaidOf.get(id) || 0,
      unsure: unsureOf.get(id) || 0,
      holders: roster ? holders.get(id) || 0 : null,
    };
  });
  roles.sort((a, b) => (roleById.get(b.roleId)?.position ?? -1) - (roleById.get(a.roleId)?.position ?? -1));
  return { at: roster?.at || null, roles };
}

// ── 계획 정리 ──
//    📌 기간이 잘못되면(종료일이 지났거나 1시간 안 등) 계획 전체를 거절한다 — 미리보기 · 실행 · 이전 표 저장 모두 막힌다
function normalizePlan(raw, now) {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "이전할 역할을 골라 주세요." };
  if (raw.length > MAX_PLAN) return { error: `한 번에 ${MAX_PLAN}개 역할까지 이전할 수 있습니다.` };
  const seen = new Set();
  const list = [];
  for (const p of raw) {
    const roleId = String(p?.roleId || "").trim();
    if (!ROLE_ID_RE.test(roleId)) return { error: "역할 값이 올바르지 않습니다." };
    if (seen.has(roleId)) return { error: "같은 역할이 두 번 들어 있습니다." };
    seen.add(roleId);
    // 환불 — 아이템 · 기간은 보지 않는다(기록을 주지 않는다)
    if (p?.refund != null) {
      const rf = parseRefund(p.refund);
      if (rf.error) return { error: rf.error };
      list.push({ roleId, refund: rf.refund, period: FOREVER });
      continue;
    }
    const pp = parsePeriod(p?.period, now);
    if (pp.error) return { error: pp.error };
    const period = pp.period;
    const itemId = String(p?.itemId || "").trim();
    if (itemId) {
      if (!mongoose.isValidObjectId(itemId)) return { error: "아이템 값이 올바르지 않습니다." };
      list.push({ roleId, itemId, period });
      continue;
    }
    const c = p?.create && typeof p.create === "object" ? p.create : {};
    list.push({
      roleId,
      period,
      create: { name: String(c.name || "").trim().slice(0, 40), type: NEW_TYPES.includes(c.type) ? c.type : "item", color: normalizeColor(c.color) },
    });
  }
  return { list };
}

// ── 계획 계산 — 쓰기 없음. 역할마다 아이템 · 대상(보유자) · 보유자 분류 · 새 기록 · 사이트 보유로 돌릴 기존 구매 · 건너뜀 ──
//    now(ms) — 미리보기 · 실행이 같은 시각으로 분류하고 기간을 잰다(실행은 이 값으로 기록을 만든다)
async function evaluate(list, roster, ctx, now) {
  const roleById = new Map(roster.roles.map((r) => [r.id, r]));
  const entries = list.map((p) => {
    const role = roleById.get(p.roleId) || null;
    const term = termFrom(p.period, now);
    const e = {
      roleId: p.roleId, roleName: role?.name || "", color: hexOf(role?.color),
      excluded: "", error: "", mode: "", item: null, create: null, keepRole: false,
      period: p.period, term, refund: p.refund || null, refundType: "role",
      holders: [], insert: [], convert: [], fill: [], payees: [], cleanup: [], convertUsers: 0, skipped: 0,
      cls: { timed: 0, forever: 0, ended: 0, pending: 0, refund: 0, refunded: 0, none: 0 }, roleLeft: 0,
    };
    if (!role) { e.excluded = "missing"; return e; }
    e.excluded = exclusionOf(role, roster, ctx);
    if (e.excluded) return e;
    e.holders = roster.members.filter((m) => !m.bot && m.roles.includes(role.id));
    // 📌 지금 가진 사람이 없으면 옮길 것도 없다 — 빈 아이템을 만들지 않는다(전체 선택에 섞여 들어와도)
    if (e.holders.length === 0) { e.excluded = "empty"; return e; }

    // 환불 — 아이템을 만들거나 고르지 않는다. 연결 · 이전 표 아이템은 '같은 아이템을 사이트에 가짐' 판정에만 쓴다.
    //   표시 기록의 유형은 그 아이템의 유형(아이템 · 권한)이고 없으면 역할 — 봇 환불 회수가 역할을 떼는 유형이다(꾸미기는 역할로 적는다)
    if (e.refund) {
      e.mode = "refund";
      e.item = mappedItem(role.id, ctx);
      e.refundType = e.item?.type === "perk" || e.item?.type === "item" ? e.item.type : "role";
      return e;
    }

    if (p.itemId) {
      const it = ctx.itemById.get(p.itemId);
      if (!it) { e.error = "아이템을 찾을 수 없습니다."; return e; }
      if (it.type === "physical") { e.error = "기프트카드는 연결할 수 없습니다."; return e; }
      if (it.roleId && it.roleId !== role.id) { e.error = "다른 역할에 연결된 아이템입니다."; return e; }
      e.item = it;
      e.mode = "existing";
    } else {
      const found = mappedItem(role.id, ctx);
      if (found) {
        e.item = found;
        e.mode = "reuse";
      } else {
        e.create = { name: p.create.name || role.name.slice(0, 40).trim() || "역할", type: p.create.type, color: p.create.color || hexOf(role.color) };
        e.mode = "new";
      }
    }
    e.keepRole = (e.item ? e.item.type : e.create.type) === "perk";
    return e;
  });

  const active = entries.filter((e) => !e.excluded && !e.error);
  await loadAndClassify(active, ctx, now, roster.at);
  return entries;
}

// ── 보유자 분류 — 미리보기 · 실행 공통. 근거 기록을 읽어 lib/roleMigrationTerms.js classifyHolders 에 넘긴다(규칙은 거기) ──
//    rosterAt — 명단을 받은 시각. 그 무렵 이후의 환불은 명단이 낡았을 수 있어 '환불 대기'로 본다
async function loadAndClassify(active, ctx, now, rosterAt) {
  const userIds = [...new Set(active.flatMap((e) => e.holders.map((h) => h.id)))];
  const roleIds = active.map((e) => e.roleId);
  const refs = active.filter((e) => e.item).map((e) => String(e.item._id));
  const since = Number(rosterAt) - REFUND_LAG_MS;
  const recs = userIds.length ? await Purchase.find(classifyQuery({ userIds, roleIds, refs, since }), CLASSIFY_FIELDS).lean() : [];
  // 새 기록 _id 를 여기서 정한다 — 같은 계획의 뒤 역할이 앞 역할의 새 기록 뒤에 이어 붙는다(renewOf). 실행은 이 id 그대로 넣는다
  classifyHolders(active, recs, ctx, now, () => new mongoose.Types.ObjectId().toString());
}

// 기록 묶음의 기간 요약 — 무기한 수 · 기간제 수 · 가장 이른 / 늦은 만료(ms). 진행 화면의 이전 기록 요약과 같은 모양
function termsOf(list) {
  const t = { forever: 0, timed: 0, minEnd: null, maxEnd: null };
  for (const x of list) {
    const end = x ? new Date(x).getTime() : null;
    if (end == null) { t.forever++; continue; }
    t.timed++;
    if (t.minEnd == null || end < t.minEnd) t.minEnd = end;
    if (t.maxEnd == null || end > t.maxEnd) t.maxEnd = end;
  }
  return t;
}

function summarize(entries, executed) {
  const roles = entries.map((e) => ({
    roleId: e.roleId,
    roleName: e.roleName,
    color: e.color,
    excluded: e.excluded,
    error: e.error,
    mode: e.mode,
    item: e.item ? { id: String(e.item._id), name: e.item.name, type: e.item.type } : e.create ? { id: "", name: e.create.name, type: e.create.type } : null,
    keepRole: e.keepRole,
    // 고른 기간 · 새로 만들 기록의 기간 요약(이어 붙인 기록 포함 — 새 기록이 없으면 전부 0). 화면 '기간' 칸은 이것만 보인다
    period: e.period || FOREVER,
    terms: termsOf(e.insert.map((x) => x.term.expiresAt)),
    holders: e.holders.length,
    // 보유자 분류 — 기간제 · 무기한 · 기간 끝남 · 지급 대기 · 환불 대기 · 환불함 · 기록 없음 / 옛 역할이 남는 사람(같은 아이템을 이미 가짐)
    cls: e.cls,
    roleLeft: e.roleLeft || 0,
    insert: e.insert.length,
    convert: e.convertUsers,
    skipped: e.skipped,
    // 환불 — 1인당(화폐 · 금액) · 환불할 사람 수(기록 없음)
    refund: e.refund || null,
    payees: e.payees.length,
    // 역할 정리 — 기간 끝남 중 역할만 뗄 사람 수
    cleanup: e.cleanup.length,
    // 실행 결과 — paid 는 오류가 난 역할도 실제로 지급한 사람 수. warn = 지급은 끝났는데 뒤 작업(이전 표 저장)이 실패. cleaned = 정리 기록이 들어간 사람
    ...(executed
      ? { inserted: e.inserted || 0, converted: e.converted || 0, created: !!e.created, paid: e.paid || 0, cleaned: e.cleaned || 0, warn: e.warn || "" }
      : {}),
  }));
  const active = entries.filter((e) => !e.excluded && !e.error);
  const sum = (f, list = active) => list.reduce((n, e) => n + f(e), 0);
  // 📌 지급 합계는 오류가 난 역할도 넣는다 — 지급한 뒤 오류가 나도 나간 돈이 합계에서 빠지지 않게
  const ran = entries.filter((e) => !e.excluded);
  const money = (cur, n, list = active) => sum((e) => (e.refund?.currency === cur ? e.refund.amount * n(e) : 0), list);
  const totals = {
    roles: active.length,
    excluded: entries.length - active.length,
    createItems: active.filter((e) => e.mode === "new").length,
    people: new Set(active.flatMap((e) => e.holders.map((h) => h.id))).size,
    records: sum((e) => e.insert.length),
    convert: sum((e) => e.convertUsers),
    skipped: sum((e) => e.skipped),
    // 역할 떼기 — 새 기록 · 사이트 보유 전환(권한 아님) + 환불(권한도 뗀다) + 역할 정리(기간 끝남 — 권한도 뗀다)
    detach: sum((e) => (e.keepRole ? 0 : e.insert.length + e.convertUsers) + e.payees.length + e.cleanup.length),
    keep: sum((e) => (e.keepRole ? e.insert.length : 0)),
    cleanup: sum((e) => e.cleanup.length),
    // 환불 — 건수(역할 × 사람) · 화폐별 합계
    refunds: sum((e) => e.payees.length),
    refundXp: money("xp", (e) => e.payees.length),
    refundPoint: money("point", (e) => e.payees.length),
    ...(executed
      ? {
          inserted: sum((e) => e.inserted || 0), converted: sum((e) => e.converted || 0), created: active.filter((e) => e.created).length,
          cleaned: sum((e) => e.cleaned || 0, ran),
          paid: sum((e) => e.paid || 0, ran), paidXp: money("xp", (e) => e.paid || 0, ran), paidPoint: money("point", (e) => e.paid || 0, ran),
        }
      : {}),
  };
  return { roles, totals, refundKey: refundKeyOf(entries) };
}

// 환불 대상의 요약 — 역할마다 화폐 · 1인당 · 환불할 사람(id). 미리보기가 돌려주고, 실행이 다시 센 값과 맞춰 본다(확인 창 숫자 그대로일 때만 지급)
function refundKeyOf(entries) {
  const list = entries
    .filter((e) => e.refund && !e.excluded && !e.error)
    .map((e) => [e.roleId, e.refund.currency, e.refund.amount, e.payees.map((h) => h.id).sort()])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return list.length ? keyOf(list) : "";
}

// ── 잠금 — 같은 실행이 겹치지 않게(서버리스라 DB 조건부 갱신). 5분이 지나면 스스로 풀린다 ──
async function acquireLock(by) {
  const token = new mongoose.Types.ObjectId().toString();
  const now = new Date();
  try {
    await Setting.updateOne({ key: LOCK_KEY }, { $setOnInsert: { value: null, updatedAt: now } }, { upsert: true });
  } catch (e) {
    if (e?.code !== 11000) throw e; // 동시에 만든 쪽이 있다 — 아래 조건부 갱신이 가른다
  }
  const got = await Setting.findOneAndUpdate(
    { key: LOCK_KEY, $or: [{ value: null }, { "value.until": { $lt: now } }] },
    { $set: { value: { token, by, until: new Date(now.getTime() + LOCK_MS) }, updatedAt: now } },
    { returnDocument: "after" }
  ).lean();
  return got ? token : null;
}
async function releaseLock(token) {
  await Setting.updateOne({ key: LOCK_KEY, "value.token": token }, { $set: { value: null, updatedAt: new Date() } }).catch((e) =>
    console.error("역할 이전 잠금 해제 실패:", e?.message || e)
  );
}

// 이전 표 한 칸을 바꾼다 — 같은 값이면 쓰지 않는다
async function saveMapEntry(map, roleId, entry) {
  if (JSON.stringify(map[roleId]) === JSON.stringify(entry)) return;
  map[roleId] = entry;
  await Setting.updateOne({ key: MAP_KEY }, { $set: { value: map, updatedAt: new Date() } }, { upsert: true });
}

// ── 환불 지급 — 사람마다 1인당 금액. 관리자 수동 지급(app/api/xp/grant)과 같은 길 ──
//    XP  : Payout(pending, source "role-refund") — 봇 processPayouts 가 30초 안에 반영하고 레벨을 다시 맞춘다(passBaseXp 동반 — 시즌 패스 진행 제외)
//    빙옥: 사람마다 ① 지급 자리(Payout processing, currency "point" — 봇은 빙옥 건을 집지 않는다) ② addPoints ③ paid — 원장 한 줄.
//          ②가 오류면 반영됐는지 모른다 → 자리를 그대로 두어 다시 주지 않는다(진행 탭 '확인 필요'). ③이 실패해도 지급은 끝났다(확인 필요)
//    people: [{ id, name, key, at?, reason? }] — 호출부가 '이미 환불'의 근거(표시 기록 · 환불로 바꾼 이전 기록)를 먼저 남긴 사람만 넘긴다.
//            key = 그 근거 기록의 _id → Payout._id(같은 묶음에 두 번 들어가지 않는다 — lib refundGapsFrom 이 이 짝으로 '지급 빠짐'을 센다)
//    반환: { paid: 지급한 사람 수, failed: 주지 못함(진행 탭 '지급 빠짐' → 빠진 지급으로), unsure: 반영 여부를 모름 } — 각 [{ userId, userName, reason }]
//    📌 던지지 않는다 — 호출부가 지급 뒤 숫자를 잃지 않게. Payout.createdAt = 근거 기록의 revokedAt(at · 없으면 now), by = 처리한 관리자(감사용, 유저 화면엔 안 보임)
async function payRefunds(people, refund, roleName, now, by) {
  const reason = refundReason(roleName);
  const failed = [];
  const unsure = [];
  let paid = 0;
  const who = (h) => ({ userId: h.id, userName: h.name || h.id });
  const ready = [];
  for (const h of people) {
    if (/^[0-9a-f]{24}$/i.test(String(h.key || ""))) ready.push(h);
    else {
      console.error(`역할 환불 지급 건너뜀 — 근거 기록 id 없음 (${roleName} / ${h.id})`);
      failed.push({ ...who(h), reason: "지급 실패" });
    }
  }
  if (!ready.length) return { paid, failed, unsure };
  const base = (h) => ({
    _id: new mongoose.Types.ObjectId(String(h.key)),
    userName: h.name || h.id,
    userId: h.id,
    amount: refund.amount,
    reason: h.reason || reason,
    source: REFUND_SOURCE,
    createdAt: h.at ? new Date(h.at) : now,
    by,
  });

  if (refund.currency === "xp") {
    const docs = ready.map((h) => ({ ...base(h), currency: "xp", status: "pending" }));
    for (let i = 0; i < docs.length; i += INSERT_CHUNK) {
      try {
        await Payout.insertMany(docs.slice(i, i + INSERT_CHUNK), { ordered: false });
      } catch (e) {
        console.error(`역할 환불 XP 지급 일부 실패 (${roleName}):`, e?.message || e);
      }
    }
    // 실제로 들어간 건만 지급으로 센다. 확인 조회가 실패하면 '확인 못 함' — 들어갔으면 봇이 지급한다(진행 탭이 실제 기록으로 다시 센다)
    let ok;
    try {
      ok = new Set((await Payout.find({ _id: { $in: docs.map((d) => d._id) } }, { _id: 1 }).lean()).map((d) => String(d._id)));
    } catch (e) {
      console.error(`역할 환불 XP 지급 확인 실패 (${roleName}):`, e?.message || e);
      for (const h of ready) {
        console.error(`역할 환불 XP 확인 못 함 (${roleName} / ${h.id})`);
        unsure.push({ ...who(h), reason: "확인 못 함" });
      }
      return { paid, failed, unsure };
    }
    for (const h of ready) {
      if (ok.has(String(h.key))) paid++;
      else {
        console.error(`역할 환불 XP 지급 실패 (${roleName} / ${h.id})`);
        failed.push({ ...who(h), reason: "지급 실패" });
      }
    }
    return { paid, failed, unsure };
  }

  for (const h of ready) {
    const doc = { ...base(h), currency: "point", status: "processing" };
    try {
      await Payout.create(doc);
    } catch (e) {
      // 같은 근거에 지급 기록이 이미 있다(겹친 실행) — 주지 않는다
      console.error(`역할 환불 빙옥 지급 자리 실패 (${roleName} / ${h.id}):`, e?.message || e);
      if (e?.code === 11000) unsure.push({ ...who(h), reason: "지급 기록 있음" });
      else failed.push({ ...who(h), reason: "지급 실패" });
      continue;
    }
    let applied;
    try {
      applied = await addPoints(h.id, refund.amount);
    } catch (e) {
      console.error(`역할 환불 빙옥 반영 확인 못 함 (${roleName} / ${h.id}):`, e?.message || e);
      unsure.push({ ...who(h), reason: "확인 못 함" });
      continue;
    }
    if (!applied) {
      // 아무것도 바뀌지 않았다 — 자리를 지워 '지급 빠짐'으로 남긴다(빠진 지급으로 다시 줄 수 있게)
      console.error(`역할 환불 빙옥 반영 안 됨 (${roleName} / ${h.id})`);
      await Payout.deleteOne({ _id: doc._id, status: "processing" }).catch(() => {});
      failed.push({ ...who(h), reason: "지급 실패" });
      continue;
    }
    paid++;
    try {
      await Payout.updateOne({ _id: doc._id, status: "processing" }, { $set: { status: "paid", paidAt: new Date() } });
    } catch (e) {
      console.error(`역할 환불 빙옥 기록 실패 — 지급은 됨 (${roleName} / ${h.id}):`, e?.message || e);
      unsure.push({ ...who(h), reason: "기록 확인 필요" });
    }
  }
  return { paid, failed, unsure };
}

// ── 환불(계획의 한 역할) — 표시 기록을 먼저 넣고, 들어간 사람에게만 지급한다 ──
//    📌 쓰기 직전에 '이미 환불'을 다시 본다 — 분류 뒤 그 사이 같은 역할로 환불된 사람(다른 요청 · 환불로 바꾸기)에게 두 번 주지 않게
//    📌 표시 기록이 들어갔는지 확인하지 못한 묶음은 지급하지 않는다 — 들어갔으면 진행 탭 '지급 빠짐'으로 남아 [빠진 지급]으로 메운다
async function executeRefund(e, nowDate, failed, by) {
  e.paid = 0;
  e.marked = 0; // 표시 기록이 들어간 사람(새 기록 · '기록' 칸과 따로 센다)
  if (!e.payees.length) return;
  const tag = (userId, userName, reason) => failed.push({ roleId: e.roleId, roleName: e.roleName, userId, userName, reason });
  const done = new Set((await Purchase.distinct("userId", toolRefundQuery({ roleIds: [e.roleId], userIds: e.payees.map((h) => h.id) }))).map(String));
  const go = [];
  for (const h of e.payees) {
    if (done.has(h.id)) tag(h.id, h.name, "이미 환불됨");
    else go.push(h);
  }
  const marks = go.map((h) => ({
    _id: new mongoose.Types.ObjectId(),
    orderId: new mongoose.Types.ObjectId().toString(),
    createdAt: nowDate,
    processedAt: nowDate,
    userId: h.id,
    userName: h.name,
    itemId: "grant",
    itemRef: "",
    itemName: e.roleName.slice(0, 80),
    itemType: e.refundType,
    roleId: e.roleId,
    // 📌 낸 값 0 — 원장 구매 · 환불 줄이 생기지 않고, 봇은 환불 DM 을 보내지 않는다(돈은 Payout 이 옮긴다)
    price: 0,
    payMethod: "xp",
    paidXp: 0,
    paidPoint: 0,
    billed: false,
    days: 0,
    expiresAt: null,
    revokedAt: nowDate,
    contact: "",
    adminNote: refundReason(e.roleName),
    status: "refunded",
    siteOnly: false,
    // 봇 환불 회수(processRefunds)가 집어 가 역할을 뗀다
    roleDetached: false,
    error: "",
  }));
  const people = [];
  for (let i = 0; i < marks.length; i += INSERT_CHUNK) {
    const chunk = marks.slice(i, i + INSERT_CHUNK);
    try {
      await Purchase.insertMany(chunk, { ordered: false });
    } catch (err) {
      console.error(`역할 환불 기록 일부 실패 (${e.roleName}):`, err?.message || err);
    }
    let ok;
    try {
      ok = new Set((await Purchase.find({ _id: { $in: chunk.map((m) => m._id) } }, { _id: 1 }).lean()).map((r) => String(r._id)));
    } catch (err) {
      console.error(`역할 환불 기록 확인 실패 (${e.roleName}):`, err?.message || err);
      for (const m of chunk) tag(m.userId, m.userName, "확인 못 함");
      continue;
    }
    for (const m of chunk) {
      if (ok.has(String(m._id))) people.push({ id: m.userId, name: m.userName, key: String(m._id) });
      else tag(m.userId, m.userName, "기록 저장 실패");
    }
  }
  e.marked = people.length;
  const r = await payRefunds(people, e.refund, e.roleName, nowDate, by);
  e.paid = r.paid;
  for (const f of [...r.failed, ...r.unsure]) failed.push({ roleId: e.roleId, roleName: e.roleName, ...f });
}

// ── 역할 정리(계획의 한 역할) — 기간 끝남인 사람마다 역할 정리 표시 기록을 넣는다. 아이템 · 지급은 없다 ──
//    📌 2026-10-04 "아이템은 주지 않고 역할만 떼어 정리합니다" — 봇 환불 회수(processRefunds)가 이 기록으로 역할을 뗀다.
//       낸 값 0 이라 원장 줄 · 환불 DM 이 없다. 들어갔는지 다시 세어 못 넣은 사람은 실패 목록으로(다음 실행에서 다시 기간 끝남으로 잡힌다)
async function executeCleanup(e, nowDate, failed) {
  e.cleaned = 0;
  if (!e.cleanup.length) return;
  const rows = e.cleanup.map((h) => ({
    _id: new mongoose.Types.ObjectId(),
    orderId: new mongoose.Types.ObjectId().toString(),
    createdAt: nowDate,
    processedAt: nowDate,
    userId: h.id,
    userName: h.name,
    itemId: "grant",
    itemRef: "",
    itemName: e.roleName.slice(0, 80),
    // 봇 환불 회수가 역할을 떼는 유형 — 표시 기록이라 역할로 적는다
    itemType: "role",
    roleId: e.roleId,
    price: 0,
    payMethod: "xp",
    paidXp: 0,
    paidPoint: 0,
    billed: false,
    days: 0,
    expiresAt: null,
    revokedAt: nowDate,
    contact: "",
    adminNote: `${CLEANUP_MARK} · ${e.roleName}`.slice(0, 120),
    status: "refunded",
    siteOnly: false,
    roleDetached: false,
    error: "",
  }));
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    try {
      await Purchase.insertMany(chunk, { ordered: false });
    } catch (err) {
      console.error(`역할 정리 기록 일부 실패 (${e.roleName}):`, err?.message || err);
    }
    let ok;
    try {
      ok = new Set((await Purchase.find({ _id: { $in: chunk.map((r) => r._id) } }, { _id: 1 }).lean()).map((r) => String(r._id)));
    } catch (err) {
      console.error(`역할 정리 기록 확인 실패 (${e.roleName}):`, err?.message || err);
      for (const r of chunk) failed.push({ roleId: e.roleId, roleName: e.roleName, userId: r.userId, userName: r.userName, reason: "확인 못 함" });
      continue;
    }
    for (const r of chunk) {
      if (ok.has(String(r._id))) e.cleaned++;
      else failed.push({ roleId: e.roleId, roleName: e.roleName, userId: r.userId, userName: r.userName, reason: "정리 기록 저장 실패" });
    }
  }
}

// ── 실행 — 역할마다: 역할 정리(기간 끝남) → 아이템 만들기(필요하면) → 이전 표(아이템 · 기간) → 새 기록 → 기존 구매 사이트 보유 ──
//    nowMs — evaluate 와 같은 시각(새 기록의 만료를 그 시각으로 쟀다)
async function execute(entries, ctx, nowMs, by) {
  const now = new Date(nowMs);
  const failed = [];
  const map = { ...ctx.map };
  let nextSort = null;
  // 📌 이번 계획이 만들 기록 id · 실제로 들어간 id — 앞 역할의 새 기록 뒤에 이어 붙인 기록(renewOf)은 앞 기록이 들어갔을 때만 넣는다.
  //    앞 기록이 저장에 실패했는데 넣으면 없는 기록에 매달린 연장분이 된다 → '앞 기록 저장 실패'로 빼고 다음 실행에서 다시 분류
  const plannedIds = new Set(entries.flatMap((e) => e.insert.map((x) => x.id)));
  const insertedIds = new Set();

  for (const e of entries) {
    if (e.excluded || e.error) continue;
    const prev = mapEntry(map[e.roleId]);
    // 역할 정리는 처리(아이템 · 환불)와 무관하다 — 아이템 만들기 · 지급이 실패해도 정리 기록은 남긴다(쓰기 오류는 안에서 사람마다 실패로 남긴다)
    await executeCleanup(e, now, failed);
    if (e.refund) {
      try {
        await executeRefund(e, now, failed, by);
      } catch (err) {
        // 지급 전(이미 환불 확인 · 표시 기록)에서 났다 — 지급은 payRefunds 가 던지지 않아 여기 오지 않는다. e.paid 는 그대로 결과에 남는다
        e.error = `처리 중 오류: ${err?.message || err}`;
        console.error(`역할 환불 처리 오류 (${e.roleName}):`, err);
      }
      // 이전 표 — 실제로 환불한 사람이 있을 때만 처리(환불 · 화폐 · 금액)를 남긴다. 아이템 · 기간은 지난 값 그대로.
      //   📌 지급 뒤의 저장 실패는 오류가 아니라 경고 — 합계 · 환불 칸이 실제 지급을 그대로 보이게(오류로 덮으면 지급 0 처럼 보인다)
      if (e.marked) {
        try {
          await saveMapEntry(map, e.roleId, mapValue({ ...prev, mode: "refund", refund: e.refund }));
        } catch (err) {
          e.warn = "이전 표 저장 실패";
          console.error(`역할 환불 이전 표 저장 실패 (${e.roleName}):`, err?.message || err);
        }
      }
      continue;
    }
    // 📌 이전 표의 기간 — 이번에 새 기록을 만드는 역할만 고른 기간으로 바꾼다. 새 기록이 0 이면 지난 값 그대로
    //    (새 기록 없이 표만 바뀌면 진행 · 역할 화면의 기본 기간이 실제 기록과 어긋난다). 처리(환불)도 같다 — 새 기록이 있을 때만 '아이템'으로
    const period = e.insert.length ? e.period : prev.period;
    const keep = e.insert.length ? { mode: "item", refund: null } : { mode: prev.mode, refund: prev.refund };
    try {
      if (!e.item) {
        // 아이템 등록 API 와 같은 정리 — 꾸미기는 여기서 roleId 가 비워진다(역할 없는 유형)
        const n = normalizeItemPayload({ name: e.create.name, type: e.create.type, color: e.create.color, roleId: e.roleId, roleName: e.roleName });
        if (!n.ok) throw new Error(n.error);
        if (nextSort == null) {
          const last = await Item.findOne({}, { sortOrder: 1 }).sort({ sortOrder: -1 }).lean();
          nextSort = Math.floor(Number(last?.sortOrder) || 0) + 1;
        }
        // 📌 id 를 먼저 정해 이전 표에 적고 나서 만든다 — 만든 직후 끊겨도 다음 실행이 이 아이템을 찾는다(꾸미기는 roleId 를 못 달아 이 표가 유일한 짝).
        //    만들기가 실패하면 표의 id 는 없는 아이템이라 다음 실행이 새로 만든다(mappedItem 이 못 찾음)
        const newId = new mongoose.Types.ObjectId();
        await saveMapEntry(map, e.roleId, mapValue({ item: String(newId), period, ...keep }));
        e.item = (await Item.create({ _id: newId, ...n.data, sortOrder: Math.min(999, nextSort++) })).toObject();
        e.created = true;
      }
    } catch (err) {
      e.error = `아이템을 만들지 못했습니다. ${err?.message || ""}`.trim();
      continue;
    }

    const itemId = String(e.item._id);
    try {
      // 이전 표 — 다음 실행이 같은 아이템 · 기간을 다시 쓰게(꾸미기처럼 roleId 를 못 다는 아이템도). 역할마다 바로 적어 중간에 끊겨도 남게
      await saveMapEntry(map, e.roleId, mapValue({ item: itemId, period, ...keep }));

      const ready = [];
      for (const x of e.insert) {
        if (x.term.renewOf && plannedIds.has(x.term.renewOf) && !insertedIds.has(x.term.renewOf)) {
          failed.push({ roleId: e.roleId, roleName: e.roleName, userId: x.h.id, userName: x.h.name, reason: "앞 기록 저장 실패" });
        } else ready.push(x);
      }
      const rows = ready.map(({ h, id, term }) => ({
        _id: id,
        orderId: new mongoose.Types.ObjectId().toString(),
        createdAt: now,
        processedAt: now,
        userId: h.id,
        userName: h.name,
        itemId: "grant",
        itemRef: itemId,
        itemName: e.item.name,
        itemType: e.item.type,
        roleId: e.roleId,
        price: 0,
        payMethod: "xp",
        paidXp: 0,
        paidPoint: 0,
        // 📌 기간 — 고른 기간(evaluate 가 잰 값). 이어 붙인 기록은 renewOf · startsAt 이 있다(상점 연장과 같은 모양)
        days: term.days,
        expiresAt: term.expiresAt,
        renewOf: term.renewOf || "",
        startsAt: term.startsAt || null,
        reminderSentAt: null,
        contact: "",
        adminNote: `${MARK} · ${e.roleName}`.slice(0, 120),
        status: "completed",
        // 권한은 역할 유지 — 나머지는 봇 큐가 역할을 뗀다
        siteOnly: !e.keepRole,
        siteOnlyAt: e.keepRole ? null : now,
        roleDetached: false,
        error: "",
      }));
      e.inserted = 0;
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        try {
          await Purchase.insertMany(chunk, { ordered: false });
        } catch (err) {
          console.error(`역할 이전 기록 일부 실패 (${e.roleName}):`, err?.message || err);
        }
        // 실제로 들어간 건을 다시 센다 — 오류 모양(검증 · 연결 끊김 · 일부 성공)과 무관하게 빠진 사람을 정확히 고른다
        const ok = new Set(
          (await Purchase.find({ userId: { $in: chunk.map((r) => r.userId) }, orderId: { $in: chunk.map((r) => r.orderId) } }, { orderId: 1 }).lean()).map((r) => r.orderId)
        );
        for (const r of chunk) {
          if (ok.has(r.orderId)) {
            e.inserted++;
            insertedIds.add(r._id);
          } else failed.push({ roleId: e.roleId, roleName: e.roleName, userId: r.userId, userName: r.userName, reason: "기록 저장 실패" });
        }
      }

      e.converted = 0;
      if (!e.keepRole && e.convert.length) {
        const r = await Purchase.updateMany(
          { _id: { $in: e.convert }, status: "completed" },
          // error 도 비운다 — 지난 실패 사유가 남으면 봇이 실패건으로 보고 뒤로 미룬다(시즌 전환 라우트와 같게). 기간(expiresAt)은 그대로
          { $set: { siteOnly: true, siteOnlyAt: now, roleDetached: false, error: "" } }
        );
        e.converted = r.modifiedCount || 0;
        // 📌 아이템을 못 찾는 옛 구매(itemRef 없음 · 상품에 연결 아이템 없음)는 이전 아이템으로 잡히게 — 효과 · 봇 /인벤토리에서 빠지지 않게.
        //    그 사이 itemRef 가 채워졌으면 덮지 않는다
        if (e.fill.length) {
          await Purchase.updateMany(
            { _id: { $in: e.fill }, status: "completed", itemRef: { $in: ["", null] } },
            { $set: { itemRef: itemId } }
          );
        }
      }
    } catch (err) {
      e.error = `처리 중 오류: ${err?.message || err}`;
      console.error(`역할 이전 처리 오류 (${e.roleName}):`, err);
    }
  }
  return failed;
}

// ── 기간 적용 — 이 도구가 만든 이전 기록(역할 하나)에 기간을 붙이거나 무기한으로 되돌린다 ──
//    대상 · 값 · 제외 · 연장 있음 규칙은 lib/roleMigrationTerms.js(termQuery · liveChildQuery · termPlanFrom). 과거 시각은 쓰지 않는다 · 같은 값이면 그대로
async function chainedOf(ids) {
  if (!ids.length) return new Set();
  return new Set((await Purchase.distinct("renewOf", liveChildQuery(ids))).map(String));
}
async function termPlan(roleId, period, now) {
  const rows = await Purchase.find(termQuery(roleId), TERM_FIELDS).lean();
  return termPlanFrom(rows, period, now, await chainedOf(rows.map((p) => String(p._id))));
}

// 쓰기 — 건마다 읽은 만료 그대로일 때만(그 사이 봇 · 다른 화면이 바꿨으면 건너뛴다). { changed: 바뀐 수, late: 그 사이 연장이 붙어 뺀 수 }
//   📌 상점 연장(_lib/renewal.js)은 이 잠금을 모른다 — 쓰기 직전에 연장을 다시 보고 붙은 기록은 뺀다.
//      그래도 그 사이(읽기 ~ 쓰기)에 붙은 연장이 옛 만료에 이어졌으면(startsAt ≠ 새 만료) 그 기록은 원래 값으로 되돌린다
async function applyTerm(change) {
  if (!change.length) return { changed: 0, late: 0 };
  const pre = await chainedOf(change.map((c) => String(c._id)));
  const go = change.filter((c) => !pre.has(String(c._id)));
  if (!go.length) return { changed: 0, late: pre.size };
  const r = await Purchase.bulkWrite(
    go.map((c) => ({ updateOne: { filter: { _id: c._id, status: "completed", consumedAt: null, expiresAt: c.cur }, update: { $set: c.set } } })),
    { ordered: false }
  );
  let changed = r?.modifiedCount || 0;
  let late = pre.size;

  const byId = new Map(go.map((c) => [String(c._id), c]));
  const kids = await Purchase.find(liveChildQuery([...byId.keys()]), { renewOf: 1, startsAt: 1 }).lean();
  const undo = new Set();
  for (const k of kids) {
    const c = byId.get(String(k.renewOf));
    const next = c?.set.expiresAt ? c.set.expiresAt.getTime() : null;
    if (c && (k.startsAt == null || next == null || new Date(k.startsAt).getTime() !== next)) undo.add(String(k.renewOf));
  }
  for (const id of undo) {
    const c = byId.get(id);
    const u = await Purchase.updateOne(
      { _id: c._id, status: "completed", expiresAt: c.set.expiresAt },
      { $set: { expiresAt: c.prev.expiresAt, days: c.prev.days, reminderSentAt: c.prev.reminderSentAt } }
    );
    if (u.modifiedCount) {
      changed--;
      late++;
    }
  }
  return { changed, late };
}

async function termAction(b, dryRun, name) {
  let lock = null;
  try {
    const roleId = String(b?.roleId || "").trim();
    if (!ROLE_ID_RE.test(roleId)) return fail("역할 값이 올바르지 않습니다.");
    const pp = parsePeriod(b?.period, Date.now());
    if (pp.error) return fail(pp.error);
    await connectToDatabase();
    if (!dryRun) {
      lock = await acquireLock(name || "admin");
      if (!lock) return fail("다른 이전 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.", 409);
    }
    const now = Date.now();
    const plan = await termPlan(roleId, pp.period, now);
    // 바뀜 · 그대로 · 제외(만료 임박 · 과거 · 그 사이 바뀜) · 연장 있음(뒤에 살아 있는 연장)
    const view = (changed, missed, late) => ({
      roleId, period: pp.period, total: plan.total, change: changed, same: plan.same, excluded: plan.excluded + missed,
      chained: plan.chained + late, minEnd: plan.minEnd, maxEnd: plan.maxEnd,
    });
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, data: view(plan.change.length, 0, 0) });

    const { changed, late } = await applyTerm(plan.change);
    const missed = plan.change.length - changed - late;
    // 고른 기간을 이전 표에 남긴다 — 역할 화면 · 다음 이전이 같은 기간을 기본으로.
    //   📌 실제 기록이 그 기간이 됐을 때만(바뀜 · 그대로가 있을 때). 전부 제외 · 연장 있음이면 표를 바꾸지 않는다(표가 실제 기록과 어긋나지 않게)
    if (changed + plan.same > 0) {
      const ctx = await loadContext();
      await saveMapEntry({ ...ctx.map }, roleId, mapValue({ ...mapEntry(ctx.map[roleId]), period: pp.period }));
    }
    console.log(
      `🧊 역할 이전 기간 적용 (${name}): ${roleId} · ${JSON.stringify(pp.period)} · 바뀜 ${changed} · 그대로 ${plan.same} · 제외 ${plan.excluded + missed} · 연장 있음 ${plan.chained + late}`
    );
    return NextResponse.json({ success: true, dryRun: false, data: view(changed, missed, late) });
  } finally {
    if (lock) await releaseLock(lock);
  }
}

// ── 환불로 바꾸기 — 이 도구가 만든 이전 기록(역할 하나)을 환불로 돌리고 사람마다 1인당 금액을 지급한다 ──
//    대상 · 제외 규칙은 lib/roleMigrationTerms.js refundPlanFrom. 쓰기는 기록마다 completed → refunded 조건부 —
//    바뀐 기록이 하나라도 있는 사람만 지급한다(두 번 눌러도 · 겹쳐도 한 사람 한 번). 바꾼 기록 자체가 '이미 환불'의 근거다
//    📌 서버에 없는 사람은 바꾸지도 주지도 않는다(members — 명단을 못 받으면 getGuildRoster 가 던져 미리보기 · 실행 모두 막힌다)
async function refundPlan(roleId, now, members) {
  const rows = await Purchase.find(termQuery(roleId), REFUND_FIELDS).lean();
  const chained = await chainedOf(rows.map((p) => String(p._id)));
  const userIds = [...new Set(rows.map((p) => p.userId))];
  const doneUsers = userIds.length
    ? new Set((await Purchase.distinct("userId", toolRefundQuery({ roleIds: [roleId], userIds }))).map(String))
    : new Set();
  const plan = refundPlanFrom(rows, now, chained, doneUsers, members);
  // 이미 환불로 바꾼 이전 기록 수(이 역할) — 미리보기의 '환불함'
  plan.already = await Purchase.countDocuments({ roleId, itemId: "grant", adminNote: MARK_RE, status: "refunded" });
  // 역할 이름 — 기록에 남긴 이름(디스코드에서 지운 역할도). 원장 · 표시 기록에 쓴다
  plan.roleName = roleNameOf(rows.find((p) => p.adminNote)?.adminNote);
  return plan;
}
// 확인 창의 대상 요약 — 사람 · 바꿀 기록 · 1인당 금액
const refundPlanKey = (plan, refund) =>
  keyOf(["refund", refund.currency, refund.amount, plan.people.map((u) => [u.id, u.recs.map((r) => String(r._id)).sort()]).sort((a, b) => (a[0] < b[0] ? -1 : 1))]);

async function refundAction(b, dryRun, name) {
  let lock = null;
  try {
    const roleId = String(b?.roleId || "").trim();
    if (!ROLE_ID_RE.test(roleId)) return fail("역할 값이 올바르지 않습니다.");
    const rf = parseRefund(b?.refund);
    if (rf.error) return fail(rf.error);
    const refund = rf.refund;
    await connectToDatabase();
    if (!dryRun) {
      lock = await acquireLock(name || "admin");
      if (!lock) return fail("다른 이전 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.", 409);
    }
    const members = await memberIds();
    const now = Date.now();
    const plan = await refundPlan(roleId, now, members);
    const roleName = plan.roleName || roleId;
    const key = refundPlanKey(plan, refund);
    // 대상(사람) · 1인당 · 합계 / 제외 — 기간 끝남 · 연장 있음 · 환불함(사람 단위로 이미 환불 + 이미 바꾼 이전 기록) · 서버에 없음
    const view = (people, late) => ({
      roleId, refund, total: plan.total, people, sum: people * refund.amount,
      ended: plan.ended, chained: plan.chained + late, done: plan.done, already: plan.already, gone: plan.gone, key,
    });
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, data: view(plan.people.length, 0) });
    // 📌 확인 창의 대상 그대로일 때만 쓴다
    if (b?.expect !== key) return stale(view(plan.people.length, 0));

    const nowDate = new Date(now);
    let late = 0;
    let error = "";
    const payees = [];
    let paid = { paid: 0, failed: [], unsure: [] };
    try {
      // 📌 쓰기 직전에 연장을 다시 본다 — 상점 연장(_lib/renewal.js)은 이 잠금을 모른다. 그 사이 붙은 기록은 바꾸지 않는다
      const pre = await chainedOf(plan.people.flatMap((u) => u.recs.map((r) => String(r._id))));
      for (const u of plan.people) {
        let entry = null;
        for (const r of u.recs) {
          if (pre.has(String(r._id))) { late++; continue; }
          // 이미 뗀 사이트 보유 기록은 회수를 다시 걸지 않는다(roleDetached · error 그대로). 나머지는 봇 환불 회수가 역할을 뗀다
          const set = r.detached
            ? { status: "refunded", revokedAt: nowDate }
            : { status: "refunded", revokedAt: nowDate, roleDetached: false, error: "" };
          const w = await Purchase.updateOne({ _id: r._id, status: "completed", consumedAt: null }, { $set: set });
          // 📌 바뀐 즉시 지급 대상에 넣는다 — 그 뒤 쓰기가 실패해도 이 사람의 지급이 빠지지 않게. key = 이 기록 _id(Payout._id)
          if (w.modifiedCount && !entry) {
            entry = { id: u.id, name: u.name, key: String(r._id) };
            payees.push(entry);
          }
        }
      }
    } catch (err) {
      error = `처리 중 오류: ${err?.message || err}`;
      console.error(`역할 이전 → 환불 처리 오류 (${roleName}):`, err);
    } finally {
      // 📌 바뀐 사람에게는 반드시 지급한다(payRefunds 는 던지지 않는다) — 중간에 끊겨도 기록만 바뀌고 돈이 빠지지 않게.
      //    그래도 빠진 사람(바뀌었는지 모르는 기록 등)은 진행 탭 '지급 빠짐'으로 남아 [빠진 지급]으로 메운다
      paid = await payRefunds(payees, refund, roleName, nowDate, name || "admin");
    }
    // 이전 표 — 바꾼 사람이 있을 때만 처리(환불 · 화폐 · 금액)를 남긴다(역할 화면 · 다음 이전의 기본값). 실패해도 지급 결과는 그대로(경고)
    let warn = "";
    if (payees.length) {
      try {
        const ctx = await loadContext();
        await saveMapEntry({ ...ctx.map }, roleId, mapValue({ ...mapEntry(ctx.map[roleId]), mode: "refund", refund }));
      } catch (err) {
        warn = "이전 표 저장 실패";
        console.error(`역할 이전 → 환불 이전 표 저장 실패 (${roleName}):`, err?.message || err);
      }
    }
    console.log(
      `🧊 역할 이전 → 환불 (${name}): ${roleName} · ${refund.amount} ${refund.currency} · 바꿈 ${payees.length}명 · 지급 ${paid.paid}명 · 실패 ${paid.failed.length}명 · 확인 필요 ${paid.unsure.length}명 · 연장 있음 ${plan.chained + late}${error ? ` · ${error}` : ""}`
    );
    return NextResponse.json({
      success: true,
      dryRun: false,
      data: {
        ...view(payees.length, late),
        changed: payees.length, paid: paid.paid, failed: paid.failed.length, unsure: paid.unsure.length,
        sum: paid.paid * refund.amount, failedList: [...paid.failed, ...paid.unsure], error, warn,
      },
    });
  } finally {
    if (lock) await releaseLock(lock);
  }
}

// ── 빠진 지급 — 이 도구의 환불 근거는 있는데 지급 기록이 없는 사람(중간에 끊긴 실행)에게만 1인당 금액을 준다 ──
//    대상: lib refundGapsFrom 의 '지급 빠짐'(묶음마다 한 사람 — 지급 _id 는 묶음의 가장 작은 기록 _id). 서버에 없는 사람 · 확인 필요는 수만 센다.
//    hint: 지난 지급 — 같은 실행(같은 시각 · 같은 사유)에서 들어간 지급의 1인당 금액, 없으면 이전 표에 남긴 환불 금액
async function repayPlan(roleId, members) {
  const recs = await Purchase.find(toolRefundQuery({ roleIds: [roleId] }), { roleId: 1, userId: 1, userName: 1, revokedAt: 1, adminNote: 1 }).lean();
  const pays = recs.length ? await Payout.find({ _id: { $in: recs.map((p) => p._id) } }, { status: 1, currency: 1 }).lean() : [];
  const g = refundGapsFrom(recs, new Map(pays.map((p) => [String(p._id), p])));
  const people = g.unpaid.filter((x) => members.has(x.id));
  let hint = null;
  if (g.unpaid.length) {
    const sib = await Payout.findOne(
      {
        source: REFUND_SOURCE,
        createdAt: { $in: [...new Set(g.unpaid.map((x) => x.at))].map((t) => new Date(t)) },
        reason: { $in: [...new Set(g.unpaid.map((x) => refundReason(roleNameOf(x.note))))] },
      },
      { currency: 1, amount: 1 }
    ).sort({ createdAt: -1 }).lean();
    if (sib && Number(sib.amount) > 0) hint = { currency: sib.currency === "point" ? "point" : "xp", amount: Number(sib.amount) };
    if (!hint) {
      const mapDoc = await Setting.findOne({ key: MAP_KEY }, { value: 1 }).lean();
      hint = mapEntry(mapDoc?.value?.[roleId]).refund;
    }
  }
  return {
    people, gone: g.unpaid.length - people.length, checking: g.unsure.length, hint,
    roleName: roleNameOf(recs.find((p) => p.adminNote)?.adminNote),
  };
}

async function repayAction(b, dryRun, name) {
  let lock = null;
  try {
    const roleId = String(b?.roleId || "").trim();
    if (!ROLE_ID_RE.test(roleId)) return fail("역할 값이 올바르지 않습니다.");
    const rf = parseRefund(b?.refund);
    if (rf.error) return fail(rf.error);
    const refund = rf.refund;
    await connectToDatabase();
    if (!dryRun) {
      lock = await acquireLock(name || "admin");
      if (!lock) return fail("다른 이전 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.", 409);
    }
    const members = await memberIds();
    const plan = await repayPlan(roleId, members);
    const roleName = plan.roleName || roleId;
    const key = keyOf(["repay", refund.currency, refund.amount, plan.people.map((x) => [x.id, x.key]).sort((a, c) => (a[1] < c[1] ? -1 : 1))]);
    // 대상(사람) · 1인당 · 합계 / 서버에 없음 · 확인 필요(빙옥 처리 중 — 반영 여부를 몰라 주지 않는다) · 지난 지급
    const view = (people) => ({ roleId, refund, people, sum: people * refund.amount, gone: plan.gone, checking: plan.checking, hint: plan.hint, key });
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, data: view(plan.people.length) });
    if (b?.expect !== key) return stale(view(plan.people.length));

    // 잠금 안에서 다시 센 대상 그대로 — 지급 _id = 묶음의 근거 기록 _id 라 같은 묶음에 두 번 들어가지 않는다. 사유 · 시각은 그 근거 기록 것
    const paid = await payRefunds(
      plan.people.map((x) => ({ id: x.id, name: x.name, key: x.key, at: x.at || null, reason: refundReason(roleNameOf(x.note) || roleName) })),
      refund, roleName, new Date(), name || "admin"
    );
    console.log(
      `🧊 역할 환불 빠진 지급 (${name}): ${roleName} · ${refund.amount} ${refund.currency} · 대상 ${plan.people.length}명 · 지급 ${paid.paid}명 · 실패 ${paid.failed.length}명 · 확인 필요 ${paid.unsure.length}명`
    );
    return NextResponse.json({
      success: true,
      dryRun: false,
      data: {
        ...view(plan.people.length),
        paid: paid.paid, failed: paid.failed.length, unsure: paid.unsure.length,
        sum: paid.paid * refund.amount, failedList: [...paid.failed, ...paid.unsure],
      },
    });
  } finally {
    if (lock) await releaseLock(lock);
  }
}

// ── [미리보기 · 실행] ──
export async function POST(request) {
  let lock = null;
  try {
    const { deny, name } = await requireAdmin();
    if (deny) return deny;
    const b = await request.json().catch(() => ({}));
    // 📌 실행은 dryRun: false 를 명시했을 때만 — 빠지거나 잘못 오면 미리보기
    const dryRun = b?.dryRun !== false;
    if (b?.action === "term") return await termAction(b, dryRun, name);
    if (b?.action === "refund") return await refundAction(b, dryRun, name);
    if (b?.action === "repay") return await repayAction(b, dryRun, name);
    const plan = normalizePlan(b?.plan, Date.now());
    if (plan.error) return fail(plan.error);

    await connectToDatabase();
    if (!dryRun) {
      lock = await acquireLock(name || "admin");
      if (!lock) return fail("다른 이전 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.", 409);
    }

    // 미리보기와 실행이 같은 명단을 보게 — 5분 안에 받은 명단이면 그대로 쓴다(인스턴스 · 캐시가 다르면 새로 받는다 — 환불은 아래 expect 로 맞춰 본다)
    const roster = await getGuildRoster({ maxAgeMs: 5 * 60 * 1000 });
    const ctx = await loadContext();
    // 📌 분류 · 기간을 잰 시각 = 기록을 만든 시각. 종료일이 그 사이 1시간 안으로 들어왔으면 실행하지 않는다
    const now = Date.now();
    if (!dryRun) {
      const recheck = normalizePlan(b?.plan, now);
      if (recheck.error) return fail(recheck.error);
    }
    const entries = await evaluate(plan.list, roster, ctx, now);

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, data: { at: roster.at, ...summarize(entries, false) } });
    }
    // 📌 환불이 든 실행은 확인 창의 대상 그대로일 때만 — 그 사이 역할을 새로 받은 사람 등으로 대상 · 합계가 바뀌었으면 쓰지 않는다(잠금 안 · 쓰기 전)
    const rk = refundKeyOf(entries);
    if (rk && b?.expect !== rk) return stale({ at: roster.at, ...summarize(entries, false) });

    const failed = await execute(entries, ctx, now, name || "admin");
    const out = summarize(entries, true);
    console.log(
      `🧊 역할 이전 (${name}): 역할 ${out.totals.roles}개 · 새 아이템 ${out.totals.created}개 · 기록 ${out.totals.inserted}건 · 사이트 보유 전환 ${out.totals.converted}건 · 환불 ${out.totals.paid}건 · 역할 정리 ${out.totals.cleaned}건 · 실패 ${failed.length}건`
    );
    return NextResponse.json({ success: true, dryRun: false, data: { at: roster.at, ...out, failed } });
  } catch (e) {
    console.error("역할 이전 오류:", e);
    return fail(e?.message?.startsWith("디스코드") || e?.message?.startsWith("봇") ? e.message : "처리 중 오류가 발생했습니다.", 500);
  } finally {
    if (lock) await releaseLock(lock);
  }
}
