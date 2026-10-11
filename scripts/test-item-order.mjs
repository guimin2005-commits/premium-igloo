// lib/itemOrder.js 검사 — node scripts/test-item-order.mjs
//    순서 · 그룹 덩어리 규칙(같은 그룹은 늘 붙어 있다)과 작업마다 결과 순서를 본다. DB · 서버 없이 돈다.
import assert from "node:assert/strict";
import {
  normalizeOrder, unitsOf, groupsInOrder, groupList, sameOrder, changesOf,
  moveUnit, moveInGroup, moveToGroup, orderGroupBlocks, assignGroup, renameGroup, deleteGroup, appendItem,
  groupUnitKey, itemUnitKey,
  nestParents, parentUnitsOf, orderParentBlocks, autoSortOrder, parentOfGroup, parentList, orderGroupsNested,
} from "../lib/itemOrder.js";
import { gapTargets, rowTargets, pickRowTarget, isNoopTarget, dropOf } from "../lib/groupedDrop.js";

let pass = 0;
const fails = [];
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fails.push(name); console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").join("\n       ")}`); }
};
const section = (t) => console.log(`\n[${t}]`);

// "a:A" = id a · 그룹 A, "x" = 그룹 없음. sortOrder 는 지금 자리(0, 1, 2 …)
const L = (spec) => spec.split(" ").filter(Boolean).map((s, i) => {
  const [id, group = ""] = s.split(":");
  return { id, group, sortOrder: i };
});
const S = (list) => list.map((it) => (it.group ? `${it.id}:${it.group}` : it.id)).join(" ");
const ids = (list) => list.map((it) => it.id).join(" ");
// 규칙 — 같은 그룹은 이어져 있어야 한다
const contiguous = (list) => {
  const seen = new Set();
  let prev = null;
  for (const it of list) {
    const g = it.group || "";
    if (g && g !== prev) {
      if (seen.has(g)) return false;
      seen.add(g);
    }
    prev = g;
  }
  return true;
};
const sameSet = (a, b) => [...a.map((x) => x.id)].sort().join() === [...b.map((x) => x.id)].sort().join();

section("normalizeOrder");
test("흩어진 그룹을 첫 아이템 자리로 모은다(안 차례 · 나머지 차례 그대로)", () => {
  assert.equal(S(normalizeOrder(L("a:A x b:B c:A y d:B e:A"))), "a:A c:A e:A x b:B d:B y");
});
test("이미 맞는 순서는 그대로", () => {
  const l = L("x a:A b:A y c:B");
  assert.equal(S(normalizeOrder(l)), S(l));
  assert.ok(sameOrder(normalizeOrder(l), l));
});
test("빈 목록 · 배열 아님 · group 칸 없음", () => {
  assert.deepEqual(normalizeOrder([]), []);
  assert.deepEqual(normalizeOrder(null), []);
  assert.equal(ids(normalizeOrder([{ id: "p" }, { id: "q", group: null }, { id: "r", group: "A" }, { id: "s" }, { id: "t", group: "A" }])), "p q r t s");
});
test("엉망인 데이터 — 같은 그룹이 맨 뒤에 붙은 경우(추천 아이템 등록)", () => {
  // 시즌 2 덩어리가 가운데 있고 새로 만든 시즌 2 아이템 두 개가 맨 뒤에
  const l = L("x a:S2 b:S2 y c:HW z n1:S2 n2:S2");
  assert.equal(S(normalizeOrder(l)), "x a:S2 b:S2 n1:S2 n2:S2 y c:HW z");
});
test("받은 배열 · 객체를 바꾸지 않는다", () => {
  const l = L("a:A x b:A");
  const copy = JSON.stringify(l);
  normalizeOrder(l);
  assert.equal(JSON.stringify(l), copy);
});

section("unitsOf · groupsInOrder · groupList");
test("단위 키 — 덩어리 g:<이름> · 그룹 없는 아이템 i:<id>", () => {
  const u = unitsOf(L("x a:A b:A y c:B"));
  assert.deepEqual(u.map((v) => v.key), ["i:x", "g:A", "i:y", "g:B"]);
  assert.deepEqual(u.map((v) => v.items.length), [1, 2, 1, 1]);
  assert.equal(groupUnitKey("A"), "g:A");
  assert.equal(itemUnitKey("x"), "i:x");
});
test("엉망인 데이터도 단위는 정리한 순서로", () => {
  assert.deepEqual(unitsOf(L("a:A x b:A")).map((v) => v.key), ["g:A", "i:x"]);
});
test("덩어리 차례", () => {
  assert.deepEqual(groupsInOrder(L("x b:B a:A y c:B")), ["B", "A"]);
});
test("그룹 목록 = 아이템 든 그룹(덩어리 차례) + 빈 그룹(저장 차례), 겹침 · 빈 이름 건너뜀", () => {
  assert.deepEqual(groupList(L("x b:B a:A"), ["A", "E1", "", null, "B", "E2", "E1"]), ["B", "A", "E1", "E2"]);
  assert.deepEqual(groupList([], ["E"]), ["E"]);
  assert.deepEqual(groupList(L("a:A"), undefined), ["A"]);
});

section("sameOrder · changesOf");
test("sameOrder", () => {
  assert.ok(sameOrder(L("a b c"), L("a b c")));
  assert.ok(!sameOrder(L("a b c"), L("a c b")));
  assert.ok(!sameOrder(L("a b"), L("a b c")));
});
test("바뀐 sortOrder · 그룹만 쓴다", () => {
  const before = L("a b:B c");
  const next = [before[0], before[2], { ...before[1], group: "" }];
  assert.deepEqual(changesOf(before, next), [
    { id: "c", set: { sortOrder: 1 } },
    { id: "b", set: { sortOrder: 2, group: "" } },
  ]);
  assert.deepEqual(changesOf(before, before), []);
});
test("띄엄띄엄 · 겹친 옛 sortOrder 는 0, 1, 2 … 로 맞춘다", () => {
  const before = [{ id: "a", group: "", sortOrder: 0 }, { id: "b", group: "", sortOrder: 0 }, { id: "c", group: "", sortOrder: 7 }];
  assert.deepEqual(changesOf(before, before), [{ id: "b", set: { sortOrder: 1 } }, { id: "c", set: { sortOrder: 2 } }]);
});

