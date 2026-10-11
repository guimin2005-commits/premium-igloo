// 📌 아이템 순서 · 그룹 덩어리 — 순수 함수(DB · 화면 없음). 상점 관리 › 아이템(app/admin/shop/page.tsx)과 저장 API(app/api/admin/items/route.js)가 같이 쓴다.
//
//    순서는 하나다(2026-10-11 운영자 — "이러면 안 되는 거잖아"): Item.sortOrder(→ createdAt) 순서 = 관리 목록 순서 = 인벤토리 · 상점 순서.
//    예전엔 관리 목록만 그룹 머리줄을 저장된 그룹 차례로 위에 모아 그려, 목록 순서와 실제 순서가 달랐다.
//
//    규칙 — 같은 그룹 아이템은 늘 붙어 있다(그룹 = 이어진 한 덩어리). 머리줄은 그 그룹 첫 아이템 자리에 선다.
//    단위(unit) = 그룹 덩어리 하나 또는 그룹 없는 아이템 하나. 단위 키: "g:<그룹 이름>" · "i:<아이템 id>"
//
//    모든 함수는 지금 순서의 [{ id, group, ...그 밖 }] 를 받아 새 배열(새 순서)을 돌려준다. 받은 배열 · 객체는 바꾸지 않는다 —
//    그룹이 바뀐 아이템만 새 객체({ ...it, group }), 나머지는 같은 객체 그대로(sortOrder 등 다른 칸이 따라온다).
//    group 은 부르는 쪽이 정리한 이름(lib/items.js normalizeItemGroup)이라 여기선 그대로 비교한다("" · 없음 = 그룹 없음).
//    옮기기 함수가 null 을 주면 = 기준 아이템 · 그룹을 찾지 못함(다른 창에서 바뀐 목록) — 저장하지 말고 다시 불러온다.

/** @typedef {{ id: string, group?: string, sortOrder?: number }} OrderRow */

/** @param {any} it */
const gOf = (it) => (typeof it?.group === "string" ? it.group : "");
/** @param {any} it */
const idOf = (it) => String(it?.id ?? "");
const has = (v) => typeof v === "string" && v !== "";

/** 그룹 덩어리 단위 키 @param {string} name */
export const groupUnitKey = (name) => `g:${name}`;
/** 그룹 없는 아이템 단위 키 @param {string} id */
export const itemUnitKey = (id) => `i:${id}`;

/**
 * 규칙에 맞춘 순서 — 그룹마다 첫 아이템 자리에 그 그룹 아이템을 모두 모은다(그 안 차례 · 나머지 차례는 그대로).
 * 이미 맞으면 같은 순서. 끌기 · 그룹 지정이 아닌 길(추천 아이템 등록 등)로 그룹 아이템이 맨 뒤에 붙었을 때 고친다
 * @template {OrderRow} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function normalizeOrder(items) {
  const list = Array.isArray(items) ? items : [];
  /** @type {Map<string, T[]>} */
  const byGroup = new Map();
  for (const it of list) {
    const g = gOf(it);
    if (!g) continue;
    const arr = byGroup.get(g);
    if (arr) arr.push(it);
    else byGroup.set(g, [it]);
  }
  /** @type {T[]} */
  const out = [];
  const done = new Set();
  for (const it of list) {
    const g = gOf(it);
    if (!g) { out.push(it); continue; }
    if (done.has(g)) continue;
    done.add(g);
    out.push(...(byGroup.get(g) || []));
  }
  return out;
}

/**
 * 단위 목록(규칙에 맞춘 순서로) — [{ key, group, items }]
 * @template {OrderRow} T
 * @param {T[]} items
 * @returns {{ key: string, group: string, items: T[] }[]}
 */
