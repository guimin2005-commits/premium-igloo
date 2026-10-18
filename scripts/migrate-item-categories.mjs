// 📌 이름 머리말 → 「분류」 칸으로 옮기는 일회용 스크립트 — 2026-10-17 운영자 결정 「자동 + 바꾸기」(lib/itemCategory.js)
//    예전엔 분류가 이름 앞에 들어 있었다(「카드 스킨 · 골드」 · 「아바타 테두리 · 브론즈」 · 「배지 · 섬」). 이제 이름은 짧은 이름만, 분류는 category 칸.
//    사이트는 옮기기 전에도 같은 모습으로 보인다(category 가 빈 동안 머리말을 분류로 읽는다 — resolveCategory) — 이 스크립트는 데이터만 새 모양으로 맞춘다.
//
//    바꾸는 것(문서 하나):
//      name     「<머리말> · <짧은 이름>」 → 「<짧은 이름>」(lib/itemCategory.js shortNameOf — 떼면 비는 이름은 머리말이 아니라 그대로)
//      category 머리말의 분류(카드 스킨 → 카드 테두리 · 아바타 테두리/테두리 → 프로필 테두리 · 배지 → 프로필 배지 — legacyCategoryOf).
//               자동 분류(autoCategoryOf — 꾸미기 효과 · 유형)와 같으면 ""(= 자동)로 둔다. 이미 분류를 직접 정한 문서는 분류를 건드리지 않고 이름만
//      아이템 연결 상품(shopitems.itemId)은 이름 스냅샷만 — 분류는 아이템을 따르므로 ""(lib/itemCategory.js · app/api/shop/items productPayload 와 같다)
//    대상: items · shopitems(실사이트) · draft_items · draft_shopitems(localhost 초안 — 기준 _draftBase 도 같은 규칙으로 바꿔 반영 때 차이가 생기지 않게).
//    건너뜀: 삭제 예정 초안. 구매 기록(purchases.itemName — 산 때의 이름 스냅샷)은 그대로 둔다(화면이 머리말을 떼어 읽는다).
//    ⚠ 공유 DB 라 --write 는 실행하는 순간 실사이트 · 봇에도 뜬다(봇 메시지 · 카드의 아이템 이름도 짧은 이름이 된다)
//
//    node scripts/migrate-item-categories.mjs            — 옮길 대상 · 머리말별 수 · 예시만 보여 준다(읽기만 — 쓰지 않음)
//    node scripts/migrate-item-categories.mjs --write    — 옮긴다. 바꾸기 전 값을 scripts/migrate-item-categories.backup.json 에 남긴다
//    node scripts/migrate-item-categories.mjs --revert   — 그 백업으로 되돌린다(그 사이 이름 · 분류를 다시 고친 문서는 건드리지 않는다)
import { registerHooks, createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 사이트 코드의 "@/…" 별칭과 확장자 없는 import("./items", "./itemArt")를 node 에서도 풀어 준다(scripts/test-catalog-draft.mjs 와 같다)
registerHooks({
  resolve(specifier, context, nextResolve) {
    const spec = specifier.startsWith("@/") ? pathToFileURL(path.join(ROOT, specifier.slice(2))).href : specifier;
    try {
      return nextResolve(spec, context);
    } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND" && e?.code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw e;
      for (const ext of [".js", "/index.js"]) {
        try { return nextResolve(spec + ext, context); } catch { /* 다음 후보 */ }
      }
      throw e;
    }
  },
});

const require = createRequire(path.join(ROOT, "package.json"));
const mongoose = require("mongoose");
const { autoCategoryOf, legacyCategoryOf, shortNameOf, resolveCategory, normalizeCategory } = await import("../lib/itemCategory.js");
const { ITEM_NAME_HEAD_RE } = await import("../lib/itemName.js");

const BACKUP = path.join(ROOT, "scripts", "migrate-item-categories.backup.json");
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--revert") ? "revert" : "dry";
const EXAMPLES = 8; // 머리말마다 보여 줄 예시 수
const fmt = (n) => Number(n).toLocaleString("ko-KR");

function uriOf() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^MONGODB_URI=(.*)$/m);
  if (!m) throw new Error("MONGODB_URI 없음");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

