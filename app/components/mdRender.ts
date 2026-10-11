// 📌 본문 서식 → HTML (RenderFormattedText · 글쓰기 미리보기 · 공지 · 이벤트 · 대회 · 서포터즈 · 구인이 같은 규칙)
//    JSX 없는 순수 함수 — scripts/test-md-edit.mjs 가 그대로 돌려 본다.
//  · 글자: **굵게** __밑줄__ ~~취소선~~ ==강조== [링크](url) ![설명](이미지) {복사코드}
//  · 줄 앞(2026-10-11 운영자 "* 하면 점이 너무 얇고 · 글자 크기도 내 맘대로 못 하고"):
//      # 큰 제목 · ## 중간 제목 · ### 작은 제목 · -# 작은 글씨 (디스코드와 같은 기호)
//      * 또는 - 목록(굵은 점, 앞 공백 두 칸마다 한 단 들여쓰기) · 1. 번호 목록 · > 인용 · --- 구분선(그 줄에 그것만)
//    줄 앞 서식은 한 줄을 통째로 차지하는 덩어리(block)라 그 뒤 줄바꿈(\n)을 붙이지 않는다 — 붙이면 빈 줄이 하나 더 생긴다(실측).
//    표는 예전 그대로(뒤에 \n — 이미 쓴 글 간격이 바뀌지 않게)
//  · dark — 어두운 바탕(대회 글). 제목 글자색만 다르다(밝은 바탕은 짙은 잉크, 어두운 바탕은 흰색)