section("moveUnit — 그룹 머리줄(덩어리째) · 그룹 없는 아이템");
const base = () => L("x a1:A a2:A y b1:B b2:B b3:B z");
test("덩어리를 맨 앞으로(before)", () => {
  assert.equal(S(moveUnit(base(), "g:B", { before: "i:x" })), "b1:B b2:B b3:B x a1:A a2:A y z");
});
test("덩어리를 맨 뒤로(after)", () => {
  assert.equal(S(moveUnit(base(), "g:A", { after: "i:z" })), "x y b1:B b2:B b3:B z a1:A a2:A");
});
test("덩어리를 다른 덩어리 뒤로", () => {
  assert.equal(S(moveUnit(base(), "g:A", { after: "g:B" })), "x y b1:B b2:B b3:B a1:A a2:A z");
});
test("그룹 없는 아이템을 덩어리 사이로", () => {
  assert.equal(S(moveUnit(base(), "i:z", { after: "g:A" })), "x a1:A a2:A z y b1:B b2:B b3:B");
});
test("덩어리 한가운데 아이템을 기준으로 놓아도 덩어리 안으로 안 들어간다(그 덩어리 뒤 · 앞)", () => {
  assert.equal(S(moveUnit(base(), "i:x", { after: "i:b2" })), "a1:A a2:A y b1:B b2:B b3:B x z");
  assert.equal(S(moveUnit(base(), "i:z", { before: "i:a2" })), "x z a1:A a2:A y b1:B b2:B b3:B");
});
test("after 가 먼저 — 둘 다 오면 after", () => {
  assert.equal(S(moveUnit(base(), "i:x", { after: "i:y", before: "g:A" })), "a1:A a2:A y x b1:B b2:B b3:B z");
});
test("못 찾으면 null — 없는 단위 · 기준 없음 · 자기 자신 · 그룹 안 아이템을 단위로", () => {
  assert.equal(moveUnit(base(), "g:Q", { after: "i:x" }), null);
  assert.equal(moveUnit(base(), "i:x", { after: "i:nope" }), null);
  assert.equal(moveUnit(base(), "i:x", {}), null);
  assert.equal(moveUnit(base(), "i:x", { after: "i:x" }), null);
  assert.equal(moveUnit(base(), "i:a1", { after: "i:z" }), null);
});
test("엉망인 데이터에서 옮겨도 결과는 규칙대로", () => {
  const r = moveUnit(L("a:A x b:A y"), "i:y", { before: "g:A" });
  assert.equal(S(r), "y a:A b:A x");
});

section("moveInGroup — 그룹 안에서만");
test("같은 그룹 아이템 뒤 · 앞으로", () => {
  assert.equal(S(moveInGroup(base(), "b1", { after: "b3" })), "x a1:A a2:A y b2:B b3:B b1:B z");
  assert.equal(S(moveInGroup(base(), "b3", { before: "b1" })), "x a1:A a2:A y b3:B b1:B b2:B z");
  assert.equal(S(moveInGroup(base(), "a2", { before: "a1" })), "x a2:A a1:A y b1:B b2:B b3:B z");
});
test("다른 그룹 · 그룹 없는 기준 · 그룹 없는 아이템 · 없는 id 는 null", () => {
  assert.equal(moveInGroup(base(), "a1", { after: "b1" }), null);
  assert.equal(moveInGroup(base(), "a1", { after: "x" }), null);
  assert.equal(moveInGroup(base(), "x", { after: "y" }), null);
  assert.equal(moveInGroup(base(), "nope", { after: "a1" }), null);
  assert.equal(moveInGroup(base(), "a1", {}), null);
  assert.equal(moveInGroup(base(), "a1", { after: "a1" }), null);
});

