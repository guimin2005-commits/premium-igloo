// 📌 이벤트 테마(2026-10-11 운영자 "ㅇㅇ" — 할로윈 하나로 박혀 있던 테마를 만들 수 있게) — Setting "shopThemes" = [{ key, name, on }] (차례 = ARCTIC 탭 차례).
//    key  : 처음 만들 때 정해 영영 안 바뀐다([a-z0-9_] · 24자). 상품(ShopItem.theme) · 배너(ShopBanner.placement)가 이 값을 가리킨다. 할로윈은 "halloween" 그대로
//    name : ARCTIC 탭 이름(한글 · 영문 · 숫자 8자) · on: 탭으로 보이는가(한 번에 THEME_ON_MAX 개까지)
//    설정 문서가 없으면 DEFAULT_THEMES(할로윈 하나 켬) — 지금까지의 동작 그대로라 옮겨 쓸 것이 없다.
//    지운 테마를 가리키는 상품 · 배너는 한꺼번에 고쳐 쓰지 않는다 — 모르는 키는 테마 없음으로 친다(상품은 다음 저장 때 "" 로 정리된다)
//    ⚠️ 이 파일은 화면(관리 · ARCTIC)도 import 한다 — DB 모듈을 import 하지 말 것. 서버 읽기는 lib/catalogDraft.js loadShopThemes(초안을 덧씌운 읽기)
//    검사: node scripts/test-shop-themes.mjs

export const THEMES_KEY = "shopThemes";
export const THEME_KEY_MAX = 24;
export const THEME_NAME_MAX = 8;
export const THEME_ON_MAX = 2;
export const THEME_MAX = 20;
export const THEME_ON_LIMIT_MESSAGE = `한 번에 켤 수 있는 테마는 ${THEME_ON_MAX}개까지입니다.`;
// 설정이 없을 때 — 할로윈(2026-10-11 처음 연 테마) 하나 켬
export const DEFAULT_THEMES = Object.freeze([Object.freeze({ key: "halloween", name: "할로윈", on: true })]);
// 📌 기본 배너가 있는 테마 — 그 탭에 켜진 배너가 없으면 그림 파일을 띄운다(public/banners/halloween-*.png). 다른 테마는 배너가 없으면 배너 자리 자체가 없다
export const BUILTIN_BANNER_THEME = "halloween";

const KEY_RE = /^[a-z0-9_]{1,24}$/;
// ARCTIC 탭 값(?type=) · 배너 위치 · 배너 조회 값과 겹치면 안 되는 이름 — 테마 키는 이 자리들에 그대로 들어간다
export const RESERVED_THEME_KEYS = Object.freeze(["home", "all", "any", "none", "season", "timed", "role", "perk", "item", "cosmetic", "physical", "bundle"]);
export const isThemeKey = (v) => typeof v === "string" && KEY_RE.test(v) && !RESERVED_THEME_KEYS.includes(v);

// 이름 — 앞뒤 · 겹친 공백만 정리(자르지 않는다 — 길면 themeNameError 가 알린다)
export const normalizeThemeName = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const NAME_RE = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 ]+$/;
const nameLen = (s) => Array.from(s).length;
// 이름 검사 — 문제가 없으면 ""
export const themeNameError = (v) => {
  const n = normalizeThemeName(v);
  if (!n) return "이름을 입력해 주세요.";
  if (nameLen(n) > THEME_NAME_MAX) return `이름은 ${THEME_NAME_MAX}자까지입니다.`;
  if (!NAME_RE.test(n)) return "이름은 한글 · 영문 · 숫자만 됩니다.";
  return "";
};

// 📌 목록 정리 — 모양이 틀린 줄 · 겹친 키는 버리고, 이름이 틀렸으면 키로(줄을 잃지 않게), 켬은 앞에서부터 THEME_ON_MAX 개까지만
export const normalizeThemes = (raw) => {
  const out = [];
  const seen = new Set();
  let onCount = 0;
  for (const r of Array.isArray(raw) ? raw : []) {
    const key = typeof r?.key === "string" ? r.key : "";
    if (!isThemeKey(key) || seen.has(key)) continue;
    seen.add(key);
    const nm = normalizeThemeName(r?.name);
    const name = themeNameError(nm) ? key.slice(0, THEME_NAME_MAX) : nm;
    const on = r?.on === true && onCount < THEME_ON_MAX;
    if (on) onCount++;
    out.push({ key, name, on });
    if (out.length >= THEME_MAX) break;
  }
  return out;
};
// 저장된 값 → 목록. 문서가 없거나 배열이 아니면 기본(할로윈) — 다 지운 빈 배열 [] 은 빈 목록 그대로
export const themesFromSetting = (value) => (Array.isArray(value) ? normalizeThemes(value) : DEFAULT_THEMES.map((t) => ({ ...t })));

// 📌 서버 읽기 한 벌 — findOne(filter, { select }) 를 받아 부른다(lib/catalogDraft.js loadShopThemes 가 초안을 덧씌운 읽기를 넘긴다)
export const loadThemesWith = async (findOne) => themesFromSetting((await findOne({ key: THEMES_KEY }, { select: { value: 1 } }))?.value);