const safeUrl = (u: string) => (/^https?:\/\/[^"'<>\s]+$/i.test(String(u).trim()) ? String(u).trim() : "");
// 본문의 꺾쇠·따옴표를 먼저 글자로 바꿔 둔다 (a<b 가 태그로 먹히거나 속성이 깨지지 않게)
const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// 복사 단추 data-copy — 앞 단계(링크 · 이미지)가 만든 태그는 떼고, 따옴표 · 꺾쇠 · 서식 기호는 문자 참조로(속성을 깨고 나가거나 뒤 단계 **·__·~~·== 가 속성 안을 바꾸지 않게).
//    이미 escapeHtml 이 만든 &#39; 같은 참조는 그대로 — getAttribute 가 원래 글자로 돌려준다
const copyAttr = (code: string) => code.replace(/<[^>]*>/g, "").replace(/['"<>`*_~=\[\]()!]/g, (c) => `&#${c.charCodeAt(0)};`);

// 줄 안 글자 서식 — cell: 표 칸(칸 머리 "* " 는 예전처럼 점 글자로)
export function formatInline(t: string, cell = false): string {
  let s = escapeHtml(t)
    // 이미지 — 링크보다 먼저 걸러야 한다 (뒤에 두면 링크로 잡히고 ! 만 남는다)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m: string, alt: string, url: string) => {
      const src = safeUrl(url);
      if (!src) return m;
      const cap = String(alt || "").replace(/[<>"']/g, "");
      return `<img src='${src}' alt='${cap}' loading='lazy' class='block w-full h-auto rounded-xl border border-[rgba(128,128,128,.35)] my-5' />`
        + (cap ? `<span class='block text-center text-[12px] text-[#8a8a8a] -mt-3 mb-5'>${cap}</span>` : "");
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m: string, label: string, url: string) => {
      const href = safeUrl(url);
      if (!href) return label;
      return `<a href='${href}' target='_blank' rel='noopener noreferrer' class='text-[#e91e3f] hover:underline'>${label}</a>`;
    })
    // 복사 단추는 type='button' — 글쓰기 미리보기처럼 form 안에 그려져도 누를 때 글이 제출되지 않게
    .replace(/\{([^}]+)\}/g, (_m, code) => `<span class='inline-flex items-center gap-1.5 bg-[rgba(128,128,128,.16)] px-2.5 py-1 rounded'><code class='text-[#e91e3f] font-mono text-sm'>${code}</code><button type='button' class='copy-btn text-[#e91e3f] hover:opacity-70 transition-opacity flex-shrink-0' data-copy='${copyAttr(code)}' title='복사'><svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' strokeWidth='2' stroke='currentColor' class='w-3.5 h-3.5'><path strokeLinecap='round' strokeLinejoin='round' d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' /></svg></button></span>`)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<span class='underline'>$1</span>")
    .replace(/~~(.*?)~~/g, "<span class='line-through'>$1</span>")
    .replace(/==(.*?)==/g, "<span class='text-[#e91e3f] font-bold'>$1</span>");
  if (cell) s = s.replace(/^(\s*)\*[ \t]+/, "$1<span class='text-[#e91e3f]'>·</span> ");
  return s;
}

// 줄 앞 서식 하나 — 맞으면 { kind, depth, n, body }. 본문 편집기(app/write/mdEdit.ts)도 같은 판정
export type LineKind = "h1" | "h2" | "h3" | "small" | "bullet" | "number" | "quote" | "hr";
export function lineKindOf(line: string): { kind: LineKind; depth: number; n: number; body: string; prefix: string } | null {
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return { kind: "hr", depth: 0, n: 0, body: "", prefix: line };
  let m = /^(#{1,3}) (.*)$/.exec(line);
  if (m) return { kind: (["h1", "h2", "h3"] as const)[m[1].length - 1], depth: 0, n: 0, body: m[2], prefix: m[1] + " " };
  m = /^-# (.*)$/.exec(line);
  if (m) return { kind: "small", depth: 0, n: 0, body: m[1], prefix: "-# " };
  m = /^>(?: (.*))?$/.exec(line); // "> 글" · ">" 만 — ">_<" 같은 글자는 인용이 아니다
  if (m) return { kind: "quote", depth: 0, n: 0, body: m[1] ?? "", prefix: line.slice(0, line.length - (m[1] ?? "").length) };
  m = /^( *)([*-])[ \t]+(.*)$/.exec(line);
  if (m) return { kind: "bullet", depth: Math.min(4, Math.floor(m[1].length / 2)), n: 0, body: m[3], prefix: line.slice(0, line.length - m[3].length) };
  // 「10. 12.(일) 예선」 같은 날짜 줄은 번호가 아니다 — 글이 또 「숫자.」로 시작하면 빼고(「1. 2.5kg」 은 번호)
  m = /^( *)(\d{1,3})[.)][ \t]+(?!\d{1,2}[.)](?:[ \t(]|$))(.*)$/.exec(line);
  if (m) return { kind: "number", depth: Math.min(4, Math.floor(m[1].length / 2)), n: Number(m[2]), body: m[3], prefix: line.slice(0, line.length - m[3].length) };
  return null;
}

function blockHtml(line: string, dark: boolean): string | null {
  const k = lineKindOf(line);
  if (!k) return null;
  const strong = dark ? "text-white" : "text-[#131313]";
  const body = formatInline(k.body);
  const pad = k.depth ? ` style='padding-left:${k.depth * 1.4}em'` : "";
  switch (k.kind) {
    case "hr":
      return "<span class='block my-5 border-t border-[rgba(128,128,128,.35)]'></span>";
    case "h1":
      return `<span class='block mt-7 mb-2 first:mt-0 text-[24px] md:text-[28px] leading-snug font-black tracking-tight ${strong}'>${body}</span>`;
    case "h2":
      return `<span class='block mt-6 mb-1.5 first:mt-0 text-[20px] md:text-[22px] leading-snug font-black tracking-tight ${strong}'>${body}</span>`;
    case "h3":
      return `<span class='block mt-5 mb-1 first:mt-0 text-[16.5px] md:text-[17.5px] leading-snug font-bold ${strong}'>${body}</span>`;
    case "small":
      return `<span class='block text-[0.86em] opacity-75'>${body}</span>`;
    case "quote":
      return `<span class='block pl-3.5 border-l-[3px] border-[rgba(128,128,128,.4)] opacity-85'>${body || "&nbsp;"}</span>`;
    case "bullet":
      // 점은 줄 높이(1lh) 가운데 — 글이 여러 줄로 넘어가도 둘째 줄은 글 첫 글자에 맞춘다(내어쓰기)
      return `<span class='flex'${pad}><span aria-hidden class='shrink-0 w-[1.3em] h-[1lh] flex items-center'><span class='block w-[0.42em] h-[0.42em] rounded-full bg-[#e91e3f]'></span></span><span class='min-w-0 flex-1'>${body}</span></span>`;
    case "number":
      return `<span class='flex'${pad}><span class='shrink-0 min-w-[1.7em] pr-[0.35em] font-bold tabular-nums text-[#e91e3f]'>${k.n}.</span><span class='min-w-0 flex-1'>${body}</span></span>`;
  }
  return null;
}

function parseTable(lines: string[]): string | null {
  if (lines.length < 2) return null;
  const headerLine = lines[0].trim();
  const separatorLine = lines[1].trim();
  if (!/^\|.*\|$/.test(headerLine) || !/^\|[\s|-]+\|$/.test(separatorLine)) return null;
  const parseRow = (line: string): string[] => line.split("|").slice(1, -1).map((cell) => cell.trim());
  const headerCells = parseRow(headerLine);
  const dataRows = lines.slice(2).map(parseRow);
  let html = "<table class='w-full border-collapse border border-[rgba(128,128,128,.35)] my-4'>";
  html += "<thead><tr>";
  headerCells.forEach((cell) => {
    html += `<th class='border border-[rgba(128,128,128,.35)] px-3 py-2 bg-[rgba(128,128,128,.12)] text-left font-bold'>${formatInline(cell, true)}</th>`;
  });
  html += "</tr></thead><tbody>";
  dataRows.forEach((cells) => {
    html += "<tr>";
    cells.forEach((cell) => {
      html += `<td class='border border-[rgba(128,128,128,.35)] px-3 py-2'>${formatInline(cell, true)}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  return html;
}

export function renderMarkdownHtml(input: string, { dark = false }: { dark?: boolean } = {}): string {
  const lines = String(input || "").replace(/\r\n?/g, "\n").split("\n");
  const parts: { html: string; block: boolean }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) tableLines.push(lines[i++]);
      const table = parseTable(tableLines);
      if (table) parts.push({ html: table, block: false });
      else parts.push(...tableLines.map((l) => ({ html: formatInline(l), block: false })));
      continue;
    }
    const b = blockHtml(line, dark);
    parts.push(b != null ? { html: b, block: true } : { html: formatInline(line), block: false });
    i++;
  }
  let out = "";
  parts.forEach((p, j) => {
    if (j > 0 && !parts[j - 1].block) out += "\n";
    out += p.html;
  });
  return out;
}