export function unitsOf(items) {
  /** @type {{ key: string, group: string, items: T[] }[]} */
  const out = [];
  for (const it of normalizeOrder(items)) {
    const g = gOf(it);
    const last = out[out.length - 1];
    if (g && last && last.group === g) { last.items.push(it); continue; }
    out.push({ key: g ? groupUnitKey(g) : itemUnitKey(idOf(it)), group: g, items: [it] });
  }
  return out;
}
/** @template T @param {{ items: T[] }[]} units */
const flat = (units) => units.flatMap((u) => u.items);

/**
 * 아이템이 든 그룹 — 덩어리 차례(목록 위에서부터)
 * @param {OrderRow[]} items
 * @returns {string[]}
 */
export function groupsInOrder(items) {
  return unitsOf(items).filter((u) => u.group).map((u) => u.group);
}

/**
 * 그룹 목록(그룹 관리 창 · 거르기 · 고르기) — 아이템이 든 그룹(덩어리 차례) 뒤에 빈 그룹(saved 차례).
 * saved: 저장된 이름(Setting "itemGroups") — 빈 그룹을 기억하는 자리. 겹치거나 빈 이름은 건너뛴다
 * @param {OrderRow[]} items
 * @param {unknown[]} [saved]
 * @returns {string[]}
 */
export function groupList(items, saved = []) {
  const out = groupsInOrder(items);
  const seen = new Set(out);
  for (const g of Array.isArray(saved) ? saved : []) {
    if (has(g) && !seen.has(g)) { seen.add(g); out.push(/** @type {string} */ (g)); }
  }
  return out;
}

/**
 * 두 순서의 id 차례가 같은가
 * @param {OrderRow[]} a
 * @param {OrderRow[]} b
 */
export function sameOrder(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((it, i) => idOf(it) === idOf(b[i]));
}

/**
 * 저장할 것 — next 의 앞에서부터 sortOrder 0, 1, 2 … 와 다른 것, 그룹이 before 와 달라진 것만.
 * [{ id, set: { sortOrder?, group? } }] (바뀐 게 없으면 빈 배열). next 객체의 sortOrder 는 지금 저장된 값이어야 한다
 * @param {OrderRow[]} before
 * @param {OrderRow[]} next
 * @returns {{ id: string, set: { sortOrder?: number, group?: string } }[]}
 */
export function changesOf(before, next) {
  const was = new Map((Array.isArray(before) ? before : []).map((it) => [idOf(it), it]));
  /** @type {{ id: string, set: { sortOrder?: number, group?: string } }[]} */
  const out = [];
  (Array.isArray(next) ? next : []).forEach((it, i) => {
    /** @type {{ sortOrder?: number, group?: string }} */
    const set = {};
    if (Number(it?.sortOrder) !== i) set.sortOrder = i;
    const w = was.get(idOf(it));
    if (w && gOf(w) !== gOf(it)) set.group = gOf(it);
    if (set.sortOrder !== undefined || set.group !== undefined) out.push({ id: idOf(it), set });
  });
  return out;
}

// 기준(after · before) 단위 자리 — "g:<이름>" 은 그 덩어리, "i:<id>" 는 그 아이템이 든 단위(그룹 안 아이템이면 그 덩어리)
/** @param {{ key: string, items: OrderRow[] }[]} units @param {string} ref */
const unitIndexOf = (units, ref) => {
  if (ref.startsWith("g:")) return units.findIndex((u) => u.key === ref);
  if (ref.startsWith("i:")) {
    const id = ref.slice(2);
    return units.findIndex((u) => u.items.some((it) => idOf(it) === id));
  }
  return -1;
};

/**
 * 단위 옮기기 — 그룹 머리줄(덩어리째) · 그룹 없는 아이템을 단위 사이로. after(그 단위 바로 뒤) 가 먼저, 없으면 before(그 단위 바로 앞).
 * 덩어리 한가운데에 놓을 수 없다(기준이 그룹 안 아이템이면 그 덩어리 앞 · 뒤). 찾지 못하면 null
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {string} key  옮길 단위 키
 * @param {{ after?: string | null, before?: string | null }} [to]
 * @returns {T[] | null}
 */
