export const dynamic = "force-dynamic";
// 📌 디스코드 멤버 명단을 읽고 수백 건을 쓰는 큰 작업 — 플랫폼 기본 시간 제한보다 넉넉히
export const maxDuration = 60;

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { getGuildRoster } from "@/lib/guildRoster";
import { normalizeItemPayload, normalizeColor } from "@/lib/items";
import Item from "@/models/Item";
import Purchase from "@/models/Purchase";
import BotSetting from "@/models/BotSetting";
import RoleConfig from "@/models/RoleConfig";
import Setting from "@/models/Setting";

// ── [관리자] 역할 → 인벤토리 이전 ──
//    지난 시즌 디스코드 역할을 사이트 아이템으로 옮긴다. 이 라우트는 디스코드 역할을 직접 건드리지 않는다(읽기만).
//    (1) 역할마다 아이템을 정한다 — 새로 만들기(역할 이름 · 색, 아이템 · 꾸미기 · 권한) 또는 기존 아이템.
//        새로 만들 때 같은 역할에 이미 연결 · 이전된 아이템이 있으면 그것을 쓴다(중복 생성 금지 — 여러 번 눌러도 하나).
//        아이템 · 권한 유형은 roleId 를 연결한다. 꾸미기는 역할 없는 유형이라 연결 대신 이전 표(Setting roleMigrationMap)에만 적는다.
//    (2) 그 역할을 지금 가진 사람(봇 제외)마다 Purchase 기록을 만든다 — 운영진 지급과 같은 모양(itemId "grant" · itemRef · price 0 · completed),
//        adminNote "역할 이전 · <역할 이름>" 로 출처를 남긴다. 같은 역할 · 같은 아이템의 살아 있는 기록이 이미 있으면 새로 만들지 않는다.
//    (3) 역할 처리 — 아이템 · 꾸미기는 siteOnly: true · roleDetached: false 로 세워, 봇 큐(processDetachments)가 30초마다 차례로 역할을 뗀다.
//        떼도 소유는 기록으로 남는다(lib/ownedItems.js (A)). 권한(perk)은 역할이 곧 디스코드 기능이라 siteOnly 를 세우지 않는다 — 기록만, 역할 유지.
//        이미 가진 완료 구매(같은 역할 · 권한 아닌 것)는 시즌 전환(app/api/season/detach)과 같은 방식으로 사이트 보유로 돌린다 — 안 돌리면 그 구매가
//        '살아 있는 근거'가 되어 봇이 역할을 남긴다.
//    제외: @everyone · 연동(봇 · 부스터) · 보호 역할(펭귄 — BotSetting.protectedRoleIds) · 레벨 보상(RoleConfig.rewardLevel) ·
//          시스템 역할(인증 · 미인증 · 내전 · 부스터 · 서포터즈 · RANKER) · 운영 권한 역할 · 봇보다 위(봇이 뗄 수 없음)
//          (계획에서만) 지금 가진 사람이 없는 역할 — 아이템을 만들지 않는다
//    GET              — 역할 목록 · 보유 인원 · 연결 아이템 (?refresh=1 이면 디스코드 명단을 새로 받는다)
//    GET ?status=1    — 이전한 역할별 진행(봇이 뗀 수 · 남은 수 · 영구 실패 · 지금 디스코드 보유자)
//    POST { dryRun, plan: [{ roleId, itemId? | create: { name, type, color } }] }
//                     — dryRun 을 false 로 명시해야만 쓴다(기본은 미리보기). 실행은 잠금(Setting roleMigrationLock)으로 하나씩.

const MARK = "역할 이전"; // adminNote 머리 — 이 도구가 만든 기록
const MARK_RE = /^역할 이전/;
const MAP_KEY = "roleMigrationMap"; // Setting.value = { 역할 id: 아이템 id }
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

