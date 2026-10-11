// 📌 묶음 표 줄 끌어 놓기 — 순수 계산(DOM · React 없음). app/admin/ui.tsx DataTable(groupOf + onRowDrop)이 쓴다.
//    2026-10-11 운영자 "바깥에 있는 걸 바로 그룹에 못 넣는다" — 줄 하나(묶음 안 줄 · 묶지 않은 줄)를 묶음 안 · 밖 · 다른 묶음으로 끌어 놓는다.
//    머리줄(덩어리째) 끌기는 여기가 아니라 단위 사이 옮기기(useRowDrag 단위 칸) 그대로.
//
//    줄(DropLine) = 화면에 보이는 줄을 위에서부터 { key, head, group, open, unit }
//      head: 묶음 머리줄 · group: 그 줄의 묶음 이름("" = 묶지 않은 줄) · open: 펼친 머리줄인가(머리줄만 본다)
//      unit: 그 줄이 든 단위 키(머리줄 · 묶음 안 줄 = 머리줄 키, 묶지 않은 줄 = 자기 키). 접힌 묶음의 줄은 줄이 아니다(안 보인다)
//    자리(DropTarget) — p: 끄는 줄을 뺀 차례에서 끼울 번호(0 = 맨 앞)
//      in   그 묶음 안 — 두 줄 사이 · 덩어리 첫 줄 앞 · 덩어리 마지막 줄 뒤(위쪽 반). after · before = 그 묶음 줄 키(이웃)
//      head 접힌 머리줄 위(위 · 아래 가장자리 띠를 뺀 거의 전부 — HEAD_EDGE) — 그 덩어리 끝. after · before 없음. line: 그 머리줄 번호(lines 기준)
//      out  단위 사이(묶지 않은 줄로) — after · before = 단위 키(이웃 단위)
//    펼친 덩어리 마지막 줄 바로 아래 틈은 둘로 읽힌다 — 위쪽 반 = 그 덩어리 끝(in) · 아래쪽 반 = 덩어리 뒤(out).
//    가운데(제자리 · 표 끝)는 끄는 줄의 지금 그룹 그대로(keep) — 눌렀다 놓기만 해도 그룹이 바뀌지 않게.
//    표 끝은 표 아래로 반 줄 넘게 더 끌어내면 밖(pickRowTarget over) — 맨 끝 덩어리의 줄도 표 끝으로 뺄 수 있게

/** @typedef {{ key: string, head: boolean, group: string, open: boolean, unit: string }} DropLine */

// 📌 접힌 머리줄의 가장자리 띠(줄 높이 대비) — 띠 안은 머리줄 앞 · 뒤(단위 사이), 그 사이 전부는 그 덩어리 안.
//    2026-10-11 운영자: 가운데 반(0.25 ~ 0.75)만 「그룹에 넣기」라 빡빡했다 → 위아래 15% 띠만 남기고 넓혔다(50px 줄이면 7.5px 띠)
export const HEAD_EDGE = 0.15;
/** @typedef {{ p: number, kind: "in" | "head" | "out", group: string, after: string | null, before: string | null, line?: number }} DropTarget */

/**
 * 틈 하나(끄는 줄을 뺀 차례의 p 자리)에 놓을 수 있는 자리 — 0 · 1 · 2개(2개면 [in, out] — 위쪽 반 · 아래쪽 반)
 * @param {DropLine[]} lines
 * @param {number} from 끄는 줄 번호
 * @param {number} p
 * @returns {DropTarget[]}
 */
export function gapTargets(lines, from, p) {
  const others = lines.filter((_, i) => i !== from);
  const above = p > 0 ? others[p - 1] || null : null;
  const below = others[p] || null;
  // 묶음 안 줄 앞 — 그 묶음 안(덩어리 첫 줄 앞 포함)
  if (below && !below.head && below.group) {
    const after = above && !above.head && above.group === below.group ? above.key : null;
    return [{ p, kind: "in", group: below.group, after, before: below.key }];
  }
  // 펼친 머리줄 바로 아래인데 그 묶음에 다른 줄이 안 보인다 — 끄는 줄이 그 묶음의 보이는 마지막 줄(제자리)
  if (above && above.head && above.open) return [{ p, kind: "in", group: above.group, after: null, before: null }];
  if (!above && !below) return [];
  const out = /** @type {DropTarget} */ ({ p, kind: "out", group: "", after: above ? above.unit : null, before: below ? below.unit : null });
  // 펼친 덩어리 마지막 줄 바로 아래 — 그 덩어리 끝 · 덩어리 뒤 둘 다
  if (above && !above.head && above.group) return [{ p, kind: "in", group: above.group, after: above.key, before: null }, out];
  return [out];
}

/**
 * 제자리 — 놓아도 아무것도 안 바뀌는 자리(끄는 줄의 틈 · 지금 그룹 그대로)
 * @param {DropLine[]} lines @param {number} from @param {DropTarget | null | undefined} t
 */
export function isNoopTarget(lines, from, t) {
  const own = lines[from];
  return !!t && !!own && t.kind !== "head" && t.p === from && t.group === own.group;
}

