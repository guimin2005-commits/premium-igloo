// 📌 상품 초안(lib/catalogDraft.js) 실제 MongoDB 흐름 점검 — 시험용 DB "pi_drafttest_20261011" 에서만 돈다.
//    .env.local 의 MONGODB_URI 로 붙되 dbName 을 시험용으로 바꾼다(URI 안의 기본 DB = 실사이트는 읽지도 쓰지도 않는다).
//    붙은 DB 이름이 시험용이 아니면 바로 끝내고, 끝나면(성공 · 실패 모두) 시험용 DB 를 지운 뒤 지워졌는지 확인한다.
//    사이트 모듈(lib/catalogDraft · lib/items · models/*)은 그대로 불러온다 — 관리 라우트가 하는 mongoose 호출을 같은 모양으로 흉내 낸다.
//    사용 (저장소 루트에서): node scripts/test-catalog-draft-db.mjs
import { registerHooks } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DB = "pi_drafttest_20261011";

// 사이트 코드의 "@/…" 별칭과 확장자 없는 import("./itemArt", "next/server")를 node 에서도 풀어 준다(scripts/test-catalog-draft.mjs 와 같다)
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

// ───────────────────────── 모드(env) ─────────────────────────
const ENV_KEYS = ["CATALOG_DRAFT", "NEXTAUTH_URL", "VERCEL"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const setEnv = (vals) => { for (const k of ENV_KEYS) { if (vals[k] == null) delete process.env[k]; else process.env[k] = vals[k]; } };
const DRAFT_ENV = { CATALOG_DRAFT: "1", NEXTAUTH_URL: "http://localhost:3000" }; // localhost 초안 모드
const LIVE_ENV = { VERCEL: "1" };                                                // 실사이트(Vercel) — 플래그 없음
const LOCAL_ENV = { NEXTAUTH_URL: "http://localhost:3000" };                     // localhost 플래그 없음
setEnv({});

function readMongoUri() {
  const text = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?MONGODB_URI\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return "";
}

// ───────────────────────── 연결 · 시험용 DB 확인 ─────────────────────────
const mongoose = (await import("mongoose")).default;
const conn = mongoose.connection;
const dbNameNow = () => conn?.db?.databaseName;
const onTestDb = () => dbNameNow() === TEST_DB && conn.name === TEST_DB;
function guard() {
  if (!onTestDb()) throw new Error(`⛔ 붙은 DB 가 ${TEST_DB} 가 아님(${dbNameNow()}) — 중단`);
}

const uri = readMongoUri();
if (!uri) {
  console.error(".env.local 에 MONGODB_URI 가 없습니다.");
  process.exit(2);
}
await mongoose.connect(uri, { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
if (!onTestDb()) {
  console.error(`⛔ 붙은 DB 가 ${TEST_DB} 가 아님(${dbNameNow()}) — 아무것도 하지 않고 끝냄`);
  await mongoose.disconnect().catch(() => {});
  process.exit(2);
}
console.log(`붙은 DB: ${dbNameNow()}`);

async function dropTestDb() {
  if (!onTestDb()) throw new Error(`⛔ 지우려는 DB 가 ${TEST_DB} 가 아님(${dbNameNow()}) — 지우지 않음`);
  try {
    await conn.db.dropDatabase();
    return "dropDatabase";
  } catch (e) {
    const cols = await conn.db.listCollections({}, { nameOnly: true }).toArray();
    for (const c of cols) await conn.db.collection(c.name).drop().catch(() => {});
    return `컬렉션 하나씩 drop(dropDatabase 실패: ${e?.message})`;
  }
}

// ───────────────────────── 점검 틀 ─────────────────────────
let total = 0;
let passed = 0;
const failures = [];
const notes = [];
async function test(name, fn) {
  guard(); // DB 가 바뀌었으면 점검을 이어 가지 않는다(던져서 main 을 끝낸다)
  total += 1;
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push({ name, msg: e?.message || String(e) });
    console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").join("\n       ")}`);
  }
}
function canonV(v) {
  if (v instanceof Date) return { $d: v.getTime() };
  if (v && typeof v === "object" && (v._bsontype === "ObjectId" || v._bsontype === "ObjectID")) return { $o: String(v) };
  if (Array.isArray(v)) return v.map(canonV);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canonV(v[k]);
    return o;
  }
  return v === undefined ? "<undefined>" : v;
}
const canonStr = (v) => JSON.stringify(canonV(v));
const fmt = (v) => { try { return canonStr(v); } catch { return String(v); } };
const eq = (actual, expected, label) => {
  try { assert.deepStrictEqual(canonV(actual), canonV(expected)); } catch { throw new Error(`${label} — 기대 ${fmt(expected)} · 실제 ${fmt(actual)}`); }
};
const ok = (cond, label) => { if (!cond) throw new Error(label); };
const META = ["_draftOp", "_draftBase", "_draftAt"];
const hasMeta = (doc) => !!doc && META.some((k) => k in doc);
const S = (v) => String(v);
const oid = () => new mongoose.Types.ObjectId();
const sorted = (arr) => arr.map(String).sort();
async function rejectsWith(p, code, label) {
  try { await p; } catch (e) { if (e?.code === code) return; throw new Error(`${label} — 기대 code ${code} · 실제 ${e?.code} ${e?.message}`); }
  throw new Error(`${label} — 던지지 않음(기대 code ${code})`);
}

// ───────────────────────── 본 점검 ─────────────────────────
async function main() {
  guard();
  const pre = await conn.db.listCollections({}, { nameOnly: true }).toArray();
  if (pre.length) {
    console.log(`이전 실행이 남긴 컬렉션 ${pre.length}개 — 먼저 비운다: ${await dropTestDb()}`);
  }

  // 모델은 시험용 DB 확인 뒤에 불러온다(모델 등록 때 인덱스 · 컬렉션을 만들기 때문)
  const cd = await import("../lib/catalogDraft.js");
  const { itemCascadeSet } = await import("../lib/items.js");
  const Item = (await import("../models/Item.js")).default;
  const ShopItem = (await import("../models/ShopItem.js")).default;
  const ShopBanner = (await import("../models/ShopBanner.js")).default;
  const Setting = (await import("../models/Setting.js")).default;
  const ShopLock = (await import("../models/ShopLock.js")).default;
  const Purchase = (await import("../models/Purchase.js")).default;
  const SeasonPass = (await import("../models/SeasonPass.js")).default;
  const MODELS = [Item, ShopItem, ShopBanner, Setting, ShopLock, Purchase, SeasonPass];
  const DRAFTS = [Item, ShopItem, ShopBanner, Setting].map((M) => cd.draftModel(M));
  for (const M of [...MODELS, ...DRAFTS]) {
    if (M.db !== conn || M.db.name !== TEST_DB) throw new Error(`⛔ ${M.modelName} 이 시험용 연결이 아님(${M.db?.name})`);
  }
  await Promise.all([...MODELS, ...DRAFTS].map((M) => M.init())); // 인덱스(설정 key unique 등)까지 — 오래 켜 둔 localhost 와 같은 상태

  const coll = (name) => { guard(); return conn.db.collection(name); };
  const LIVE_COLLS = ["items", "shopitems", "shopbanners", "settings"];
  const DRAFT_COLLS = LIVE_COLLS.map((c) => `draft_${c}`);
  if (canonStr([Item, ShopItem, ShopBanner, Setting].map((M) => M.collection.collectionName)) !== canonStr(LIVE_COLLS)) throw new Error("모델 컬렉션 이름이 예상과 다름");
  if (canonStr(DRAFTS.map((M) => M.collection.collectionName)) !== canonStr(DRAFT_COLLS)) throw new Error("초안 컬렉션 이름이 예상과 다름");
  const rawAll = (name) => coll(name).find({}).sort({ _id: 1 }).toArray();
  const rawOne = (name, filter) => coll(name).findOne(filter && filter._bsontype ? { _id: filter } : filter);
  const idsIn = async (name) => sorted((await rawAll(name)).map((d) => d._id));
  const liveSnap = async () => Object.fromEntries(await Promise.all(LIVE_COLLS.map(async (c) => [c, canonStr(await rawAll(c))])));
  const eqSnap = (a, b, label) => { for (const c of LIVE_COLLS) if (a[c] !== b[c]) throw new Error(`${label} — 실사이트 ${c} 가 바뀜`); };
  const draftCounts = async () => Object.fromEntries(await Promise.all(DRAFT_COLLS.map(async (c) => [c, await coll(c).countDocuments({})])));
  const withEnv = async (env, fn) => {
    const prev = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    setEnv(env);
    try { return await fn(); } finally { setEnv(prev); }
  };
  const liveRead = (fn) => withEnv(LIVE_ENV, fn);

  // ── 실사이트 문서 넣기 ──
  const ID = Object.fromEntries(["I1", "I2", "I3", "I4", "I5", "I6", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "B1", "B2", "B3"].map((k) => [k, oid()]));
  const T0 = Date.parse("2026-10-01T00:00:00Z");
  const at = (m) => new Date(T0 + m * 60000);
  const plain = (Model, data) => new Model(data).toObject(); // 스키마 기본값을 채운 문서 모양
  const items = [
    plain(Item, { _id: ID.I1, name: "보호막", icon: "art:shield", type: "item", sortOrder: 1, effects: [{ id: "e1", on: "cardSkin", mode: "add", skin: "hw_ghost" }], createdAt: at(1) }),
    plain(Item, { _id: ID.I2, name: "포션", icon: "svg:bolt", type: "item", sortOrder: 2, createdAt: at(2) }),
    plain(Item, { _id: ID.I3, name: "지울 아이템", type: "item", sortOrder: 3, createdAt: at(3) }),
    plain(Item, { _id: ID.I4, name: "쓰는 중 아이템", type: "item", sortOrder: 4, createdAt: at(4) }),
    plain(Item, { _id: ID.I5, name: "패스 아이템", type: "item", sortOrder: 5, createdAt: at(5) }),
    plain(Item, { _id: ID.I6, name: "세트 구성", type: "cosmetic", sortOrder: 6, group: "G1", createdAt: at(6) }),
  ];
  const shops = [
    plain(ShopItem, { _id: ID.S1, ...itemCascadeSet(items[0]), itemId: S(ID.I1), price: 1000, stock: 10, soldCount: 3, sortOrder: 1, createdAt: at(11) }),
    plain(ShopItem, { _id: ID.S2, name: "무제한 상품", type: "item", price: 500, stock: -1, sortOrder: 2, createdAt: at(12) }),
    plain(ShopItem, { _id: ID.S3, name: "구매된 상품", type: "item", price: 300, sortOrder: 3, createdAt: at(13) }),
    plain(ShopItem, { _id: ID.S4, ...itemCascadeSet(items[2]), itemId: S(ID.I3), price: 200, sortOrder: 4, createdAt: at(14) }),
    plain(ShopItem, { _id: ID.S6, name: "세트 A", type: "bundle", price: 900, bundle: [{ itemId: S(ID.I6), days: 0, qty: 1, value: 100 }, { itemId: S(ID.I2), days: 0, qty: 1, value: 100 }], sortOrder: 6, createdAt: at(16) }),
    plain(ShopItem, { _id: ID.S7, name: "한정 상품", type: "item", price: 700, stock: 5, soldCount: 0, sortOrder: 7, createdAt: at(17) }),
    plain(ShopItem, { _id: ID.S9, name: "세트 B", type: "bundle", price: 800, bundle: [{ itemId: S(ID.I1), days: 0, qty: 1, value: 100 }], sortOrder: 8, createdAt: at(19) }),
  ];
  const b1 = plain(ShopBanner, { _id: ID.B1, imageUrl: "https://img.example/b1.png", title: "옛 배너", sortOrder: 0, createdAt: at(21) });
  delete b1.placement; // placement 칸이 생기기 전에 등록한 옛 배너
  const banners = [
    b1,
    plain(ShopBanner, { _id: ID.B2, imageUrl: "https://img.example/b2.png", title: "시즌 배너", subtitle: "부제", placement: "season", sortOrder: 1, createdAt: at(22) }),
    plain(ShopBanner, { _id: ID.B3, imageUrl: "https://img.example/b3.png", title: "지울 배너", sortOrder: 2, createdAt: at(23) }),
  ];
  const settings = [
    plain(Setting, { key: "itemGroups", value: [{ name: "G1" }], updatedAt: at(0) }),
    plain(Setting, { key: "maintenance", value: false, updatedAt: at(0) }),
  ];
  const GROUPS_ID = settings[0]._id;
  guard();
  await Item.collection.insertMany(items);
  await ShopItem.collection.insertMany(shops);
  await ShopBanner.collection.insertMany(banners);
  await Setting.collection.insertMany(settings);
  await Purchase.collection.insertOne(plain(Purchase, { userId: "u1", itemId: S(ID.S3), itemName: "구매된 상품", itemType: "item", status: "completed", createdAt: at(30) }));
  console.log(`실사이트 문서 넣음 — 아이템 ${items.length} · 상품 ${shops.length} · 배너 ${banners.length} · 설정 ${settings.length} · 구매 1`);

  // 관리 라우트 흉내(app/api/admin/items POST 수정 · shop/items POST · banners POST · 순서 · 그룹)
  const writable = (W, filter) => (W === Item ? filter : { ...filter, _draftOp: { $ne: "delete" } });
  async function adminEditItem(id, set) {
    const W = await cd.forWrite(Item, { _id: S(id) });
    const doc = cd.stripDraft(await W.findOneAndUpdate(writable(W, { _id: S(id) }), { $set: set }, { new: true, runValidators: true }).lean());
    const SW = await cd.forWrite(ShopItem, { itemId: S(id) });
    const r = await SW.updateMany({ itemId: S(id) }, { $set: itemCascadeSet(doc) });
    return { W, SW, doc, cascaded: r.matchedCount };
  }

  // ═════════════ 1) 초안 모드 forWrite ═════════════
  console.log("\n1) 초안 모드 forWrite — 고친 것은 draft_* 에만, 실사이트 컬렉션은 그대로");
  setEnv(DRAFT_ENV);
  const live0 = await liveSnap();
  await test("초안 모드 판별(CATALOG_DRAFT=1 · localhost · VERCEL 없음)", () => {
    eq(cd.isDraftMode(), true, "isDraftMode");
    eq(cd.catalogWriteBlocked(), false, "catalogWriteBlocked");
  });
  await test("아이템 수정(관리 저장 흐름) — 초안 모델 · 연결 상품 S1 도 초안으로 연쇄", async () => {
    const r = await adminEditItem(ID.I1, { name: "보호막2" });
    ok(r.W !== Item, "forWrite(Item) 가 실사이트 모델을 돌려줌");
    eq(r.W.collection.collectionName, "draft_items", "아이템 쓸 컬렉션");
    eq(r.SW.collection.collectionName, "draft_shopitems", "상품 쓸 컬렉션");
    eq(r.doc?.name, "보호막2", "저장 결과 이름");
    ok(!hasMeta(r.doc), "stripDraft 뒤에도 초안 칸이 남음");
    eq(r.cascaded, 1, "연쇄된 상품 초안 수");
  });
  await test("상품 수정(가격 + 재고 폭 +5, stockBase 10 → 15) — writeDraftStock 후 findByIdAndUpdate", async () => {
    const W = await cd.forWrite(ShopItem, { _id: S(ID.S1) });
    eq(W.collection.collectionName, "draft_shopitems", "쓸 컬렉션");
    eq(await cd.writeDraftStock(S(ID.S1), { delta: 15 - 10 }), true, "writeDraftStock 결과");
    const doc = await W.findByIdAndUpdate(S(ID.S1), { price: 1500 }, { new: true });
    eq(doc?.price, 1500, "저장 결과 가격");
  });
  await test("배너 수정 — B1 제목 · B2 부제 칸 빼기($unset)", async () => {
    const d1 = await (await cd.forWrite(ShopBanner, { _id: S(ID.B1) })).findByIdAndUpdate(S(ID.B1), { title: "새 배너 제목" }, { new: true });
    eq(d1?.title, "새 배너 제목", "B1 저장 결과");
    const d2 = await (await cd.forWrite(ShopBanner, { _id: S(ID.B2) })).findByIdAndUpdate(S(ID.B2), { $unset: { subtitle: 1 } }, { new: true }).lean();
    ok(!("subtitle" in d2), "B2 부제가 남음");
  });
  await test("끌어서 순서(PATCH order 흐름) — 아이템 I2 · 상품 S2 sortOrder 만", async () => {
    const W = await cd.forWrite(Item, { _id: { $in: [S(ID.I2)] } });
    await W.bulkWrite([{ updateOne: { filter: { _id: S(ID.I2) }, update: { $set: { sortOrder: 50 } } } }], { ordered: false });
    const WS = await cd.forWrite(ShopItem, { _id: { $in: [S(ID.S2)] } });
    await WS.bulkWrite([{ updateOne: { filter: { _id: S(ID.S2) }, update: { $set: { sortOrder: 9 } } } }], { ordered: false });
  });
  await test("그룹 이름 바꾸기 G1 → G3 (forWrite(Item, {group}) + updateMany) · 그룹 목록 설정 저장", async () => {
    const W = await cd.forWrite(Item, { group: "G1" });
    const r = await W.updateMany(writable(W, { group: "G1" }), { $set: { group: "G3" } });
    eq(r.matchedCount, 1, "바뀐 아이템 수");
    const WS = await cd.forWrite(Setting, { key: "itemGroups" });
    eq(WS.collection.collectionName, "draft_settings", "설정 쓸 컬렉션");
    await WS.updateOne({ key: "itemGroups" }, { $set: { value: [{ name: "G3" }, { name: "G2" }], updatedAt: new Date() } }, { upsert: true });
  });
  await test("초안 대상 아닌 설정 키 · 모델 · key 없는 설정 쓰기는 실사이트 모델 그대로", async () => {
    eq(await cd.forWrite(Setting, { key: "maintenance" }) === Setting, true, "maintenance");
    eq(await cd.forWrite(Setting, {}) === Setting, true, "key 없는 설정");
    eq(await cd.forWrite(Purchase, { _id: S(oid()) }) === Purchase, true, "Purchase");
  });
  await test("실사이트 items · shopitems · shopbanners · settings 는 한 글자도 안 바뀜", async () => {
    eqSnap(await liveSnap(), live0, "초안 쓰기 뒤");
  });
  await test("draft_* 에 고친 문서만 같은 _id 로 생김", async () => {
    const names = (await conn.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    for (const c of DRAFT_COLLS) ok(names.includes(c), `${c} 컬렉션이 없음`);
    eq(await idsIn("draft_items"), sorted([ID.I1, ID.I2, ID.I6]), "draft_items _id");
    eq(await idsIn("draft_shopitems"), sorted([ID.S1, ID.S2]), "draft_shopitems _id");
    eq(await idsIn("draft_shopbanners"), sorted([ID.B1, ID.B2]), "draft_shopbanners _id");
    eq(await idsIn("draft_settings"), sorted([GROUPS_ID]), "draft_settings _id(실사이트 itemGroups 와 같은 _id)");
  });
  await test("초안 내용 · _draftBase = 복사한 순간의 실사이트 문서", async () => {
    const dI1 = await rawOne("draft_items", ID.I1);
    eq([dI1.name, dI1._draftOp, dI1._draftBase?.name], ["보호막2", "", "보호막"], "I1 이름 · op · 기준 이름");
    ok(dI1._draftAt instanceof Date, "I1 _draftAt 없음");
    const { _id, ...liveI1 } = await rawOne("items", ID.I1);
    eq(dI1._draftBase, liveI1, "I1 _draftBase ≠ 실사이트 문서");
    const dS1 = await rawOne("draft_shopitems", ID.S1);
    eq([dS1.name, dS1.price, dS1.stock, dS1.soldCount], ["보호막2", 1500, 15, 3], "S1 이름 · 가격 · 재고 · 판매 수");
    eq([dS1._draftBase?.name, dS1._draftBase?.price, dS1._draftBase?.stock], ["보호막", 1000, 10], "S1 기준 이름 · 가격 · 재고");
    const dB1 = await rawOne("draft_shopbanners", ID.B1);
    eq([dB1.title, "placement" in dB1, "placement" in dB1._draftBase], ["새 배너 제목", false, false], "B1 제목 · placement 칸 없음 유지");
    const dB2 = await rawOne("draft_shopbanners", ID.B2);
    eq(["subtitle" in dB2, dB2._draftBase?.subtitle], [false, "부제"], "B2 부제 빠짐 · 기준 부제");
    eq((await rawOne("draft_items", ID.I2)).sortOrder, 50, "I2 순서");
    eq((await rawOne("draft_items", ID.I6)).group, "G3", "I6 그룹");
    eq((await rawOne("draft_shopitems", ID.S2)).sortOrder, 9, "S2 순서");
    const dG = await rawOne("draft_settings", { key: "itemGroups" });
    eq([dG.value, dG._draftBase?.value], [[{ name: "G3" }, { name: "G2" }], [{ name: "G1" }]], "itemGroups 값 · 기준 값");
  });
  await test("forWrite 를 다시 불러도(이미 초안) 초안을 실사이트 값으로 되돌리지 않음", async () => {
    await cd.forWrite(Item, { _id: S(ID.I1) });
    await cd.forWrite(ShopItem, { itemId: S(ID.I1) });
    eq((await rawOne("draft_items", ID.I1)).name, "보호막2", "I1 초안 이름");
    eq((await rawOne("draft_shopitems", ID.S1)).price, 1500, "S1 초안 가격");
  });

  // ═════════════ 2) 읽기 덧씌우기 ═════════════
  console.log("\n2) catalogFind · FindOne · FindById · Count — 초안 모드는 덧씌운 보기, 실사이트 모드는 실사이트 값만");
  const ORDER_SORT = { sortOrder: 1, createdAt: 1, _id: 1 };
  const SHOP_SORT = { sortOrder: 1, createdAt: -1 };
  await test("초안 모드 아이템 목록(관리 GET: ORDER_SORT · mark)", async () => {
    const rows = await cd.catalogFind(Item, {}, { sort: ORDER_SORT, mark: true });
    eq(rows.map((r) => r.name), ["보호막2", "지울 아이템", "쓰는 중 아이템", "패스 아이템", "세트 구성", "포션"], "이름 · 차례");
    eq(rows.map((r) => r._draft ?? null), ["edit", null, null, null, "edit", null], "_draft 표시(순서만 바뀐 I2 는 표시 없음)");
    ok(rows.every((r) => !hasMeta(r)), "초안 저장 칸이 응답에 남음");
    eq(rows.find((r) => S(r._id) === S(ID.I6)).group, "G3", "I6 그룹");
  });
  await test("실사이트 모드(VERCEL=1) 아이템 목록 — 실사이트 값만", async () => {
    const rows = await liveRead(() => cd.catalogFind(Item, {}, { sort: ORDER_SORT, mark: true }));
    eq(rows.map((r) => r.name), ["보호막", "포션", "지울 아이템", "쓰는 중 아이템", "패스 아이템", "세트 구성"], "이름 · 차례");
    ok(rows.every((r) => !("_draft" in r)), "실사이트 모드에 _draft 가 붙음");
  });
  await test("localhost 플래그 없음 — 실사이트 값만", async () => {
    const rows = await withEnv(LOCAL_ENV, () => cd.catalogFind(Item, {}, { sort: ORDER_SORT }));
    eq(rows.map((r) => r.name), ["보호막", "포션", "지울 아이템", "쓰는 중 아이템", "패스 아이템", "세트 구성"], "이름 · 차례");
  });
  await test("상품 목록(상점 GET 정렬 · mark) — 초안 · 실사이트", async () => {
    const d = await cd.catalogFind(ShopItem, {}, { sort: SHOP_SORT, mark: true });
    eq(d.map((r) => S(r._id)), [ID.S1, ID.S3, ID.S4, ID.S6, ID.S7, ID.S9, ID.S2].map(S), "초안 모드 차례(S2 순서 9 → 맨 뒤)");
    eq(d.map((r) => r._draft ?? null), ["edit", null, null, null, null, null, null], "초안 모드 표시");
    const l = await liveRead(() => cd.catalogFind(ShopItem, {}, { sort: SHOP_SORT, mark: true }));
    eq(l.map((r) => S(r._id)), [ID.S1, ID.S2, ID.S3, ID.S4, ID.S6, ID.S7, ID.S9].map(S), "실사이트 모드 차례");
    eq([l[0].name, l[0].price, l[0].stock], ["보호막", 1000, 10], "실사이트 모드 S1");
  });
  await test("catalogFindById(ShopItem S1) — 초안: 가격 1500 · 재고 15(폭) · 판매 수 실사이트 / 실사이트: 1000 · 10", async () => {
    const d = await cd.catalogFindById(ShopItem, S(ID.S1));
    eq([d.name, d.price, d.stock, d.soldCount], ["보호막2", 1500, 15, 3], "초안 모드");
    ok(!hasMeta(d), "초안 칸이 남음");
    const l = await liveRead(() => cd.catalogFindById(ShopItem, S(ID.S1)));
    eq([l.name, l.price, l.stock, l.soldCount], ["보호막", 1000, 10, 3], "실사이트 모드");
  });
  await test("select 투영 — 초안 · 실사이트 같은 칸만", async () => {
    const [d] = await cd.catalogFind(ShopItem, { _id: S(ID.S1) }, { select: { name: 1, stock: 1, soldCount: 1 } });
    eq(Object.keys(d).sort(), ["_id", "name", "soldCount", "stock"], "초안 모드 칸");
    eq([d.name, d.stock], ["보호막2", 15], "초안 모드 값");
    const [l] = await liveRead(() => cd.catalogFind(ShopItem, { _id: S(ID.S1) }, { select: { name: 1, stock: 1, soldCount: 1 } }));
    eq(Object.keys(l).sort(), ["_id", "name", "soldCount", "stock"], "실사이트 모드 칸");
    const names = await cd.catalogFind(Item, {}, { select: { name: 1 } });
    ok(names.every((r) => Object.keys(r).sort().join() === "_id,name"), "초안 모드 Item select name — 다른 칸이 섞임");
  });
  await test("catalogFindOne · FindById(Item) — 초안 이름 / 실사이트 이름 · 잘못된 id null", async () => {
    eq((await cd.catalogFindOne(Item, { _id: S(ID.I1) }))?.name, "보호막2", "초안 FindOne");
    eq((await cd.catalogFindById(Item, S(ID.I1)))?.name, "보호막2", "초안 FindById");
    eq((await liveRead(() => cd.catalogFindById(Item, S(ID.I1))))?.name, "보호막", "실사이트 FindById");
    eq(await cd.catalogFindById(Item, "zzz"), null, "잘못된 id");
    eq(await cd.catalogFindById(Item, S(oid())), null, "없는 id");
    eq((await cd.catalogFindOne(Item, {}, { sort: { sortOrder: -1 } }))?.name, "포션", "초안 FindOne 정렬(-sortOrder → I2 50)");
    eq((await liveRead(() => cd.catalogFindOne(Item, {}, { sort: { sortOrder: -1 } })))?.name, "세트 구성", "실사이트 FindOne 정렬");
  });
  await test("catalogCount — 초안에서 바꾼 칸으로 거르면 초안 기준", async () => {
    const dc = async (M, f) => [await cd.catalogCount(M, f), await liveRead(() => cd.catalogCount(M, f))];
    eq(await dc(Item, { name: "보호막" }), [0, 1], "name 보호막 [초안, 실사이트]");
    eq(await dc(Item, { name: "보호막2" }), [1, 0], "name 보호막2");
    eq(await dc(Item, { group: "G3" }), [1, 0], "group G3");
    eq(await dc(Item, { group: "G1" }), [0, 1], "group G1");
    eq(await dc(ShopItem, { itemId: S(ID.I1) }), [1, 1], "itemId I1");
    eq(await dc(Item, {}), [6, 6], "전체");
  });
  await test("설정 — itemGroups 는 초안 값, maintenance 는 늘 실사이트", async () => {
    const d = await cd.catalogFindOne(Setting, { key: "itemGroups" }, { select: { value: 1 } });
    eq(Object.keys(d).sort(), ["_id", "value"], "초안 select 칸");
    eq(d.value, [{ name: "G3" }, { name: "G2" }], "초안 itemGroups");
    eq((await liveRead(() => cd.catalogFindOne(Setting, { key: "itemGroups" }, { select: { value: 1 } })))?.value, [{ name: "G1" }], "실사이트 itemGroups");
    eq((await cd.catalogFindOne(Setting, { key: "maintenance" }, { select: { value: 1 } }))?.value, false, "초안 모드 maintenance");
    const all = await cd.catalogFind(Setting, {});
    eq(all.length, 2, "초안 모드 전체 설정 수(가린 실사이트 문서가 두 번 나오지 않음)");
    eq(all.find((r) => r.key === "itemGroups")?.value, [{ name: "G3" }, { name: "G2" }], "전체 목록의 itemGroups");
  });
  await test("배너 — placement 없는 옛 배너가 { $in: [home, null] } 에 초안에서도 걸림", async () => {
    const f = { placement: { $in: ["home", null] } };
    const d = await cd.catalogFind(ShopBanner, f, { sort: SHOP_SORT, mark: true });
    eq(d.map((r) => [S(r._id), r.title, r._draft ?? null]), [[S(ID.B1), "새 배너 제목", "edit"], [S(ID.B3), "지울 배너", null]], "초안 모드 홈 배너");
    const l = await liveRead(() => cd.catalogFind(ShopBanner, f, { sort: SHOP_SORT }));
    eq(l.map((r) => [S(r._id), r.title]), [[S(ID.B1), "옛 배너"], [S(ID.B3), "지울 배너"]], "실사이트 모드 홈 배너");
    const s = await cd.catalogFind(ShopBanner, { placement: "season" });
    eq(s.map((r) => [S(r._id), "subtitle" in r]), [[S(ID.B2), false]], "초안 모드 시즌 배너(B2 부제 빠짐)");
  });
  await test("재고 기준 옮기기(S7) — 복사 뒤 실사이트에서 2개 팔림 → 폼(+2) 저장 → 보이는 재고가 폼 값 · 그 뒤 판매도 반영", async () => {
    await cd.forWrite(ShopItem, { _id: S(ID.S7) });
    await coll("shopitems").updateOne({ _id: ID.S7 }, { $inc: { stock: -2, soldCount: 2 } }); // 실사이트 판매 5 → 3
    let v = await cd.catalogFindById(ShopItem, S(ID.S7));
    eq([v.stock, v.soldCount], [3, 2], "판매 뒤 보이는 재고(안 바꾼 초안 = 실사이트)");
    eq(await cd.writeDraftStock(S(ID.S7), { delta: 2 }), true, "writeDraftStock");
    const raw = await rawOne("draft_shopitems", ID.S7);
    eq([raw.stock, raw._draftBase?.stock], [5, 3], "초안 재고 · 기준 재고(지금 실사이트로 옮김)");
    v = await cd.catalogFindById(ShopItem, S(ID.S7));
    eq(v.stock, 5, "저장 직후 보이는 재고 = 폼 값");
    await coll("shopitems").updateOne({ _id: ID.S7 }, { $inc: { stock: -1, soldCount: 1 } }); // 실사이트 판매 3 → 2
    v = await cd.catalogFindById(ShopItem, S(ID.S7));
    eq([v.stock, v.soldCount], [4, 3], "그 뒤 1개 판매 → 보이는 재고 4");
  });
  await test("writeDraftStock — 무제한이면 폭 무시 · 초안 없으면 false · 잘못된 id false · 실사이트 모드는 NOT_DRAFT", async () => {
    eq(await cd.writeDraftStock(S(ID.S2), { delta: 3 }), true, "S2(무제한) 결과");
    eq((await rawOne("draft_shopitems", ID.S2)).stock, -1, "S2 초안 재고 그대로 -1");
    eq(await cd.writeDraftStock(S(ID.S3), { delta: 1 }), false, "초안 없는 S3");
    eq(await cd.writeDraftStock("bad", { delta: 1 }), false, "잘못된 id");
    eq(await coll("draft_shopitems").countDocuments({ _id: ID.S3 }), 0, "S3 초안이 생기면 안 됨");
    await rejectsWith(liveRead(() => cd.writeDraftStock(S(ID.S1), { delta: 1 })), "NOT_DRAFT", "실사이트 모드");
  });
  {
    // 참고(통과 · 실패에 넣지 않음) — select 에 정렬 칸이 없을 때 초안 모드 정렬
    const d = await cd.catalogFind(Item, {}, { select: { name: 1 }, sort: { sortOrder: 1 } });
    const want = ["보호막2", "지울 아이템", "쓰는 중 아이템", "패스 아이템", "세트 구성", "포션"];
    const got = d.map((r) => r.name);
    if (canonStr(got) !== canonStr(want)) {
      notes.push(`select 에 정렬 칸이 없으면 초안 모드 정렬이 달라짐 — catalogFind(Item, {}, { select: { name: 1 }, sort: { sortOrder: 1 } }) → ${got.join(" · ")} (기대 ${want.join(" · ")}). overlayMerge 가 투영한 뒤 sortDocs 로 정렬해서다. 지금 호출처는 모두 정렬 칸을 select 에 넣거나 select 가 없어 해당 없음`);
    }
  }

  // ═════════════ 3) 새로 만들기 · 순서 · 지우기 ═════════════
  console.log("\n3) catalogCreate · nextSortOrder · catalogDelete");
  const NEW = {};
  await test("nextSortOrder — 초안 모드는 초안까지(아이템 51 · 상품 10 · 배너 3), 실사이트 모드는 실사이트만(7 · 9 · 3), cap", async () => {
    eq([await cd.nextSortOrder(Item, 999), await cd.nextSortOrder(ShopItem), await cd.nextSortOrder(ShopBanner)], [51, 10, 3], "초안 모드");
    eq(await liveRead(async () => [await cd.nextSortOrder(Item, 999), await cd.nextSortOrder(ShopItem), await cd.nextSortOrder(ShopBanner)]), [7, 9, 3], "실사이트 모드");
    eq(await cd.nextSortOrder(Item, 20), 20, "cap 20");
  });
  await test("catalogCreate(Item) — 초안에만 · _draftBase null · 응답에 초안 칸 없음 · 다음 순서 52", async () => {
    const liveCount = await coll("items").countDocuments({});
    const doc = await cd.catalogCreate(Item, {
      name: "새 아이템", icon: "art:brandnew_key", type: "item",
      effects: [{ id: "n1", on: "cardSkin", mode: "add", skin: "hw_ghost" }, { id: "n2", on: "cardSkin", mode: "add", skin: "hw_newskin" }],
      sortOrder: await cd.nextSortOrder(Item, 999),
    });
    NEW.I = doc._id;
    ok(NEW.I, "_id 없음");
    ok(!hasMeta(doc), `응답에 초안 칸: ${Object.keys(doc).join(",")}`);
    eq(doc.sortOrder, 51, "순서");
    eq(await coll("items").countDocuments({}), liveCount, "실사이트 아이템 수");
    eq(await coll("items").countDocuments({ _id: NEW.I }), 0, "실사이트에 새 아이템");
    const raw = await rawOne("draft_items", NEW.I);
    eq([raw?.name, raw?._draftOp, raw?._draftBase], ["새 아이템", "", null], "초안 문서");
    eq(await cd.nextSortOrder(Item, 999), 52, "다음 순서");
  });
  await test("catalogCreate(ShopItem · ShopBanner) — 초안에만, 순서는 합친 목록 맨 뒤", async () => {
    const s = await cd.catalogCreate(ShopItem, { name: "새 상품", itemId: S(NEW.I), type: "item", price: 2000, stock: 4, imageUrl: "http://insecure.example/new.png", sortOrder: await cd.nextSortOrder(ShopItem) });
    NEW.S = s._id;
    const bad = await cd.catalogCreate(ShopItem, { name: "고아 상품", itemId: S(oid()), type: "item", price: 1, sortOrder: await cd.nextSortOrder(ShopItem) });
    NEW.Sbad = bad._id;
    const b = await cd.catalogCreate(ShopBanner, { imageUrl: "https://img.example/new.png", title: "새 배너", placement: "season", sortOrder: await cd.nextSortOrder(ShopBanner) });
    NEW.B = b._id;
    eq([s.sortOrder, bad.sortOrder, b.sortOrder], [10, 11, 3], "순서");
    ok(![s, bad, b].some(hasMeta), "응답에 초안 칸");
    eq(await coll("shopitems").countDocuments({ _id: { $in: [NEW.S, NEW.Sbad] } }), 0, "실사이트 상품에 들어감");
    eq(await coll("shopbanners").countDocuments({ _id: NEW.B }), 0, "실사이트 배너에 들어감");
    eq(await coll("draft_shopitems").countDocuments({ _id: { $in: [NEW.S, NEW.Sbad] }, _draftBase: null }), 2, "상품 초안 2개(_draftBase null)");
  });
  await test("새 초안은 초안 모드 목록에만(_draft new) · 실사이트 모드엔 없음", async () => {
    const d = await cd.catalogFind(Item, {}, { sort: ORDER_SORT, mark: true });
    eq(d.find((r) => S(r._id) === S(NEW.I))?._draft, "new", "초안 모드 표시");
    eq(d.at(-1)?.name, "새 아이템", "맨 뒤");
    eq(await liveRead(() => cd.catalogFindById(Item, S(NEW.I))), null, "실사이트 모드 FindById");
    eq((await liveRead(() => cd.catalogFind(ShopItem, {}))).length, 7, "실사이트 모드 상품 수");
    eq((await cd.catalogFind(ShopItem, {})).length, 9, "초안 모드 상품 수");
  });
  await test("catalogCreate(Setting) — 초안 대상 아닌 키는 실사이트에 바로", async () => {
    await cd.catalogCreate(Setting, { key: "testKey", value: 1 });
    eq(await coll("settings").countDocuments({ key: "testKey" }), 1, "실사이트 settings");
    eq(await coll("draft_settings").countDocuments({ key: "testKey" }), 0, "draft_settings");
  });
  const live3 = await liveSnap();
  await test("catalogDelete(ShopItem 구매 이력 있음 S3 · 없음 S4) — 실사이트는 그대로, 초안이 삭제 예정", async () => {
    const r3 = await cd.catalogDelete(ShopItem, S(ID.S3));
    eq(r3?.name, "구매된 상품", "S3 반환");
    await cd.catalogDelete(ShopItem, S(ID.S4));
    eq(await coll("shopitems").countDocuments({ _id: { $in: [ID.S3, ID.S4] } }), 2, "실사이트 S3 · S4 남아 있음");
    const d3 = await rawOne("draft_shopitems", ID.S3);
    eq([d3?._draftOp, d3?._draftBase?.name], ["delete", "구매된 상품"], "S3 초안 op · 기준");
    eq(await cd.catalogFindById(ShopItem, S(ID.S3)), null, "초안 모드 FindById(S3) 숨김");
    eq((await liveRead(() => cd.catalogFindById(ShopItem, S(ID.S3))))?.name, "구매된 상품", "실사이트 모드 FindById(S3)");
    eq([await cd.catalogCount(ShopItem, { _id: S(ID.S3) }), await liveRead(() => cd.catalogCount(ShopItem, { _id: S(ID.S3) }))], [0, 1], "Count [초안, 실사이트]");
  });
  await test("아이템 삭제 409 판정은 합친 보기 — S4 삭제 예정이면 I3 를 쓰는 상품 0", async () => {
    const f = { $or: [{ itemId: S(ID.I3) }, { "bundle.itemId": S(ID.I3) }] };
    eq([await cd.catalogCount(ShopItem, f), await liveRead(() => cd.catalogCount(ShopItem, f))], [0, 1], "[초안, 실사이트]");
  });
  await test("catalogDelete(Item I3 · I4 · I5 · Banner B3) — 삭제 예정 초안", async () => {
    for (const id of [ID.I3, ID.I4, ID.I5]) ok(await cd.catalogDelete(Item, S(id)), `Item ${id} 반환 없음`);
    ok(await cd.catalogDelete(ShopBanner, S(ID.B3)), "B3 반환 없음");
    eq(await coll("draft_items").countDocuments({ _id: { $in: [ID.I3, ID.I4, ID.I5] }, _draftOp: "delete" }), 3, "아이템 삭제 예정 수");
    eq(await coll("draft_shopbanners").countDocuments({ _id: ID.B3, _draftOp: "delete" }), 1, "배너 삭제 예정");
    eq((await cd.catalogFind(Item, {})).some((r) => [ID.I3, ID.I4, ID.I5].map(S).includes(S(r._id))), false, "초안 모드 목록에 삭제 예정 아이템");
  });
  await test("catalogDelete — 새 초안은 통째로 지움 · 잘못된 · 없는 id null · 두 번 지워도 하나", async () => {
    const t = await cd.catalogCreate(ShopBanner, { imageUrl: "https://img.example/tmp.png", title: "임시" });
    const r = await cd.catalogDelete(ShopBanner, S(t._id));
    ok(r && !hasMeta(r), "새 초안 지우기 반환에 초안 칸");
    eq(await coll("draft_shopbanners").countDocuments({ _id: t._id }), 0, "새 초안이 남음");
    eq(await coll("shopbanners").countDocuments({ _id: t._id }), 0, "실사이트에 생김");
    eq(await cd.catalogDelete(Item, "bad"), null, "잘못된 id");
    eq(await cd.catalogDelete(Item, S(oid())), null, "없는 id");
    const again = await cd.catalogDelete(ShopItem, S(ID.S3));
    ok(again && !hasMeta(again), "두 번째 지우기 반환에 초안 칸");
    eq(await coll("draft_shopitems").countDocuments({ _id: ID.S3, _draftOp: "delete" }), 1, "S3 초안 수");
  });
  await test("초안 모드 지우기 동안 실사이트 컬렉션은 그대로", async () => {
    eqSnap(await liveSnap(), live3, "지우기 뒤");
  });
  await test("참고 대조 — localhost 플래그 없음(실사이트 모드)의 catalogDelete 는 구매 이력이 있어도 바로 지움(코드 주석 그대로)", async () => {
    const tmpId = oid();
    await coll("shopitems").insertOne(plain(ShopItem, { _id: tmpId, name: "임시 구매 상품", type: "item", price: 1 }));
    await coll(Purchase.collection.collectionName).insertOne(plain(Purchase, { userId: "u2", itemId: S(tmpId), status: "completed" }));
    await withEnv(LOCAL_ENV, () => cd.catalogDelete(ShopItem, S(tmpId)));
    eq(await coll("shopitems").countDocuments({ _id: tmpId }), 0, "실사이트 모드 삭제");
    await coll(Purchase.collection.collectionName).deleteMany({ itemId: S(tmpId) });
  });
  // 그 사이 실사이트에서 생긴 것 — 삭제 예정 I4 를 쓰는 상품 S5, I5 를 보상으로 쓰는 시즌 패스
  guard();
  await coll("shopitems").insertOne(plain(ShopItem, { _id: ID.S5, ...itemCascadeSet(items[3]), itemId: S(ID.I4), price: 100, sortOrder: 5, createdAt: at(15) }));
  await coll(SeasonPass.collection.collectionName).insertOne(plain(SeasonPass, { key: "main", tiers: [{ tid: "t1", level: 1, need: 0, free: [{ kind: "item", itemId: S(ID.I5) }], paid: [] }] }));

  // ═════════════ 4) 요약 · 결제 막기 ═════════════
  console.log("\n4) draftSummary · draftBlockedProducts");
  await test("draftSummary counts · total · rows", async () => {
    const s = await cd.draftSummary();
    eq(s.counts, {
      item: { add: 1, edit: 2, order: 1, del: 3 },
      shopItem: { add: 2, edit: 2, order: 1, del: 2 },
      banner: { add: 1, edit: 2, order: 0, del: 1 },
      setting: { edit: 1 },
    }, "counts");
    eq(s.total, 19, "total");
    eq(s.rows.length, 19, "rows 수");
    const row = (id) => s.rows.find((r) => r.id === S(id));
    eq([row(ID.I1)?.op, row(ID.I2)?.op, row(ID.I6)?.op, row(NEW.I)?.op, row(ID.I3)?.op], ["edit", "order", "edit", "add", "del"], "아이템 op");
    eq([row(ID.S1)?.op, row(ID.S2)?.op, row(ID.S7)?.op, row(NEW.S)?.op, row(ID.S3)?.op], ["edit", "order", "edit", "add", "del"], "상품 op");
    eq([row(ID.S3)?.name, row(NEW.Sbad)?.name, row(ID.B1)?.name, row(GROUPS_ID)?.name], ["구매된 상품", "고아 상품", "새 배너 제목", "그룹 순서"], "이름");
    eq(s.rows.map((r) => r.kind).filter((k, i, a) => a.indexOf(k) === i), ["item", "shopItem", "banner", "setting"], "종류 차례");
  });
  await test("draftSummary warnings — 처음 쓰는 아이콘 · 스킨, https 아닌 이미지(실사이트가 쓰는 art:shield · hw_ghost 는 경고 없음)", async () => {
    const s = await cd.draftSummary();
    const got = s.warnings.map((w) => `${w.kind}|${w.id}|${w.why}`).sort();
    const want = [
      `item|${S(NEW.I)}|처음 쓰는 아이콘 · art:brandnew_key`,
      `item|${S(NEW.I)}|처음 쓰는 스킨 · hw_newskin`,
      `shopItem|${S(NEW.S)}|https 아닌 이미지 주소`,
    ].sort();
    eq(got, want, "warnings");
  });
  await test("draftSummary — 실사이트 모드는 빈 요약", async () => {
    const s = await liveRead(() => cd.draftSummary());
    eq([s.total, s.rows.length, s.warnings.length], [0, 0, 0], "total · rows · warnings");
  });
  await test("draftBlockedProducts — 바뀐 상품 · 바뀐 연결/세트 아이템 · 새 · 삭제 예정은 막고, 순서 · 그룹만이면 통과", async () => {
    const b = (ids) => cd.draftBlockedProducts(ids.map(S));
    eq(await b([ID.S1]), true, "S1(가격 수정)");
    eq(await b([ID.S2]), false, "S2(순서만)");
    eq(await b([ID.S6]), false, "S6(세트 — 구성 I6 그룹만 · I2 순서만)");
    eq(await b([ID.S9]), true, "S9(세트 — 구성 I1 이름 수정)");
    eq(await b([NEW.S]), true, "새 상품");
    eq(await b([ID.S3]), true, "S3(삭제 예정)");
    eq(await b([ID.S5]), true, "S5(연결 아이템 I4 삭제 예정)");
    eq(await b([ID.S7]), true, "S7(재고 수정)");
    eq(await b([ID.S2, ID.S1]), true, "S2 + S1");
    eq(await cd.draftBlockedProducts([]), false, "빈 목록");
    eq(await cd.draftBlockedProducts(["bad", null]), false, "잘못된 id");
    eq(await b([oid()]), false, "없는 id");
    eq(await liveRead(() => b([ID.S1])), false, "실사이트 모드 S1");
  });

  // ═════════════ 5) 반영 ═════════════
  console.log("\n5) publishAll — 실사이트 반영 · 초안 비움 · 카운터 지킴 · 멱등");
  // 그 사이 실사이트에서 바뀐 것
  guard();
  await coll("shopitems").updateOne({ _id: ID.S1 }, { $inc: { stock: -2, soldCount: 2 } });                 // S1 2개 판매: 재고 10 → 8, 판매 3 → 5
  await coll("items").updateOne({ _id: ID.I1 }, { $set: { description: "라이브 설명" } });                   // 초안이 안 건드린 칸
  await coll("items").updateOne({ _id: ID.I2 }, { $set: { name: "포션(라이브)" } });                         // 초안은 순서만
  await coll("shopbanners").updateOne({ _id: ID.B1 }, { $set: { subtitle: "라이브 부제" } });                // 초안은 제목만
  await coll("shopitems").insertOne(plain(ShopItem, { _id: ID.S8, ...itemCascadeSet(items[0]), itemId: S(ID.I1), price: 50, sortOrder: 20, createdAt: at(18) })); // 실사이트에서 새로 만든 I1 연결 상품
  await test("반영 전 보기 — S1 재고 8+5=13 · 판매 수 5(실사이트)", async () => {
    const v = await cd.catalogFindById(ShopItem, S(ID.S1));
    eq([v.stock, v.soldCount], [13, 5], "S1 재고 · 판매 수");
  });
  const preDraft = {
    S1: await rawOne("draft_shopitems", ID.S1),
    Snew: await rawOne("draft_shopitems", NEW.S),
    Inew: await rawOne("draft_items", NEW.I),
  };
  let res1 = null;
  await test("publishAll 결과 — applied 16 · skipped 3(고아 상품 · I4 · I5) · hidden [S3]", async () => {
    res1 = await cd.publishAll();
    eq(res1.applied, 16, "applied");
    eq(res1.skipped.map((x) => `${x.kind}|${x.id}|${x.why}`).sort(), [
      `item|${S(ID.I4)}|상품 · 패스가 쓰는 중`,
      `item|${S(ID.I5)}|상품 · 패스가 쓰는 중`,
      `shopItem|${S(NEW.Sbad)}|연결 아이템이 실사이트에 없음`,
    ].sort(), "skipped");
    eq(res1.hidden.map((x) => `${x.kind}|${x.id}`), [`shopItem|${S(ID.S3)}`], "hidden");
  });
  await test("초안 비워짐 — 건너뛴 것만 남음", async () => {
    eq(await idsIn("draft_items"), sorted([ID.I4, ID.I5]), "draft_items");
    eq(await idsIn("draft_shopitems"), sorted([NEW.Sbad]), "draft_shopitems");
    eq(await draftCounts().then((c) => [c.draft_shopbanners, c.draft_settings]), [0, 0], "draft_shopbanners · draft_settings");
  });
  await test("아이템 반영 — 바뀐 칸만(I1 이름 · I2 순서 · I6 그룹), 그 사이 실사이트 변경(I1 설명 · I2 이름) 유지, 새 아이템 같은 _id", async () => {
    const i1 = await rawOne("items", ID.I1);
    eq([i1.name, i1.description], ["보호막2", "라이브 설명"], "I1");
    const i2 = await rawOne("items", ID.I2);
    eq([i2.name, i2.sortOrder], ["포션(라이브)", 50], "I2");
    eq((await rawOne("items", ID.I6)).group, "G3", "I6 그룹");
    const n = await rawOne("items", NEW.I);
    eq([n?.name, n?.sortOrder, n?.icon, n?.effects?.length], ["새 아이템", 51, "art:brandnew_key", 2], "새 아이템");
    eq(await coll("items").countDocuments({ _id: ID.I3 }), 0, "I3 지워짐(S4 가 먼저 지워짐)");
    eq(await coll("items").countDocuments({ _id: { $in: [ID.I4, ID.I5] } }), 2, "I4 · I5 남음");
  });
  await test("상품 반영 — S1 가격 · 재고 폭(8+5=13) · 판매 수 5 유지, 연결 표기는 실사이트 I1 값", async () => {
    const s1 = await rawOne("shopitems", ID.S1);
    eq([s1.price, s1.stock, s1.soldCount, s1.name, s1.description], [1500, 13, 5, "보호막2", "라이브 설명"], "S1");
  });
  await test("상품 반영 — S7 재고 2+(5−3)=4 · 판매 수 3, S2 순서 9 · 무제한 유지", async () => {
    const s7 = await rawOne("shopitems", ID.S7);
    eq([s7.stock, s7.soldCount], [4, 3], "S7");
    const s2 = await rawOne("shopitems", ID.S2);
    eq([s2.sortOrder, s2.stock], [9, -1], "S2");
  });
  await test("새 상품 — 같은 _id · 재고 4 · 판매 수 0 · 표기는 새 아이템 스냅샷", async () => {
    const n = await rawOne("shopitems", NEW.S);
    eq([n?.price, n?.stock, n?.soldCount, n?.sortOrder, n?.name, n?.icon, n?.itemId], [2000, 4, 0, 10, "새 아이템", "art:brandnew_key", S(NEW.I)], "새 상품");
    eq(await coll("shopitems").countDocuments({ _id: NEW.Sbad }), 0, "고아 상품이 실사이트에 들어감");
  });
  await test("연결 상품 표기 — 그 사이 실사이트에서 만든 S8 도 I1 새 이름", async () => {
    const s8 = await rawOne("shopitems", ID.S8);
    eq([s8.name, s8.description, s8.price], ["보호막2", "라이브 설명", 50], "S8");
  });
  await test("삭제 — 구매 이력 S3 는 숨김(active:false, 문서 남음) · S4 지움 · 설계 4번", async () => {
    const s3 = await rawOne("shopitems", ID.S3);
    eq([!!s3, s3?.active, s3?.name, s3?.price], [true, false, "구매된 상품", 300], "S3");
    eq(await coll("shopitems").countDocuments({ _id: ID.S4 }), 0, "S4");
  });
  await test("배너 반영 — B1 제목만(placement 칸 없음 유지 · 실사이트 부제 유지) · B2 부제 $unset · B3 지움 · 새 배너 같은 _id", async () => {
    const x1 = await rawOne("shopbanners", ID.B1);
    eq([x1.title, x1.subtitle, "placement" in x1], ["새 배너 제목", "라이브 부제", false], "B1");
    const x2 = await rawOne("shopbanners", ID.B2);
    eq(["subtitle" in x2, x2.title, x2.placement], [false, "시즌 배너", "season"], "B2");
    eq(await coll("shopbanners").countDocuments({ _id: ID.B3 }), 0, "B3");
    const nb = await rawOne("shopbanners", NEW.B);
    eq([nb?.title, nb?.placement, nb?.sortOrder], ["새 배너", "season", 3], "새 배너");
  });
  await test("설정 반영 — itemGroups 값(같은 _id) · maintenance 그대로", async () => {
    const g = await coll("settings").find({ key: "itemGroups" }).toArray();
    eq([g.length, S(g[0]?._id), g[0]?.value], [1, S(GROUPS_ID), [{ name: "G3" }, { name: "G2" }]], "itemGroups");
    eq((await rawOne("settings", { key: "maintenance" }))?.value, false, "maintenance");
  });
  await test("실사이트 문서에 초안 칸(_draftOp · _draftBase · _draftAt)이 하나도 없음 · 자물쇠 풀림", async () => {
    for (const c of LIVE_COLLS) {
      const n = await coll(c).countDocuments({ $or: META.map((k) => ({ [k]: { $exists: true } })) });
      eq(n, 0, `${c} 초안 칸 문서 수`);
    }
    eq(await coll(ShopLock.collection.collectionName).countDocuments({ _id: "admin:catalog-publish" }), 0, "자물쇠");
  });
  const liveAfter1 = await liveSnap();
  await test("다시 publishAll — applied 0 · 같은 skipped · 실사이트 그대로(멱등)", async () => {
    const r = await cd.publishAll();
    eq([r.applied, r.hidden.length], [0, 0], "applied · hidden");
    eq(r.skipped.map((x) => x.id).sort(), res1 ? res1.skipped.map((x) => x.id).sort() : [], "skipped");
    eqSnap(await liveSnap(), liveAfter1, "두 번째 반영 뒤");
  });
  await test("끊긴 반영 흉내 ① — S1 실사이트 쓰기 뒤 초안을 못 지움(기준 재고는 이미 15) → 다시 반영해도 재고 폭을 또 더하지 않음", async () => {
    guard();
    await coll("draft_shopitems").insertOne({ ...preDraft.S1, _draftBase: { ...preDraft.S1._draftBase, stock: preDraft.S1.stock } });
    const r = await cd.publishAll();
    eq(r.applied, 1, "applied");
    eqSnap(await liveSnap(), liveAfter1, "다시 반영 뒤");
    eq((await rawOne("shopitems", ID.S1)).stock, 13, "S1 재고");
  });
  await test("끊긴 반영 흉내 ② — 새 아이템 · 새 상품이 실사이트에 이미 있음 + 초안 수정 → 초안 값으로 맞추되 재고 · 판매 수는 처음 넣을 때만", async () => {
    guard();
    await coll("shopitems").updateOne({ _id: NEW.S }, { $inc: { stock: -1, soldCount: 1 } }); // 실사이트 판매 4 → 3
    await coll("draft_items").insertOne({ ...preDraft.Inew, name: "새 아이템(재)" });
    await coll("draft_shopitems").insertOne({ ...preDraft.Snew, price: 2500, stock: 99 });
    const r = await cd.publishAll();
    eq(r.applied, 2, "applied");
    eq((await rawOne("items", NEW.I))?.name, "새 아이템(재)", "새 아이템 이름");
    const n = await rawOne("shopitems", NEW.S);
    eq([n.price, n.stock, n.soldCount, n.name], [2500, 3, 1, "새 아이템(재)"], "새 상품");
    eq(await coll("draft_items").countDocuments({ _id: NEW.I }) + await coll("draft_shopitems").countDocuments({ _id: NEW.S }), 0, "초안 남음");
  });
  await test("반영 · 버리기 · 되돌리기 자물쇠 — 잡혀 있으면 PUBLISH_BUSY, 30초 지난 자물쇠는 가져감", async () => {
    guard();
    await coll(ShopLock.collection.collectionName).insertOne({ _id: "admin:catalog-publish", token: "other", at: new Date() });
    await rejectsWith(cd.publishAll(), cd.PUBLISH_BUSY, "publishAll");
    await rejectsWith(cd.discardAll(), cd.PUBLISH_BUSY, "discardAll");
    await rejectsWith(cd.discardOne("item", S(ID.I4)), cd.PUBLISH_BUSY, "discardOne");
    eq(await coll("draft_items").countDocuments({}), 2, "잡혀 있을 때 초안이 지워짐");
    await coll(ShopLock.collection.collectionName).updateOne({ _id: "admin:catalog-publish" }, { $set: { at: new Date(Date.now() - 60_000) } });
    const r = await cd.publishAll();
    eq(r.applied, 0, "오래된 자물쇠 뒤 반영");
    eq(await coll(ShopLock.collection.collectionName).countDocuments({ _id: "admin:catalog-publish" }), 0, "자물쇠 풀림");
  });

  // ═════════════ 6) 되돌리기 · 버리기 ═════════════
  console.log("\n6) discardOne · discardAll");
  const live6 = await liveSnap();
  await test("아이템 I1 수정(연결 상품 S1 · S8 초안 연쇄) → discardOne(item) 이 상품 초안 표기를 실사이트 I1 값으로 되돌림", async () => {
    const r = await adminEditItem(ID.I1, { name: "보호막3" });
    eq(r.cascaded, 2, "연쇄 상품 초안 수");
    eq((await cd.catalogFindById(ShopItem, S(ID.S8)))?.name, "보호막3", "초안 보기 S8");
    eq(await cd.draftBlockedProducts([S(ID.S8)]), true, "되돌리기 전 S8 결제 막힘");
    eq(await cd.discardOne("item", S(ID.I1)), { removed: 1 }, "discardOne 결과");
    eq(await coll("draft_items").countDocuments({ _id: ID.I1 }), 0, "I1 초안 남음");
    eq([(await rawOne("draft_shopitems", ID.S1))?.name, (await rawOne("draft_shopitems", ID.S8))?.name], ["보호막2", "보호막2"], "상품 초안 표기");
    eq(await cd.draftBlockedProducts([S(ID.S1), S(ID.S8)]), false, "되돌린 뒤 결제 막힘");
    const s = await cd.draftSummary();
    eq(s.rows.map((x) => x.id).sort(), sorted([ID.I4, ID.I5, NEW.Sbad]), "요약에 남은 줄(바뀐 칸 없는 S1 · S8 은 안 셈)");
  });
  await test("discardOne(banner · setting · shopItem 새 초안) · 잘못된 종류 · id 는 0", async () => {
    await (await cd.forWrite(ShopBanner, { _id: S(ID.B1) })).findByIdAndUpdate(S(ID.B1), { title: "임시 제목" }, { new: true });
    eq((await cd.catalogFindById(ShopBanner, S(ID.B1)))?.title, "임시 제목", "되돌리기 전 보기");
    eq(await cd.discardOne("banner", S(ID.B1)), { removed: 1 }, "banner");
    eq((await cd.catalogFindById(ShopBanner, S(ID.B1)))?.title, "새 배너 제목", "되돌린 뒤 보기 = 실사이트");
    const W = await cd.forWrite(Setting, { key: "itemGroups" });
    await W.updateOne({ key: "itemGroups" }, { $set: { value: [{ name: "X" }], updatedAt: new Date() } }, { upsert: true });
    eq((await cd.catalogFindOne(Setting, { key: "itemGroups" }))?.value, [{ name: "X" }], "설정 되돌리기 전 보기");
    eq(await cd.discardOne("setting", S(GROUPS_ID)), { removed: 1 }, "setting");
    eq((await cd.catalogFindOne(Setting, { key: "itemGroups" }))?.value, [{ name: "G3" }, { name: "G2" }], "설정 되돌린 뒤 보기");
    eq(await cd.discardOne("shopItem", S(NEW.Sbad)), { removed: 1 }, "shopItem 새 초안");
    eq(await cd.discardOne("item", "bad"), { removed: 0 }, "잘못된 id");
    eq(await cd.discardOne("nope", S(ID.I4)), { removed: 0 }, "잘못된 종류");
    eq(await cd.discardOne("item", S(oid())), { removed: 0 }, "없는 id");
    await rejectsWith(liveRead(() => cd.discardOne("item", S(ID.I4))), "NOT_DRAFT", "실사이트 모드");
  });
  await test("discardAll — 남은 초안(I4 · I5 · S1 · S8) 모두 지움 · 실사이트 그대로 · 초안 모드 보기 = 실사이트", async () => {
    const r = await cd.discardAll();
    eq(r, { removed: 4 }, "removed");
    eq(Object.values(await draftCounts()), [0, 0, 0, 0], "draft_* 문서 수");
    eqSnap(await liveSnap(), live6, "버리기 뒤");
    eq((await cd.draftSummary()).total, 0, "요약 total");
    const d = await cd.catalogFind(Item, {}, { sort: ORDER_SORT });
    const l = await liveRead(() => cd.catalogFind(Item, {}, { sort: ORDER_SORT }));
    eq(canonStr(d), canonStr(l), "초안 모드 아이템 보기 ≠ 실사이트");
    await rejectsWith(liveRead(() => cd.discardAll()), "NOT_DRAFT", "실사이트 모드");
  });
  await test("추가 — itemGroups 초안이 실사이트 문서보다 먼저 생긴 경우(_id 다름): key 로 맞춰 보이고 반영도 key 로", async () => {
    guard();
    await coll("settings").deleteOne({ key: "itemGroups" });
    const W = await cd.forWrite(Setting, { key: "itemGroups" });
    await W.updateOne({ key: "itemGroups" }, { $set: { value: [{ name: "N1" }], updatedAt: new Date() } }, { upsert: true });
    const d0 = await rawOne("draft_settings", { key: "itemGroups" });
    eq([d0?._draftBase ?? null, d0?._draftOp ?? ""], [null, ""], "새 설정 초안(upsert 기본값)");
    const liveId = oid();
    await coll("settings").insertOne({ _id: liveId, key: "itemGroups", value: [{ name: "L1" }], updatedAt: new Date() }); // 실사이트에서 생김
    await cd.forWrite(Setting, { key: "itemGroups" }); // 같은 key 복사 시도 — unique 충돌은 삼켜야 한다
    eq(await coll("draft_settings").countDocuments({ key: "itemGroups" }), 1, "설정 초안 수");
    eq((await cd.catalogFindOne(Setting, { key: "itemGroups" }, { select: { value: 1 } }))?.value, [{ name: "N1" }], "초안 모드 보기");
    eq((await cd.catalogFind(Setting, {})).filter((r) => r.key === "itemGroups").length, 1, "전체 목록 itemGroups 수");
    eq((await cd.draftSummary()).counts.setting.edit, 1, "요약 설정 edit");
    const r = await cd.publishAll();
    eq(r.applied, 1, "applied");
    const g = await coll("settings").find({ key: "itemGroups" }).toArray();
    eq([g.length, S(g[0]?._id), g[0]?.value], [1, S(liveId), [{ name: "N1" }]], "실사이트 itemGroups");
    eq(await coll("draft_settings").countDocuments({}), 0, "설정 초안 남음");
  });

  // ═════════════ 7) 모드 ═════════════
  console.log("\n7) 실사이트 모드 — catalogWriteBlocked");
  await test("VERCEL=1 · 플래그 없음 → catalogWriteBlocked true · isDraftMode false", () => withEnv(LIVE_ENV, () => {
    eq([cd.catalogWriteBlocked(), cd.isDraftMode()], [true, false], "[blocked, draft]");
  }));
  await test("VERCEL=1 + CATALOG_DRAFT=1 + localhost → 여전히 blocked true · 초안 모드 아님", () => withEnv({ ...DRAFT_ENV, VERCEL: "1" }, () => {
    eq([cd.catalogWriteBlocked(), cd.isDraftMode()], [true, false], "[blocked, draft]");
  }));
  await test("localhost 플래그 없음 → blocked false · 초안 모드 false / 초안 모드 → blocked false", async () => {
    await withEnv(LOCAL_ENV, () => eq([cd.catalogWriteBlocked(), cd.isDraftMode()], [false, false], "localhost"));
    await withEnv(DRAFT_ENV, () => eq([cd.catalogWriteBlocked(), cd.isDraftMode()], [false, true], "초안 모드"));
  });
  await test("실사이트 모드 — forWrite 는 실사이트 모델(초안 안 생김) · publishAll NOT_DRAFT · liveLockedResponse 403", async () => {
    await withEnv(LIVE_ENV, async () => {
      eq(await cd.forWrite(Item, { _id: S(ID.I1) }) === Item, true, "forWrite(Item)");
      eq(await cd.forWrite(Setting, { key: "itemGroups" }) === Setting, true, "forWrite(Setting itemGroups)");
      await rejectsWith(cd.publishAll(), "NOT_DRAFT", "publishAll");
      const r = cd.liveLockedResponse();
      eq([r.status, (await r.json()).code], [403, "LIVE_LOCKED"], "liveLockedResponse");
    });
    eq(Object.values(await draftCounts()), [0, 0, 0, 0], "draft_* 문서 수");
  });

  // ═════════════ 8) 추가 경계 ═════════════
  console.log("\n8) 추가 경계 — 그 사이 실사이트에서 지워짐 · 무제한 전환 · 0 아래 재고 · 연결 바꾸기 · 같은 칸 충돌 · 수정 뒤 삭제");
  setEnv(DRAFT_ENV);
  const X = Object.fromEntries(["I7", "I8", "I9", "S10", "S11", "S12", "S13", "S14", "S15", "S17", "B4"].map((k) => [k, oid()]));
  guard();
  await coll("items").insertMany([
    plain(Item, { _id: X.I7, name: "곧 지워질 아이템", type: "item", sortOrder: 70, createdAt: at(70) }),
    plain(Item, { _id: X.I8, name: "연결될 아이템", type: "item", sortOrder: 71, createdAt: at(71) }),
    plain(Item, { _id: X.I9, name: "충돌 아이템", type: "item", sortOrder: 72, createdAt: at(72) }),
  ]);
  const shop = (id, data) => plain(ShopItem, { _id: id, type: "item", price: 100, ...data });
  await coll("shopitems").insertMany([
    shop(X.S10, { name: "곧 지워질 상품", stock: 5, sortOrder: 80 }),
    shop(X.S11, { name: "무제한 될 상품", stock: 5, sortOrder: 81 }),
    shop(X.S12, { name: "무제한으로 바꿀 상품", stock: 5, sortOrder: 82 }),
    shop(X.S13, { name: "많이 줄일 상품", stock: 5, sortOrder: 83 }),
    shop(X.S14, { name: "없는 아이템 연결", stock: -1, sortOrder: 84 }),
    shop(X.S15, { name: "있는 아이템 연결", stock: -1, sortOrder: 85 }),
    shop(X.S17, { name: "수정 뒤 삭제", price: 300, stock: -1, sortOrder: 87 }),
  ]);
  await coll("shopbanners").insertOne(plain(ShopBanner, { _id: X.B4, imageUrl: "https://img.example/b4.png", title: "곧 지워질 배너", sortOrder: 9 }));
  await coll(Purchase.collection.collectionName).insertOne(plain(Purchase, { userId: "u3", itemId: S(X.S17), status: "completed" }));
  await test("초안 쓰기 — 수정 · 재고(+2 · 무제한 · −4) · 연결 바꾸기 · 배너 순서만 · 수정 뒤 삭제", async () => {
    await adminEditItem(X.I7, { name: "지워질 아이템 수정" });
    await adminEditItem(X.I9, { name: "초안 이름" });
    await (await cd.forWrite(ShopItem, { _id: S(X.S10) })).findByIdAndUpdate(S(X.S10), { price: 111 });
    await cd.forWrite(ShopItem, { _id: S(X.S11) });
    eq(await cd.writeDraftStock(S(X.S11), { delta: 2 }), true, "S11 재고 +2");
    await cd.forWrite(ShopItem, { _id: S(X.S12) });
    eq(await cd.writeDraftStock(S(X.S12), { value: -1 }), true, "S12 무제한");
    await cd.forWrite(ShopItem, { _id: S(X.S13) });
    eq(await cd.writeDraftStock(S(X.S13), { delta: -4 }), true, "S13 재고 −4");
    await (await cd.forWrite(ShopItem, { _id: S(X.S14) })).findByIdAndUpdate(S(X.S14), { itemId: S(oid()) });
    await (await cd.forWrite(ShopItem, { _id: S(X.S15) })).findByIdAndUpdate(S(X.S15), { itemId: S(ID.I2) });
    await (await cd.forWrite(ShopItem, { _id: S(X.S17) })).findByIdAndUpdate(S(X.S17), { price: 999 });
    await cd.catalogDelete(ShopItem, S(X.S17));
    await (await cd.forWrite(ShopBanner, { _id: S(X.B4) })).findByIdAndUpdate(S(X.B4), { title: "배너 수정" });
    const WB = await cd.forWrite(ShopBanner, { _id: { $in: [S(ID.B1)] } });
    await WB.bulkWrite([{ updateOne: { filter: { _id: S(ID.B1) }, update: { $set: { sortOrder: 5 } } } }], { ordered: false });
    eq((await rawOne("draft_shopitems", X.S17))?._draftOp, "delete", "S17 수정 뒤 삭제 예정");
    eq((await rawOne("draft_shopitems", X.S11))?.stock, 7, "S11 초안 재고");
    eq((await rawOne("draft_shopitems", X.S13))?.stock, 1, "S13 초안 재고");
  });
  await test("초안 상품이 쓰는 아이템은 삭제 409 판정에 들어감(합친 보기)", async () => {
    const s16 = await cd.catalogCreate(ShopItem, { name: "초안 연결 상품", itemId: S(X.I8), type: "item", price: 1 });
    const f = { $or: [{ itemId: S(X.I8) }, { "bundle.itemId": S(X.I8) }] };
    eq([await cd.catalogCount(ShopItem, f), await liveRead(() => cd.catalogCount(ShopItem, f))], [1, 0], "[초안, 실사이트]");
    eq(await cd.discardOne("shopItem", S(s16._id)), { removed: 1 }, "임시 초안 되돌리기");
  });
  // 그 사이 실사이트에서 — 지움 · 무제한 전환 · 판매 · 같은 칸 수정
  guard();
  await coll("items").deleteOne({ _id: X.I7 });
  await coll("shopitems").deleteOne({ _id: X.S10 });
  await coll("shopbanners").deleteOne({ _id: X.B4 });
  await coll("shopitems").updateOne({ _id: X.S11 }, { $set: { stock: -1 } });
  await coll("shopitems").updateOne({ _id: X.S13 }, { $inc: { stock: -4, soldCount: 4 } }); // 5 → 1
  await coll("items").updateOne({ _id: X.I9 }, { $set: { name: "라이브 이름" } });
  await test("반영 전 보기 — S11 무제한 전환 뒤 초안 값 7 · S12 −1 · S13 max(0, 1+1−5)=0", async () => {
    const v = async (id) => (await cd.catalogFindById(ShopItem, S(id)))?.stock;
    eq([await v(X.S11), await v(X.S12), await v(X.S13)], [7, -1, 0], "[S11, S12, S13]");
  });
  await test("draftSummary — 아이템 edit 2 · 상품 edit 6 · del 1 · 배너 edit 1 · order 1", async () => {
    const s = await cd.draftSummary();
    eq([s.counts.item, s.counts.shopItem, s.counts.banner, s.counts.setting], [
      { add: 0, edit: 2, order: 0, del: 0 },
      { add: 0, edit: 6, order: 0, del: 1 },
      { add: 0, edit: 1, order: 1, del: 0 },
      { edit: 0 },
    ], "counts");
  });
  await test("publishAll — 지워진 실사이트 문서는 건너뜀 · 재고 규칙 · 연결 바꾸기 · 같은 칸은 초안이 이김 · 수정 뒤 삭제는 숨김만", async () => {
    const r = await cd.publishAll();
    eq(r.skipped.map((x) => `${x.kind}|${x.id}|${x.why}`).sort(), [
      `item|${S(X.I7)}|실사이트에서 지워짐`,
      `shopItem|${S(X.S10)}|실사이트에서 지워짐`,
      `shopItem|${S(X.S14)}|연결 아이템이 실사이트에 없음`,
      `banner|${S(X.B4)}|실사이트에서 지워짐`,
    ].sort(), "skipped");
    eq(r.hidden.map((x) => x.id), [S(X.S17)], "hidden");
    eq(r.applied, 7, "applied(I9 · S11 · S12 · S13 · S15 · S17 · B1)");
    const st = async (id) => (await rawOne("shopitems", id))?.stock;
    eq([await st(X.S11), await st(X.S12), await st(X.S13)], [7, -1, 0], "실사이트 재고 [S11, S12, S13]");
    eq((await rawOne("shopitems", X.S13))?.soldCount, 4, "S13 판매 수");
    const s15 = await rawOne("shopitems", X.S15);
    eq([s15.itemId, s15.name], [S(ID.I2), "포션(라이브)"], "S15 연결 · 표기(I2 실사이트 값)");
    eq((await rawOne("shopitems", X.S14))?.itemId, "", "S14 연결 안 바뀜");
    eq((await rawOne("items", X.I9))?.name, "초안 이름", "I9 같은 칸 → 초안");
    const s17 = await rawOne("shopitems", X.S17);
    eq([s17?.active, s17?.price], [false, 300], "S17 숨김 · 가격은 실사이트 그대로(수정은 반영 안 됨)");
    eq((await rawOne("shopbanners", ID.B1))?.sortOrder, 5, "B1 순서");
    eq(await coll("items").countDocuments({ _id: X.I7 }) + await coll("shopitems").countDocuments({ _id: X.S10 }) + await coll("shopbanners").countDocuments({ _id: X.B4 }), 0, "지워진 문서가 되살아남");
    eq(sorted([...(await idsIn("draft_items")), ...(await idsIn("draft_shopitems")), ...(await idsIn("draft_shopbanners"))]), sorted([X.I7, X.S10, X.S14, X.B4]), "남은 초안");
    eq(await cd.discardAll(), { removed: 4 }, "정리 discardAll");
  });
}

// ───────────────────────── 실행 · 정리 ─────────────────────────
let exitCode = 0;
let cleanup = null;
try {
  await main();
} catch (e) {
  exitCode = 1;
  console.error(`\n중단: ${e?.stack || e}`);
} finally {
  setEnv(savedEnv);
  cleanup = { method: "", remaining: null, listed: null, error: "" };
  try {
    cleanup.method = await dropTestDb();
    cleanup.remaining = (await conn.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    try {
      const r = await conn.db.admin().command({ listDatabases: 1, nameOnly: true, filter: { name: TEST_DB } });
      cleanup.listed = (r?.databases || []).map((d) => d.name);
    } catch (e) {
      cleanup.listed = `listDatabases 안 됨(${e?.message})`;
    }
  } catch (e) {
    cleanup.error = e?.message || String(e);
  }
  await mongoose.disconnect().catch(() => {});
}

console.log(`\n${total} 검사 · ${passed} 통과 · ${failures.length} 실패`);
for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`);
if (notes.length) {
  console.log("참고(합계에 안 넣음):");
  for (const n of notes) console.log(`  · ${n}`);
}
console.log(`시험용 DB 정리: ${cleanup?.error ? `실패 — ${cleanup.error}` : cleanup?.method} · 남은 컬렉션 ${JSON.stringify(cleanup?.remaining)} · listDatabases(${TEST_DB}) ${JSON.stringify(cleanup?.listed)}`);
process.exit(exitCode || (failures.length ? 1 : 0));