export function moveUnit(items, key, { after = null, before = null } = {}) {
  const units = unitsOf(items);
  const from = units.findIndex((u) => u.key === key);
  if (from < 0) return null;
  const [unit] = units.splice(from, 1);
  let at = -1;
  if (has(after)) {
    const j = unitIndexOf(units, /** @type {string} */ (after));
    if (j < 0) return null;
    at = j + 1;
  } else if (has(before)) {
    const j = unitIndexOf(units, /** @type {string} */ (before));
    if (j < 0) return null;
    at = j;
  } else return null;
  units.splice(at, 0, unit);
  return flat(units);
}

/**
 * 그룹 안에서 옮기기 — 같은 그룹 아이템 바로 뒤(after) · 앞(before)으로. 덩어리 밖으로는 못 나간다.
 * 그룹 없는 아이템이거나 기준이 다른 그룹이면 null
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {string} id
 * @param {{ after?: string | null, before?: string | null }} [to]
 * @returns {T[] | null}
 */
export function moveInGroup(items, id, { after = null, before = null } = {}) {
  const list = normalizeOrder(items);
  const from = list.findIndex((it) => idOf(it) === id);
  if (from < 0) return null;
  const it = list[from];
  const g = gOf(it);
  if (!g) return null;
  const ref = has(after) ? after : has(before) ? before : null;
  if (!ref || ref === id) return null;
  const rest = list.slice();
  rest.splice(from, 1);
  const j = rest.findIndex((x) => idOf(x) === ref);
  if (j < 0 || gOf(rest[j]) !== g) return null;
  rest.splice(has(after) ? j + 1 : j, 0, it);
  return rest;
}

/**
 * 그룹을 바꾸며 옮기기(끌어 놓기 한 번 — 2026-10-11 운영자 "바깥에 있는 걸 바로 그룹에 못 넣는다") — id 를 group 으로 바꿔 놓은 자리에.
 *   group 있음: 그 덩어리 안으로. after · before = 그 그룹 아이템 id(그 바로 뒤 · 앞 — moveInGroup 과 같은 기준).
 *               둘 다 없으면 그 덩어리 끝(접힌 머리줄 위에 놓기 — assignGroup 과 같은 자리)
 *   group "": 그룹에서 빼 단위 사이로. after · before = 단위 키(moveUnit 과 같은 기준 — 그룹 안 아이템이면 그 덩어리 앞 · 뒤).
 *             둘 다 없으면 옛 덩어리 바로 뒤(assignGroup 과 같다). 기준이 옛 그룹 덩어리인데 이 아이템이 그 그룹의 마지막이라
 *             덩어리가 없어지면 제자리(그 덩어리 자리 = 이 아이템 자리)
 *   이미 그 그룹이면 그 안 옮기기(moveInGroup), 그룹 없는 아이템을 "" 로는 단위 옮기기(moveUnit)와 같은 결과.
 *   after 가 먼저, 없으면 before. 기준을 찾지 못하면 null(다른 창에서 바뀐 목록)
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {string} id
 * @param {string} group  정리한 이름(normalizeItemGroup) — "" = 그룹 없음
 * @param {{ after?: string | null, before?: string | null }} [to]
 * @returns {T[] | null}
 */