section("moveToGroup — 끌어서 그룹 넣기 · 빼기 · 옮기기");
test("그룹 없음 → 그룹 두 줄 사이(놓은 자리가 곧 순서)", () => {
  assert.equal(S(moveToGroup(base(), "x", "B", { after: "b1" })), "a1:A a2:A y b1:B x:B b2:B b3:B z");
  assert.equal(S(moveToGroup(base(), "z", "B", { before: "b3" })), "x a1:A a2:A y b1:B b2:B z:B b3:B");
});
test("그룹 없음 → 덩어리 첫 줄 앞", () => {
  assert.equal(S(moveToGroup(base(), "z", "A", { before: "a1" })), "x z:A a1:A a2:A y b1:B b2:B b3:B");
});
test("접힌 머리줄 위(기준 없음) → 그 덩어리 맨 끝", () => {
  assert.equal(S(moveToGroup(base(), "y", "B")), "x a1:A a2:A b1:B b2:B b3:B y:B z");
  assert.equal(S(moveToGroup(base(), "x", "A", {})), "a1:A a2:A x:A y b1:B b2:B b3:B z");
});
test("그룹 → 밖(단위 사이 그 자리에, 그룹 없음)", () => {
  assert.equal(S(moveToGroup(base(), "b2", "", { after: "i:x" })), "x b2 a1:A a2:A y b1:B b3:B z");
  assert.equal(S(moveToGroup(base(), "b2", "", { after: "g:B" })), "x a1:A a2:A y b1:B b3:B b2 z");
  assert.equal(S(moveToGroup(base(), "b2", "", { before: "g:B" })), "x a1:A a2:A y b2 b1:B b3:B z");
  assert.equal(S(moveToGroup(base(), "b2", "", { after: "g:A" })), "x a1:A a2:A b2 y b1:B b3:B z");
  // 기준이 그룹 안 아이템이면 그 덩어리 앞 · 뒤(덩어리 한가운데로는 안 들어간다)
  assert.equal(S(moveToGroup(base(), "b2", "", { before: "i:a2" })), "x b2 a1:A a2:A y b1:B b3:B z");
});
test("그룹 → 다른 그룹(놓은 자리에)", () => {
  assert.equal(S(moveToGroup(base(), "a1", "B", { before: "b3" })), "x a2:A y b1:B b2:B a1:B b3:B z");
  assert.equal(S(moveToGroup(base(), "a1", "B", { after: "b3" })), "x a2:A y b1:B b2:B b3:B a1:B z");
  assert.equal(S(moveToGroup(base(), "b3", "A", { after: "a1" })), "x a1:A b3:A a2:A y b1:B b2:B z");
  assert.equal(S(moveToGroup(base(), "a2", "B")), "x a1:A y b1:B b2:B b3:B a2:B z");
});
test("같은 그룹이면 moveInGroup, 그룹 없는 아이템을 \"\" 로는 moveUnit 과 같다", () => {
  assert.equal(S(moveToGroup(base(), "b1", "B", { after: "b3" })), S(moveInGroup(base(), "b1", { after: "b3" })));
  assert.equal(S(moveToGroup(base(), "a2", "A", { before: "a1" })), S(moveInGroup(base(), "a2", { before: "a1" })));
  assert.equal(S(moveToGroup(base(), "z", "", { after: "g:A" })), S(moveUnit(base(), "i:z", { after: "g:A" })));
  assert.equal(S(moveToGroup(base(), "x", "", { before: "i:z" })), S(moveUnit(base(), "i:x", { before: "i:z" })));
  // 기준 없이 같은 그룹 · 그룹 없음 → 그대로
  assert.equal(S(moveToGroup(base(), "b2", "B")), S(base()));
  assert.equal(S(moveToGroup(base(), "y", "")), S(base()));
});
test("그룹에서 빼기 · 기준 없음 → 옛 덩어리 바로 뒤(assignGroup 과 같다)", () => {
  assert.equal(S(moveToGroup(base(), "a1", "")), "x a2:A a1 y b1:B b2:B b3:B z");
  assert.equal(S(moveToGroup(base(), "a1", "")), S(assignGroup(base(), ["a1"], "")));
});
test("빈 그룹이 되는 경우 — 마지막 아이템이 다른 그룹으로 · 밖으로", () => {
  const l = L("x s:S y b1:B b2:B");
  const r = moveToGroup(l, "s", "B", { after: "b1" });
  assert.equal(S(r), "x y b1:B s:B b2:B");
  assert.deepEqual(groupsInOrder(r), ["B"]);
  // 서버 그룹 목록(groupsAfter) — 빈 그룹 S 는 목록에 남는다(아이템 든 그룹 뒤)
  assert.deepEqual(groupList(r, [...groupsInOrder(l)]), ["B", "S"]);
  assert.equal(S(moveToGroup(l, "s", "B")), "x y b1:B b2:B s:B");
  assert.equal(S(moveToGroup(l, "s", "", { after: "g:B" })), "x y b1:B b2:B s");
  assert.equal(S(moveToGroup(l, "s", "", { after: "i:x" })), "x s y b1:B b2:B");
});
test("빈 그룹이 되는 경우 — 기준이 사라진 옛 덩어리면 제자리에서 빼기", () => {
  const l = L("x s:S y b1:B");
  for (const to of [{ before: "g:S" }, { after: "g:S" }]) {
    const r = moveToGroup(l, "s", "", to);
    assert.equal(S(r), "x s y b1:B");
    assert.deepEqual(changesOf(l, r), [{ id: "s", set: { group: "" } }]);
  }
  // 그 그룹에 아이템이 남아 있으면 덩어리 앞 · 뒤
  assert.equal(S(moveToGroup(L("x s:S t:S y"), "s", "", { before: "g:S" })), "x s t:S y");
});
test("거른 목록 — 보이는 이웃 기준(가운데 숨은 아이템은 뒤로)", () => {
  // B 의 b2 가 검색에 안 맞아 b1 · b3 만 보일 때 두 줄 사이 = b1 바로 뒤
  assert.equal(S(moveToGroup(base(), "x", "B", { after: "b1" })), "a1:A a2:A y b1:B x:B b2:B b3:B z");
});
test("못 찾으면 null — 없는 id · 다른 그룹 기준 · 자기 자신 · 없는 단위 · 남은 덩어리 아닌 기준", () => {
  assert.equal(moveToGroup(base(), "nope", "B", { after: "b1" }), null);
  assert.equal(moveToGroup(base(), "x", "B", { after: "a1" }), null);
  assert.equal(moveToGroup(base(), "x", "B", { after: "y" }), null);
  assert.equal(moveToGroup(base(), "b1", "B", { after: "b1" }), null);
  assert.equal(moveToGroup(base(), "a1", "B", { after: "a1" }), null);
  assert.equal(moveToGroup(base(), "b1", "", { after: "i:nope" }), null);
  assert.equal(moveToGroup(base(), "b1", "", { after: "i:b1" }), null);
  assert.equal(moveToGroup(base(), "b1", "", { after: "g:Q" }), null);
  assert.equal(moveToGroup(base(), "x", "NEW", { after: "a1" }), null);
});
test("받은 배열 · 객체를 바꾸지 않고 옮긴 것만 새 객체(sortOrder 그대로) · 저장할 것", () => {
  const l = base();
  const copy = JSON.stringify(l);
  const r = moveToGroup(l, "x", "B", { after: "b1" });
  assert.equal(JSON.stringify(l), copy);
  const moved = r.find((it) => it.id === "x");
  assert.equal(moved.group, "B");
  assert.equal(moved.sortOrder, 0);
  assert.ok(r.find((it) => it.id === "b2") === l.find((it) => it.id === "b2"));
  assert.deepEqual(changesOf(l, r).find((c) => c.id === "x").set, { sortOrder: 4, group: "B" });
});