// 문서 하나(또는 초안 기준 _draftBase)의 새 값 — 옮길 게 없으면 null.
//    kind "item" | "shop". 연결 상품(shop + itemId)은 이름만(분류 "")
function convert(kind, doc) {
  if (!doc || typeof doc !== "object") return null;
  const name = String(doc.name || "");
  const m = ITEM_NAME_HEAD_RE.exec(name);
  if (!m) return null;
  const auto = autoCategoryOf(doc);
  const legacy = legacyCategoryOf(name, auto);
  if (!legacy) return null; // 떼면 비는 이름 — 머리말이 아니다
  const short = shortNameOf(name);
  const head = m[1].replace(/\s+/g, " ");
  const linked = kind === "shop" && !!String(doc.itemId || "");
  const own = normalizeCategory(doc.category);
  // 이미 직접 정한 분류는 둔다 · 연결 상품은 늘 "" · 나머지는 자동과 같으면 ""
  const category = linked ? "" : own || (legacy === auto ? "" : legacy);
  const set = { name: short };
  if (category !== (typeof doc.category === "string" ? doc.category : "")) set.category = category;
  return { set, head, legacy, auto, short, category, linked, kept: !!own && !linked };
}

const COLS = [
  { col: "items", kind: "item" },
  { col: "shopitems", kind: "shop" },
  { col: "draft_items", kind: "item", draft: true },
  { col: "draft_shopitems", kind: "shop", draft: true },
];
const HEAD_FILTER = { name: { $regex: ITEM_NAME_HEAD_RE.source } };

async function planOf(db) {
  const plan = [];
  const skipped = [];
  const missing = [];
  for (const c of COLS) {
    if (c.draft && !(await db.listCollections({ name: c.col }).toArray()).length) { missing.push(c.col); continue; }
    const filter = c.draft ? { $or: [HEAD_FILTER, { "_draftBase.name": HEAD_FILTER.name }] } : HEAD_FILTER;
    for (const d of await db.collection(c.col).find(filter).toArray()) {
      if (c.draft && d._draftOp === "delete") { skipped.push({ col: c.col, id: d._id, name: d.name, why: "삭제 예정 초안" }); continue; }
      const cv = convert(c.kind, d);
      const cb = c.draft ? convert(c.kind, d._draftBase) : null;
      if (!cv && !cb) continue;
      const set = { ...(cv ? cv.set : {}) };
      if (cb) for (const [k, v] of Object.entries(cb.set)) set[`_draftBase.${k}`] = v;
      plan.push({
        col: c.col, kind: c.kind, id: d._id, name: d.name, set, cv, baseOnly: !cv,
        before: { name: d.name, category: d.category ?? null, ...(c.draft && d._draftBase ? { _draftBase: { name: d._draftBase.name, category: d._draftBase.category ?? null } } : {}) },
      });
    }
  }
  return { plan, skipped, missing };
}