export function moveToGroup(items, id, group, { after = null, before = null } = {}) {
  const list = normalizeOrder(items);
  const from = list.findIndex((it) => idOf(it) === id);
  if (from < 0) return null;
  const it = list[from];
  const og = gOf(it);
  const g = typeof group === "string" ? group : "";
  const ref = has(after) ? /** @type {string} */ (after) : has(before) ? /** @type {string} */ (before) : null;
  if (!ref) return assignGroup(list, [id], g);
  const moved = og === g ? it : { ...it, group: g };
  const rest = list.slice();
  rest.splice(from, 1);
  if (g) {
    if (ref === id) return null;
    const j = rest.findIndex((x) => idOf(x) === ref);
    if (j < 0 || gOf(rest[j]) !== g) return null;
    rest.splice(has(after) ? j + 1 : j, 0, moved);
    return normalizeOrder(rest);
  }
  const units = unitsOf(rest);
  const j = unitIndexOf(units, ref);
  if (j < 0) {
    // 옛 그룹의 마지막 아이템 — 기준 덩어리가 이 아이템과 함께 사라졌다
    if (og && ref === groupUnitKey(og) && !rest.some((x) => gOf(x) === og)) {
      const out = list.slice();
      out[from] = moved;
      return normalizeOrder(out);
    }
    return null;
  }
  units.splice(has(after) ? j + 1 : j, 0, { key: itemUnitKey(id), group: "", items: [moved] });
  return normalizeOrder(flat(units));
}

/**
 * 그룹 차례 바꾸기(그룹 관리 창) — 그룹 덩어리들이 차지한 자리 안에서만 덩어리를 names 차례로 바꿔 끼운다.
 * 그룹 없는 아이템은 제자리. names 에 없는 그룹은 있는 그룹 뒤에 지금 차례로
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {unknown[]} names
 * @returns {T[]}
 */
export function orderGroupBlocks(items, names) {
  const units = unitsOf(items);
  /** @type {Map<string, number>} */
  const rank = new Map();
  for (const n of Array.isArray(names) ? names : []) if (has(n) && !rank.has(/** @type {string} */ (n))) rank.set(/** @type {string} */ (n), rank.size);
  /** @type {number[]} */
  const slots = [];
  /** @type {{ u: (typeof units)[number], i: number, r: number }[]} */
  const blocks = [];
  units.forEach((u, i) => {
    if (!u.group) return;
    slots.push(i);
    blocks.push({ u, i, r: rank.has(u.group) ? /** @type {number} */ (rank.get(u.group)) : rank.size + i });
  });
  blocks.sort((a, b) => a.r - b.r || a.i - b.i);
  const out = units.slice();
  slots.forEach((s, k) => { out[s] = blocks[k].u; });
  return flat(out);
}

/**
 * 그룹 지정(여러 개 · 아이템 수정의 그룹 칸) — ids 를 group 으로.
 *   group 있음: 그 그룹이 아닌 것만 옮겨 그 덩어리 끝에(이미 그 그룹인 것은 제자리). 그 그룹에 남는 아이템이 없으면
 *               옮기는 것 중 맨 앞 아이템 자리에서 덩어리가 시작한다(그 자리가 다른 덩어리 한가운데면 그 덩어리 바로 뒤).
 *   group "": 그룹에서 빼기 — 뺀 아이템은 옛 덩어리 바로 뒤에(덩어리째 빼면 제자리). 이미 그룹 없는 것은 그대로
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {unknown[]} ids
 * @param {string} group
 * @returns {T[]}
 */
export function assignGroup(items, ids, group) {
  const list = normalizeOrder(items);
  const pick = new Set((Array.isArray(ids) ? ids : []).map((v) => String(v)));
  const g = typeof group === "string" ? group : "";
  if (g) {
    const moving = list.filter((it) => pick.has(idOf(it)) && gOf(it) !== g);
    if (moving.length === 0) return list;
    const movingSet = new Set(moving);
    const rest = list.filter((it) => !movingSet.has(it));
    let last = -1;
    rest.forEach((it, i) => { if (gOf(it) === g) last = i; });
    // 남는 덩어리가 있으면 그 끝, 없으면 맨 앞 옮기는 아이템 자리(그 앞은 모두 남는 아이템이라 rest 에서도 같은 자리)
    const at = last >= 0 ? last + 1 : list.indexOf(moving[0]);
    const moved = moving.map((it) => ({ ...it, group: g }));
    return normalizeOrder([...rest.slice(0, at), ...moved, ...rest.slice(at)]);
  }
  /** @type {T[]} */
  const out = [];
  for (const u of unitsOf(list)) {
    if (!u.group) { out.push(...u.items); continue; }
    const keep = u.items.filter((it) => !pick.has(idOf(it)));
    const off = u.items.filter((it) => pick.has(idOf(it))).map((it) => ({ ...it, group: "" }));
    out.push(...keep, ...off);
  }
  return out;
}