// ── 공통 읽기 — 제외 판정 · 아이템 · 이전 표 ──
async function loadContext() {
  const [setting, roleConfigs, items, mapDoc] = await Promise.all([
    BotSetting.findOne({ key: "main" }, { protectedRoleIds: 1, rankerRoleId: 1, supporterRoleId: 1 }).lean(),
    RoleConfig.find({}, { roleId: 1, rewardLevel: 1, buffXp: 1, attendBuffXp: 1 }).lean(),
    Item.find({}, { name: 1, type: 1, roleId: 1, color: 1, visible: 1, sortOrder: 1, createdAt: 1 }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
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
  const it = ctx.itemById.get(String(ctx.map[roleId] || ""));
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
    const [liveAgg, migAgg] = await Promise.all([
      // 그 역할로 살아 있는 구매 기록(대기 · 완료, 소모 안 됨, 기간 남음)
      Purchase.aggregate([
        { $match: { roleId: { $in: roleIds }, status: { $in: ["pending", "completed"] }, consumedAt: null, ...isLive(now) } },
        { $group: { _id: "$roleId", n: { $sum: 1 } } },
      ]),
      // 이 도구가 만든 기록
      Purchase.aggregate([
        { $match: { roleId: { $in: roleIds }, itemId: "grant", adminNote: MARK_RE } },
        { $group: { _id: "$roleId", n: { $sum: 1 } } },
      ]),
    ]);
    const liveOf = new Map(liveAgg.map((g) => [g._id, g.n]));
    const migOf = new Map(migAgg.map((g) => [g._id, g.n]));

    const roles = [...roster.roles]
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: hexOf(r.color),
        position: r.position,
        holders: holders.get(r.id) || 0,
        excluded: exclusionOf(r, roster, ctx),
        buff: ctx.buffIds.has(r.id),
        item: itemView(mappedItem(r.id, ctx)),
        live: liveOf.get(r.id) || 0,
        migrated: migOf.get(r.id) || 0,
      }));
    const items = ctx.items
      .filter((i) => i.type !== "physical")
      .map((i) => ({ id: String(i._id), name: i.name, type: i.type, roleId: i.roleId || "", color: i.color || "", visible: i.visible !== false }));

    return NextResponse.json({
      success: true,
      data: { at: roster.at, members: humans, bots: roster.members.length - humans, botTop: roster.botTop, roles, items },
    });
  } catch (e) {
    console.error("역할 이전 조회 오류:", e);
    return fail(e?.message?.startsWith("디스코드") || e?.message?.startsWith("봇") ? e.message : "조회 중 오류가 발생했습니다.", 500);
  }
}

// ── 진행 — 이전한 역할(이전 표 + 이 도구의 기록)별로 봇이 뗀 수 · 남은 수 ──
async function statusData() {
  const ctx = await loadContext();
  const fromRecords = await Purchase.distinct("roleId", { itemId: "grant", adminNote: MARK_RE });
  const ids = [...new Set([...Object.keys(ctx.map), ...fromRecords.map(String)])].filter(Boolean);
  if (ids.length === 0) return { at: null, roles: [] };

  const rows = await Purchase.find(
    { roleId: { $in: ids }, status: "completed" },
    { roleId: 1, siteOnly: 1, roleDetached: 1, error: 1, itemId: 1, adminNote: 1 }
  ).lean();
  // 지금 디스코드 보유자 — 30초 안에 받은 명단이면 그대로. 못 받으면 칸만 비운다(진행 숫자는 DB 기준이라 그대로 보여 준다)
  let roster = null;
  try { roster = await getGuildRoster({ maxAgeMs: 30_000 }); } catch (e) { console.error("역할 이전 진행 — 명단 조회 실패:", e?.message || e); }
  const roleById = new Map((roster?.roles || []).map((r) => [r.id, r]));
  const holders = new Map();
  for (const m of roster?.members || []) {
    if (m.bot) continue;
    for (const r of m.roles) holders.set(r, (holders.get(r) || 0) + 1);
  }

  const stat = new Map(ids.map((id) => [id, { records: 0, kept: 0, waiting: 0, retrying: 0, detached: 0, failed: 0, note: "" }]));
  for (const p of rows) {
    const s = stat.get(p.roleId);
    if (!s) continue;
    const mine = p.itemId === "grant" && MARK_RE.test(p.adminNote || "");
    if (mine) {
      s.records++;
      if (!s.note) s.note = String(p.adminNote || "");
      if (!p.siteOnly) s.kept++;
    }
    if (!p.siteOnly) continue;
    if (p.roleDetached !== true) {
      s.waiting++;
      if (p.error) s.retrying++;
    } else if (PERM_FAIL_RE.test(p.error || "") && !ROLE_GONE_RE.test(p.error || "")) s.failed++;
    else s.detached++;
  }

  const roles = ids.map((id) => {
    const r = roleById.get(id);
    const s = stat.get(id);
    return {
      roleId: id,
      // 디스코드에서 지운 역할은 기록에 남긴 이름으로
      name: r?.name || s.note.replace(MARK_RE, "").replace(/^\s*·\s*/, "") || id,
      color: hexOf(r?.color),
      gone: !!roster && !r,
      item: itemView(mappedItem(id, ctx)),
      records: s.records,
      kept: s.kept,
      waiting: s.waiting,
      retrying: s.retrying,
      detached: s.detached,
      failed: s.failed,
      holders: roster ? holders.get(id) || 0 : null,
    };
  });
  roles.sort((a, b) => (roleById.get(b.roleId)?.position ?? -1) - (roleById.get(a.roleId)?.position ?? -1));
  return { at: roster?.at || null, roles };
}

