// lib/shopThemes.js 검사 — node scripts/test-shop-themes.mjs
//    이벤트 테마 목록(Setting "shopThemes")의 모양 · 기본값 · 이름 검사 · 작업(만들기 · 이름 · 삭제 · 차례 · 켜기 — 켬 2개 상한) · 고르기 칸 보기. DB · 서버 없이 돈다.
import assert from "node:assert/strict";
import {
  THEMES_KEY, THEME_NAME_MAX, THEME_ON_MAX, THEME_MAX, THEME_ON_LIMIT_MESSAGE, DEFAULT_THEMES, BUILTIN_BANNER_THEME, RESERVED_THEME_KEYS,
  isThemeKey, normalizeThemeName, themeNameError, normalizeThemes, themesFromSetting, loadThemesWith,
  themeOf, themeNameOf, onThemes, themeKeyOf, themePickOptions, newThemeKey, applyThemeOp, sameThemes,
} from "../lib/shopThemes.js";

let pass = 0;
const fails = [];
const test = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fails.push(name); console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").join("\n       ")}`); }
};
const section = (t) => console.log(`\n[${t}]`);
// 정해진 무작위 — 차례대로 값을 돌려준다
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const keysOf = (list) => list.map((t) => t.key).join(" ");
const HW = { key: "halloween", name: "할로윈", on: true };

section("기본값 · 모양");
await test("설정 키 · 상한 값", () => {
  assert.equal(THEMES_KEY, "shopThemes");
  assert.equal(THEME_NAME_MAX, 8);
  assert.equal(THEME_ON_MAX, 2);
  assert.equal(BUILTIN_BANNER_THEME, "halloween");
  assert.match(THEME_ON_LIMIT_MESSAGE, /2개까지/);
});
await test("설정이 없으면 할로윈 하나 켬(지금 동작 그대로)", () => {
  assert.deepEqual(themesFromSetting(undefined), [HW]);
  assert.deepEqual(themesFromSetting(null), [HW]);
  assert.deepEqual(themesFromSetting({ bad: 1 }), [HW]);
  assert.deepEqual(DEFAULT_THEMES, [HW]);
});
await test("기본값은 복사본 — 고쳐도 DEFAULT_THEMES 가 안 바뀐다", () => {
  const a = themesFromSetting(undefined);
  a[0].name = "바뀜";
  assert.equal(DEFAULT_THEMES[0].name, "할로윈");
  assert.ok(Object.isFrozen(DEFAULT_THEMES));
});
await test("다 지운 빈 배열은 빈 목록 그대로(기본으로 되살리지 않는다)", () => {
  assert.deepEqual(themesFromSetting([]), []);
});
await test("키 모양 — [a-z0-9_] 24자 · 예약어 · 하이픈 안 됨", () => {
  for (const k of ["halloween", "t1a2b3c", "chuseok_2026", "a", "x".repeat(24)]) assert.ok(isThemeKey(k), k);
  for (const k of ["", "Halloween", "t-1", "한글", "x".repeat(25), " t1", "-gone", null, undefined, 3]) assert.ok(!isThemeKey(k), String(k));
  for (const k of RESERVED_THEME_KEYS) assert.ok(!isThemeKey(k), k);
  for (const k of ["home", "all", "season", "timed", "role", "perk", "item", "cosmetic", "physical", "bundle", "any"]) assert.ok(RESERVED_THEME_KEYS.includes(k), k);
});
await test("이름 — 공백 정리 · 8자 · 한글/영문/숫자만", () => {
  assert.equal(normalizeThemeName("  추석   이벤트 "), "추석 이벤트");
  assert.equal(themeNameError("할로윈"), "");
  assert.equal(themeNameError("Xmas 26"), "");
  assert.notEqual(themeNameError("Xmas 2026"), ""); // 9자(공백 포함)
  assert.equal(themeNameError("가나다라마바사아"), ""); // 8자
  assert.notEqual(themeNameError("가나다라마바사아자"), ""); // 9자
  assert.notEqual(themeNameError(""), "");
  assert.notEqual(themeNameError("   "), "");
  assert.notEqual(themeNameError("🎃할로윈"), "");
  assert.notEqual(themeNameError("할로윈!"), "");
});
await test("목록 정리 — 틀린 줄 · 겹친 키 버림, 틀린 이름은 키로, 켬은 앞에서 2개까지", () => {
  const out = normalizeThemes([
    { key: "halloween", name: "할로윈", on: true },
    { key: "halloween", name: "겹침", on: true },
    { key: "Bad", name: "대문자", on: true },
    { key: "home", name: "예약", on: true },
    { key: "t1", name: "", on: true },
    { key: "t2", name: "추석", on: true },
    { key: "t3", name: "설날", on: "yes" },
    null, 5, "x",
  ]);
  assert.deepEqual(out, [
    { key: "halloween", name: "할로윈", on: true },
    { key: "t1", name: "t1", on: true },
    { key: "t2", name: "추석", on: false },
    { key: "t3", name: "설날", on: false },
  ]);
});
await test("목록 정리 — THEME_MAX 개까지", () => {
  const raw = Array.from({ length: THEME_MAX + 5 }, (_, i) => ({ key: `t${i}`, name: `테마${i}`, on: false }));
  assert.equal(normalizeThemes(raw).length, THEME_MAX);
});
await test("서버 읽기 — findOne 을 받아 설정 값을 목록으로(문서 없음 = 기본)", async () => {
  const calls = [];
  const none = await loadThemesWith(async (f, o) => { calls.push([f, o]); return null; });
  assert.deepEqual(none, [HW]);
  assert.deepEqual(calls, [[{ key: "shopThemes" }, { select: { value: 1 } }]]);
  const some = await loadThemesWith(async () => ({ value: [{ key: "t9", name: "추석", on: false }] }));
  assert.deepEqual(some, [{ key: "t9", name: "추석", on: false }]);
});