/**
 * 이름 바꾸기 — 순서는 그대로(to 가 이미 있는 그룹이면 두 덩어리가 앞 덩어리 자리로 합쳐진다 — API 는 막는다)
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {string} from
 * @param {string} to
 * @returns {T[]}
 */
export function renameGroup(items, from, to) {
  if (!has(from) || from === to) return normalizeOrder(items);
  return normalizeOrder(normalizeOrder(items).map((it) => (gOf(it) === from ? { ...it, group: to || "" } : it)));
}

/**
 * 그룹 삭제 — 그 그룹 아이템은 제자리에서 그룹 없음으로
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {string} name
 * @returns {T[]}
 */
export function deleteGroup(items, name) {
  return normalizeOrder(items).map((it) => (has(name) && gOf(it) === name ? { ...it, group: "" } : it));
}

// ── 상위 그룹(그룹의 그룹 — 2026-10-11 운영자 "그룹의 그룹도 만들어서 자동 정렬") ──
//    상위 그룹은 그룹을 묶는 관리 목록 머리줄일 뿐이다(유저 화면엔 없다). 아이템 문서에는 없고 그룹마다 하나 — Setting "itemGroups" 의 { name, parent }.
//    규칙 — 같은 상위 그룹의 그룹 덩어리는 늘 이어져 있다(상위 덩어리). 상위 덩어리 자리 = 그 첫 그룹 덩어리 자리, 그 안 그룹 차례는 그대로.
//    parentOf: { 그룹 이름: 상위 그룹 이름 } 또는 Map — 없거나 "" = 상위 없음. 상위 키는 "p:<이름>"
/** @typedef {Record<string, string> | Map<string, string> | null | undefined} ParentMap */
/** @param {ParentMap} parentOf @param {string} g */
const pOf = (parentOf, g) => {
  if (!g || !parentOf) return "";
  const v = parentOf instanceof Map ? parentOf.get(g) : Object.prototype.hasOwnProperty.call(parentOf, g) ? parentOf[g] : "";
  return has(v) ? /** @type {string} */ (v) : "";
};
/** 상위 그룹 키 @param {string} name */
export const parentUnitKey = (name) => `p:${name}`;
/** 그룹의 상위 그룹("" = 없음) @param {ParentMap} parentOf @param {string} group */
export const parentOfGroup = (parentOf, group) => pOf(parentOf, group);

/**
 * 상위 규칙에 맞춘 순서 — 같은 상위 그룹의 덩어리를 그 첫 덩어리 자리로 모은다(그룹 덩어리 규칙도 함께 — normalizeOrder 를 거친다).
 * 이미 맞으면 같은 순서. 그룹 단위로 옮기는 함수들은 상위를 모른다 — 저장 직전(API) · 화면 맞추기에서 이것을 한 번 더 거친다.
 * pin: 방금 끌어 옮긴 그룹 — 그 상위 덩어리 자리는 나머지 형제 그룹 쪽으로 잡는다(상위 안 그룹 하나를 밖으로 끌면 상위 전체가 딸려가지 않고
 *      그 그룹이 형제 곁으로 돌아온다 — 형제보다 앞에 놓았으면 형제 앞, 뒤면 뒤). 형제가 없으면 그 자리 그대로
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {ParentMap} parentOf
 * @param {string} [pin]
 * @returns {T[]}
 */