// ── 계획 정리 ──
function normalizePlan(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "이전할 역할을 골라 주세요." };
  if (raw.length > MAX_PLAN) return { error: `한 번에 ${MAX_PLAN}개 역할까지 이전할 수 있습니다.` };
  const seen = new Set();
  const list = [];
  for (const p of raw) {
    const roleId = String(p?.roleId || "").trim();
    if (!ROLE_ID_RE.test(roleId)) return { error: "역할 값이 올바르지 않습니다." };
    if (seen.has(roleId)) return { error: "같은 역할이 두 번 들어 있습니다." };
    seen.add(roleId);
    const itemId = String(p?.itemId || "").trim();
    if (itemId) {
      if (!mongoose.isValidObjectId(itemId)) return { error: "아이템 값이 올바르지 않습니다." };
      list.push({ roleId, itemId });
      continue;
    }
    const c = p?.create && typeof p.create === "object" ? p.create : {};
    list.push({
      roleId,
      create: { name: String(c.name || "").trim().slice(0, 40), type: NEW_TYPES.includes(c.type) ? c.type : "item", color: normalizeColor(c.color) },
    });
  }
  return { list };
}

// ── 계획 계산 — 쓰기 없음. 역할마다 아이템 · 대상(보유자) · 새 기록 · 사이트 보유로 돌릴 기존 구매 · 건너뜀 ──
async function evaluate(list, roster, ctx) {
  const roleById = new Map(roster.roles.map((r) => [r.id, r]));
  const now = new Date();
  const entries = list.map((p) => {
    const role = roleById.get(p.roleId) || null;
    const e = {
      roleId: p.roleId, roleName: role?.name || "", color: hexOf(role?.color),
      excluded: "", error: "", mode: "", item: null, create: null, keepRole: false,
      holders: [], insert: [], convert: [], convertUsers: 0, skipped: 0,
    };
    if (!role) { e.excluded = "missing"; return e; }
    e.excluded = exclusionOf(role, roster, ctx);
    if (e.excluded) return e;
    e.holders = roster.members.filter((m) => !m.bot && m.roles.includes(role.id));
    // 📌 지금 가진 사람이 없으면 옮길 것도 없다 — 빈 아이템을 만들지 않는다(전체 선택에 섞여 들어와도)
    if (e.holders.length === 0) { e.excluded = "empty"; return e; }

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
  const userIds = [...new Set(active.flatMap((e) => e.holders.map((h) => h.id)))];
  const roleIds = active.map((e) => e.roleId);
  const refs = active.filter((e) => e.item).map((e) => String(e.item._id));
  const lives = userIds.length
    ? await Purchase.find(
        {
          userId: { $in: userIds },
          status: { $in: ["pending", "completed"] },
          consumedAt: null,
          $and: [isLive(now), { $or: [{ roleId: { $in: roleIds } }, ...(refs.length ? [{ itemRef: { $in: refs } }] : [])] }],
        },
        { userId: 1, roleId: 1, itemRef: 1, itemType: 1, status: 1, siteOnly: 1, roleDetached: 1 }
      ).lean()
    : [];
  const byUser = new Map();
  for (const p of lives) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId).push(p);
  }

  // 📌 같은 기존 아이템을 여러 역할에 골랐을 때 — 이번 계획 안에서 이미 그 아이템을 받는 사람은 한 번만(DB 에 아직 없는 기록이라 위 조회로는 안 잡힌다)
  const given = new Set();
  for (const e of active) {
    const ref = e.item ? String(e.item._id) : "";
    for (const h of e.holders) {
      const mine = (byUser.get(h.id) || []).filter((p) => p.roleId === e.roleId || (ref && p.itemRef === ref));
      if (mine.length === 0) {
        if (ref && given.has(`${h.id}|${ref}`)) { e.skipped++; continue; }
        e.insert.push(h);
        if (ref) given.add(`${h.id}|${ref}`);
        continue;
      }
      // 이미 기록이 있다 — 새로 만들지 않는다. 역할을 뗄 계획이면, 아직 사이트 보유가 아닌(또는 봇이 이미 처리했는데 역할이 남은) 완료 구매를 다시 큐에 올린다
      if (!e.keepRole) {
        const conv = mine.filter((p) => p.status === "completed" && p.roleId === e.roleId && p.itemType !== "perk" && (p.siteOnly !== true || p.roleDetached === true));
        if (conv.length) {
          e.convert.push(...conv.map((p) => String(p._id)));
          e.convertUsers++;
          continue;
        }
      }
      e.skipped++;
    }
  }
  return entries;
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
    holders: e.holders.length,
    insert: e.insert.length,
    convert: e.convertUsers,
    skipped: e.skipped,
    ...(executed ? { inserted: e.inserted || 0, converted: e.converted || 0, created: !!e.created } : {}),
  }));
  const active = entries.filter((e) => !e.excluded && !e.error);
  const sum = (f) => active.reduce((n, e) => n + f(e), 0);
  const totals = {
    roles: active.length,
    excluded: entries.length - active.length,
    createItems: active.filter((e) => e.mode === "new").length,
    people: new Set(active.flatMap((e) => e.holders.map((h) => h.id))).size,
    records: sum((e) => e.insert.length),
    convert: sum((e) => e.convertUsers),
    skipped: sum((e) => e.skipped),
    detach: sum((e) => (e.keepRole ? 0 : e.insert.length + e.convertUsers)),
    keep: sum((e) => (e.keepRole ? e.insert.length : 0)),
    ...(executed
      ? { inserted: sum((e) => e.inserted || 0), converted: sum((e) => e.converted || 0), created: active.filter((e) => e.created).length }
      : {}),
  };
  return { roles, totals };
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

