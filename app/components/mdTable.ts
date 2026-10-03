// 📌 본문 표 문법 — app/components/FormattedText.tsx parseMarkdownWithTable · parseMarkdownTable 과 같은 규칙으로 읽고 쓴다.
//    · "|" 로 시작하는 줄(앞 공백 무시)이 이어지면 한 덩어리 — 렌더러가 표 하나로 묶는 단위와 같다
//    · 첫 줄 = 머리(th) · 둘째 줄 = 구분줄 · 나머지 = 몸통. 렌더러는 첫 줄을 늘 머리로 그린다(머리 없는 표 없음)
//    · 렌더러의 구분줄은 - 와 공백만 받는다(/^\|[\s|-]+\|$/) → 정렬(:---:)을 쓰면 표가 안 그려지고 글자 그대로 나온다. 쓸 때는 늘 | --- |
//    · 렌더러는 \| 이스케이프를 모른다(split("|")) → 칸 안 | 는 전각 ｜ 로 바꿔 쓴다. 읽어 올 때는 다시 | 로 보여 준다
export type Grid = string[][];

export const isPipeLine = (l: string) => l.trim().startsWith("|");

// 구분줄 — 읽을 때는 넓게(정렬 : 이 섞인 고장 난 표도 불러와 고칠 수 있게)
const isSepLine = (l: string) => {
  const t = l.trim();
  return /^[\s|:-]+$/.test(t) && t.includes("-") && t.startsWith("|");
};

// 한 줄 → 칸들. 끝 | 가 빠진 줄도 마지막 칸을 살린다(렌더러는 그 칸을 버린다 — 불러와 바꾸면 고쳐진다)
const cellsOf = (line: string): string[] => {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim().replace(/｜/g, "|"));
};

// 덩어리 줄들 → 칸 격자(머리 + 몸통). 표가 아니면 null
export function readTable(lines: string[]): Grid | null {
  if (lines.length < 2 || !isSepLine(lines[1])) return null;
  const rows = [lines[0], ...lines.slice(2)].map(cellsOf);
  const n = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array<string>(n - r.length).fill("")]);
}

// 커서(pos)가 놓인 "|" 덩어리. grid 가 null 이면 | 줄이지만 표 문법이 아닌 것
export function findTableAt(text: string, pos: number): { start: number; end: number; grid: Grid | null } | null {
  const lines = text.split("\n");
  let idx = lines.length - 1;
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    if (pos <= acc + lines[i].length) { idx = i; break; }
    acc += lines[i].length + 1;
  }
  if (!isPipeLine(lines[idx] || "")) return null;
  let a = idx;
  let b = idx;
  while (a > 0 && isPipeLine(lines[a - 1])) a--;
  while (b < lines.length - 1 && isPipeLine(lines[b + 1])) b++;
  const offset = (i: number) => lines.slice(0, i).reduce((s, l) => s + l.length + 1, 0);
  return { start: offset(a), end: offset(b) + lines[b].length, grid: readTable(lines.slice(a, b + 1)) };
}

// 칸 글자 — 줄바꿈은 한 칸, | 는 전각 ｜
const cellText = (s: string) => s.replace(/\r?\n/g, " ").replace(/\|/g, "｜").trim();

// 칸 격자 → 렌더러가 그리는 표 글자
export function buildTable(grid: Grid): string {
  const n = Math.max(1, ...grid.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: n }, (_, i) => cellText(r[i] ?? "")).join(" | ")} |`;
  return [line(grid[0] || []), `| ${Array<string>(n).fill("---").join(" | ")} |`, ...grid.slice(1).map(line)].join("\n");
}

// 📌 text 의 [start, end) 를 표 덩어리로 바꾼다. 표가 제 줄을 차지하게 앞뒤 줄을 끊고,
//    바로 옆 줄이 | 로 시작하면 한 덩어리로 붙어 표가 깨지므로 빈 줄을 하나 둔다.
//    selStart · selEnd: 넣은 표의 글자 범위(편집 칸은 selEnd 에 커서를 둔다)
export function spliceBlock(text: string, start: number, end: number, block: string) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  let lead = "";
  let trail = "";
  if (before) {
    const prev = (before.endsWith("\n") ? before.slice(0, -1) : before).split("\n").pop() ?? "";
    if (!before.endsWith("\n")) lead = "\n";
    if (isPipeLine(prev)) lead += "\n";
  }
  if (after) {
    const next = (after.startsWith("\n") ? after.slice(1) : after).split("\n")[0];
    if (!after.startsWith("\n")) trail = "\n";
    if (isPipeLine(next)) trail += "\n";
  }
  const selStart = before.length + lead.length;
  return { text: before + lead + block + trail + after, selStart, selEnd: selStart + block.length };
}