section("groupedDrop — 묶음 표 줄 끌어 놓을 자리(app/admin/ui.tsx)");
// 화면 줄 — DataTable 과 같이: 단위마다 머리줄(키 group:<이름>) + 펼쳤으면 그 줄들, 묶지 않은 줄은 제 키
const linesOf = (list, open) => {
  const out = [];
  for (const u of unitsOf(list)) {
    if (!u.group) { const k = u.items[0].id; out.push({ key: k, head: false, group: "", open: false, unit: k }); continue; }
    const hk = `group:${u.group}`;
    const on = open.has(u.group);
    out.push({ key: hk, head: true, group: u.group, open: on, unit: hk });
    if (on) for (const it of u.items) out.push({ key: it.id, head: false, group: u.group, open: false, unit: hk });
  }
  return out;
};
const lineIdx = (lines, key) => lines.findIndex((l) => l.key === key);
// 놓기 → 저장 요청 → 새 순서 — app/admin/shop/page.tsx saveRegDrop 과 같은 갈래
const tableUnit = (k) => (k.startsWith("group:") ? groupUnitKey(k.slice(6)) : itemUnitKey(k));
const applyDrop = (list, d) => {
  const from = list.find((r) => r.id === d.moved)?.group || "";
  if (d.group) {
    const ref = d.after ? { after: d.after } : d.before ? { before: d.before } : {};
    return d.group === from ? moveInGroup(list, d.moved, ref) : moveToGroup(list, d.moved, d.group, ref);
  }
  const ref = d.after ? { after: tableUnit(d.after) } : { before: tableUnit(d.before) };
  return from ? moveToGroup(list, d.moved, "", ref) : moveUnit(list, itemUnitKey(d.moved), ref);
};
const kinds = (ts) => ts.map((t) => `${t.kind}${t.group ? `:${t.group}` : ""}@${t.p}`).join(" ");
// 줄 높이 50 으로 고른 자리(dy = 끄는 줄을 움직인 거리)
// over = 끄는 줄이 표 바닥에 닿은 뒤 손가락이 더 내려간 거리(app/admin/ui.tsx useLineDrag 와 같다)
const pickAt = (lines, from, dy, hs = lines.map(() => 50), over = 0) => {
  const tops = [];
  hs.reduce((y, h) => { tops.push(y); return y + h; }, 0);
  return pickRowTarget(lines, from, { tops, hs, c: tops[from] + hs[from] / 2 + dy, over });
};
test("펼친 덩어리 — 두 줄 사이 · 첫 줄 앞은 그 그룹 안, 마지막 줄 뒤는 안 · 밖 둘", () => {
  const list = L("x a1:A a2:A y");
  const lines = linesOf(list, new Set(["A"]));
  const ts = rowTargets(lines, 0);
  assert.equal(kinds(ts), "out@0 in:A@1 in:A@2 in:A@3 out@3 out@4");
  assert.ok(isNoopTarget(lines, 0, ts[0]));
  assert.equal(S(applyDrop(list, dropOf(lines, 0, ts[1]))), "x:A a1:A a2:A y");
  assert.equal(S(applyDrop(list, dropOf(lines, 0, ts[2]))), "a1:A x:A a2:A y");
  assert.equal(S(applyDrop(list, dropOf(lines, 0, ts[3]))), "a1:A a2:A x:A y");
  assert.equal(S(applyDrop(list, dropOf(lines, 0, ts[4]))), "a1:A a2:A x y");
  assert.equal(S(applyDrop(list, dropOf(lines, 0, ts[5]))), "a1:A a2:A y x");
});
test("접힌 머리줄 — 머리줄 위 = 그 덩어리 끝, 머리줄 앞 · 뒤 = 단위 사이", () => {
  const list = L("x a1:A a2:A y");
  const lines = linesOf(list, new Set());
  const ts = rowTargets(lines, 0);
  assert.equal(kinds(ts), "out@0 head:A@0 out@1 out@2");
  assert.deepEqual(dropOf(lines, 0, ts[1]), { moved: "x", group: "A", after: null, before: null });
  assert.equal(S(applyDrop(list, dropOf(lines, 0, ts[1]))), "a1:A a2:A x:A y");
  assert.equal(S(applyDrop(list, dropOf(lines, 0, ts[2]))), "a1:A a2:A x y");
});
test("그룹 안 줄 — 덩어리 밖으로 빼기 · 다른 그룹으로", () => {
  const list = L("x a1:A a2:A y b1:B b2:B");
  const lines = linesOf(list, new Set(["A", "B"]));
  const from = lineIdx(lines, "a2");
  const ts = rowTargets(lines, from);
  const k = ts.findIndex((t) => isNoopTarget(lines, from, t));
  // 제자리(안) 바로 다음 = 덩어리 바로 뒤(밖) — 키보드 ↓ 한 번
  assert.equal(`${ts[k].kind}@${ts[k].p}`, "in@3");
  assert.equal(S(applyDrop(list, dropOf(lines, from, ts[k + 1]))), "x a1:A a2 y b1:B b2:B");
  const intoB = ts.find((t) => t.kind === "in" && t.group === "B" && t.after === "b1");
  assert.equal(S(applyDrop(list, dropOf(lines, from, intoB))), "x a1:A y b1:B a2:B b2:B");
  // 접힌 B 머리줄 위 → B 끝
  const closed = linesOf(list, new Set(["A"]));
  const head = rowTargets(closed, lineIdx(closed, "a1")).find((t) => t.kind === "head");
  assert.equal(S(applyDrop(list, dropOf(closed, lineIdx(closed, "a1"), head))), "x a2:A y b1:B b2:B a1:B");
});
test("그룹의 마지막 아이템 — 빼면 그 그룹은 빈 그룹(제자리 · 앞 · 뒤)", () => {
  const list = L("s:S y");
  const lines = linesOf(list, new Set(["S"]));
  const ts = rowTargets(lines, 1);
  assert.equal(kinds(ts), "out@0 in:S@1 out@2");
  assert.deepEqual(dropOf(lines, 1, ts[0]), { moved: "s", group: "", after: null, before: "group:S" });
  assert.equal(S(applyDrop(list, dropOf(lines, 1, ts[0]))), "s y");
  assert.ok(isNoopTarget(lines, 1, ts[1]));
  assert.equal(S(applyDrop(list, dropOf(lines, 1, ts[2]))), "y s");
});
test("손가락 자리 — 이웃 가운데를 지나면 한 칸, 마지막 줄 아래 틈은 위쪽 반 안 · 아래쪽 반 밖", () => {
  const lines = linesOf(L("x a1:A a2:A y"), new Set(["A"])); // x H a1 a2 y — 높이 50
  const y = 4;
  assert.equal(pickAt(lines, y, -3).target.kind, "out"); // 가운데 둘레 — 그대로(그룹 없음)
  assert.ok(isNoopTarget(lines, y, pickAt(lines, y, -3).target));
  assert.deepEqual([pickAt(lines, y, -30).target.kind, pickAt(lines, y, -30).target.group, pickAt(lines, y, -30).to], ["in", "A", 4]); // 위로 조금 — A 끝
  const up = pickAt(lines, y, -60); // a2 가운데를 지남 — a1 · a2 사이
  assert.deepEqual([up.target.kind, up.target.after, up.target.before, up.to], ["in", "a1", "a2", 3]);
  // x 를 아래로 — 펼친 머리줄은 그냥 줄(가운데를 지나면 그 묶음 첫 줄 앞)
  assert.equal(pickAt(lines, 0, 40).target.kind, "out");
  assert.deepEqual([pickAt(lines, 0, 55).target.kind, pickAt(lines, 0, 55).target.before], ["in", "a1"]);
  // a2(마지막 줄)를 아래로 조금 — 덩어리 밖, 위로 조금 — 그대로
  const a2 = 3;
  assert.equal(pickAt(lines, a2, 20).target.kind, "out");
  assert.ok(isNoopTarget(lines, a2, pickAt(lines, a2, -20).target));
});
test("손가락 자리 — 접힌 머리줄 가운데 반 위는 머리줄(그 줄은 비켜서지 않음)", () => {
  const lines = linesOf(L("x a1:A y"), new Set()); // x H y
  const on = pickAt(lines, 0, 50);
  assert.deepEqual([on.target.kind, on.target.group, on.to], ["head", "A", 0]);
  const past = pickAt(lines, 0, 70);
  assert.deepEqual([past.target.kind, past.target.after, past.to], ["out", "group:A", 1]);
  const fromBelow = pickAt(lines, 2, -50);
  assert.deepEqual([fromBelow.target.kind, fromBelow.to], ["head", 2]);
});
test("손가락 자리 — 표 끝은 맨 아래까지 끌면 지금 그룹 그대로(같은 덩어리 맨 끝으로 옮기기 그대로)", () => {
  const list = L("x a1:A a2:A");
  const lines = linesOf(list, new Set(["A"])); // x H a1 a2
  // a1 을 맨 아래로(끝까지 — dy 50) → A 안 a2 뒤
  const a1 = pickAt(lines, 2, 50);
  assert.deepEqual([a1.target.kind, a1.target.group, a1.target.after], ["in", "A", "a2"]);
  assert.equal(S(applyDrop(list, dropOf(lines, 2, a1.target))), "x a2:A a1:A");
  // 높이가 달라도(끄는 줄이 더 낮다) 맨 아래면 그대로
  const short = pickAt(lines, 2, 60, [50, 50, 40, 60]);
  assert.equal(short.target.kind, "in");
  // 그룹 없는 x 를 맨 아래로 → 그룹 없음 그대로(덩어리 뒤)
  const x = pickAt(lines, 0, 150);
  assert.deepEqual([x.target.kind, x.target.after], ["out", "group:A"]);
  assert.equal(pickAt(lines, 0, 150, undefined, 40).target.kind, "out");
});
test("손가락 자리 — 표 끝에서 표 아래로 반 줄 넘게 끌어내면 맨 끝 덩어리에서도 빠진다", () => {
  const list = L("x a1:A a2:A");
  const lines = linesOf(list, new Set(["A"])); // x H a1 a2
  // a1 — 바닥에 닿은 뒤 반 줄(25) 이하면 그대로 A 끝, 넘으면 A 뒤(표 끝)
  assert.equal(pickAt(lines, 2, 50, undefined, 20).target.kind, "in");
  const out = pickAt(lines, 2, 50, undefined, 30);
  assert.deepEqual([out.target.kind, out.target.after, out.to], ["out", "group:A", 3]);
  assert.equal(S(applyDrop(list, dropOf(lines, 2, out.target))), "x a2:A a1");
  // 마지막 줄 a2 자신 — 끄는 줄은 못 내려가도 손가락을 표 아래로 끌어내면 밖
  assert.ok(isNoopTarget(lines, 3, pickAt(lines, 3, 0, undefined, 20).target));
  const last = pickAt(lines, 3, 0, undefined, 30);
  assert.equal(last.target.kind, "out");
  assert.equal(S(applyDrop(list, dropOf(lines, 3, last.target))), "x a1:A a2");
  // 표 끝이 아니면 over 는 보지 않는다(가운데 틈은 위쪽 반 · 아래쪽 반 그대로)
  const mid = linesOf(L("x a1:A a2:A y"), new Set(["A"])); // x H a1 a2 y
  assert.equal(pickAt(mid, 2, 50, undefined, 99).target.kind, "in");
});
test("틈 하나의 자리 — 머리줄 · 줄 이웃", () => {
  const lines = linesOf(L("a1:A b1:B"), new Set(["A", "B"])); // HA a1 HB b1
  // b1 을 끌 때 — a1 아래 틈은 A 끝 · A 뒤 둘, HB 바로 아래(b1 이 B 의 하나뿐) = B 안 제자리
  assert.equal(kinds(gapTargets(lines, 3, 2)), "in:A@2 out@2");
  assert.deepEqual(gapTargets(lines, 3, 2)[1], { p: 2, kind: "out", group: "", after: "group:A", before: "group:B" });
  assert.deepEqual(gapTargets(lines, 3, 3), [{ p: 3, kind: "in", group: "B", after: null, before: null }]);
  // a1 을 끌 때 — HB 아래 = B 첫 줄 앞
  assert.deepEqual(gapTargets(lines, 1, 2), [{ p: 2, kind: "in", group: "B", after: null, before: "b1" }]);
  assert.deepEqual(rowTargets(lines, 0), []); // 머리줄은 이 끌기가 아니다
});
test("무작위 표 — 놓을 수 있는 모든 자리: 덩어리 붙음 · 아이템 그대로 · 제자리만 그대로 · 놓은 그룹", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const groups = ["A", "B", "C"];
  let checked = 0;
  for (let round = 0; round < 300; round++) {
    const list = normalizeOrder(Array.from({ length: 2 + rnd(8) }, (_, i) => ({ id: `t${i}`, group: rnd(2) ? groups[rnd(3)] : "", sortOrder: i })));
    const open = new Set(groups.filter(() => rnd(2)));
    const lines = linesOf(list, open);
    lines.forEach((l, from) => {
      if (l.head) return;
      for (const t of rowTargets(lines, from)) {
        const next = applyDrop(list, dropOf(lines, from, t));
        assert.ok(next, `null: ${S(list)} ${l.key} ${kinds([t])}`);
        assert.ok(contiguous(next), `덩어리 깨짐: ${S(next)}`);
        assert.ok(sameSet(next, list));
        const same = S(next) === S(list);
        assert.equal(same, isNoopTarget(lines, from, t), `제자리 판정: ${S(list)} | ${l.key} ${kinds([t])} → ${S(next)}`);
        assert.equal(next.find((it) => it.id === l.key).group || "", t.kind === "out" ? "" : t.group);
        checked++;
      }
    });
  }
  assert.ok(checked > 1000);
});