export function nestParents(items, parentOf, pin = "") {
  const units = unitsOf(items);
  /** @type {Map<string, (typeof units)>} */
  const byParent = new Map();
  for (const u of units) {
    const p = pOf(parentOf, u.group);
    if (!p) continue;
    const arr = byParent.get(p);
    if (arr) arr.push(u);
    else byParent.set(p, [u]);
  }
  if (byParent.size === 0) return flat(units);
  // 상위마다 덩어리를 세울 자리 — 첫 덩어리(끈 그룹은 형제가 있으면 건너뛴다)
  const pinP = pOf(parentOf, pin);
  /** @type {Map<string, (typeof units)[number]>} */
  const anchor = new Map();
  for (const [p, arr] of byParent) {
    const other = p === pinP ? arr.find((u) => u.group !== pin) : null;
    anchor.set(p, other || arr[0]);
  }
  /** @type {typeof units} */
  const out = [];
  for (const u of units) {
    const p = pOf(parentOf, u.group);
    if (!p) { out.push(u); continue; }
    if (anchor.get(p) !== u) continue;
    out.push(...(byParent.get(p) || []));
  }
  return flat(out);
}

/**
 * 상위 단위 — 상위 덩어리 하나(그 그룹 덩어리들) 또는 상위 없는 단위 하나(그룹 덩어리 · 그룹 없는 아이템). 상위 규칙에 맞춘 순서로
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {ParentMap} parentOf
 * @returns {{ parent: string, units: { key: string, group: string, items: T[] }[] }[]}
 */
export function parentUnitsOf(items, parentOf) {
  /** @type {{ parent: string, units: { key: string, group: string, items: T[] }[] }[]} */
  const out = [];
  for (const u of unitsOf(nestParents(items, parentOf))) {
    const p = pOf(parentOf, u.group);
    const last = out[out.length - 1];
    if (p && last && last.parent === p) { last.units.push(u); continue; }
    out.push({ parent: p, units: [u] });
  }
  return out;
}

/**
 * 상위 차례 — 목록에서 상위 덩어리가 나오는 차례 뒤에 든 그룹이 없는 상위(saved 차례). 그룹 차례(groupList)처럼 늘 목록에서 다시 센다 —
 * 저장된 차례만 믿으면 상위에 넣기 · 그룹 끌기로 덩어리 자리가 바뀌었을 때 그룹 관리 창 · 거르기 차례가 목록과 어긋난다(2026-10-11 검토)
 * @param {OrderRow[]} items
 * @param {ParentMap} parentOf
 * @param {unknown[]} [saved]
 * @returns {string[]}
 */
export function parentList(items, parentOf, saved = []) {
  const out = [];
  for (const s of parentUnitsOf(items, parentOf)) if (s.parent && !out.includes(s.parent)) out.push(s.parent);
  for (const p of Array.isArray(saved) ? saved : []) if (has(p) && !out.includes(/** @type {string} */ (p))) out.push(/** @type {string} */ (p));
  return out;
}

/**
 * 그룹 차례 바꾸기(그룹 관리 창 · 상위가 있어도) — 맨 윗단위(상위 덩어리 하나 · 상위 없는 그룹 덩어리 하나)들이 차지한 자리 안에서만
 * names 차례로 바꿔 끼우고, 상위 덩어리 안의 그룹 차례도 names 차례로. 그룹 없는 아이템은 제자리(상위가 없으면 orderGroupBlocks 와 같다).
 * 상위 덩어리의 차례 = 그 안 그룹 중 names 에서 가장 앞선 자리. 다른 상위 사이로 끈 그룹은 제 상위 안 차례만 바뀐다
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {unknown[]} names
 * @param {ParentMap} parentOf
 * @returns {T[]}
 */
