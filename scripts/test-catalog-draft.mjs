// 📌 상품 초안(lib/catalogDraft.js) 순수 계산 점검 — DB 없이 돈다(연결 · 쓰기 없음).
//    diffFields(3-way 비교) · shownStock(재고 폭) · overlayMerge(덧씌우기) · 투영 · 정렬 · 시즌 패스 셈 · 모드 판별,
//    그리고 실사이트 모드에서 도우미가 지금의 mongoose 호출 하나로만 가는지(가짜 모델로 호출 기록을 본다).
//    사용 (저장소 루트에서): node scripts/test-catalog-draft.mjs
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 사이트 코드의 "@/…" 별칭과 확장자 없는 import("./itemArt", "next/server")를 node 에서도 풀어 준다
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

// 실사이트 모드로 시작(플래그 없음)
const ENV_KEYS = ["CATALOG_DRAFT", "NEXTAUTH_URL", "VERCEL"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const setEnv = (vals) => { for (const k of ENV_KEYS) { if (vals[k] == null) delete process.env[k]; else process.env[k] = vals[k]; } };
setEnv({});

const mongoose = (await import("mongoose")).default;
const cd = await import("../lib/catalogDraft.js");
const { itemCascadeSet } = await import("../lib/items.js");
const Item = (await import("../models/Item.js")).default;
const ShopItem = (await import("../models/ShopItem.js")).default;
const ShopBanner = (await import("../models/ShopBanner.js")).default;
const Setting = (await import("../models/Setting.js")).default;

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${e?.message?.split("\n").join("\n       ")}`);
  }
}
const oid = () => new mongoose.Types.ObjectId();

console.log("모드 판별");
await test("플래그 없음 → 실사이트 모드 · 쓰기 막지 않음(localhost next start)", () => {
  setEnv({ NEXTAUTH_URL: "http://localhost:3000" });
  assert.equal(cd.isDraftMode(), false);
  assert.equal(cd.catalogWriteBlocked(), false);
});
await test("CATALOG_DRAFT=1 + localhost → 초안 모드", () => {
  setEnv({ CATALOG_DRAFT: "1", NEXTAUTH_URL: "http://localhost:3000" });
  assert.equal(cd.isDraftMode(), true);
  assert.equal(cd.catalogWriteBlocked(), false);
  setEnv({ CATALOG_DRAFT: "1", NEXTAUTH_URL: "http://127.0.0.1:3001/" });
  assert.equal(cd.isDraftMode(), true);
});
await test("Vercel 이면 플래그가 있어도 실사이트 모드 + 관리 쓰기 막음", () => {
  setEnv({ CATALOG_DRAFT: "1", NEXTAUTH_URL: "http://localhost:3000", VERCEL: "1" });
  assert.equal(cd.isDraftMode(), false);
  assert.equal(cd.catalogWriteBlocked(), true);
  setEnv({ VERCEL: "1", NEXTAUTH_URL: "https://premium-igloo.example" });
  assert.equal(cd.catalogWriteBlocked(), true);
});
await test("로컬이 아닌 주소 → 초안 모드 아님", () => {
  setEnv({ CATALOG_DRAFT: "1", NEXTAUTH_URL: "https://localhost.evil.example" });
  assert.equal(cd.isDraftMode(), false);
  setEnv({ CATALOG_DRAFT: "true", NEXTAUTH_URL: "http://localhost:3000" });
  assert.equal(cd.isDraftMode(), false);
});
await test("liveLockedResponse — 403 LIVE_LOCKED", async () => {
  const r = cd.liveLockedResponse();
  assert.equal(r.status, 403);
  const body = await r.json();
  assert.equal(body.success, false);
  assert.equal(body.code, "LIVE_LOCKED");
  assert.equal(body.message, "상품 · 아이템 수정은 테스트 사이트(localhost)에서 합니다.");
});
setEnv({});

console.log("shownStock");
await test("안 바꿨으면 실사이트 재고", () => assert.equal(cd.shownStock({ stock: 5 }, { stock: 5 }, { stock: 3 }), 3));
await test("한정 → 한정 은 실사이트 + 바꾼 폭", () => assert.equal(cd.shownStock({ stock: 8 }, { stock: 5 }, { stock: 3 }), 6));
await test("0 아래로는 안 내림", () => assert.equal(cd.shownStock({ stock: 0 }, { stock: 5 }, { stock: 3 }), 0));
await test("초안이 무제한이면 무제한", () => assert.equal(cd.shownStock({ stock: -1 }, { stock: 5 }, { stock: 3 }), -1));
await test("기준이 무제한이면 초안 값", () => assert.equal(cd.shownStock({ stock: 10 }, { stock: -1 }, { stock: -1 }), 10));
await test("실사이트가 그 사이 무제한이 됐으면 초안 값", () => assert.equal(cd.shownStock({ stock: 8 }, { stock: 5 }, { stock: -1 }), 8));
await test("실사이트 문서가 없으면 초안 값", () => assert.equal(cd.shownStock({ stock: 8 }, { stock: 5 }, null), 8));
await test("칸이 없으면 기본값 -1 로 본다", () => assert.equal(cd.shownStock({}, {}, { stock: 4 }), 4));

console.log("diffFields");
const itemBase = () => ({
  _id: oid(), name: "보호막", description: "", icon: "art:shield", imageUrl: "", color: "", type: "item", roleId: "", roleName: "",
  detachOnSeason: false, visible: true, sortOrder: 3, group: "", chatBuffXp: 0, voiceBuffXp: 0, attendBuffXp: 0,
  effects: [{ id: "e1", on: "cardSkin", mode: "add", skin: "hw_ghost" }], createdAt: new Date("2026-10-01T00:00:00Z"), __v: 0,
});
await test("같으면 빈 목록", () => {
  const b = itemBase();
  assert.deepEqual(cd.diffFields(Item, { ...b, _draftOp: "", _draftBase: b, _draftAt: new Date() }, b), []);
});
await test("이름이 바뀌면 name", () => {
  const b = itemBase();
  assert.deepEqual(cd.diffFields(Item, { ...b, name: "새 이름" }, b), ["name"]);
});
await test("없는 칸은 스키마 기본값 — group 없는 옛 문서와 group \"\" 는 같다", () => {
  const b = itemBase();
  delete b.group;
  assert.deepEqual(cd.diffFields(Item, { ...b, group: "" }, b), []);
});
await test("초안에서 빠진 칸이 기본값과 다르면 바뀐 칸", () => {
  const b = { ...itemBase(), description: "설명" };
  const d = { ...b };
  delete d.description;
  assert.deepEqual(cd.diffFields(Item, d, b), ["description"]);
});
await test("효과 객체 키 순서는 무시", () => {
  const b = itemBase();
  const d = { ...b, effects: [{ skin: "hw_ghost", mode: "add", on: "cardSkin", id: "e1" }] };
  assert.deepEqual(cd.diffFields(Item, d, b), []);
});
await test("_id · __v · createdAt 은 비교하지 않는다", () => {
  const b = itemBase();
  assert.deepEqual(cd.diffFields(Item, { ...b, _id: oid(), __v: 7, createdAt: new Date() }, b), []);
});
await test("배너 placement — 칸 없는 옛 배너 = home", () => {
  const b = { _id: oid(), imageUrl: "https://a/b.png", title: "", sortOrder: 0, active: true };
  assert.deepEqual(cd.diffFields(ShopBanner, { ...b, placement: "home" }, b), []);
  assert.deepEqual(cd.diffFields(ShopBanner, { ...b, placement: "season" }, b), ["placement"]);
});
const shopBase = () => ({
  _id: oid(), name: "상품", price: 1000, stock: 5, soldCount: 2, itemId: "", type: "item",
  durations: [{ _id: oid(), days: 7, price: 500 }], discountUntil: new Date("2026-10-31T15:00:00Z"), bundle: [],
});
await test("상품 soldCount 는 비교하지 않고 stock 은 비교", () => {
  const b = shopBase();
  assert.deepEqual(cd.diffFields(ShopItem, { ...b, soldCount: 99 }, b), []);
  assert.deepEqual(cd.diffFields(ShopItem, { ...b, stock: 9 }, b), ["stock"]);
});
await test("기간제 가격표의 하위 _id 만 다르면 같다 · 값이 다르면 durations", () => {
  const b = shopBase();
  assert.deepEqual(cd.diffFields(ShopItem, { ...b, durations: [{ _id: oid(), days: 7, price: 500 }] }, b), []);
  assert.deepEqual(cd.diffFields(ShopItem, { ...b, durations: [{ _id: oid(), days: 7, price: 600 }] }, b), ["durations"]);
});
await test("날짜는 값으로 비교", () => {
  const b = shopBase();
  assert.deepEqual(cd.diffFields(ShopItem, { ...b, discountUntil: new Date(b.discountUntil.getTime()) }, b), []);
  assert.deepEqual(cd.diffFields(ShopItem, { ...b, discountUntil: null }, b), ["discountUntil"]);
});
await test("설정은 value 만 — updatedAt 은 무시", () => {
  const b = { _id: oid(), key: "itemGroups", value: [{ name: "시즌 2" }], updatedAt: new Date("2026-10-01") };
  assert.deepEqual(cd.diffFields(Setting, { ...b, updatedAt: new Date() }, b), []);
  assert.deepEqual(cd.diffFields(Setting, { ...b, value: [{ name: "시즌 2" }, { name: "할로윈" }] }, b), ["value"]);
});

console.log("overlayMerge");
await test("삭제 예정은 숨기고 · 초안으로 바꾸고 · 새 초안은 더하고 · 정렬 · 표시", () => {
  const A = { ...itemBase(), name: "A", sortOrder: 0 };
  const B = { ...itemBase(), name: "B", sortOrder: 1 };
  const C = { ...itemBase(), name: "C", sortOrder: 2 };
  const E = { ...itemBase(), name: "E", sortOrder: 9 };
  const Bd = { ...B, sortOrder: 5, _draftOp: "", _draftBase: B, _draftAt: new Date() };      // 순서만 → 표시 없음
  const Dn = { ...itemBase(), name: "D", sortOrder: 3, _draftOp: "", _draftBase: null, _draftAt: new Date() }; // 새 초안
  const Ed = { ...E, name: "E2", _draftOp: "", _draftBase: E, _draftAt: new Date() };        // 실사이트 결과에 없던 수정 초안
  const out = cd.overlayMerge({
    Model: Item,
    live: [A, B, C],
    drafts: [Bd, Dn, Ed],
    draftKeys: new Set([String(B._id), String(C._id), String(Dn._id), String(E._id)]),
    sort: { sortOrder: 1, createdAt: 1 },
    mark: true,
  });
  assert.deepEqual(out.map((d) => d.name), ["A", "D", "B", "E2"]);
  assert.deepEqual(out.map((d) => d._draft), [undefined, "new", undefined, "edit"]);
  for (const d of out) for (const k of ["_draftOp", "_draftBase", "_draftAt"]) assert.equal(k in d, false, `${k} 가 남았다`);
});
await test("mark 를 안 주면 _draft 를 달지 않는다", () => {
  const B = { ...itemBase(), name: "B" };
  const out = cd.overlayMerge({ Model: Item, live: [B], drafts: [{ ...B, name: "B2", _draftBase: B }], draftKeys: [String(B._id)] });
  assert.equal(out[0].name, "B2");
  assert.equal("_draft" in out[0], false);
});
await test("정렬이 없으면 실사이트 자리에 그대로 바꿔 넣는다", () => {
  const A = { ...itemBase(), name: "A" };
  const B = { ...itemBase(), name: "B" };
  const C = { ...itemBase(), name: "C" };
  const out = cd.overlayMerge({ Model: Item, live: [A, B, C], drafts: [{ ...B, name: "B2", _draftBase: B }], draftKeys: [String(B._id)] });
  assert.deepEqual(out.map((d) => d.name), ["A", "B2", "C"]);
});
await test("초안이 filter 에 안 맞으면(초안 id 만 있음) 실사이트 문서도 빠진다", () => {
  const A = { ...itemBase(), name: "A" };
  const out = cd.overlayMerge({ Model: Item, live: [A], drafts: [], draftKeys: [String(A._id)] });
  assert.deepEqual(out, []);
});
await test("select 포함형 투영 + _draft", () => {
  const A = { ...itemBase(), name: "A" };
  const Dn = { ...itemBase(), name: "D", _draftBase: null };
  const out = cd.overlayMerge({ Model: Item, live: [{ _id: A._id, name: "A" }], drafts: [Dn], draftKeys: [String(Dn._id)], select: { name: 1 }, mark: true });
  assert.deepEqual(Object.keys(out[0]).sort(), ["_id", "name"]);
  assert.deepEqual(Object.keys(out[1]).sort(), ["_draft", "_id", "name"]);
});
await test("상품 초안 — soldCount 는 실사이트, stock 은 폭 반영", () => {
  const S = { ...shopBase(), stock: 5, soldCount: 2 };
  const Sd = { ...S, stock: 8, name: "상품2", _draftBase: S };
  const N = { ...shopBase(), name: "새 상품", stock: 10, soldCount: 0, _draftBase: null };
  const out = cd.overlayMerge({
    Model: ShopItem,
    live: [{ ...S, stock: 3, soldCount: 4 }],
    drafts: [Sd, N],
    draftKeys: [String(S._id), String(N._id)],
    liveCounters: new Map([[String(S._id), { _id: S._id, stock: 3, soldCount: 4 }]]),
    mark: true,
  });
  assert.equal(out[0].name, "상품2");
  assert.equal(out[0].stock, 6);
  assert.equal(out[0].soldCount, 4);
  assert.equal(out[0]._draft, "edit");
  assert.equal(out[1].stock, 10);
  assert.equal(out[1].soldCount, 0);
  assert.equal(out[1]._draft, "new");
});
await test("상품 초안 — 재고만 안 바꿨으면 실사이트 재고 그대로(그 사이 팔린 수량)", () => {
  const S = { ...shopBase(), stock: 5 };
  const out = cd.overlayMerge({
    Model: ShopItem, live: [], drafts: [{ ...S, price: 2000, _draftBase: S }], draftKeys: [String(S._id)],
    liveCounters: new Map([[String(S._id), { stock: 1, soldCount: 6 }]]),
  });
  assert.equal(out[0].stock, 1);
  assert.equal(out[0].soldCount, 6);
});
await test("설정은 key 로 맞춘다(초안 _id 가 달라도 실사이트 문서를 가린다)", () => {
  const live = { _id: oid(), key: "itemGroups", value: [{ name: "A" }] };
  const draft = { _id: oid(), key: "itemGroups", value: [{ name: "B" }], _draftBase: null };
  const out = cd.overlayMerge({ Model: Setting, live: [live], drafts: [draft], draftKeys: ["k:itemGroups"], select: { value: 1 } });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { _id: draft._id, value: [{ name: "B" }] });
});

console.log("투영 · 정렬");
await test("{ _id: 1 } 하나면 _id 만", () => {
  const d = { _id: 1, a: 1, b: 2 };
  assert.deepEqual(cd.projectDoc(d, { _id: 1 }), { _id: 1 });
});
await test("문자열 select · _id: 0 · 빈 select", () => {
  const d = { _id: 1, name: "n", icon: "i", x: 3 };
  assert.deepEqual(cd.projectDoc(d, "name icon"), { _id: 1, name: "n", icon: "i" });
  assert.deepEqual(cd.projectDoc(d, { name: 1, _id: 0 }), { name: "n" });
  assert.equal(cd.projectDoc(d, {}), d);
  assert.equal(cd.projectDoc(d, undefined), d);
});
await test("점 경로는 맨 위 칸 통째로", () => {
  const d = { _id: 1, bundle: [{ itemId: "a", qty: 2 }], name: "n" };
  assert.deepEqual(cd.projectDoc(d, { "bundle.itemId": 1 }), { _id: 1, bundle: [{ itemId: "a", qty: 2 }] });
});
await test("Mongo 형 순서 · 내림차순 · 여러 키", () => {
  const t1 = new Date("2026-01-01");
  const t2 = new Date("2026-02-01");
  const rows = [
    { n: "d", s: 2, c: t1 }, { n: "a", s: null, c: t1 }, { n: "b", s: 1, c: t2 }, { n: "c", s: 1, c: t1 }, { n: "e", c: t2 },
  ];
  // 칸 없음 · null 은 같은 자리(맨 앞) — 다음 키(c 내림차순)로 가른다
  assert.deepEqual(cd.sortDocs(rows, { s: 1, c: -1 }).map((r) => r.n), ["e", "a", "b", "c", "d"]);
  assert.deepEqual(cd.sortDocs(rows, "-s c").map((r) => r.n), ["d", "c", "b", "a", "e"]);
});

console.log("시즌 패스 셈(lib/seasonPass rewardsOf 와 같은 규칙)");
await test("옛 칸(객체 하나) · 빈 보상 빼기 · 칸마다 앞 4개", () => {
  const item = (id) => ({ kind: "item", itemId: id });
  const tiers = [
    { free: [item("a"), { kind: "none" }, { kind: "xp", amount: 0 }], paid: item("a") },
    { free: [item("b"), { kind: "xp", amount: 100 }, { kind: "role", roleId: "r" }, { kind: "point", amount: 5 }, item("c")] },
    { free: [{ kind: "item", itemId: "  " }], paid: null },
  ];
  const m = cd.countPassItems(tiers);
  assert.equal(m.get("a"), 2);
  assert.equal(m.get("b"), 1);
  assert.equal(m.has("c"), false); // 다섯 번째라 빠진다
  assert.equal(m.size, 2);
});

console.log("실사이트 모드 — 지금의 mongoose 호출 하나로만");
// 가짜 모델 — 호출을 기록한다. 실행은 then(await)에서만
function fakeModel(modelName, { lastSort = null } = {}) {
  const calls = [];
  const chain = (name, result) => {
    const q = {
      sort(s) { calls.push(["sort", s]); return q; },
      lean() { calls.push(["lean"]); return q; },
      then(res, rej) { calls.push(["exec", name]); return Promise.resolve(result).then(res, rej); },
    };
    return q;
  };
  return {
    modelName,
    calls,
    find(...a) { calls.push(["find", ...a]); return chain("find", [{ _id: 1 }]); },
    findOne(...a) { calls.push(["findOne", ...a]); return chain("findOne", lastSort); },
    findById(...a) { calls.push(["findById", ...a]); return chain("findById", { _id: a[0] }); },
    countDocuments(...a) { calls.push(["countDocuments", ...a]); return chain("countDocuments", 3); },
    findByIdAndDelete(...a) { calls.push(["findByIdAndDelete", ...a]); return chain("findByIdAndDelete", null); },
    create(d) { calls.push(["create", d]); return Promise.resolve({ toObject: () => ({ _id: "new", ...d }) }); },
  };
}
const draftModelsMade = () => Object.keys(mongoose.models).filter((n) => n.startsWith("Draft"));
setEnv({ NEXTAUTH_URL: "http://localhost:3000" });
await test("catalogFind = find(filter, select).sort(sort).lean()", async () => {
  const M = fakeModel("Item");
  const r = await cd.catalogFind(M, { a: 1 }, { select: { name: 1 }, sort: { sortOrder: 1 }, mark: true });
  assert.deepEqual(r, [{ _id: 1 }]);
  assert.deepEqual(M.calls, [["find", { a: 1 }, { name: 1 }], ["sort", { sortOrder: 1 }], ["lean"], ["exec", "find"]]);
});
await test("catalogFind 정렬 없음 = find(filter).lean()", async () => {
  const M = fakeModel("ShopItem");
  await cd.catalogFind(M, { active: true });
  assert.deepEqual(M.calls, [["find", { active: true }, undefined], ["lean"], ["exec", "find"]]);
});
await test("catalogFindOne = findOne(filter, select).lean()", async () => {
  const M = fakeModel("Setting", { lastSort: { value: [] } });
  const r = await cd.catalogFindOne(M, { key: "itemGroups" }, { select: { value: 1 } });
  assert.deepEqual(r, { value: [] });
  assert.deepEqual(M.calls, [["findOne", { key: "itemGroups" }, { value: 1 }], ["lean"], ["exec", "findOne"]]);
});
await test("catalogFindById — 잘못된 id 는 쿼리 없이 null, 맞는 id 는 findById(id).lean()", async () => {
  const M = fakeModel("Item");
  assert.equal(await cd.catalogFindById(M, "nope"), null);
  assert.equal(M.calls.length, 0);
  const id = String(oid());
  await cd.catalogFindById(M, id);
  assert.deepEqual(M.calls, [["findById", id, undefined], ["lean"], ["exec", "findById"]]);
});
await test("catalogCount = countDocuments(filter)", async () => {
  const M = fakeModel("ShopItem");
  assert.equal(await cd.catalogCount(M, { itemId: "x" }), 3);
  assert.deepEqual(M.calls, [["countDocuments", { itemId: "x" }], ["exec", "countDocuments"]]);
});
await test("forWrite = 모델 그대로(쿼리 없음)", async () => {
  const M = fakeModel("Item");
  assert.equal(await cd.forWrite(M, { _id: "x" }), M);
  assert.equal(M.calls.length, 0);
});
await test("nextSortOrder = findOne({}, {sortOrder}).sort(-1).lean() + 1 (cap)", async () => {
  const M = fakeModel("Item", { lastSort: { sortOrder: 4.7 } });
  assert.equal(await cd.nextSortOrder(M, 999), 5);
  assert.deepEqual(M.calls, [["findOne", {}, { sortOrder: 1 }], ["sort", { sortOrder: -1 }], ["lean"], ["exec", "findOne"]]);
  assert.equal(await cd.nextSortOrder(fakeModel("Item", { lastSort: { sortOrder: 2000 } }), 999), 999);
  assert.equal(await cd.nextSortOrder(fakeModel("ShopItem", { lastSort: { sortOrder: 2000 } })), 2001);
  assert.equal(await cd.nextSortOrder(fakeModel("ShopItem", { lastSort: null })), 1);
});
await test("catalogCreate = create(data).toObject()", async () => {
  const M = fakeModel("ShopBanner");
  const r = await cd.catalogCreate(M, { imageUrl: "https://x" });
  assert.deepEqual(r, { _id: "new", imageUrl: "https://x" });
  assert.deepEqual(M.calls, [["create", { imageUrl: "https://x" }]]);
});
await test("catalogDelete = findByIdAndDelete(id)", async () => {
  const M = fakeModel("ShopItem");
  await cd.catalogDelete(M, "abc");
  assert.deepEqual(M.calls, [["findByIdAndDelete", "abc"], ["exec", "findByIdAndDelete"]]);
});
await test("draftBlockedProducts = false(쿼리 없음) · draftSummary 는 빈 요약", async () => {
  assert.equal(await cd.draftBlockedProducts([String(oid())]), false);
  const s = await cd.draftSummary();
  assert.equal(s.total, 0);
  assert.deepEqual(s.rows, []);
});
await test("반영 · 버리기 · 되돌리기는 초안 모드에서만", async () => {
  await assert.rejects(cd.publishAll(), (e) => e.code === "NOT_DRAFT");
  await assert.rejects(cd.discardAll(), (e) => e.code === "NOT_DRAFT");
  await assert.rejects(cd.discardOne("item", String(oid())), (e) => e.code === "NOT_DRAFT");
});
await test("실사이트 모드에서는 초안 모델을 만들지 않는다", () => {
  assert.deepEqual(draftModelsMade(), []);
});
setEnv({ CATALOG_DRAFT: "1", NEXTAUTH_URL: "http://localhost:3000" });
await test("초안 모드라도 초안 대상이 아닌 모델 · 설정 키는 실사이트 그대로", async () => {
  const C = fakeModel("Coupon");
  await cd.catalogFind(C, { code: "A" });
  assert.deepEqual(C.calls, [["find", { code: "A" }, undefined], ["lean"], ["exec", "find"]]);
  const S = fakeModel("Setting", { lastSort: { value: true } });
  await cd.catalogFindOne(S, { key: "maintenance" }, { select: { value: 1 } });
  assert.deepEqual(S.calls, [["findOne", { key: "maintenance" }, { value: 1 }], ["lean"], ["exec", "findOne"]]);
  assert.equal(await cd.forWrite(S, { key: "maintenance" }), S);
  assert.deepEqual(draftModelsMade(), []);
});
setEnv({});

console.log("초안 모델 · 그 밖");
await test("draftModel — 같은 스키마 + _draft* 칸, draft_<컬렉션>", () => {
  const D = cd.draftModel(ShopItem);
  assert.equal(D.modelName, "DraftShopItem");
  assert.equal(D.collection.collectionName, "draft_shopitems");
  assert.ok(D.schema.path("_draftOp") && D.schema.path("_draftBase") && D.schema.path("price") && D.schema.path("bundle"));
  assert.equal(cd.draftModel(ShopItem), D); // 캐시
  assert.equal(cd.draftModel(Setting).collection.collectionName, "draft_settings");
});
await test("stripDraft — 초안 칸만 빼고 _draft 는 남긴다", () => {
  const d = { _id: 1, name: "n", _draftOp: "", _draftBase: {}, _draftAt: new Date(), _draft: "edit" };
  assert.deepEqual(cd.stripDraft(d), { _id: 1, name: "n", _draft: "edit" });
  assert.deepEqual(cd.stripDraft([d]), [{ _id: 1, name: "n", _draft: "edit" }]);
  assert.equal(cd.stripDraft(null), null);
});
await test("itemCascadeSet — 스냅샷 + 기프트카드 기간표 비움 + 1개 단위 끔", () => {
  const phys = itemCascadeSet({ name: "기프트", type: "physical", imageUrl: "https://i", roleId: "" });
  assert.equal(phys.name, "기프트");
  assert.equal(phys.itemImageUrl, "https://i");
  assert.deepEqual(phys.durations, []);
  assert.equal(phys.unitSale, false);
  assert.equal(phys.maxPerOrder, 0);
  const plain = itemCascadeSet({ name: "포션", type: "item", roleId: "" });
  assert.equal("durations" in plain, false);
  assert.equal("unitSale" in plain, false);
  const role = itemCascadeSet({ name: "역할 아이템", type: "item", roleId: "123" });
  assert.equal(role.unitSale, false);
  assert.equal(role.roleId, "123");
});

setEnv(savedEnv);
console.log(`\n${passed} 통과 · ${failures.length} 실패`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