// ── 실행 — 역할마다: 아이템 만들기(필요하면) → 이전 표 → 새 기록 → 기존 구매 사이트 보유 ──
async function execute(entries, ctx) {
  const now = new Date();
  const failed = [];
  const map = { ...ctx.map };
  let nextSort = null;

  for (const e of entries) {
    if (e.excluded || e.error) continue;
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
        map[e.roleId] = String(newId);
        await Setting.updateOne({ key: MAP_KEY }, { $set: { value: map, updatedAt: new Date() } }, { upsert: true });
        e.item = (await Item.create({ _id: newId, ...n.data, sortOrder: Math.min(999, nextSort++) })).toObject();
        e.created = true;
      }
    } catch (err) {
      e.error = `아이템을 만들지 못했습니다. ${err?.message || ""}`.trim();
      continue;
    }

    const itemId = String(e.item._id);
    try {
      // 이전 표 — 다음 실행이 같은 아이템을 다시 쓰게(꾸미기처럼 roleId 를 못 다는 아이템도). 역할마다 바로 적어 중간에 끊겨도 남게
      if (map[e.roleId] !== itemId) {
        map[e.roleId] = itemId;
        await Setting.updateOne({ key: MAP_KEY }, { $set: { value: map, updatedAt: new Date() } }, { upsert: true });
      }

      const rows = e.insert.map((h) => ({
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
        days: 0,
        expiresAt: null,
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
          if (ok.has(r.orderId)) e.inserted++;
          else failed.push({ roleId: e.roleId, roleName: e.roleName, userId: r.userId, userName: r.userName, reason: "기록 저장 실패" });
        }
      }

      e.converted = 0;
      if (!e.keepRole && e.convert.length) {
        const r = await Purchase.updateMany(
          { _id: { $in: e.convert }, status: "completed" },
          // error 도 비운다 — 지난 실패 사유가 남으면 봇이 실패건으로 보고 뒤로 미룬다(시즌 전환 라우트와 같게)
          { $set: { siteOnly: true, siteOnlyAt: now, roleDetached: false, error: "" } }
        );
        e.converted = r.modifiedCount || 0;
      }
    } catch (err) {
      e.error = `처리 중 오류: ${err?.message || err}`;
      console.error(`역할 이전 처리 오류 (${e.roleName}):`, err);
    }
  }
  return failed;
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
    const plan = normalizePlan(b?.plan);
    if (plan.error) return fail(plan.error);

    await connectToDatabase();
    if (!dryRun) {
      lock = await acquireLock(name || "admin");
      if (!lock) return fail("다른 이전 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.", 409);
    }

    // 미리보기와 실행이 같은 명단을 보게 — 5분 안에 받은 명단이면 그대로 쓴다
    const roster = await getGuildRoster({ maxAgeMs: 5 * 60 * 1000 });
    const ctx = await loadContext();
    const entries = await evaluate(plan.list, roster, ctx);

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, data: { at: roster.at, ...summarize(entries, false) } });
    }

    const failed = await execute(entries, ctx);
    const out = summarize(entries, true);
    console.log(
      `🧊 역할 이전 (${name}): 역할 ${out.totals.roles}개 · 새 아이템 ${out.totals.created}개 · 기록 ${out.totals.inserted}건 · 사이트 보유 전환 ${out.totals.converted}건 · 실패 ${failed.length}건`
    );
    return NextResponse.json({ success: true, dryRun: false, data: { at: roster.at, ...out, failed } });
  } catch (e) {
    console.error("역할 이전 오류:", e);
    return fail(e?.message?.startsWith("디스코드") || e?.message?.startsWith("봇") ? e.message : "처리 중 오류가 발생했습니다.", 500);
  } finally {
    if (lock) await releaseLock(lock);
  }
}