export function orderGroupsNested(items, names, parentOf) {
  /** @type {Map<string, number>} */
  const rank = new Map();
  for (const n of Array.isArray(names) ? names : []) if (has(n) && !rank.has(/** @type {string} */ (n))) rank.set(/** @type {string} */ (n), rank.size);
  const sus = parentUnitsOf(items, parentOf);
  const gRank = (/** @type {string} */ g, /** @type {number} */ i) => (rank.has(g) ? /** @type {number} */ (rank.get(g)) : rank.size + i);
  /** @type {number[]} */
  const slots = [];
  /** @type {{ s: (typeof sus)[number], i: number, r: number }[]} */
  const blocks = [];
  sus.forEach((s, i) => {
    if (!s.parent && !s.units[0]?.group) return; // 그룹 없는 아이템은 제자리
    const units = s.parent ? s.units.map((u, k) => ({ u, k })).sort((a, b) => gRank(a.u.group, a.k) - gRank(b.u.group, b.k) || a.k - b.k).map((x) => x.u) : s.units;
    slots.push(i);
    blocks.push({ s: { ...s, units }, i, r: Math.min(...units.map((u, k) => gRank(u.group, i * 1000 + k))) });
  });
  blocks.sort((a, b) => a.r - b.r || a.i - b.i);
  const out = sus.slice();
  slots.forEach((at, k) => { out[at] = blocks[k].s; });
  return out.flatMap((s) => s.units.flatMap((u) => u.items));
}

/**
 * 상위 그룹 차례 바꾸기(그룹 관리 창) — 상위 덩어리들이 차지한 자리 안에서만 덩어리를 names 차례로 바꿔 끼운다(orderGroupBlocks 와 같은 셈).
 * 상위 없는 단위는 제자리. names 에 없는 상위는 있는 것 뒤에 지금 차례로
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {unknown[]} names
 * @param {ParentMap} parentOf
 * @returns {T[]}
 */
export function orderParentBlocks(items, names, parentOf) {
  const sus = parentUnitsOf(items, parentOf);
  /** @type {Map<string, number>} */
  const rank = new Map();
  for (const n of Array.isArray(names) ? names : []) if (has(n) && !rank.has(/** @type {string} */ (n))) rank.set(/** @type {string} */ (n), rank.size);
  /** @type {number[]} */
  const slots = [];
  /** @type {{ s: (typeof sus)[number], i: number, r: number }[]} */
  const blocks = [];
  sus.forEach((s, i) => {
    if (!s.parent) return;
    slots.push(i);
    blocks.push({ s, i, r: rank.has(s.parent) ? /** @type {number} */ (rank.get(s.parent)) : rank.size + i });
  });
  blocks.sort((a, b) => a.r - b.r || a.i - b.i);
  const out = sus.slice();
  slots.forEach((at, k) => { out[at] = blocks[k].s; });
  return out.flatMap((s) => s.units.flatMap((u) => u.items));
}

// ── 자동 정렬(2026-10-11 운영자 "아이템이 선순위로 갈지 … 방향을 못 정하겠어" → 규칙 확정 "ㄱ") ──
//    1) 유형 차례(typeOrder — 인벤토리 탭 차례: 역할 → 권한 → 아이템 → 꾸미기 → 기프트카드). 모르는 유형은 맨 뒤
//    2) 한 유형 안: 상위 덩어리(parents 차례) → 상위 없는 그룹(지금 차례) → 그룹 없는 아이템(지금 차례)
//       그룹 · 상위 덩어리의 유형 = 그 안 아이템이 가장 많은 유형(같으면 유형 차례가 앞선 쪽) — 덩어리째 그 유형 자리로
//    3) 그룹 안: 등급 아이템(rank 0 = 아이언 … — 부르는 쪽이 셈)은 등급 아이템이 있던 자리들에 등급 차례로, 나머지는 제자리
//    아이템 객체는 그대로(그룹 · 상위는 바뀌지 않는다) — 순서만 새로. 단추를 누를 때 한 번(늘 켜 두면 끌어 맞춘 순서를 덮는다)
/** @typedef {OrderRow & { type?: string, rank?: number }} SortRow */
/**
 * @template {SortRow} T
 * @param {T[]} items  지금 순서
 * @param {{ typeOrder?: string[], parents?: unknown[], parentOf?: ParentMap }} [opt]
 * @returns {T[]}
 */