section("orderGroupBlocks — 그룹 관리 창 차례");
test("덩어리 자리 안에서만 바꿔 끼우고 그룹 없는 아이템은 제자리", () => {
  const l = L("x a1:A y b1:B b2:B c1:C z");
  assert.equal(S(orderGroupBlocks(l, ["C", "A", "B"])), "x c1:C y a1:A b1:B b2:B z");
});
test("목록에 없는 그룹은 뒤에 지금 차례로 · 빈 그룹 이름 · 겹친 이름은 무시", () => {
  const l = L("a1:A b1:B x c1:C");
  assert.equal(S(orderGroupBlocks(l, ["C", "EMPTY", "C", ""])), "c1:C a1:A x b1:B");
});
test("names 가 비면 그대로", () => {
  const l = L("x a1:A b1:B");
  assert.equal(S(orderGroupBlocks(l, [])), S(l));
  assert.equal(S(orderGroupBlocks(l, null)), S(l));
});

section("assignGroup — 그룹 지정 · 아이템 수정의 그룹 칸");
test("있는 그룹으로 — 그 덩어리 끝에(고른 차례가 아니라 목록 차례로)", () => {
  assert.equal(S(assignGroup(base(), ["z", "x"], "A")), "a1:A a2:A x:A z:A y b1:B b2:B b3:B");
});
test("다른 그룹에서 옮겨 와도 그 덩어리 끝에(옛 덩어리는 붙은 채)", () => {
  assert.equal(S(assignGroup(base(), ["b2"], "A")), "x a1:A a2:A b2:A y b1:B b3:B z");
});
test("이미 그 그룹인 것은 제자리 — 새로 든 것만 끝에", () => {
  assert.equal(S(assignGroup(base(), ["a1", "y"], "A")), "x a1:A a2:A y:A b1:B b2:B b3:B z");
});
test("아이템이 없는 새 그룹 — 옮기는 것 중 맨 앞 자리에서 시작", () => {
  assert.equal(S(assignGroup(base(), ["z", "y"], "N")), "x a1:A a2:A y:N z:N b1:B b2:B b3:B");
});
test("새 그룹 시작 자리가 다른 덩어리 한가운데면 그 덩어리 바로 뒤", () => {
  assert.equal(S(assignGroup(base(), ["b2"], "N")), "x a1:A a2:A y b1:B b3:B b2:N z");
  assert.equal(S(assignGroup(base(), ["b2", "x"], "N")), "x:N b2:N a1:A a2:A y b1:B b3:B z");
});
test("그룹에서 빼기 — 옛 덩어리 바로 뒤에", () => {
  assert.equal(S(assignGroup(base(), ["b1"], "")), "x a1:A a2:A y b2:B b3:B b1 z");
  assert.equal(S(assignGroup(base(), ["a1", "b2", "x"], "")), "x a2:A a1 y b1:B b3:B b2 z");
});
test("덩어리째 빼면 제자리", () => {
  assert.equal(S(assignGroup(base(), ["a1", "a2"], "")), "x a1 a2 y b1:B b2:B b3:B z");
});
test("바뀌는 게 없으면 같은 순서 · 없는 id 는 무시", () => {
  assert.equal(S(assignGroup(base(), ["a1"], "A")), S(base()));
  assert.equal(S(assignGroup(base(), ["x"], "")), S(base()));
  assert.equal(S(assignGroup(base(), ["nope"], "A")), S(base()));
  assert.equal(S(assignGroup(base(), null, "A")), S(base()));
});
test("받은 객체를 바꾸지 않고 그룹이 바뀐 것만 새 객체", () => {
  const l = base();
  const copy = JSON.stringify(l);
  const r = assignGroup(l, ["x"], "B");
  assert.equal(JSON.stringify(l), copy);
  assert.equal(r.find((it) => it.id === "x").group, "B");
  assert.ok(r.find((it) => it.id === "a1") === l.find((it) => it.id === "a1"));
  assert.equal(r.find((it) => it.id === "x").sortOrder, 0);
});
test("저장할 것 — 그룹 · 자리가 바뀐 것만", () => {
  const l = base();
  const r = assignGroup(l, ["x"], "B");
  assert.equal(S(r), "a1:A a2:A y b1:B b2:B b3:B x:B z");
  assert.deepEqual(changesOf(l, r).map((c) => c.id), ["a1", "a2", "y", "b1", "b2", "b3", "x"]);
  assert.deepEqual(changesOf(l, r).find((c) => c.id === "x").set, { sortOrder: 6, group: "B" });
});