section("찾기");
const L = [HW, { key: "t2", name: "추석", on: false }, { key: "t3", name: "설날", on: true }];
await test("themeOf · themeNameOf · onThemes", () => {
  assert.equal(themeOf(L, "t2")?.name, "추석");
  assert.equal(themeOf(L, "nope"), null);
  assert.equal(themeOf(L, ""), null);
  assert.equal(themeNameOf(L, "halloween"), "할로윈");
  assert.equal(themeNameOf(L, "gone"), "");
  assert.equal(themeNameOf(L, undefined), "");
  assert.equal(keysOf(onThemes(L)), "halloween t3");
});
await test("themeKeyOf — 있는 키(꺼진 테마 포함)만, 지운 키 · 이상한 값은 테마 없음", () => {
  assert.equal(themeKeyOf(L, "halloween"), "halloween");
  assert.equal(themeKeyOf(L, "t2"), "t2"); // 꺼진 테마도 고를 수 있다
  assert.equal(themeKeyOf(L, "gone"), "");
  assert.equal(themeKeyOf(L, ""), "");
  assert.equal(themeKeyOf(L, null), "");
  assert.equal(themeKeyOf(L, { key: "t2" }), "");
  assert.equal(themeKeyOf([], "halloween"), "");
});
await test("고르기 칸 보기 — 없음 + 테마 차례 · 꺼짐 표시 · 지운 테마 자리", () => {
  assert.deepEqual(themePickOptions(L, ""), [
    { value: "", label: "없음" },
    { value: "halloween", label: "할로윈" },
    { value: "t2", label: "추석", hint: "꺼짐" },
    { value: "t3", label: "설날" },
  ]);
  const gone = themePickOptions(L, "tgone");
  assert.deepEqual(gone.at(-1), { value: "tgone", label: "지운 테마" });
  assert.equal(themePickOptions([], "").length, 1);
});
await test("새 키 — t + 6자, 예약어 · 겹치는 키는 다시 뽑는다", () => {
  const k = newThemeKey([], seq(0));
  assert.equal(k, "taaaaaa");
  assert.ok(isThemeKey(k));
  // 첫 번째가 겹치면 다음 값으로
  const k2 = newThemeKey([{ key: "taaaaaa", name: "a", on: false }], seq(0, 0, 0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99));
  assert.equal(k2, "t999999");
  for (let i = 0; i < 200; i++) assert.ok(isThemeKey(newThemeKey(L)));
});

