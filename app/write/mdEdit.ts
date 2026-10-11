// 📌 글쓰기 본문 편집 동작 — 값(value)과 선택(s ~ e)을 받아 바꿀 한 구간(Edit)을 돌려주는 순수 함수(2026-10-11 운영자 "굵게 하는 것도 불편 · 편의 기능 팍팍").
//    화면(app/write/RichEditor.tsx)이 Edit 를 execCommand("insertText") 로 넣는다 — 브라우저 되돌리기(Ctrl+Z)가 그대로 산다.
//    줄 앞 서식 판정은 렌더러(app/components/mdRender.ts lineKindOf)와 같은 함수. scripts/test-md-edit.mjs 가 돌려 본다
import { lineKindOf, type LineKind } from "../components/mdRender";

export type Edit = { start: number; end: number; text: string; selStart: number; selEnd: number };
export type WrapMark = "**" | "__" | "~~" | "==";
export type BlockKind = Exclude<LineKind, "hr">;

const lineStartAt = (v: string, i: number) => v.lastIndexOf("\n", i - 1) + 1;
const lineEndAt = (v: string, i: number) => { const n = v.indexOf("\n", i); return n < 0 ? v.length : n; };
const WORD = /[\p{L}\p{N}_]/u;

// 줄 안 서식 묶음 — 렌더러와 같은 짝 찾기(앞에서부터 짧게)
function runsIn(line: string, mark: WrapMark): { open: number; close: number }[] {
  const out: { open: number; close: number }[] = [];
  let i = 0;
  while (i < line.length) {
    const o = line.indexOf(mark, i);
    if (o < 0) break;
    const c = line.indexOf(mark, o + mark.length);
    if (c < 0) break;
    out.push({ open: o, close: c });
    i = c + mark.length;
  }
  return out;
}

// 커서 자리에 켜진 서식 — 도구 단추를 눌린 모양으로
export function activeAt(v: string, s: number): { marks: Record<WrapMark, boolean>; block: LineKind | null } {
  const ls = lineStartAt(v, s), le = lineEndAt(v, s);
  const line = v.slice(ls, le), at = s - ls;
  const marks = {} as Record<WrapMark, boolean>;
  for (const m of ["**", "__", "~~", "=="] as WrapMark[]) marks[m] = runsIn(line, m).some((r) => at >= r.open + m.length && at <= r.close);
  return { marks, block: lineKindOf(line)?.kind ?? null };
}

// 표 줄 · 구분선 · 이미지 한 줄 — 글자 서식 · 줄 서식을 받지 않는다(렌더러가 그 줄을 통째로 읽는다 — 기호가 붙으면 표 · 선 · 그림이 깨진다)
const isAtomicLine = (ln: string) => ln.trim().startsWith("|") || lineKindOf(ln)?.kind === "hr" || /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(ln);