section("renameGroup · deleteGroup · appendItem");
test("이름 바꾸기 — 순서 그대로", () => {
  const r = renameGroup(base(), "A", "A2");
  assert.equal(S(r), "x a1:A2 a2:A2 y b1:B b2:B b3:B z");
  assert.ok(sameOrder(r, base()));
});
test("같은 이름으로 · 빈 이름 from 은 그대로", () => {
  assert.equal(S(renameGroup(base(), "A", "A")), S(base()));
  assert.equal(S(renameGroup(base(), "", "Q")), S(base()));
});
test("그룹 삭제 — 제자리에서 그룹 없음", () => {
  const r = deleteGroup(base(), "B");
  assert.equal(S(r), "x a1:A a2:A y b1 b2 b3 z");
  assert.ok(sameOrder(r, base()));
});
test("새 아이템 — 맨 뒤, 그룹이 있으면 그 덩어리 끝", () => {
  assert.equal(S(appendItem([...base(), { id: "n", group: "" }], "n")), "x a1:A a2:A y b1:B b2:B b3:B z n");
  assert.equal(S(appendItem([...base(), { id: "n", group: "A" }], "n")), "x a1:A a2:A n:A y b1:B b2:B b3:B z");
  assert.equal(S(appendItem([...base(), { id: "n", group: "NEW" }], "n")), "x a1:A a2:A y b1:B b2:B b3:B z n:NEW");
  // 저장 순서가 맨 뒤가 아니어도(999 상한 등) 맨 뒤로 본다
  assert.equal(S(appendItem([{ id: "n", group: "" }, ...base()], "n")), "x a1:A a2:A y b1:B b2:B b3:B z n");
});