section("작업");
await test("만들기 — 꺼진 채 맨 뒤 · 키는 새로", () => {
  const r = applyThemeOp([HW], { op: "create", name: " 추석 " }, { rand: seq(0.5) });
  assert.ok(r.ok);
  assert.equal(r.list.length, 2);
  assert.deepEqual(r.list[0], HW);
  assert.equal(r.theme.name, "추석");
  assert.equal(r.theme.on, false);
  assert.ok(isThemeKey(r.theme.key) && r.theme.key.startsWith("t"));
  assert.deepEqual(r.list[1], r.theme);
});
await test("만들기 — 이름 오류 · 같은 이름(대소문자 무시) · 개수 상한", () => {
  assert.equal(applyThemeOp([HW], { op: "create", name: "" }).ok, false);
  assert.equal(applyThemeOp([HW], { op: "create", name: "가나다라마바사아자" }).ok, false);
  assert.equal(applyThemeOp([HW], { op: "create", name: "할로윈" }).message, "같은 이름의 테마가 있습니다.");
  assert.equal(applyThemeOp([{ key: "t1", name: "Xmas", on: false }], { op: "create", name: "xmas" }).ok, false);
  const full = Array.from({ length: THEME_MAX }, (_, i) => ({ key: `t${i}`, name: `테마${i}`, on: false }));
  assert.match(applyThemeOp(full, { op: "create", name: "하나 더" }).message, /20개까지/);
});
await test("만들기 — 켬이 꽉 차 있어도 만들 수 있다(꺼진 채)", () => {
  const two = [HW, { key: "t3", name: "설날", on: true }];
  const r = applyThemeOp(two, { op: "create", name: "추석" });
  assert.ok(r.ok);
  assert.equal(onThemes(r.list).length, 2);
});
await test("이름 바꾸기 — 키 · 켬 · 차례 그대로", () => {
  const r = applyThemeOp(L, { op: "rename", key: "t2", name: "한가위" });
  assert.ok(r.ok);
  assert.deepEqual(r.list[1], { key: "t2", name: "한가위", on: false });
  assert.equal(keysOf(r.list), keysOf(L));
  // 제 이름으로는 된다 · 남의 이름은 안 된다 · 없는 키 · 틀린 이름
  assert.ok(applyThemeOp(L, { op: "rename", key: "t2", name: "추석" }).ok);
  assert.equal(applyThemeOp(L, { op: "rename", key: "t2", name: "설날" }).ok, false);
  assert.equal(applyThemeOp(L, { op: "rename", key: "nope", name: "새 이름" }).message, "테마를 찾을 수 없습니다.");
  assert.equal(applyThemeOp(L, { op: "rename", key: "t2", name: "" }).ok, false);
});
await test("삭제 — 그 줄만 빠진다(상품 · 배너는 건드리지 않는다 — 순수 계산이라 목록만)", () => {
  const r = applyThemeOp(L, { op: "delete", key: "halloween" });
  assert.ok(r.ok);
  assert.equal(keysOf(r.list), "t2 t3");
  assert.equal(r.theme.key, "halloween");
  assert.equal(applyThemeOp(L, { op: "delete", key: "nope" }).ok, false);
  // 다 지우면 빈 목록 — 저장하면 [] 라 기본으로 되살아나지 않는다
  const empty = applyThemeOp([HW], { op: "delete", key: "halloween" });
  assert.deepEqual(empty.list, []);
  assert.deepEqual(themesFromSetting(empty.list), []);
});
await test("차례 — 받은 차례 · 빠진 키는 뒤에 지금 차례로 · 모르는 키는 건너뜀", () => {
  assert.equal(keysOf(applyThemeOp(L, { op: "order", keys: ["t3", "halloween", "t2"] }).list), "t3 halloween t2");
  assert.equal(keysOf(applyThemeOp(L, { op: "order", keys: ["t3"] }).list), "t3 halloween t2");
  assert.equal(keysOf(applyThemeOp(L, { op: "order", keys: ["nope", "t2", "t2"] }).list), "t2 halloween t3");
  assert.equal(applyThemeOp(L, { op: "order", keys: [] }).ok, false);
  assert.equal(applyThemeOp(L, { op: "order", keys: "t2" }).ok, false);
});
await test("켜기 — 한 번에 2개까지, 3번째는 짧은 문구로 막는다", () => {
  const one = [HW, { key: "t2", name: "추석", on: false }, { key: "t3", name: "설날", on: false }];
  const r1 = applyThemeOp(one, { op: "toggle", key: "t2", on: true });
  assert.ok(r1.ok);
  assert.equal(keysOf(onThemes(r1.list)), "halloween t2");
  const r2 = applyThemeOp(r1.list, { op: "toggle", key: "t3", on: true });
  assert.equal(r2.ok, false);
  assert.equal(r2.message, THEME_ON_LIMIT_MESSAGE);
  // 이미 켠 것을 다시 켜기는 된다(바뀐 것 없음) · 끄기는 늘 된다
  assert.ok(applyThemeOp(r1.list, { op: "toggle", key: "t2", on: true }).ok);
  const r3 = applyThemeOp(r1.list, { op: "toggle", key: "halloween", on: false });
  assert.ok(r3.ok);
  assert.equal(keysOf(onThemes(r3.list)), "t2");
  // 하나 끈 뒤에는 세 번째를 켤 수 있다
  assert.ok(applyThemeOp(r3.list, { op: "toggle", key: "t3", on: true }).ok);
  // on 은 true 일 때만 켬(문자열 "true" 는 끔)
  assert.equal(applyThemeOp(one, { op: "toggle", key: "t2", on: "true" }).theme.on, false);
  assert.equal(applyThemeOp(one, { op: "toggle", key: "nope", on: true }).ok, false);
});
await test("모르는 작업 · 빈 본문", () => {
  assert.equal(applyThemeOp(L, { op: "explode" }).ok, false);
  assert.equal(applyThemeOp(L, null).ok, false);
});
await test("작업은 받은 목록을 고치지 않는다", () => {
  const src = JSON.parse(JSON.stringify(L));
  applyThemeOp(src, { op: "rename", key: "t2", name: "한가위" });
  applyThemeOp(src, { op: "toggle", key: "t2", on: true });
  applyThemeOp(src, { op: "delete", key: "t3" });
  assert.deepEqual(src, L);
});
await test("같은 목록인가 — 바뀐 게 없으면 쓰지 않게", () => {
  assert.ok(sameThemes(L, JSON.parse(JSON.stringify(L))));
  assert.ok(sameThemes(L, applyThemeOp(L, { op: "rename", key: "t2", name: "추석" }).list));
  assert.ok(!sameThemes(L, applyThemeOp(L, { op: "order", keys: ["t3"] }).list));
  assert.ok(!sameThemes(L, applyThemeOp(L, { op: "toggle", key: "t3", on: false }).list));
  // 설정이 없던 상태(기본)에서 아무것도 안 바꾼 저장도 같은 목록
  assert.ok(sameThemes(themesFromSetting(undefined), [HW]));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
