// 📌 상위 그룹 · 자동 정렬 · 배너 순서(2026-10-11) — 관리 라우트를 실제 MongoDB 시험용 DB 에서 그대로 부른다.
//    시험용 DB "pi_groupstest_20261011" 에서만 돈다(URI 안의 기본 DB = 실사이트는 읽지도 쓰지도 않는다).
//    라우트가 쓰는 연결(@/lib/mongodb) · 관리자 확인(@/lib/apiAuth) · 상점 공개(@/lib/shopAccess)만 바꿔 끼운다 — 나머지(초안 · 순서 계산 · 모델)는 사이트 코드 그대로.
//    끝나면(성공 · 실패 모두) 시험용 DB 를 지운다.   사용 (저장소 루트에서): node scripts/test-item-groups-db.mjs
import { registerHooks } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DB = "pi_groupstest_20261011";

// 바꿔 끼울 모듈 — 이 셋은 실사이트 연결 · 로그인을 부르므로 시험용 몸으로
const MOCKS = {
  "/lib/mongodb.js": "export async function connectToDatabase() { return globalThis.__testMongoose; }",
  "/lib/apiAuth.js": "export async function denyIfNotAdmin() { return null; } export async function requireAdmin() { return { session: null, name: 'test', userId: '' }; } export const getSession = async () => null;",
  "/lib/shopAccess.js": "export async function getShopAccess() { return { isAdmin: true, canView: true }; }",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const spec = specifier.startsWith("@/") ? pathToFileURL(path.join(ROOT, specifier.slice(2))).href : specifier;
    let r;
    try {
      r = nextResolve(spec, context);
    } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND" && e?.code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw e;
      for (const ext of [".js", "/index.js"]) {
        try { r = nextResolve(spec + ext, context); break; } catch { /* 다음 후보 */ }
      }
      if (!r) throw e;
    }
    const hit = Object.keys(MOCKS).find((k) => r.url.replace(/\\/g, "/").endsWith(k));
    if (hit) return { url: `data:text/javascript,${encodeURIComponent(MOCKS[hit])}`, format: "module", shortCircuit: true };
    return r;
  },
});

const ENV_KEYS = ["CATALOG_DRAFT", "NEXTAUTH_URL", "VERCEL"];
const setEnv = (vals) => { for (const k of ENV_KEYS) { if (vals[k] == null) delete process.env[k]; else process.env[k] = vals[k]; } };
const LOCAL_ENV = { NEXTAUTH_URL: "http://localhost:3000" };
const DRAFT_ENV = { CATALOG_DRAFT: "1", NEXTAUTH_URL: "http://localhost:3000" };
setEnv(LOCAL_ENV);

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