// ── 찾기 ──
export const themeOf = (list, key) => (typeof key === "string" && key ? (Array.isArray(list) ? list : []).find((t) => t.key === key) || null : null);
export const themeNameOf = (list, key) => themeOf(list, key)?.name || "";
export const onThemes = (list) => (Array.isArray(list) ? list : []).filter((t) => t.on);
// 상품 · 배너가 가리키는 키 — 목록에 있는 키면 그 값, 아니면 ""(테마 없음)
export const themeKeyOf = (list, v) => (themeOf(list, typeof v === "string" ? v : "") ? v : "");

// 📌 상품 폼 「이벤트 테마」 고르기 칸 보기(관리 상품 폼 · ARCTIC 인라인 폼 — Dropdown 모양 { value, label, hint }).
//    없음 + 테마 차례대로 · 꺼진 테마도 고를 수 있다(hint "꺼짐"). 지금 값이 지운 테마 키면 그 자리를 「지운 테마」로 남긴다(저장하면 없음)
export const themePickOptions = (list, value = "") => {
  const out = [{ value: "", label: "없음" }, ...normalizeThemes(list).map((t) => (t.on ? { value: t.key, label: t.name } : { value: t.key, label: t.name, hint: "꺼짐" }))];
  if (typeof value === "string" && value && !themeOf(list, value)) out.push({ value, label: "지운 테마" });
  return out;
};

// 새 키 — "t" + 짧은 무작위(겹치면 다시). rand 는 검사용(0 ≤ x < 1 을 돌려주는 함수)
export const newThemeKey = (list, rand = Math.random) => {
  const taken = new Set((Array.isArray(list) ? list : []).map((t) => t.key));
  for (let i = 0; i < 50; i++) {
    let s = "t";
    for (let j = 0; j < 6; j++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(rand() * 36) % 36];
    if (isThemeKey(s) && !taken.has(s)) return s;
  }
  return "";
};

// ── 작업(app/api/shop/themes POST) — 순수 계산. { ok: true, list, theme? } | { ok: false, message } ──
//    create { name } — 새 테마는 꺼진 채 맨 뒤(켜는 건 따로 — 켬 수 상한에 막혀 만들기가 실패하지 않게)
//    rename { key, name } · delete { key } · order { keys } — 빠진 키는 뒤에 지금 차례로 · toggle { key, on }
const fail = (message) => ({ ok: false, message });
const sameName = (list, name, exceptKey = "") => list.some((t) => t.key !== exceptKey && t.name.toLowerCase() === name.toLowerCase());
export const applyThemeOp = (rawList, body, { rand } = {}) => {
  const list = normalizeThemes(rawList);
  const op = body?.op;
  const key = typeof body?.key === "string" ? body.key : "";
  const cur = key ? themeOf(list, key) : null;
  if (op === "create") {
    const bad = themeNameError(body?.name);
    if (bad) return fail(bad);
    const name = normalizeThemeName(body.name);
    if (sameName(list, name)) return fail("같은 이름의 테마가 있습니다.");
    if (list.length >= THEME_MAX) return fail(`테마는 ${THEME_MAX}개까지입니다.`);
    const k = newThemeKey(list, rand);
    if (!k) return fail("테마를 만들지 못했습니다.");
    const theme = { key: k, name, on: false };
    return { ok: true, list: [...list, theme], theme };
  }
  if (op === "rename" || op === "delete" || op === "toggle") {
    if (!cur) return fail("테마를 찾을 수 없습니다.");
  }
  if (op === "rename") {
    const bad = themeNameError(body?.name);
    if (bad) return fail(bad);
    const name = normalizeThemeName(body.name);
    if (sameName(list, name, key)) return fail("같은 이름의 테마가 있습니다.");
    const theme = { ...cur, name };
    return { ok: true, list: list.map((t) => (t.key === key ? theme : t)), theme };
  }
  if (op === "delete") return { ok: true, list: list.filter((t) => t.key !== key), theme: cur };
  if (op === "toggle") {
    const on = body?.on === true;
    if (on && !cur.on && onThemes(list).length >= THEME_ON_MAX) return fail(THEME_ON_LIMIT_MESSAGE);
    const theme = { ...cur, on };
    return { ok: true, list: list.map((t) => (t.key === key ? theme : t)), theme };
  }
  if (op === "order") {
    const keys = [...new Set((Array.isArray(body?.keys) ? body.keys : []).filter((k) => typeof k === "string"))];
    const listed = keys.map((k) => themeOf(list, k)).filter(Boolean);
    if (!listed.length) return fail("순서를 받지 못했습니다.");
    const listedSet = new Set(listed.map((t) => t.key));
    return { ok: true, list: [...listed, ...list.filter((t) => !listedSet.has(t.key))] };
  }
  return fail("알 수 없는 작업입니다.");
};
// 같은 목록인가(키 · 이름 · 켬 · 차례) — 바뀐 게 없으면 쓰지 않는다(초안 모드에서 빈 초안이 생기지 않게)
export const sameThemes = (a, b) => JSON.stringify(normalizeThemes(a)) === JSON.stringify(normalizeThemes(b));
