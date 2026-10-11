// lib/productOrder.js 검사 — node scripts/test-product-order.mjs (DB · 서버 없이)
import assert from "node:assert/strict";
import { itemIndexOf, productGroupOf, productRowsOf, normalizeProductOrder, syncProductOrder, anchorItemOf } from "../lib/productOrder.js";

let pass = 0;
const fails = [];
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fails.push(name); console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").join("\n       ")}`); }
};
// 아이템(순서대로): a1 a2 (그룹 A · 상위 H), b1 (그룹 B), x (그룹 없음)
const items = [{ id: "a1", group: "A" }, { id: "a2", group: "A" }, { id: "b1", group: "B" }, { id: "x", group: "" }];
const P = { A: "H" };
const pr = (id, itemId, extra = {}) => ({ _id: id, itemId, type: "item", ...extra });
const set = (id, comps) => ({ _id: id, itemId: "", type: "bundle", bundle: comps.map((c) => ({ itemId: c })) });
const ids = (rows) => rows.map((r) => r.id).join(" ");

test("상품 그룹 = 연결 아이템 그룹 · 세트는 첫 구성 아이템 그룹 · 없으면 \"\"", () => {
  const idx = itemIndexOf(items);
  assert.equal(productGroupOf(pr("p", "a2"), idx), "A");
  assert.equal(productGroupOf(set("s", ["b1", "a1"]), idx), "B");
  assert.equal(productGroupOf(pr("r", ""), idx), "");
  assert.equal(productGroupOf(pr("gone", "zz"), idx), "", "지워진 아이템");
  assert.equal(anchorItemOf(set("s", [])), "");
});
test("아이템 순서대로 — 연결 상품은 아이템 순서, 세트는 첫 구성 아이템 상품 바로 뒤, 아이템 없는 상품은 지금 차례로 맨 뒤", () => {
  const products = [pr("role", ""), set("setA", ["a1", "b1"]), pr("pb1", "b1"), pr("pa2", "a2"), pr("pa1", "a1"), pr("px", "x"), pr("gone", "zz"), set("setNone", ["zz"])];
  assert.equal(ids(syncProductOrder(products, items, P)), "pa1 setA pa2 pb1 px role gone setNone");
});
test("같은 아이템 상품 둘은 지금 차례 · 세트 둘이 같은 첫 구성이면 지금 차례", () => {
  const products = [pr("pa1b", "a1"), set("s2", ["a1"]), pr("pa1a", "a1"), set("s1", ["a1"])];
  assert.equal(ids(syncProductOrder(products, items, P)), "pa1b pa1a s2 s1");
});
test("규칙 맞추기 — 떨어진 같은 그룹 상품을 첫 자리로 모은다(끌어 놓은 순서 저장 전)", () => {
  const idx = itemIndexOf(items);
  const rows = productRowsOf([pr("pa1", "a1"), pr("role", ""), pr("pa2", "a2"), pr("pb1", "b1")], idx);
  assert.equal(ids(normalizeProductOrder(rows, P)), "pa1 pa2 role pb1");
});
test("pin — 상위 안 그룹 하나(G2)를 밖으로 끌면 상위 전체가 딸려가지 않고 형제(G1) 곁으로", () => {
  const its = [{ id: "g1", group: "G1" }, { id: "g2", group: "G2" }, { id: "u", group: "" }];
  const PP = { G1: "S", G2: "S" };
  const rows = productRowsOf([pr("B", "g2"), pr("U", ""), pr("A", "g1")], itemIndexOf(its));
  assert.equal(ids(normalizeProductOrder(rows, PP)), "B A U", "pin 없으면 상위째");
  assert.equal(ids(normalizeProductOrder(rows, PP, "G2")), "U B A");
});
test("한 번 더 맞춰도 같다(무작위 300번)", () => {
  let seed = 3;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  const pool = ["a1", "a2", "b1", "x", "", "zz"];
  for (let k = 0; k < 300; k++) {
    const n = 2 + rnd(9);
    const products = Array.from({ length: n }, (_, i) => (rnd(4) === 0 ? set("s" + i, [pool[rnd(6)], pool[rnd(6)]]) : pr("p" + i, pool[rnd(6)])));
    const once = syncProductOrder(products, items, P);
    const byId = new Map(products.map((p) => [p._id, p]));
    const twice = syncProductOrder(once.map((r) => byId.get(r.id)), items, P);
    assert.equal(ids(twice), ids(once));
    assert.equal(once.length, n);
  }
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