section("무작위 — 어떤 작업 뒤에도 같은 그룹은 붙어 있고 아이템은 그대로");
test("작업 3000번", () => {
  let seed = 20261011;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const groups = ["A", "B", "C", "D"];
  let list = Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, group: rnd(3) ? groups[rnd(4)] : "", sortOrder: rnd(5) }));
  const start = list;
  list = normalizeOrder(list);
  assert.ok(contiguous(list));
  for (let step = 0; step < 3000; step++) {
    const units = unitsOf(list);
    const pickId = () => list[rnd(list.length)].id;
    let next = null;
    switch (rnd(7)) {
      case 0: {
        const u = units[rnd(units.length)];
        const ref = units[rnd(units.length)];
        next = moveUnit(list, u.key, rnd(2) ? { after: ref.key } : { before: rnd(2) ? ref.key : `i:${pickId()}` });
        break;
      }
      case 1: next = moveInGroup(list, pickId(), rnd(2) ? { after: pickId() } : { before: pickId() }); break;
      case 2: next = orderGroupBlocks(list, [...groups].sort(() => rnd(3) - 1)); break;
      case 3: next = assignGroup(list, [pickId(), pickId()], rnd(4) ? groups[rnd(4)] : ""); break;
      case 4: next = rnd(2) ? deleteGroup(list, groups[rnd(4)]) : renameGroup(list, groups[rnd(4)], `${groups[rnd(4)]}`); break;
      case 5: {
        // 끌어서 그룹 넣기 · 빼기 · 옮기기 — 그룹 안은 아이템 id 기준, 밖은 단위 키 기준(맞지 않는 기준은 null)
        const g = rnd(3) ? groups[rnd(4)] : "";
        const ref = g ? pickId() : rnd(2) ? units[rnd(units.length)].key : `i:${pickId()}`;
        const r = rnd(3);
        next = moveToGroup(list, pickId(), g, r === 0 ? {} : r === 1 ? { after: ref } : { before: ref });
        break;
      }
      default: next = appendItem(list, pickId());
    }
    if (next == null) continue;
    assert.ok(contiguous(next), `덩어리 깨짐: ${S(next)}`);
    assert.ok(sameSet(next, start), "아이템 수가 바뀜");
    assert.ok(sameOrder(normalizeOrder(next), next), "정리하면 또 바뀜");
    list = next;
  }
});

// ══════════════════════════════════════════════════════
section("상위 그룹 — 같은 상위의 그룹 덩어리는 늘 이어져 있다(nestParents · parentUnitsOf · orderParentBlocks)");
// 상위 이어짐 검사 — 같은 상위의 덩어리 사이에 다른 단위가 끼지 않는다
const nested = (list, pmap) => {
  const seen = new Set();
  let prev = null;
  for (const u of unitsOf(list)) {
    const p = parentOfGroup(pmap, u.group);
    if (p && p !== prev) { if (seen.has(p)) return false; seen.add(p); }
    prev = p || null;
  }
  return true;
};
test("떨어진 같은 상위 그룹을 첫 그룹 자리로 모은다 · 그 안 그룹 차례 · 나머지는 그대로", () => {
  const P = { A: "H", C: "H" };
  const list = L("a1:A x b1:B c1:C a2:A y");
  const r = nestParents(list, P);
  assert.equal(S(r), "a1:A a2:A c1:C x b1:B y");
  assert.ok(nested(r, P));
  assert.ok(sameOrder(nestParents(r, P), r), "두 번 해도 같다");
});
test("상위가 없으면 normalizeOrder 와 같다 · Map 도 된다 · 없는 키(constructor)는 상위 없음", () => {
  const list = L("a1:A x a2:A b1:B");
  assert.ok(sameOrder(nestParents(list, null), normalizeOrder(list)));
  assert.equal(S(nestParents(L("a1:A b1:B c1:C"), new Map([["A", "H"], ["C", "H"]]))), "a1:A c1:C b1:B");
  assert.equal(S(nestParents(L("a1:constructor x b1:toString"), {})), "a1:constructor x b1:toString");
});
test("parentUnitsOf — 상위 덩어리 하나 · 상위 없는 단위 하나씩", () => {
  const P = { A: "H", B: "H", D: "K" };
  const r = parentUnitsOf(L("a1:A b1:B x c1:C d1:D"), P);
  assert.deepEqual(r.map((s) => [s.parent, s.units.map((u) => u.key).join(",")]), [["H", "g:A,g:B"], ["", "i:x"], ["", "g:C"], ["K", "g:D"]]);
});
test("orderParentBlocks — 상위 덩어리 자리 안에서만 바꿔 끼운다(상위 없는 단위는 제자리)", () => {
  const P = { A: "H", B: "H", D: "K" };
  const list = L("a1:A b1:B x d1:D y c1:C");
  assert.equal(S(orderParentBlocks(list, ["K", "H"], P)), "d1:D x a1:A b1:B y c1:C");
  assert.equal(S(orderParentBlocks(list, ["H", "K"], P)), S(nestParents(list, P)));
  assert.equal(S(orderParentBlocks(list, [], P)), S(nestParents(list, P)), "모르는 차례면 지금 차례");
});