// 굵게 · 밑줄 · 취소선 · 강조 켜고 끄기
//  · 고른 글이 정확히 그 서식 한 덩어리면(안쪽이든 기호까지든) 벗긴다 — 「**a** 와 **b**」처럼 두 덩어리를 고르면 벗기지 않고 하나로 합쳐 씌운다
//  · 여러 줄을 골랐으면 줄마다(서식은 줄을 넘지 못한다) — 줄 앞 기호(목록 · 제목)는 밖에, 표 · 구분선 · 이미지 줄은 그대로. 고른 줄이 전부 그 서식이면 전부 벗긴다
//  · 고른 게 없으면: 서식 끝(닫는 기호 바로 앞)이면 닫는 기호 뒤로 빠져나가고(켜고 · 쓰고 · 끄기), 그 서식 안이면 벗기고,
//    낱말 위면 그 낱말을, 아니면 빈 짝을 넣고 그 사이에 커서
export function toggleWrap(v: string, s: number, e: number, mark: WrapMark): Edit {
  const m = mark.length;
  if (s === e) {
    const ls = lineStartAt(v, s), le = lineEndAt(v, s);
    const line = v.slice(ls, le), at = s - ls;
    const hit = runsIn(line, mark).find((r) => at >= r.open && at <= r.close + m);
    if (hit) {
      if (at === hit.close && hit.close > hit.open + m) {
        const p = ls + hit.close + m;
        return { start: p, end: p, text: "", selStart: p, selEnd: p };
      }
      const inner = line.slice(hit.open + m, hit.close);
      const cur = Math.min(Math.max(at - m, hit.open), hit.open + inner.length);
      return { start: ls + hit.open, end: ls + hit.close + m, text: inner, selStart: ls + cur, selEnd: ls + cur };
    }
    if (isAtomicLine(line)) return { start: s, end: s, text: "", selStart: s, selEnd: s };
    let a = s, b = s;
    while (a > ls && WORD.test(v[a - 1])) a--;
    while (b < le && WORD.test(v[b])) b++;
    if (a < b) {
      const word = v.slice(a, b);
      return { start: a, end: b, text: mark + word + mark, selStart: s + m, selEnd: s + m };
    }
    return { start: s, end: s, text: mark + mark, selStart: s + m, selEnd: s + m };
  }
  const sel = v.slice(s, e);
  const ls0 = lineStartAt(v, s);
  if (!sel.includes("\n")) {
    // 고른 글이 정확히 한 덩어리(기호까지)
    const r0 = runsIn(sel, mark);
    if (r0.length === 1 && r0[0].open === 0 && r0[0].close === sel.length - m) {
      const inner = sel.slice(m, -m);
      return { start: s, end: e, text: inner, selStart: s, selEnd: s + inner.length };
    }
    // 고른 글 바로 바깥 기호가 이 줄의 한 덩어리
    if (runsIn(v.slice(ls0, lineEndAt(v, s)), mark).some((r) => r.open === s - m - ls0 && r.close === e - ls0)) {
      return { start: s - m, end: e + m, text: sel, selStart: s - m, selEnd: e - m };
    }
  }
  const lines = sel.split("\n");
  const parts = lines.map((ln, idx) => {
    // 첫 줄은 고른 자리부터라 줄 앞 기호가 없을 수 있다 — 기호 · 통째 줄 판정은 줄 전체로
    const whole = idx === 0 ? ls0 === s : true;
    const full = idx === 0 ? v.slice(ls0, lineEndAt(v, s)) : ln;
    if (isAtomicLine(full)) return { ln, atomic: true, pre: "", lead: "", tail: "", core: "" };
    const k = whole ? lineKindOf(ln) : null;
    const pre = k && k.kind !== "hr" ? k.prefix : "";
    const body = ln.slice(pre.length);
    const lead = body.match(/^\s*/)![0], tail = body.match(/\s*$/)![0];
    const core = body.slice(lead.length, body.length - tail.length);
    return { ln, atomic: false, pre, lead, tail, core };
  });
  const filled = parts.filter((p) => !p.atomic && p.core);
  // 고른 줄이 전부 그 서식 한 덩어리 → 전부 벗긴다
  const isRun = (c: string) => { const r = runsIn(c, mark); return r.length === 1 && r[0].open === 0 && r[0].close === c.length - m && c.length > 2 * m; };
  const unwrapAll = lines.length > 1 && filled.length > 0 && filled.every((p) => isRun(p.core));
  const out = parts.map((p) => {
    if (p.atomic || !p.core) return { out: p.ln, at: 0, len: 0 };
    if (unwrapAll) { const inner = p.core.slice(m, -m); return { out: p.pre + p.lead + inner + p.tail, at: p.pre.length + p.lead.length, len: inner.length }; }
    // 안에 같은 서식이 있으면 걷어 내고 하나로 씌운다(짝 없는 기호는 그대로)
    const plain = runsIn(p.core, mark).length ? stripRuns(p.core, mark) : p.core;
    return { out: p.pre + p.lead + mark + plain + mark + p.tail, at: p.pre.length + p.lead.length + m, len: plain.length };
  });
  const text = out.map((p) => p.out).join("\n");
  if (lines.length === 1) {
    const p = out[0];
    if (!p.len && text === sel) return { start: s, end: e, text, selStart: s, selEnd: e };
    return { start: s, end: e, text, selStart: s + p.at, selEnd: s + p.at + p.len };
  }
  return { start: s, end: e, text, selStart: s, selEnd: s + text.length };
}
// 짝지은 서식 기호만 걷어 낸다
function stripRuns(c: string, mark: WrapMark) {
  const m = mark.length;
  let out = "", i = 0;
  for (const r of runsIn(c, mark)) { out += c.slice(i, r.open) + c.slice(r.open + m, r.close); i = r.close + m; }
  return out + c.slice(i);
}