export function autoSortOrder(items, { typeOrder = [], parents = [], parentOf = null } = {}) {
  const tIdx = (/** @type {unknown} */ t) => { const i = typeOrder.indexOf(/** @type {string} */ (t)); return i < 0 ? typeOrder.length : i; };
  // 무리의 유형 차례 — 아이템이 가장 많은 유형(같으면 차례가 앞선 쪽)
  const typeRankOf = (/** @type {T[]} */ list) => {
    /** @type {Map<number, number>} */
    const n = new Map();
    for (const it of list) { const t = tIdx(it?.type); n.set(t, (n.get(t) || 0) + 1); }
    let best = typeOrder.length, bestN = -1;
    for (const [t, c] of n) if (c > bestN || (c === bestN && t < best)) { best = t; bestN = c; }
    return best;
  };
  // 그룹 안 — 등급 아이템 자리에 등급 차례로(같은 등급끼리 · 등급 없는 아이템은 제자리)
  const rankSort = (/** @type {T[]} */ list) => {
    /** @type {number[]} */
    const slots = [];
    /** @type {{ it: T, k: number }[]} */
    const tiers = [];
    list.forEach((it, i) => {
      const r = Number(it?.rank);
      if (it?.rank != null && Number.isFinite(r) && r >= 0) { slots.push(i); tiers.push({ it, k: tiers.length }); }
    });
    if (tiers.length < 2) return list;
    tiers.sort((a, b) => Number(a.it.rank) - Number(b.it.rank) || a.k - b.k);
    const out = list.slice();
    slots.forEach((s, k) => { out[s] = tiers[k].it; });
    return out;
  };
  /** @type {Map<string, number>} */
  const pRank = new Map();
  for (const p of Array.isArray(parents) ? parents : []) if (has(p) && !pRank.has(/** @type {string} */ (p))) pRank.set(/** @type {string} */ (p), pRank.size);
  /** @type {Map<number, { parents: { r: number, i: number, groups: T[][] }[], groups: T[][], loose: T[] }>} */
  const byType = new Map();
  const bucket = (/** @type {number} */ t) => {
    let b = byType.get(t);
    if (!b) { b = { parents: [], groups: [], loose: [] }; byType.set(t, b); }
    return b;
  };
  parentUnitsOf(items, parentOf).forEach((s, i) => {
    if (s.parent) {
      const groups = s.units.map((u) => rankSort(u.items));
      bucket(typeRankOf(groups.flat())).parents.push({ r: pRank.has(s.parent) ? /** @type {number} */ (pRank.get(s.parent)) : pRank.size + i, i, groups });
      return;
    }
    const u = s.units[0];
    if (u.group) bucket(typeRankOf(u.items)).groups.push(rankSort(u.items));
    else bucket(tIdx(u.items[0]?.type)).loose.push(u.items[0]);
  });
  /** @type {T[]} */
  const out = [];
  for (const t of [...byType.keys()].sort((a, b) => a - b)) {
    const b = /** @type {NonNullable<ReturnType<typeof byType.get>>} */ (byType.get(t));
    b.parents.sort((x, y) => x.r - y.r || x.i - y.i);
    for (const p of b.parents) for (const g of p.groups) out.push(...g);
    for (const g of b.groups) out.push(...g);
    out.push(...b.loose);
  }
  return out;
}

/**
 * 새 아이템 — 맨 뒤(그룹이 있으면 그 덩어리 끝). id 가 목록에 이미 있으면 그 줄을 맨 뒤로 옮겨서 본다(저장 직후 목록)
 * @template {OrderRow} T
 * @param {T[]} items
 * @param {string} id
 * @returns {T[]}
 */
export function appendItem(items, id) {
  const list = Array.isArray(items) ? items : [];
  const mine = list.filter((it) => idOf(it) === id);
  return normalizeOrder([...list.filter((it) => idOf(it) !== id), ...mine]);
}