// 옮긴 뒤 같은 것(분류 + 짧은 이름)이 둘 이상인 아이템 — 실사이트 items 기준(옛 이름 「카드 스킨 · X」 · 「카드 테두리 · X」가 함께 있던 것 등)
async function duplicatesOf(db, plan) {
  const after = new Map(plan.filter((p) => p.col === "items" && p.cv).map((p) => [String(p.id), p.cv]));
  const groups = new Map();
  for (const it of await db.collection("items").find({}, { projection: { name: 1, type: 1, category: 1, effects: 1 } }).toArray()) {
    const cv = after.get(String(it._id));
    const doc = cv ? { ...it, name: cv.short, category: cv.category } : it;
    const key = `${resolveCategory(doc)} · ${shortNameOf(doc.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: it._id, name: it.name });
  }
  return [...groups.entries()].filter(([, rows]) => rows.length > 1);
}

await mongoose.connect(uriOf());
const db = mongoose.connection.db;
try {
  if (mode === "revert") {
    const back = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
    let n = 0;
    for (const b of back) {
      const _id = new mongoose.Types.ObjectId(b.id);
      const cur = await db.collection(b.col).findOne({ _id }, { projection: { name: 1, category: 1 } });
      // 그 사이 이름 · 분류를 다시 고쳤으면 건드리지 않는다
      if (!cur || (b.after.name !== undefined && cur.name !== b.after.name)) continue;
      if (b.after.category !== undefined && (cur.category ?? "") !== b.after.category) continue;
      const $set = {};
      const $unset = {};
      const put = (k, v) => { if (v === null || v === undefined) $unset[k] = ""; else $set[k] = v; };
      if (b.after.name !== undefined) put("name", b.before.name);
      if (b.after.category !== undefined) put("category", b.before.category);
      if (b.before._draftBase) {
        if (b.after["_draftBase.name"] !== undefined) put("_draftBase.name", b.before._draftBase.name);
        if (b.after["_draftBase.category"] !== undefined) put("_draftBase.category", b.before._draftBase.category);
      }
      const ops = {};
      if (Object.keys($set).length) ops.$set = $set;
      if (Object.keys($unset).length) ops.$unset = $unset;
      if (!Object.keys(ops).length) continue;
      const r = await db.collection(b.col).updateOne({ _id }, ops);
      n += r.modifiedCount;
    }
    console.log(`되돌림 ${n} / ${back.length}`);
  } else {
    const { plan, skipped, missing } = await planOf(db);
    for (const c of COLS) {
      if (missing.includes(c.col)) { console.log(`\n${c.col} — 없음`); continue; }
      const rows = plan.filter((p) => p.col === c.col);
      console.log(`\n${c.col} — 옮길 것 ${fmt(rows.length)}개${c.draft ? `(기준 _draftBase 만 ${rows.filter((p) => p.baseOnly).length}개)` : ""}`);
      // 머리말별 수 · 예시(옛 이름 → 새 이름 · 분류)
      const byHead = new Map();
      for (const p of rows.filter((x) => x.cv)) {
        if (!byHead.has(p.cv.head)) byHead.set(p.cv.head, []);
        byHead.get(p.cv.head).push(p);
      }
      for (const [head, list] of [...byHead.entries()].sort((a, b) => b[1].length - a[1].length)) {
        const auto = list.filter((p) => !p.cv.linked && !p.cv.kept && p.cv.category === "").length;
        const own = list.filter((p) => !p.cv.linked && !p.cv.kept && p.cv.category !== "").length;
        const linked = list.filter((p) => p.cv.linked).length;
        const kept = list.filter((p) => p.cv.kept).length;
        console.log(`  「${head} · 」 ${fmt(list.length)}개 → ${list[0].cv.legacy} — 자동 ${auto} · 직접 분류 ${own}${linked ? ` · 연결 상품(이름만) ${linked}` : ""}${kept ? ` · 분류 이미 있음(이름만) ${kept}` : ""}`);
        for (const p of list.slice(0, EXAMPLES)) {
          const cat = p.cv.linked ? "연결 아이템 분류" : p.cv.kept ? `분류 그대로 「${p.cv.category}」` : p.cv.category ? `분류 「${p.cv.category}」(자동은 ${p.cv.auto})` : `분류 자동(${p.cv.auto})`;
          console.log(`    · ${p.name} → ${p.cv.short} · ${cat} (${p.id})`);
        }
        if (list.length > EXAMPLES) console.log(`    … 외 ${fmt(list.length - EXAMPLES)}개`);
      }
      for (const p of rows.filter((x) => x.baseOnly).slice(0, EXAMPLES)) console.log(`  · 기준만 — ${p.name} (${p.id})`);
    }
    if (skipped.length) {
      console.log(`\n건너뜀 ${skipped.length}개`);
      for (const s of skipped) console.log(`  · [${s.col}] ${s.name} (${s.id}) — ${s.why}`);
    }
    const dups = await duplicatesOf(db, plan);
    if (dups.length) {
      console.log(`\n⚠ 옮긴 뒤 같은 분류 · 같은 이름이 둘 이상인 아이템 ${dups.length}묶음(실사이트 items — 정리는 관리 화면에서)`);
      for (const [key, rows] of dups) console.log(`  · ${key} — ${rows.map((r) => `${r.name} (${r.id})`).join(" / ")}`);
    }
    if (mode === "dry") {
      console.log("\n쓰지 않았습니다. 옮기려면 --write");
    } else if (plan.length) {
      // 바꾸기 전 값을 먼저 남긴다
      // 📌 백업은 덮어쓰지 않고 합친다(같은 문서는 처음 값 그대로) — 첫 실행이 도중에 끊긴 뒤 다시 돌려도 이미 옮긴 건까지 --revert 로 되돌린다
      let prev = [];
      try { prev = JSON.parse(fs.readFileSync(BACKUP, "utf8")); } catch { prev = []; }
      const seen = new Set(prev.map((b) => `${b.col}:${b.id}`));
      const merged = [...prev, ...plan.map((p) => ({ col: p.col, id: String(p.id), name: p.name, before: p.before, after: p.set })).filter((b) => !seen.has(`${b.col}:${b.id}`))];
      fs.writeFileSync(BACKUP, JSON.stringify(merged, null, 2));
      let n = 0;
      for (const p of plan) {
        // 이름이 아직 옛 이름인(또는 기준만 남은) 문서만 — 두 번 돌려도 같은 결과
        const filter = p.baseOnly ? { _id: p.id } : { _id: p.id, name: p.before.name };
        const r = await db.collection(p.col).updateOne(filter, { $set: p.set });
        n += r.modifiedCount;
      }
      console.log(`\n옮김 ${n} / ${plan.length} · 백업 ${path.relative(ROOT, BACKUP)}`);
    } else console.log("\n옮길 것이 없습니다.");
  }
} finally {
  await mongoose.disconnect();
}