// 선택이 걸친 줄들 — 끝이 다음 줄 맨 앞이면 그 줄은 빼고
function lineSpan(v: string, s: number, e: number) {
  const a = lineStartAt(v, s);
  const eEff = e > s && v[e - 1] === "\n" ? e - 1 : e;
  const b = lineEndAt(v, Math.max(eEff, a));
  return { a, b, lines: v.slice(a, b).split("\n") };
}
const PREFIX: Record<string, string> = { h1: "# ", h2: "## ", h3: "### ", small: "-# ", quote: "> " };
const isHeadingish = (k: LineKind | undefined | null) => k === "h1" || k === "h2" || k === "h3" || k === "small";
// 줄 앞 기호를 떼고 { 들여쓰기, 글 }
function stripBlock(line: string): { indent: string; body: string; kind: LineKind | null } {
  const k = lineKindOf(line);
  if (!k || k.kind === "hr") return { indent: "", body: line, kind: k?.kind ?? null };
  const indent = k.kind === "bullet" || k.kind === "number" ? line.match(/^ */)![0] : "";
  return { indent, body: k.body, kind: k.kind };
}

// 글자 크기(본문 · 큰 제목 · 중간 제목 · 작은 제목 · 작은 글씨) · 목록 · 번호 · 인용 — 걸친 줄마다.
//  kind null = 본문(제목 · 작은 글씨를 뗀다). 이미 전부 그 서식이면 뗀다(목록 · 번호 · 인용 · 제목 단추를 다시 누르면 꺼짐)
export function setBlock(v: string, s: number, e: number, kind: BlockKind | null): Edit {
  const { a, b, lines } = lineSpan(v, s, e);
  // 표 · 구분선 · 이미지 줄은 건너뛴다(기호가 붙으면 깨진다)
  const filled = lines.filter((l) => l.trim() && !isAtomicLine(l));
  const all = filled.length > 0 && filled.every((l) => lineKindOf(l)?.kind === kind);
  const off = kind === null || all;
  let n = 0;
  const out = lines.map((ln) => {
    if ((!ln.trim() && lines.length > 1) || isAtomicLine(ln)) return ln;
    const st = stripBlock(ln);
    if (off) {
      if (kind === null) return isHeadingish(st.kind) ? st.body : ln; // 본문 — 크기만 되돌린다(목록 · 인용은 그대로)
      return st.indent + st.body;
    }
    if (kind === "bullet") return `${st.indent}* ${st.body}`;
    if (kind === "number") return `${st.indent}${++n}. ${st.body}`;
    return PREFIX[kind] + st.body;
  });
  const text = out.join("\n");
  if (s === e && lines.length === 1) {
    // 커서 하나 — 글(body)은 그대로라 기호 길이가 바뀐 만큼 옮긴다. 기호 안쪽에 있었으면 글 맨 앞으로
    if (out[0] === lines[0]) return { start: a, end: b, text, selStart: s, selEnd: s };
    const bodyLen = stripBlock(lines[0]).body.length;
    const oldPre = lines[0].length - bodyLen, newPre = out[0].length - bodyLen;
    const pos = a + newPre + Math.min(bodyLen, Math.max(0, s - a - oldPre));
    return { start: a, end: b, text, selStart: pos, selEnd: pos };
  }
  return { start: a, end: b, text, selStart: a, selEnd: a + text.length };
}

// 구분선 — 그 줄이 비었으면 그 자리, 아니면 줄 아래에. 커서는 선 다음 줄
export function insertHr(v: string, s: number): Edit {
  const ls = lineStartAt(v, s), le = lineEndAt(v, s);
  if (!v.slice(ls, le).trim()) {
    const text = "---\n";
    return { start: ls, end: le, text, selStart: ls + text.length, selEnd: ls + text.length };
  }
  const text = "\n---\n";
  return { start: le, end: le, text, selStart: le + text.length, selEnd: le + text.length };
}

// 커서 자리에 글 넣기(기호 · 이미지 등) — 고른 글은 바꾼다
export function insertAt(s: number, e: number, text: string, selFromEnd = 0): Edit {
  const p = s + text.length - selFromEnd;
  return { start: s, end: e, text, selStart: p, selEnd: p };
}