section("자동 정렬 — 유형 → 상위 덩어리 → 상위 없는 그룹 → 그룹 없는 아이템, 그룹 안은 등급 차례(autoSortOrder)");
const TYPES = ["role", "perk", "item", "cosmetic", "physical"];
// "id:그룹/유형/등급" — 등급 없으면 생략
const T = (spec) => spec.split(" ").filter(Boolean).map((tok, i) => {
  const [id, rest = ""] = tok.split(":");
  const [group = "", type = "item", rank] = rest.split("/");
  return { id, group, type, rank: rank === undefined || rank === "" ? -1 : Number(rank), sortOrder: i };
});
test("유형 차례 — 꾸미기 · 역할 · 아이템이 섞인 목록이 역할 → 권한 → 아이템 → 꾸미기 → 기프트카드로", () => {
  const r = autoSortOrder(T("c1:/cosmetic r1:/role i1:/item c2:/cosmetic p1:/perk g1:/physical"), { typeOrder: TYPES });
  assert.equal(ids(r), "r1 p1 i1 c1 c2 g1");
});
test("한 유형 안: 상위 덩어리(parents 차례) → 상위 없는 그룹(지금 차례) → 그룹 없는 아이템", () => {
  const P = { A: "H", B: "K", C: "K" };
  const list = T("x:/cosmetic a1:A/cosmetic d1:D/cosmetic b1:B/cosmetic c1:C/cosmetic y:/cosmetic");
  const r = autoSortOrder(list, { typeOrder: TYPES, parents: ["K", "H"], parentOf: P });
  assert.equal(ids(r), "b1 c1 a1 d1 x y");
  assert.ok(nested(r, P) && contiguous(r));
});
test("섞인 그룹은 아이템이 가장 많은 유형 자리로 덩어리째 · 같으면 앞선 유형", () => {
  const list = T("i1:/item m1:M/cosmetic m2:M/cosmetic m3:M/item r1:/role n1:N/role n2:N/item");
  const r = autoSortOrder(list, { typeOrder: TYPES });
  assert.equal(ids(r), "n1 n2 r1 i1 m1 m2 m3");
});
test("그룹 안 — 등급 아이템 자리에 등급 차례로, 등급 없는 아이템은 제자리", () => {
  const list = T("t9:F/cosmetic/9 z:F/cosmetic t1:F/cosmetic/1 t4:F/cosmetic/4");
  assert.equal(ids(autoSortOrder(list, { typeOrder: TYPES })), "t1 z t4 t9");
});
test("그룹 없는 아이템은 등급이 있어도 지금 차례 · 모르는 유형은 맨 뒤", () => {
  const list = T("q:/weird t9:/cosmetic/9 t1:/cosmetic/1");
  assert.equal(ids(autoSortOrder(list, { typeOrder: TYPES })), "t9 t1 q");
});
test("무작위 400번 — 아이템 수 · 그룹 덩어리 · 상위 덩어리 유지, 한 번 더 정렬해도 같다", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  const groups = ["A", "B", "C", "D", "E"];
  for (let k = 0; k < 400; k++) {
    const P = { A: rnd(2) ? "H" : "", B: rnd(2) ? "H" : "K", C: rnd(3) ? "K" : "", D: "", E: rnd(2) ? "H" : "" };
    const parents = rnd(2) ? ["H", "K"] : ["K"];
    const n = 3 + rnd(12);
    const list = normalizeOrder(Array.from({ length: n }, (_, i) => ({ id: "i" + i, group: rnd(3) ? groups[rnd(5)] : "", type: TYPES[rnd(5)], rank: rnd(3) ? -1 : rnd(10), sortOrder: i })));
    const r = autoSortOrder(list, { typeOrder: TYPES, parents, parentOf: P });
    assert.ok(sameSet(r, list), "아이템 수");
    assert.ok(contiguous(r), "그룹 덩어리: " + S(r));
    assert.ok(nested(r, P), "상위 덩어리: " + S(r));
    const twice = autoSortOrder(r, { typeOrder: TYPES, parents, parentOf: P });
    assert.ok(sameOrder(twice, r), "두 번 정렬해도 같다: " + S(r) + " / " + S(twice));
  }
});

test("pin — 상위 안 그룹 하나를 밖으로 끌면 그 그룹이 형제 곁으로(상위 전체가 딸려가지 않는다)", () => {
  const P = { A: "H", B: "H" };
  // 처음: x a1:A b1:B y  →  A 를 맨 앞으로 끈 뒤(a1 x b1 y)
  const dragged = L("a1:A x b1:B y");
  assert.equal(S(nestParents(dragged, P)), "a1:A b1:B x y", "pin 없으면 첫 덩어리(A) 자리로 상위가 딸려 온다");
  assert.equal(S(nestParents(dragged, P, "A")), "x a1:A b1:B y", "pin 이면 형제(B) 자리 — 형제보다 앞이었으니 앞");
  assert.equal(S(nestParents(L("x b1:B y a1:A"), P, "A")), "x b1:B a1:A y", "형제보다 뒤에 놓으면 형제 뒤");
  assert.equal(S(nestParents(L("a1:A x y"), { A: "H" }, "A")), "a1:A x y", "형제가 없으면 그 자리");
  assert.equal(S(nestParents(L("a1:A x c1:C"), { A: "H", C: "K" }, "A")), "a1:A x c1:C", "다른 상위는 그대로");
});

test("parentList — 목록 덩어리 차례 뒤에 그룹 없는 상위(저장 차례)", () => {
  const P = { A: "H", B: "K" };
  assert.deepEqual(parentList(L("b1:B x a1:A"), P, ["H", "K", "E"]), ["K", "H", "E"]);
  assert.deepEqual(parentList(L("x y"), {}, ["H"]), ["H"]);
});
test("orderGroupsNested — 그룹 없는 아이템은 제자리 · 상위 덩어리는 통째로 · 상위 안 차례는 names 대로", () => {
  const P = { a: "P", b: "P" };
  // 검토 사례: a1 a2(상위 P) · y(그룹 없음) · c1 — names [a, c, b] 로 끌어도 y 는 제자리
  const list = L("a1:a b1:b y c1:c");
  assert.equal(S(orderGroupsNested(list, ["a", "c", "b"], P)), "a1:a b1:b y c1:c", "다른 상위 사이로 끈 c 는 제자리 · y 그대로");
  assert.equal(S(orderGroupsNested(list, ["c", "a", "b"], P)), "c1:c y a1:a b1:b", "c 를 맨 앞으로 — 상위 덩어리와 자리 바꿈, y 는 그 자리");
  assert.equal(S(orderGroupsNested(list, ["b", "a", "c"], P)), "b1:b a1:a y c1:c", "상위 안 차례");
  const flat = L("a1:A x b1:B c1:C");
  assert.equal(S(orderGroupsNested(flat, ["C", "A", "B"], {})), S(orderGroupBlocks(flat, ["C", "A", "B"])), "상위가 없으면 orderGroupBlocks 와 같다");
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(`failed: ${fails.join(" | ")}`); process.exit(1); }