const mongoose = (await import("mongoose")).default;
globalThis.__testMongoose = mongoose;
const conn = mongoose.connection;
const onTestDb = () => conn?.db?.databaseName === TEST_DB && conn.name === TEST_DB;
const guard = () => { if (!onTestDb()) throw new Error(`⛔ 붙은 DB 가 ${TEST_DB} 가 아님(${conn?.db?.databaseName}) — 중단`); };
const uri = readMongoUri();
if (!uri) { console.error(".env.local 에 MONGODB_URI 가 없습니다."); process.exit(2); }
await mongoose.connect(uri, { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
if (!onTestDb()) { console.error("⛔ 시험용 DB 가 아님 — 끝냄"); await mongoose.disconnect().catch(() => {}); process.exit(2); }
console.log(`붙은 DB: ${conn.db.databaseName}`);
const dropTestDb = async () => { guard(); await conn.db.dropDatabase(); };

let total = 0, passed = 0;
const failures = [];
async function test(name, fn) {
  guard();
  total++;
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").join("\n       ")}`); }
}
const section = (t) => console.log(`\n[${t}]`);

async function main() {
  guard();
  if ((await conn.db.listCollections({}, { nameOnly: true }).toArray()).length) await dropTestDb();
  const Item = (await import("../models/Item.js")).default;
  const ShopBanner = (await import("../models/ShopBanner.js")).default;
  const Setting = (await import("../models/Setting.js")).default;
  for (const M of [Item, ShopBanner, Setting]) if (M.db.name !== TEST_DB) throw new Error(`⛔ ${M.modelName} 이 시험용 연결이 아님`);
  const items = await import("../app/api/admin/items/route.js");
  const banners = await import("../app/api/shop/banners/route.js");

  const BASE = "http://localhost:3000";
  const call = async (fn, url, method = "GET", body) => {
    const res = await fn(new Request(BASE + url, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
    return { status: res.status, d: await res.json() };
  };
  const op = (body) => call(items.PATCH, "/api/admin/items", "PATCH", body);
  // 이름 차례(지금 DB 순서 — 목록 GET 과 같은 정렬)
  const live = async (M = Item) => (await M.find({}).sort({ sortOrder: 1, createdAt: 1, _id: 1 }).lean());
  const names = async () => (await live()).map((r) => r.name).join(" ");
  const setting = async () => (await Setting.findOne({ key: "itemGroups" }).lean())?.value;

  // ── 시험 아이템 ──
  //    0 c4(할로윈) · 1 i1 · 2 t2(테두리 · 실버) · 3 t1(테두리 · 브론즈) · 4 r1 · 5 c5(할로윈) · 6 t3(테두리 · 골드) · 7 p1 · 8 g1 · 9 s1(시즌)
  const T0 = Date.parse("2026-10-01T00:00:00Z");
  const mk = (i, name, type, group = "", effects = []) => ({ name, type, group, effects, sortOrder: i, createdAt: new Date(T0 + i * 60000) });
  await Item.insertMany([
    mk(0, "c4", "cosmetic", "할로윈", [{ id: "e", on: "cardSkin", mode: "add", skin: "hw_ghost" }]),
    mk(1, "i1", "item"),
    mk(2, "t2", "cosmetic", "테두리", [{ id: "e", on: "avatarFrame", mode: "add", frame: "silver" }]),
    mk(3, "t1", "cosmetic", "테두리", [{ id: "e", on: "avatarFrame", mode: "add", frame: "bronze" }]),
    mk(4, "r1", "role"),
    mk(5, "c5", "cosmetic", "할로윈", [{ id: "e", on: "cardSkin", mode: "add", skin: "gold" }]),
    mk(6, "t3", "cosmetic", "테두리", [{ id: "e", on: "avatarFrame", mode: "add", frame: "gold" }]),
    mk(7, "p1", "perk"),
    mk(8, "g1", "physical"),
    mk(9, "s1", "cosmetic", "시즌"),
  ]);
  await Setting.create({ key: "itemGroups", value: [{ name: "할로윈", parent: "꾸밈" }, { name: "테두리", parent: "꾸밈" }, { name: "시즌" }, { name: "빈 그룹" }, { name: "꾸밈", kind: "parent" }] });

  section("목록 GET — 상위 · 그룹 덩어리를 맞춰 저장하고 상위를 준다");
  await test("GET ?groups=1 — 떨어진 그룹 · 같은 상위를 첫 자리로 모아 저장, parents · parentOf 를 준다", async () => {
    const { status, d } = await call(items.GET, "/api/admin/items?groups=1");
    assert.equal(status, 200);
    assert.equal(d.data.map((r) => r.name).join(" "), "c4 c5 t2 t1 t3 i1 r1 p1 g1 s1");
    assert.equal(await names(), "c4 c5 t2 t1 t3 i1 r1 p1 g1 s1", "DB 에도 그 순서");
    assert.deepEqual(d.groups, ["할로윈", "테두리", "시즌", "빈 그룹"]);
    assert.deepEqual(d.parents, ["꾸밈"]);
    assert.deepEqual(d.parentOf, { 할로윈: "꾸밈", 테두리: "꾸밈" });
    assert.deepEqual(await setting(), [{ name: "할로윈", parent: "꾸밈" }, { name: "테두리", parent: "꾸밈" }, { name: "시즌" }, { name: "빈 그룹" }, { name: "꾸밈", kind: "parent" }], "설정은 그대로(같으면 안 씀)");
  });

  section("자동 정렬");
  await test("autoSort — 역할 → 권한 → 아이템 → 꾸미기(상위 꾸밈[할로윈 · 테두리(브론즈 → 실버 → 골드)] → 시즌) → 기프트카드", async () => {
    const { status, d } = await op({ groupOp: "autoSort" });
    assert.equal(status, 200, JSON.stringify(d));
    assert.equal(await names(), "r1 p1 i1 c4 c5 t1 t2 t3 s1 g1");
    assert.equal(d.order.length, 10);
    assert.ok(d.moved > 0);
    const again = await op({ groupOp: "autoSort" });
    assert.equal(again.d.moved, 0, "두 번째는 바뀌는 게 없다");
  });
  await test("등급 판정 — 골드 「카드 스킨」(rank_ 가 아닌 스킨)은 등급 아이템이 아니다 · 이름 낱말(「골드 등급」)은 등급", async () => {
    // c5(skin gold) 가 등급이면 할로윈 안에서 c4 와 자리가 바뀌지 않아야 — 등급 아이템이 하나뿐이면 정렬하지 않으므로 이름 등급 하나를 더 넣어 본다
    await Item.updateOne({ name: "c4" }, { $set: { name: "c4 실버 등급", effects: [] } });
    await op({ groupOp: "autoSort" });
    assert.equal(await names(), "r1 p1 i1 c4 실버 등급 c5 t1 t2 t3 s1 g1", "c5(골드 카드 스킨)는 등급이 아니라 제자리");
    await Item.updateOne({ name: "c4 실버 등급" }, { $set: { name: "c4" } });
  });

  section("상위 그룹 만들기 · 넣기 · 빼기 · 차례 · 이름 · 삭제");
  await test("parentCreate — 이름 겹침 거절(그룹 · 상위) · 차례 끝에", async () => {
    assert.equal((await op({ groupOp: "parentCreate", name: "시즌" })).status, 409, "그룹 이름과 겹침");
    assert.equal((await op({ groupOp: "parentCreate", name: "꾸밈" })).status, 409, "있는 상위");
    const { d } = await op({ groupOp: "parentCreate", name: "따로" });
    assert.deepEqual(d.parents, ["꾸밈", "따로"]);
    assert.deepEqual((await setting()).filter((r) => r.kind === "parent").map((r) => r.name), ["꾸밈", "따로"]);
    assert.equal((await op({ groupOp: "create", name: "따로" })).status, 409, "그룹도 상위 이름과 겹치면 거절");
  });
  await test("setParent — 시즌을 꾸밈에 넣으면 꾸밈의 마지막 그룹 뒤로 · 할로윈을 따로로 옮기면 꾸밈에서 떨어져 제자리", async () => {
    let r = await op({ groupOp: "setParent", group: "시즌", parent: "꾸밈" });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    assert.equal(r.d.parentOf.시즌, "꾸밈");
    assert.equal(await names(), "r1 p1 i1 c4 c5 t1 t2 t3 s1 g1");
    r = await op({ groupOp: "setParent", group: "할로윈", parent: "따로" });
    assert.equal(r.d.parentOf.할로윈, "따로");
    assert.deepEqual(r.d.parents, ["따로", "꾸밈"], "상위 차례 = 목록 덩어리 차례(할로윈 덩어리가 앞) — 저장 차례만 믿지 않는다");
    assert.equal(await names(), "r1 p1 i1 c4 c5 t1 t2 t3 s1 g1", "이미 앞에 붙어 있어 순서 그대로");
    assert.equal((await op({ groupOp: "setParent", group: "시즌", parent: "없는 상위" })).status, 404);
  });
  await test("parentOrder — [꾸밈, 따로] 로 바꾸면 상위 덩어리끼리 자리를 바꾼다(상위 없는 단위는 제자리)", async () => {
    const { d } = await op({ groupOp: "parentOrder", names: ["꾸밈", "따로"] });
    assert.deepEqual(d.parents, ["꾸밈", "따로"]);
    assert.equal(await names(), "r1 p1 i1 t1 t2 t3 s1 c4 c5 g1");
  });
  await test("move — 상위 안 그룹(시즌)을 맨 앞으로 끌면 형제(테두리) 곁으로 돌아온다 · 상위 없는 단위는 끈 자리로", async () => {
    let r = await op({ move: { unit: "g:시즌", before: "i:" + String((await live())[0]._id) } });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    assert.equal(await names(), "r1 p1 i1 s1 t1 t2 t3 c4 c5 g1", "형제보다 앞에 놓아 형제 앞으로");
    r = await op({ move: { unit: "i:" + String((await live()).find((x) => x.name === "g1")._id), before: "g:시즌" } });
    assert.equal(await names(), "r1 p1 i1 g1 s1 t1 t2 t3 c4 c5", "그룹 없는 아이템은 상위 덩어리 앞으로");
  });
  await test("그룹 이름 바꾸기 · 삭제 — 상위도 따라간다 · 지운 그룹은 상위 표에서 빠진다", async () => {
    let r = await op({ groupOp: "rename", from: "테두리", to: "등급 테두리" });
    assert.equal(r.d.parentOf["등급 테두리"], "꾸밈");
    assert.equal(r.d.parentOf.테두리, undefined);
    r = await op({ groupOp: "delete", name: "시즌" });
    assert.equal(r.d.parentOf.시즌, undefined);
    const v = await setting();
    assert.ok(!v.some((x) => x.name === "시즌"));
    assert.ok(v.some((x) => x.name === "등급 테두리" && x.parent === "꾸밈"));
  });
  await test("parentRename · parentDelete — 든 그룹이 따라가고, 지우면 상위 없음(순서 그대로)", async () => {
    let r = await op({ groupOp: "parentRename", from: "따로", to: "할로윈 모음" });
    assert.deepEqual(r.d.parents, ["꾸밈", "할로윈 모음"]);
    assert.equal(r.d.parentOf.할로윈, "할로윈 모음");
    const before = await names();
    r = await op({ groupOp: "parentDelete", name: "할로윈 모음" });
    assert.deepEqual(r.d.parents, ["꾸밈"]);
    assert.equal(r.d.parentOf.할로윈, undefined);
    assert.equal(await names(), before);
    assert.ok(!(await setting()).some((x) => x.name === "할로윈 모음"));
  });

  section("초안 모드 — 자동 정렬은 초안으로만");
  await test("CATALOG_DRAFT=1 — 자동 정렬이 실사이트 아이템을 건드리지 않고 초안에 쓴다", async () => {
    await Item.updateOne({ name: "r1" }, { $set: { sortOrder: 99 } });
    const liveBefore = JSON.stringify(await live());
    setEnv(DRAFT_ENV);
    try {
      const { status } = await op({ groupOp: "autoSort" });
      assert.equal(status, 200);
      assert.equal(JSON.stringify(await live()), liveBefore, "실사이트 그대로");
      assert.ok((await conn.db.collection("draft_items").countDocuments({})) > 0, "초안이 생김");
    } finally {
      setEnv(LOCAL_ENV);
    }
  });

section("상품 정리 B안 · 판매 종료 — 상품 API(app/api/shop/items · purchase)");
  const ShopItem = (await import("../models/ShopItem.js")).default;
  const shop = await import("../app/api/shop/items/route.js");
  // 새 아이템 — 아이템 순서 맨 뒤(X1 X2 = 그룹 PX, Y1 = 그룹 PY)
  const [X1, X2, Y1] = await Item.insertMany([
    { name: "X1", type: "item", group: "PX", sortOrder: 100, createdAt: new Date(T0 + 100 * 60000) },
    { name: "X2", type: "item", group: "PX", sortOrder: 101, createdAt: new Date(T0 + 101 * 60000) },
    { name: "Y1", type: "item", group: "PY", sortOrder: 102, createdAt: new Date(T0 + 102 * 60000) },
  ]);
  const P = (name, sortOrder, extra = {}) => ({ name, type: "item", price: 1000, active: true, sortOrder, createdAt: new Date(T0 + sortOrder * 1000), ...extra });
  await ShopItem.insertMany([
    P("P_y1", 0, { itemId: String(Y1._id) }),
    P("R", 1),
    P("P_x2", 2, { itemId: String(X2._id) }),
    P("S", 3, { type: "bundle", bundle: [{ itemId: String(X1._id), days: 0, qty: 1, value: 100 }, { itemId: String(Y1._id), days: 0, qty: 1, value: 100 }] }),
    P("E", 4, { itemId: String(Y1._id), saleUntil: new Date(Date.now() - 3600e3) }),
    P("P_x1", 5, { itemId: String(X1._id) }),
  ]);
  const pnames = async () => (await ShopItem.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean()).map((x) => x.name).join(" ");
  const pid = async (n) => String((await ShopItem.findOne({ name: n }).lean())._id);
  await test("목록 GET(상점) — 판매 종료(E)는 빠진다 · 관리 전체 목록(?all=1)에는 있다", async () => {
    const pub = await call(shop.GET, "/api/shop/items");
    assert.ok(!pub.d.data.some((x) => x.name === "E"), "상점 목록에서 빠짐");
    const adm = await call(shop.GET, "/api/shop/items?all=1");
    assert.ok(adm.d.data.some((x) => x.name === "E"), "관리 목록에는 있음");
  });
  await test("관리 목록 GET(?all=1&groups=1) — 떨어진 같은 그룹 상품을 모아 저장(PX: P_x2 · S · P_x1)", async () => {
    const r = await call(shop.GET, "/api/shop/items?all=1&groups=1");
    assert.equal(r.status, 200);
    assert.equal(await pnames(), "P_y1 E R P_x2 S P_x1");
  });
  await test("「아이템 순서대로」 — 연결 상품은 아이템 순서, 세트는 첫 구성 아이템 상품 바로 뒤, 아이템 없는 상품은 맨 뒤", async () => {
    const r = await call(shop.PATCH, "/api/shop/items", "PATCH", { syncItems: true });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    assert.equal(await pnames(), "P_x1 S P_x2 P_y1 E R");
    assert.ok(r.d.moved > 0);
    const again = await call(shop.PATCH, "/api/shop/items", "PATCH", { syncItems: true });
    assert.equal(again.d.moved, 0, "두 번째는 그대로");
  });
  await test("「아이템 순서대로」 — 차례가 그대로면 듬성듬성한 sortOrder(지운 상품 자리)를 고쳐 쓰지 않는다 · moved 0", async () => {
    const rows = await ShopItem.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
    await ShopItem.bulkWrite(rows.map((x, i) => ({ updateOne: { filter: { _id: x._id }, update: { $set: { sortOrder: i * 2 } } } })));
    const r = await call(shop.PATCH, "/api/shop/items", "PATCH", { syncItems: true });
    assert.equal(r.d.moved, 0);
    const after = await ShopItem.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
    assert.deepEqual(after.map((x) => x.sortOrder), rows.map((_, i) => i * 2), "그대로");
    assert.equal(after.map((x) => x.name).join(" "), "P_x1 S P_x2 P_y1 E R");
  });
  await test("끌기 순서 저장 — 그룹을 끊는 순서를 보내도 같은 그룹은 모여 저장 · 응답 order 가 실제 순서", async () => {
    const order = await Promise.all(["P_x1", "R", "S", "P_x2", "P_y1", "E"].map(pid));
    const r = await call(shop.PATCH, "/api/shop/items", "PATCH", { order });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    assert.equal(await pnames(), "P_x1 S P_x2 R P_y1 E");
    const back = await Promise.all(r.d.order.map(async (id) => (await ShopItem.findById(id).lean()).name));
    assert.equal(back.join(" "), "P_x1 S P_x2 R P_y1 E");
  });
  await test("POST 판매 종료 시각 — 저장 · 비우면 없음 · 잘못된 값은 400", async () => {
    const id = await pid("R");
    const base = { id, name: "R", type: "item", price: "1000", active: true };
    let r = await call(shop.POST, "/api/shop/items", "POST", { ...base, saleUntil: "2026-12-31T23:59:59+09:00" });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    assert.equal(new Date((await ShopItem.findById(id).lean()).saleUntil).toISOString(), "2026-12-31T14:59:59.000Z");
    r = await call(shop.POST, "/api/shop/items", "POST", { ...base, saleUntil: "" });
    assert.equal((await ShopItem.findById(id).lean()).saleUntil, null);
    r = await call(shop.POST, "/api/shop/items", "POST", { ...base, saleUntil: "nope" });
    assert.equal(r.status, 400);
  });

  section("배너 노출 순서 — 위치마다 끌기(PATCH) · 새 배너는 그 위치 맨 뒤 · 수정은 순서 그대로");
  const placeOrder = async (p) => (await ShopBanner.find(p === "season" ? { placement: "season" } : { placement: { $in: ["home", null] } }).sort({ sortOrder: 1, createdAt: -1 }).lean()).map((b) => b.title).join(" ");
  await test("POST 새 배너 — 순서를 안 보내면 그 위치 맨 뒤", async () => {
    for (const [title, placement] of [["h1", "home"], ["h2", "home"], ["s1", "season"], ["h3", "home"], ["s2", "season"]]) {
      const r = await call(banners.POST, "/api/shop/banners", "POST", { imageUrl: "https://img.example/" + title + ".png", title, placement });
      assert.equal(r.status, 200, JSON.stringify(r.d));
    }
    assert.equal(await placeOrder("home"), "h1 h2 h3");
    assert.equal(await placeOrder("season"), "s1 s2");
  });
  await test("PATCH 순서 — 홈 [h3, h1] 만 보내면 h3 h1 다음에 빠진 h2 · 시즌 탭은 그대로", async () => {
    const id = async (t) => String((await ShopBanner.findOne({ title: t }).lean())._id);
    const r = await call(banners.PATCH, "/api/shop/banners", "PATCH", { placement: "home", order: [await id("h3"), await id("h1"), await id("s1")] });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    assert.equal(await placeOrder("home"), "h3 h1 h2");
    assert.equal(await placeOrder("season"), "s1 s2", "다른 위치 id 는 건너뜀");
  });
  await test("POST 수정 — 순서를 안 보내면 저장된 순서 그대로 · 위치를 바꾸면 새 위치 맨 뒤", async () => {
    const h1 = await ShopBanner.findOne({ title: "h1" }).lean();
    await call(banners.POST, "/api/shop/banners", "POST", { id: String(h1._id), imageUrl: h1.imageUrl, title: "h1", placement: "home" });
    assert.equal(await placeOrder("home"), "h3 h1 h2", "수정해도 자리 그대로");
    await call(banners.POST, "/api/shop/banners", "POST", { id: String(h1._id), imageUrl: h1.imageUrl, title: "h1", placement: "season" });
    assert.equal(await placeOrder("season"), "s1 s2 h1", "시즌 탭 맨 뒤로");
    assert.equal(await placeOrder("home"), "h3 h2");
  });
}

let code = 0;
try {
  await main();
} catch (e) {
  code = 1;
  console.error("중단:", e?.message || e);
} finally {
  try { await dropTestDb(); console.log(`\n시험용 DB ${TEST_DB} 지움`); } catch (e) { console.error("시험용 DB 지우기 실패:", e?.message || e); code = 1; }
  await mongoose.disconnect().catch(() => {});
}
console.log(`${passed}/${total} passed${failures.length ? ` · 실패: ${failures.join(" | ")}` : ""}`);
process.exit(code || (failures.length ? 1 : 0));