// 한 줄을 통째로 차지해야 하는 덩어리(이미지 · 표) — 앞뒤에 줄바꿈을 맞춰 넣는다. 커서는 덩어리 끝
export function insertBlockAt(v: string, s: number, e: number, md: string): Edit {
  const before = v.slice(0, s), after = v.slice(e);
  const pre = before && !before.endsWith("\n") ? "\n" : "";
  const post = after && !after.startsWith("\n") ? "\n" : "";
  const text = pre + md + post;
  const p = s + pre.length + md.length;
  return { start: s, end: e, text, selStart: p, selEnd: p };
}

// 링크 — [글](주소). 글이 비면 주소를 글로
export function linkEdit(s: number, e: number, label: string, url: string): Edit {
  const text = `[${label.trim() || url.trim()}](${url.trim()})`;
  return { start: s, end: e, text, selStart: s + text.length, selEnd: s + text.length };
}
export const isUrl = (t: string) => /^https?:\/\/[^\s<>"']+$/i.test(t.trim());

// Enter — 목록 · 번호 · 인용 줄이면 다음 줄에 같은 기호(번호는 +1, 아래 번호도 이어 고친다).
//  빈 항목에서 Enter 면: 들여쓴 항목은 한 단 내어쓰고, 아니면 기호를 떼고 목록을 끝낸다. 해당 없으면 null(기본 동작)
export function enterEdit(v: string, s: number, e: number): Edit | null {
  if (s !== e) return null;
  const ls = lineStartAt(v, s), le = lineEndAt(v, s);
  const line = v.slice(ls, le);
  const k = lineKindOf(line);
  if (!k || (k.kind !== "bullet" && k.kind !== "number" && k.kind !== "quote")) return null;
  if (s - ls < k.prefix.length) return null; // 기호 앞에서 누르면 그냥 줄바꿈
  if (!k.body.trim()) {
    if ((k.kind === "bullet" || k.kind === "number") && k.depth > 0) {
      const text = line.slice(2);
      return { start: ls, end: le, text, selStart: ls + text.length, selEnd: ls + text.length };
    }
    return { start: ls, end: le, text: "", selStart: ls, selEnd: ls };
  }
  const indent = line.match(/^ */)![0];
  const next = k.kind === "bullet" ? `${indent}${k.prefix.trim().charAt(0)} ` : k.kind === "number" ? `${indent}${k.n + 1}. ` : "> ";
  // 번호 — 바로 아래로 이어지는 같은 단 번호를 하나씩 민다
  let tailEnd = le, tail = "";
  if (k.kind === "number") {
    let n = k.n + 1, p = le;
    const rows: string[] = [];
    while (p < v.length) {
      const nls = p + 1, nle = lineEndAt(v, nls);
      const nl = v.slice(nls, nle);
      const nk = lineKindOf(nl);
      if (!nk || nk.kind !== "number" || nk.depth !== k.depth) break;
      rows.push(nl.replace(/^( *)\d{1,3}([.)])/, `$1${++n}$2`));
      p = nle;
    }
    if (rows.length) { tailEnd = p; tail = "\n" + rows.join("\n"); }
  }
  const text = "\n" + next + v.slice(s, le) + tail;
  return { start: s, end: tailEnd, text, selStart: s + 1 + next.length, selEnd: s + 1 + next.length };
}

// Tab · Shift+Tab — 목록 · 번호 줄을 두 칸씩 들이고 내어쓴다. 걸친 줄에 목록이 없으면 null(기본 동작)
export function indentEdit(v: string, s: number, e: number, out: boolean): Edit | null {
  const { a, b, lines } = lineSpan(v, s, e);
  const isList = (l: string) => { const k = lineKindOf(l)?.kind; return k === "bullet" || k === "number"; };
  if (!lines.some(isList)) return null;
  let d0 = 0;
  const res = lines.map((l, i) => {
    if (!isList(l)) return l;
    const nl = out ? l.replace(/^ {1,2}/, "") : (l.match(/^ */)![0].length >= 8 ? l : "  " + l);
    if (i === 0) d0 = nl.length - l.length;
    return nl;
  });
  const text = res.join("\n");
  if (s === e) { const p = Math.max(a, s + d0); return { start: a, end: b, text, selStart: p, selEnd: p }; }
  return { start: a, end: b, text, selStart: a, selEnd: a + text.length };
}

// 값에 Edit 를 적용한 결과(시험 · 되돌리기 실패 때 대신 넣기)
export const applyToValue = (v: string, ed: Edit) => v.slice(0, ed.start) + ed.text + v.slice(ed.end);