/**
 * 놓을 수 있는 자리 전부 — 위에서부터(키보드 ↑ ↓ 한 칸 = 이 차례 한 칸). 접힌 머리줄은 그 앞 틈과 뒤 틈 사이
 * @param {DropLine[]} lines
 * @param {number} from
 * @returns {DropTarget[]}
 */
export function rowTargets(lines, from) {
  const own = lines[from];
  if (!own || own.head) return [];
  const others = lines.filter((_, i) => i !== from);
  /** @type {DropTarget[]} */
  const out = [];
  for (let p = 0; p <= others.length; p++) {
    out.push(...gapTargets(lines, from, p));
    const l = others[p];
    if (l && l.head && !l.open && l.group !== own.group) out.push({ p, kind: "head", group: l.group, after: null, before: null, line: p < from ? p : p + 1 });
  }
  return out;
}

/**
 * 손가락 · 마우스 자리로 고른 자리 — 줄 위치(tops · hs: 끌기 전 문서 좌표)와 끄는 줄 가운데(c).
 * 틈은 useRowDrag 와 같은 셈(이웃 줄 가운데를 지나면 한 칸), 접힌 머리줄은 그 줄의 가장자리 띠(HEAD_EDGE)를 뺀 자리 위.
 * to: 화면에서 비켜설 자리(useRowDrag 의 to — 머리줄 위면 그 머리줄은 제자리)
 * over: 끄는 줄이 표 바닥에 닿은 뒤 손가락이 더 내려간 거리(끄는 줄은 표 밖으로 못 나가 c 가 멈춘다).
 *       표 끝 틈에서 반 줄 넘게 더 내리면 덩어리 뒤(밖) — 맨 끝 덩어리의 줄을 표 끝으로 빼는 자리(그 밖엔 닿을 수 없다)
 * @param {DropLine[]} lines
 * @param {number} from
 * @param {{ tops: number[], hs: number[], c: number, dead?: number, over?: number }} geo  dead: 제자리 가운데 둘레(그 안은 지금 그룹 그대로)
 * @returns {{ target: DropTarget, to: number } | null}
 */
export function pickRowTarget(lines, from, { tops, hs, c, dead = 6, over = 0 }) {
  const n = lines.length;
  const own = lines[from];
  if (!own || own.head || n < 2) return null;
  const mid = (/** @type {number} */ j) => tops[j] + hs[j] / 2;
  for (let j = 0; j < n; j++) {
    const l = lines[j];
    if (j === from || !l.head || l.open || l.group === own.group) continue;
    if (c >= tops[j] + hs[j] * HEAD_EDGE && c <= tops[j] + hs[j] * (1 - HEAD_EDGE)) {
      return { target: { p: j < from ? j : j - 1, kind: "head", group: l.group, after: null, before: null, line: j }, to: j < from ? j + 1 : j - 1 };
    }
  }
  let to = from;
  for (let j = from + 1; j < n; j++) if (c >= mid(j)) to = j;
  for (let j = from - 1; j >= 0; j--) if (c <= mid(j)) to = j;
  const ts = gapTargets(lines, from, to);
  if (ts.length < 2) return ts.length ? { target: ts[0], to } : null;
  // 덩어리 끝(in) · 덩어리 뒤(out) — 이 틈이 고른 구간을 반으로. 제자리는 끄는 줄 가운데 ± dead, 표 끝은 맨 아래까지 끌어야 지금 그대로
  const [tin, tout] = ts;
  const keep = own.group === tin.group ? tin : tout;
  // 표 끝 틈(마지막 줄 뒤) — 표 아래로 반 줄 넘게 끌어내면 밖
  if (to === n - 1 && over > hs[from] / 2) return { target: tout, to };
  let lo;
  let hi;
  if (to === from) {
    lo = mid(from) - dead;
    hi = mid(from) + dead;
  } else if (to > from) {
    const end = to + 1 >= n;
    const split = end ? tops[n - 1] + hs[n - 1] - hs[from] / 2 - 0.5 : (mid(to) + mid(to + 1)) / 2;
    lo = split;
    hi = end ? Infinity : split;
  } else {
    const split = (mid(to - 1) + mid(to)) / 2;
    lo = split;
    hi = split;
  }
  return { target: c < lo ? tin : c > hi ? tout : keep, to };
}

/**
 * 놓은 자리 → 부르는 쪽에 줄 것 { moved, group, after, before }
 *   group 있음: 그 묶음 안 — after · before 는 그 묶음 줄 키(둘 다 null = 덩어리 끝)
 *   group "": 단위 사이 — after · before 는 단위 키
 * @param {DropLine[]} lines @param {number} from @param {DropTarget} t
 */
//   📌 위로 끌어 단위 사이(out)에 놓으면 아래 이웃(before)만 준다 — 두 보이는 줄 사이에 안 보이는 단위(접은 상위 안 그룹 · 거른 줄)가 있으면
//      after(위 이웃 바로 뒤)는 그 안 보이는 것들 위로 들어가, 아래에서 올라온 줄이 접은 상위 머리줄 위에 붙었다(2026-10-11 검토). 아래로 끌면 after 그대로
export function dropOf(lines, from, t) {
  const up = t.kind === "out" && t.p < from && !!t.before;
  return { moved: lines[from].key, group: t.kind === "out" ? "" : t.group, after: up ? null : t.after, before: t.before };
}
