"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MESSAGE_DEFS, COMMON_VARS, COLOR_PRESETS, LIMITS } from "@/lib/botMessages";
import { playTone } from "@/lib/sfx";
import { Panel, Btn, Switch, inputClass } from "../ui";

// 📌 봇 메시지 편집 부품 — 관리 › 봇 메시지(./page.tsx)와 글쓰기 › 디스코드 공지 팝업(app/write/NoticeDiscordDialog.tsx)이 같이 쓴다.
//    · 템플릿 모양(Tpl) ↔ 초안(Draft) · 검사(서버 lib/botMessageClean.js 와 같은 규칙) · 변수 넣기
//    · 디스코드처럼 그린 미리보기(DiscordPreview) — 그리는 값은 lib/botMessages.js renderTemplate(봇과 같은 규칙)의 결과
//    · 임베드 편집 판(EmbedPanel) · 변수 칩(VarChips) · 글 칸(TextBox · Blk · Sub)
//    한쪽 화면만 고치지 말고 여기를 고친다 — 두 화면의 편집 · 미리보기가 어긋나지 않게

export type Field = { name: string; value: string; inline: boolean };
export type Embed = {
  on: boolean;
  color: string;
  authorName: string;
  authorIcon: string;
  title: string;
  url: string;
  description: string;
  thumbnail: string;
  image: string;
  footerText: string;
  footerIcon: string;
  timestamp: boolean;
  fields: Field[];
};
export type Tpl = { enabled: boolean; card: boolean; content: string; embed: Embed };
// 초안의 필드에는 화면 전용 id — 순서를 바꾸거나 지워도 입력칸이 같은 필드를 따라가게 (서버로는 안 보낸다)
export type DField = Field & { id: number };
export type DEmbed = Omit<Embed, "fields"> & { fields: DField[] };
export type Draft = { enabled: boolean; card: boolean; content: string; embed: DEmbed };
export type VarDef = { name: string; label: string; sample: unknown };
export type REmbed = Omit<Embed, "on">;
export type Rendered = { enabled: boolean; content: string; embed: REmbed | null; empty: boolean };
export type EmbedText = "color" | "authorName" | "authorIcon" | "title" | "url" | "description" | "thumbnail" | "image" | "footerText" | "footerIcon";

export const COMMON = COMMON_VARS as VarDef[];
export const SWATCHES = (COLOR_PRESETS as { value: string; label: string }[]).filter((p) => p.value !== "tier");
export const LIM = LIMITS as Record<string, number>;
const DEFS = MESSAGE_DEFS as unknown as Record<string, { vars?: VarDef[] }>;

// ── 템플릿 모양 ────────────────────────────────
export const TEXT_KEYS: EmbedText[] = ["color", "authorName", "authorIcon", "title", "url", "description", "thumbnail", "image", "footerText", "footerIcon"];
export const str = (v: unknown) => (typeof v === "string" ? v : "");

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === "object" ? (v as Loose) : {});
export function normTpl(raw: unknown): Tpl {
  const r = obj(raw);
  const e = obj(r.embed);
  const embed = { on: e.on !== false, timestamp: !!e.timestamp } as Embed;
  for (const k of TEXT_KEYS) embed[k] = str(e[k]);
  embed.fields = (Array.isArray(e.fields) ? e.fields : []).map((f) => {
    const x = obj(f);
    return { name: str(x.name), value: str(x.value), inline: !!x.inline };
  });
  return { enabled: r.enabled !== false, card: r.card !== false, content: str(r.content), embed };
}

let fieldSeq = 0;
// prev 를 주면 같은 자리 필드의 id 를 이어 쓴다 — 저장 직후 입력칸이 다시 그려져 커서가 빠지지 않게
export const toDEmbed = (e: Embed, prev?: DEmbed): DEmbed => ({ ...e, fields: e.fields.map((f, i) => ({ ...f, id: prev?.fields[i]?.id ?? ++fieldSeq })) });
export const toDraft = (t: Tpl, prev?: Draft): Draft => ({
  enabled: t.enabled,
  card: t.card,
  content: t.content,
  embed: toDEmbed(t.embed, prev?.embed),
});
export const fromDraft = (d: Draft): Tpl => ({
  enabled: d.enabled,
  card: d.card,
  content: d.content,
  embed: { ...d.embed, fields: d.embed.fields.map(({ name, value, inline }) => ({ name, value, inline })) },
});
export const embedSig = (e: Omit<Embed, "fields"> & { fields: Field[] }) =>
  JSON.stringify([e.on, ...TEXT_KEYS.map((k) => e[k]), e.timestamp, e.fields.map((f) => [f.name, f.value, f.inline])]);
export const sigOf = (t: Tpl) => JSON.stringify([t.enabled, t.card, t.content, embedSig(t.embed)]);

// 바뀐 묶음 — 저장 줄의 변경 목록 · 칸 이름 옆 빨간 점
const PARTS: { label: string; get: (t: Tpl) => unknown }[] = [
  { label: "보내기", get: (t) => t.enabled },
  { label: "카드", get: (t) => t.card },
  { label: "본문", get: (t) => t.content },
  { label: "임베드", get: (t) => t.embed.on },
  { label: "색", get: (t) => t.embed.color },
  { label: "작성자", get: (t) => [t.embed.authorName, t.embed.authorIcon] },
  { label: "제목", get: (t) => [t.embed.title, t.embed.url] },
  { label: "설명", get: (t) => t.embed.description },
  { label: "이미지", get: (t) => [t.embed.thumbnail, t.embed.image] },
  { label: "필드", get: (t) => t.embed.fields.map((f) => [f.name, f.value, f.inline]) },
  { label: "푸터", get: (t) => [t.embed.footerText, t.embed.footerIcon] },
  { label: "시각", get: (t) => t.embed.timestamp },
];
export const changedParts = (a: Tpl, b: Tpl) => PARTS.filter((p) => JSON.stringify(p.get(a)) !== JSON.stringify(p.get(b))).map((p) => p.label);

// ── 검사 (서버와 같은 규칙 — 저장 전에 칸 아래에 알린다) ─────────
export const URL_FIELDS: [EmbedText, string][] = [
  ["authorIcon", "작성자 아이콘"],
  ["url", "제목 링크"],
  ["thumbnail", "썸네일"],
  ["image", "큰 이미지"],
  ["footerIcon", "푸터 아이콘"],
];
const varNamesOf = (key: string) => new Set([...COMMON, ...(DEFS[key]?.vars || [])].map((v) => v.name));
const COLOR_RE = /^(tier|#[0-9a-f]{6}|#[0-9a-f]{3})$/i;
export const HEX6_RE = /^#[0-9a-f]{6}$/i;
const URL_MSG = "http(s) 주소 또는 {avatar} 같은 변수만 쓸 수 있습니다";

function badUrl(v: string, names: Set<string>) {
  const s = v.trim();
  if (!s) return false;
  if (/[\s<>"]/.test(s)) return true;
  const m = s.match(/^\{([a-zA-Z][a-zA-Z0-9]*)\}/);
  if (m) return !names.has(m[1]);
  return !/^https?:\/\/[^\s<>"]+$/i.test(s);
}
// { 칸 이름 → 알림 } — 비어 있으면 저장 가능
export function problemsOf(d: Draft, key: string): Partial<Record<EmbedText, string>> {
  const out: Partial<Record<EmbedText, string>> = {};
  const c = d.embed.color.trim();
  if (c && !COLOR_RE.test(c)) out.color = "#rrggbb 또는 등급 색만 쓸 수 있습니다";
  const names = varNamesOf(key);
  for (const [f] of URL_FIELDS) if (badUrl(d.embed[f], names)) out[f] = URL_MSG;
  return out;
}
export const firstProblem = (p: Partial<Record<EmbedText, string>>) => {
  if (p.color) return `색 — ${p.color}`;
  const hit = URL_FIELDS.find(([f]) => p[f]);
  return hit ? `${hit[1]} — ${URL_MSG}` : "";
};

// ── 변수 넣기용 칸 경로 ────────────────────────
//    "content" · "embed.title" … · 필드는 "f:<id>:name|value"
const FIELD_PATH = /^f:(\d+):(name|value)$/;
export function getText(d: Draft, path: string): string | null {
  if (path === "content") return d.content;
  if (path.startsWith("embed.")) {
    const k = path.slice(6) as EmbedText;
    return TEXT_KEYS.includes(k) ? d.embed[k] : null;
  }
  const m = path.match(FIELD_PATH);
  if (m) {
    const f = d.embed.fields.find((x) => x.id === Number(m[1]));
    return f ? f[m[2] as "name" | "value"] : null;
  }
  return null;
}
export function withText(d: Draft, path: string, v: string): Draft {
  if (path === "content") return { ...d, content: v };
  if (path.startsWith("embed.")) return { ...d, embed: { ...d.embed, [path.slice(6)]: v } };
  const m = path.match(FIELD_PATH);
  if (m) {
    const id = Number(m[1]);
    return { ...d, embed: { ...d.embed, fields: d.embed.fields.map((f) => (f.id === id ? { ...f, [m[2]]: v } : f)) } };
  }
  return d;
}
const MAX_OF: Record<string, number> = {
  content: LIM.content,
  "embed.title": LIM.title,
  "embed.description": LIM.description,
  "embed.authorName": LIM.authorName,
  "embed.footerText": LIM.footerText,
};
export const maxOf = (path: string) => {
  if (MAX_OF[path]) return MAX_OF[path];
  const m = path.match(FIELD_PATH);
  if (m) return m[2] === "name" ? LIM.fieldName : LIM.fieldValue;
  return LIM.url;
};

// ── 디스코드 마크다운 흉내 (미리보기 전용) ─────────────────
//    📌 원문은 전부 이스케이프한 뒤 정해 둔 태그만 끼운다. 주소는 http(s) 만 링크로.
//    멘션 변수(user · first …)의 예시 값은 표시 문자로 감싸 두었다가 멘션 모양으로 바꾼다.
export const M_OPEN = "";
export const M_CLOSE = "";
export const MENTION_VARS = ["user", "first", "second", "third"];
const MENTION_RE = /([^]*)/g;
const SLOT_RE = /(\d+)/g;
const NO_LINKS = { links: false, mentions: false };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// 작성자 · 푸터처럼 마크다운이 먹지 않는 칸 — 멘션도 디스코드처럼 날것으로 (React 가 이스케이프한다)
const plainText = (s: string) => String(s || "").replace(MENTION_RE, (_m, n) => `<@${n}>`);
const anchor = (url: string, inner: string) => `<a class="dc-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;

function emph(s: string) {
  let h = esc(s);
  h = h.replace(/\|\|(.+?)\|\|/g, '<span class="dc-spoiler">$1</span>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/__(.+?)__/g, "<u>$1</u>");
  h = h.replace(/\*(?=\S)(.+?)\*/g, "<em>$1</em>");
  h = h.replace(/(^|[^A-Za-z0-9_])_(?=\S)(.+?)_(?![A-Za-z0-9_])/g, "$1<em>$2</em>");
  h = h.replace(/~~(.+?)~~/g, "<s>$1</s>");
  return h;
}

function inline(src: string, o: { links: boolean; mentions: boolean } = { links: true, mentions: true }) {
  const slots: string[] = [];
  const put = (html: string) => `${slots.push(html) - 1}`;
  const mention = (label: string) => put(`<span class="dc-mention">${esc(label)}</span>`);
  let s = String(src || "");
  s = s.replace(/``([^`]+?)``|`([^`\n]+?)`/g, (_m, a, b) => put(`<code class="dc-code">${esc(a ?? b)}</code>`));
  // 백슬래시 풀기 — 디스코드처럼 \# \> \* 는 서식 없이 글자 그대로(사이트 공지 요약이 줄 앞 기호를 이렇게 막는다)
  s = s.replace(/\\([\\*_~`|#>\-[\]()])/g, (_m, c) => put(esc(c)));
  s = s.replace(MENTION_RE, (_m, n) => (o.mentions ? mention(`@${n}`) : put(esc(`<@${n}>`))));
  if (o.mentions) {
    s = s.replace(/<@!?\d{5,25}>/g, () => mention("@사용자"));
    s = s.replace(/<@&\d{5,25}>/g, () => mention("@역할"));
    s = s.replace(/<#\d{5,25}>/g, () => mention("#채널"));
    s = s.replace(/@(everyone|here)\b/g, (m) => mention(m));
  }
  // 📌 주소에는 자리표(코드 · 멘션)를 넣지 않는다 — href 안에서 태그로 풀려 모양이 깨진다
  if (o.links) {
    s = s.replace(/\[([^\]\n]+)\]\(\s*<?(https?:\/\/[^\s<>()-]+)>?\s*\)/g, (_m, text, url) => put(anchor(url, emph(text))));
    s = s.replace(/<(https?:\/\/[^\s<>-]+)>/g, (_m, url) => put(anchor(url, esc(url))));
    s = s.replace(/https?:\/\/[^\s<>]*[^\s<>.,:;"'!?)\]]/g, (url) => put(anchor(url, esc(url))));
  }
  let h = emph(s);
  // 링크 글 안의 코드 · 멘션처럼 겹친 자리까지 풀리도록 몇 번 돈다
  for (let i = 0; i < 4 && h.includes(""); i++) h = h.replace(SLOT_RE, (_m, n) => slots[Number(n)] ?? "");
  return h;
}

type Piece = { h: string; block: boolean };
function pushLines(seg: string, out: Piece[]) {
  const ls = seg.split("\n");
  const st: { quote: string[] | null } = { quote: null };
  const flush = () => {
    if (!st.quote) return;
    out.push({ h: `<div class="dc-quote">${st.quote.map((q) => inline(q)).join("\n")}</div>`, block: true });
    st.quote = null;
  };
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    const all = line.match(/^>>> ?(.*)$/);
    if (all) {
      st.quote = [...(st.quote || []), all[1], ...ls.slice(i + 1)];
      break;
    }
    const q = line.match(/^> (.*)$/);
    if (q) {
      st.quote = [...(st.quote || []), q[1]];
      continue;
    }
    flush();
    const hd = line.match(/^(#{1,3}) (.+)$/);
    if (hd) {
      out.push({ h: `<div class="dc-h${hd[1].length}">${inline(hd[2])}</div>`, block: true });
      continue;
    }
    const sub = line.match(/^-# (.+)$/);
    if (sub) {
      out.push({ h: `<div class="dc-sub">${inline(sub[1])}</div>`, block: true });
      continue;
    }
    const li = line.match(/^\s*[-*] (.+)$/);
    if (li) {
      out.push({ h: `<div class="dc-li">${inline(li[1])}</div>`, block: true });
      continue;
    }
    out.push({ h: inline(line), block: false });
  }
  flush();
}

// 본문 · 설명 · 필드 값 — 코드 블록 · 인용 · 제목 줄 · 목록까지
export function md(src: string) {
  const text = String(src || "");
  if (!text) return "";
  const parts = text.split("```");
  // 홀수 번째 조각이 코드 — 단, 닫는 ``` 가 없는 마지막 조각은 글자 그대로
  const isCode = (j: number) => j % 2 === 1 && j < parts.length - 1;
  const out: Piece[] = [];
  parts.forEach((part, i) => {
    if (isCode(i)) {
      const code = part.replace(/^[a-zA-Z0-9_+#.-]*\n/, "").replace(/\n$/, "");
      out.push({ h: `<pre class="dc-pre"><code>${esc(code)}</code></pre>`, block: true });
      return;
    }
    let seg = i % 2 === 1 ? "```" + part : part;
    // 코드 블록 앞뒤 줄바꿈 하나는 블록이 대신한다
    if (isCode(i - 1)) seg = seg.replace(/^\n/, "");
    if (isCode(i + 1)) seg = seg.replace(/\n$/, "");
    if (seg) pushLines(seg, out);
  });
  let h = "";
  out.forEach((p, i) => {
    if (i > 0 && !p.block && !out[i - 1].block) h += "\n";
    h += p.h;
  });
  return h;
}

// 인라인 필드는 한 줄에 셋(썸네일이 있으면 둘)까지 — 디스코드와 같게
function fieldRows(fields: Field[], hasThumb: boolean) {
  const max = hasThumb ? 2 : 3;
  const rows: Field[][] = [];
  let cur: Field[] = [];
  for (const f of fields) {
    if (!f.inline) {
      if (cur.length) rows.push(cur);
      rows.push([f]);
      cur = [];
      continue;
    }
    cur.push(f);
    if (cur.length === max) {
      rows.push(cur);
      cur = [];
    }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

const DC_CSS = `
.dc-root{background:#313338;color:#dbdee1;font-family:"gg sans","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;font-size:15px;line-height:1.375;-webkit-font-smoothing:antialiased}
.dc-name{color:#f2f3f5;font-weight:600;font-size:15px;margin-right:4px}
.dc-app{display:inline-flex;align-items:center;height:15px;padding:0 4px;border-radius:3px;background:#5865f2;color:#fff;font-size:10px;font-weight:700;margin-right:6px;position:relative;top:-1px}
.dc-time{color:#949ba4;font-size:12px}
.dc-empty{margin-top:4px;color:#949ba4;font-size:14px}
.dc-text{margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere}
.dc-embed{margin-top:6px;max-width:520px;background:#2b2d31;border-left:4px solid #1e1f22;border-radius:4px;padding:0 16px 16px 12px;font-size:14px}
.dc-author{display:flex;align-items:center;padding-top:8px;color:#f2f3f5;font-size:14px;font-weight:600;overflow-wrap:anywhere}
.dc-author img{width:24px;height:24px;border-radius:50%;margin-right:8px;object-fit:cover;flex-shrink:0}
.dc-title{padding-top:8px;color:#f2f3f5;font-size:16px;font-weight:600;overflow-wrap:anywhere;white-space:pre-wrap}
.dc-title a{color:#00a8fc}
.dc-title a:hover{text-decoration:underline}
.dc-desc{padding-top:8px;white-space:pre-wrap;overflow-wrap:anywhere}
.dc-fields{padding-top:8px}
.dc-row{display:grid;column-gap:8px}
.dc-row+.dc-row{margin-top:8px}
.dc-fname{color:#f2f3f5;font-weight:600;margin-bottom:2px;overflow-wrap:anywhere;white-space:pre-wrap}
.dc-fvalue{white-space:pre-wrap;overflow-wrap:anywhere}
.dc-thumb{width:80px;height:80px;margin:8px 0 0 16px;border-radius:4px;object-fit:contain;flex-shrink:0}
.dc-image{display:block;margin-top:16px;max-width:100%;max-height:300px;border-radius:4px;object-fit:contain}
.dc-card{position:relative;display:block;margin-top:16px;width:100%;border-radius:4px;overflow:hidden;background:#1e1f22}
.dc-card.alone{margin-top:6px;max-width:520px}
.dc-card img{display:block;width:100%;height:100%}
.dc-card-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#949ba4;font-size:12px}
.dc-footer{display:flex;align-items:center;padding-top:8px;color:#b5bac1;font-size:12px;font-weight:500}
.dc-footer img{width:20px;height:20px;border-radius:50%;margin-right:8px;object-fit:cover;flex-shrink:0}
.dc-link{color:#00a8fc}
.dc-link:hover{text-decoration:underline}
.dc-mention{background:rgba(88,101,242,.3);color:#c9cdfb;border-radius:3px;padding:0 2px;font-weight:500}
.dc-code{background:#1e1f22;border-radius:4px;padding:0 .2em;font-family:Consolas,"Courier New",monospace;font-size:85%}
.dc-pre{margin:4px 0 0;padding:8px;background:#1e1f22;border-radius:4px;font-family:Consolas,"Courier New",monospace;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;color:#dbdee1}
.dc-quote{border-left:4px solid #4e5058;border-radius:2px;padding:0 8px 0 12px;margin:2px 0}
.dc-h1,.dc-h2,.dc-h3{color:#f2f3f5;font-weight:700;margin-top:6px;line-height:1.3}
.dc-h1{font-size:24px}.dc-h2{font-size:20px}.dc-h3{font-size:16px}
.dc-sub{font-size:12px;color:#949ba4}
.dc-li{position:relative;padding-left:16px}
.dc-li::before{content:"•";position:absolute;left:4px}
.dc-spoiler{background:#1e1f22;color:transparent;border-radius:3px}
.dc-spoiler:hover{background:rgba(255,255,255,.1);color:inherit}
.dc-root strong{font-weight:700}
.dc-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.dc-btn{display:inline-flex;align-items:center;max-width:100%;height:32px;padding:0 16px;border-radius:8px;background:#4e5058;color:#fff;font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc-btn svg{width:16px;height:16px;margin-left:8px;flex-shrink:0}
`;

// 불러오지 못한 이미지는 자리를 비운다 (주소가 바뀌면 key 로 다시 그린다)
const hideImg = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = "none";
};

// 카드 미리보기 — 봇이 붙이는 PNG 와 같은 템플릿(/api/admin/bot-messages/card). 자리는 카드 비율로 먼저 잡아 두어 불러오는 동안 아래가 밀리지 않게
//   주소가 바뀌면 key 로 다시 그린다(불러오는 중 상태부터)
export type CardView = { src: string; ratio: number };
function CardImg({ card, alone = false }: { card: CardView; alone?: boolean }) {
  const [state, setState] = useState<"load" | "ok" | "err">("load");
  return (
    <div className={`dc-card ${alone ? "alone" : ""} ${state === "load" ? "animate-pulse" : ""}`} style={{ aspectRatio: card.ratio }}>
      {state !== "err" && <img src={card.src} alt="카드 이미지" onLoad={() => setState("ok")} onError={() => setState("err")} />}
      {state === "err" && <span className="dc-card-msg">카드를 불러오지 못했습니다</span>}
    </div>
  );
}

function EmbedView({ e, clock, card }: { e: REmbed; clock: string; card: CardView | null }) {
  const rows = fieldRows(e.fields, !!e.thumbnail);
  const titleHtml = e.title ? inline(e.title, NO_LINKS) : "";
  return (
    <div className="dc-embed" style={{ borderLeftColor: e.color || "#1e1f22" }}>
      <div className="flex">
        <div className="min-w-0 flex-1">
          {e.authorName && (
            <div className="dc-author">
              {e.authorIcon && <img key={e.authorIcon} src={e.authorIcon} alt="" onError={hideImg} />}
              <span className="min-w-0">{plainText(e.authorName)}</span>
            </div>
          )}
          {titleHtml && (
            <div className="dc-title">
              {e.url ? (
                <a href={e.url} target="_blank" rel="noopener noreferrer" dangerouslySetInnerHTML={{ __html: titleHtml }} />
              ) : (
                <span dangerouslySetInnerHTML={{ __html: titleHtml }} />
              )}
            </div>
          )}
          {e.description && <div className="dc-desc" dangerouslySetInnerHTML={{ __html: md(e.description) }} />}
          {rows.length > 0 && (
            <div className="dc-fields">
              {rows.map((row, i) => (
                <div key={i} className="dc-row" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                  {row.map((f, j) => (
                    <div key={j} className="min-w-0">
                      <div className="dc-fname" dangerouslySetInnerHTML={{ __html: inline(f.name, NO_LINKS) }} />
                      <div className="dc-fvalue" dangerouslySetInnerHTML={{ __html: md(f.value) }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {e.thumbnail && <img key={e.thumbnail} src={e.thumbnail} alt="" className="dc-thumb" onError={hideImg} />}
      </div>
      {/* 카드가 켜져 있으면 봇이 큰 이미지 자리를 카드로 채운다 */}
      {card ? <CardImg key={card.src} card={card} /> : e.image && <img key={e.image} src={e.image} alt="" className="dc-image" onError={hideImg} />}
      {(e.footerText || e.timestamp) && (
        <div className="dc-footer">
          {e.footerIcon && e.footerText && <img key={e.footerIcon} src={e.footerIcon} alt="" onError={hideImg} />}
          <span className="min-w-0 break-words">
            {plainText(e.footerText)}
            {e.footerText && e.timestamp ? " • " : ""}
            {e.timestamp ? `오늘 ${clock}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// 카드가 켜져 있으면 — 임베드가 있으면 그 안, 없으면(임베드 꺼짐 · 빈 임베드) 본문 아래 첨부. 글이 전부 비어도 카드만 간다
//    buttons: 메시지 아래 링크 버튼 글자(디스코드 공지)
export function DiscordPreview({ r, clock, off, card, buttons }: { r: Rendered | null; clock: string; off: boolean; card: CardView | null; buttons?: string[] }) {
  const nothing = (!r || r.empty) && !card;
  return (
    <div className="dc-root px-4 py-4">
      <style>{DC_CSS}</style>
      <div className={`flex ${off ? "opacity-50" : ""}`}>
        <img src="/logo.png" alt="" className="w-10 h-10 rounded-full shrink-0 mr-3 bg-[#1e1f22] object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline">
            <span className="dc-name">고급 이글루</span>
            <span className="dc-app">앱</span>
            <span className="dc-time tabular-nums">{clock ? `오늘 ${clock}` : ""}</span>
          </div>
          {nothing ? (
            <p className="dc-empty">보낼 내용이 없습니다</p>
          ) : (
            <>
              {r?.content && <div className="dc-text" dangerouslySetInnerHTML={{ __html: md(r.content) }} />}
              {r?.embed && <EmbedView e={r.embed} clock={clock} card={card} />}
              {card && !r?.embed && <CardImg key={card.src} card={card} alone />}
              {buttons && buttons.length > 0 && (
                <div className="dc-btns">
                  {buttons.map((b, i) => (
                    <span key={i} className="dc-btn">
                      <span className="min-w-0 truncate">{b}</span>
                      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 편집 부품 ──────────────────────────────────
//    📌 모듈 스코프에 둔다 — 페이지 함수 안에서 정의하면 렌더마다 새 컴포넌트가 되어 타이핑 중 포커스가 날아간다.
export type Caret = (path: string, start: number, end: number) => void;

export function TextBox({
  path,
  value,
  onChange,
  onCaret,
  max,
  rows,
  placeholder,
  label,
  invalid = false,
  disabled = false,
}: {
  path: string;
  value: string;
  onChange: (v: string) => void;
  onCaret: Caret;
  max: number;
  rows?: number;
  placeholder?: string;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  // 모바일은 16px — 14px 이하면 iOS 가 포커스할 때 화면을 확대한다
  const cls = `${inputClass} max-md:text-[16px] ${invalid ? "!border-[#e91e3f]" : ""}`;
  const track = (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onCaret(path, e.currentTarget.selectionStart ?? 0, e.currentTarget.selectionEnd ?? 0);
  const common = {
    "data-path": path,
    value,
    maxLength: max,
    placeholder,
    disabled,
    "aria-label": label,
    "aria-invalid": invalid || undefined,
    onFocus: track,
    onSelect: track,
    onKeyUp: track,
    onClick: track,
  };
  return rows ? (
    <textarea {...common} rows={rows} onChange={(e) => { onChange(e.target.value); track(e); }} className={`${cls} resize-y leading-relaxed`} />
  ) : (
    <input type="text" {...common} onChange={(e) => { onChange(e.target.value); track(e); }} className={cls} />
  );
}

export const Dot = () => <span aria-label="바뀜" className="ml-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-[#e91e3f]" />;

// 패널 안 한 묶음 — 이름(바뀐 점 · 오른쪽 글자 수) + 입력
export function Blk({ label, changed = false, right, children }: { label: string; changed?: boolean; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-[#ededed] last:border-b-0">
      <div className="flex items-center min-h-5 mb-2">
        <span className="text-[13px] font-bold text-[#131313]">{label}</span>
        {changed && <Dot />}
        {right != null && <span className="ml-auto pl-3 text-[11px] text-[#8a8a8a] tabular-nums">{right}</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// 묶음 안의 작은 이름 + 입력 + 알림
export function Sub({ label, err, children }: { label: string; err?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1 text-[12px] font-bold text-[#5a5a5a]">{label}</p>
      {children}
      {err && <p className="mt-1 text-[12px] font-bold text-[#d01634] break-keep">{err}</p>}
    </div>
  );
}

export function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 inline-flex items-center justify-center text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f2f2f2] disabled:opacity-30 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30"
    >
      {children}
    </button>
  );
}

export const count = (n: number, max: number) => `${n.toLocaleString()} / ${max.toLocaleString()}`;

// ── 효과음 ─────────────────────────────────────
export const sfxOk = () => [660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.1, "sine", 0.035), i * 80));
export const sfxErr = () => {
  playTone(300, 0.14, "square", 0.035);
  setTimeout(() => playTone(220, 0.2, "square", 0.035), 130);
};

// 미리보기의 "오늘 오후 9:41" — 서버 그림과 어긋나지 않게 붙은 뒤에 채운다
export function useClock() {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return clock;
}

// ── 변수 넣기 ──────────────────────────────────
//    마지막으로 누른 글 칸과 커서 자리를 기억해 두었다가 변수 칩이 그 자리에 {이름}을 넣는다.
//    rootRef: 편집 칸들을 감싼 요소 — 넣은 뒤 그 칸으로 포커스를 돌린다
export function useVarInsert(rootRef: React.RefObject<HTMLElement | null>) {
  const caretRef = useRef<{ path: string; start: number; end: number } | null>(null);
  const onCaret = useCallback<Caret>((path, start, end) => {
    caretRef.current = { path, start, end };
  }, []);
  const resetCaret = useCallback(() => {
    caretRef.current = null;
  }, []);
  // 누른 칸이 없으면 설명(임베드를 껐으면 본문) 끝에
  const insertVar = useCallback(
    (draft: Draft | null, name: string, setText: (path: string, v: string) => void, onError: (msg: string) => void) => {
      if (!draft) return;
      const token = `{${name}}`;
      let a = caretRef.current;
      // 임베드를 끈 뒤엔 숨은 임베드 칸에 넣지 않는다
      if (!a || getText(draft, a.path) == null || (!draft.embed.on && a.path !== "content")) a = { path: draft.embed.on ? "embed.description" : "content", start: -1, end: -1 };
      const cur = getText(draft, a.path) ?? "";
      const s = a.start < 0 ? cur.length : Math.min(a.start, cur.length);
      const e = a.end < 0 ? s : Math.min(Math.max(a.end, s), cur.length);
      const next = cur.slice(0, s) + token + cur.slice(e);
      if (next.length > maxOf(a.path)) return onError("글자 수 한도를 넘습니다.");
      const path = a.path;
      const pos = s + token.length;
      setText(path, next);
      caretRef.current = { path, start: pos, end: pos };
      requestAnimationFrame(() => {
        const el = rootRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-path="${path}"]`);
        if (!el) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(pos, pos);
      });
    },
    [rootRef]
  );
  return { onCaret, resetCaret, insertVar };
}

// ── 변수 칩 ── 키 변수(진한 테두리) 다음 공통 변수. PC 는 줄바꿈, 모바일은 한 줄 가로 스크롤
export function VarChips({ vars, keyVarCount, onInsert }: { vars: VarDef[]; keyVarCount: number; onInsert: (name: string) => void }) {
  const insertVar = onInsert;
  return (
    <Panel flush>
      <div className="flex items-center px-4 py-2.5">
        <span className="shrink-0 mr-3 text-[12px] font-bold text-[#5a5a5a]">변수</span>
        <div className="min-w-0 flex-1 flex flex-nowrap lg:flex-wrap gap-1.5 overflow-x-auto no-bar lg:overflow-visible">
          {vars.map((v, i) => (
            <button
              key={v.name}
              type="button"
              title={v.label}
              // 누르는 순간 입력칸 포커스를 뺏지 않게 — 커서 자리가 그대로 남는다
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => insertVar(v.name)}
              className={`shrink-0 inline-flex items-center h-7 px-2.5 rounded-full border bg-white text-[12px] whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#131313]/20 ${i < keyVarCount ? "border-[#131313] text-[#131313]" : "border-[#a3a3a3] text-[#131313]"} hover:bg-[#f2f2f2]`}
            >
              <span className="font-mono font-bold">{`{${v.name}}`}</span>
              <span className="ml-1.5 text-[#5a5a5a]">{v.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ── 임베드 편집 판 ── 색 · 작성자 · 제목 · 설명 · 이미지 · 필드 · 푸터
//    tierChip: 색 고르기의 '등급 색'(레벨 변수가 있는 메시지만 뜻이 있다)
export function EmbedPanel({
  draft,
  patch,
  onCaret,
  problems,
  chg,
  cardOn = false,
  tierColor = "",
  tierChip = true,
  onLimit,
}: {
  draft: Draft;
  patch: (fn: (d: Draft) => Draft) => void;
  onCaret: Caret;
  problems: Partial<Record<EmbedText, string>>;
  chg: Set<string>;
  cardOn?: boolean;
  tierColor?: string;
  tierChip?: boolean;
  onLimit: (msg: string) => void;
}) {
  const e = draft.embed;
  const setEmb = (k: keyof Omit<Embed, "fields">, v: string | boolean) => patch((d) => ({ ...d, embed: { ...d.embed, [k]: v } }));
  const setText = (path: string, v: string) => patch((d) => withText(d, path, v));
  const setFieldInline = (id: number, v: boolean) =>
    patch((d) => ({ ...d, embed: { ...d.embed, fields: d.embed.fields.map((f) => (f.id === id ? { ...f, inline: v } : f)) } }));
  const addField = () => {
    if (e.fields.length >= LIM.fields) return onLimit(`필드는 ${LIM.fields}개까지입니다.`);
    const id = ++fieldSeq;
    patch((d) => ({ ...d, embed: { ...d.embed, fields: [...d.embed.fields, { id, name: "", value: "", inline: true }] } }));
  };
  const moveField = (i: number, dir: -1 | 1) =>
    patch((d) => {
      const f = d.embed.fields.slice();
      const j = i + dir;
      if (j < 0 || j >= f.length) return d;
      [f[i], f[j]] = [f[j], f[i]];
      return { ...d, embed: { ...d.embed, fields: f } };
    });
  const removeField = (id: number) => patch((d) => ({ ...d, embed: { ...d.embed, fields: d.embed.fields.filter((f) => f.id !== id) } }));

  return (
    <Panel
      flush
      title={
        <span className="inline-flex items-center">
          임베드{chg.has("임베드") && <Dot />}
        </span>
      }
      right={<Switch on={e.on} onChange={(v) => setEmb("on", v)} label="임베드" />}
    >
      {e.on && (
        <>
          <Blk label="색" changed={chg.has("색")}>
            <div className="flex flex-wrap items-center gap-2">
              {tierChip && (
                <button
                  type="button"
                  onClick={() => setEmb("color", "tier")}
                  aria-pressed={e.color === "tier"}
                  className={`inline-flex items-center h-8 px-3 rounded-full border text-[12px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/20 ${e.color === "tier" ? "border-[#131313] bg-[#131313] text-white" : "border-[#a3a3a3] text-[#131313] hover:border-[#131313]"}`}
                >
                  <span aria-hidden className="w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: tierColor }} />
                  등급 색
                </button>
              )}
              {SWATCHES.map((p) => {
                const on = e.color.toLowerCase() === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    title={p.label}
                    aria-label={p.label}
                    aria-pressed={on}
                    onClick={() => setEmb("color", p.value)}
                    className={`w-7 h-7 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "ring-2 ring-offset-2 ring-[#131313]" : "ring-1 ring-black/10"}`}
                    style={{ backgroundColor: p.value }}
                  />
                );
              })}
              <label title="직접 고르기" className="relative w-7 h-7 rounded-full overflow-hidden ring-1 ring-black/10 cursor-pointer" style={{ backgroundImage: "conic-gradient(#e91e3f, #c39220, #3f9e93, #3f7fc4, #8557b0, #e91e3f)" }}>
                <input
                  type="color"
                  aria-label="색 직접 고르기"
                  value={HEX6_RE.test(e.color) ? e.color.toLowerCase() : "#e91e3f"}
                  onChange={(ev) => setEmb("color", ev.target.value.toLowerCase())}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </label>
              <input
                type="text"
                aria-label="색 코드"
                value={e.color === "tier" ? "" : e.color}
                onChange={(ev) => setEmb("color", ev.target.value.trim().toLowerCase())}
                placeholder={e.color === "tier" ? "등급 색" : "#rrggbb"}
                maxLength={7}
                className={`${inputClass} max-md:text-[16px] !w-28 font-mono ${problems.color ? "!border-[#e91e3f]" : ""}`}
              />
            </div>
            {problems.color && <p className="mt-1.5 text-[12px] font-bold text-[#d01634]">{problems.color}</p>}
          </Blk>

          <Blk label="작성자" changed={chg.has("작성자")}>
            <Sub label="이름">
              <TextBox path="embed.authorName" value={e.authorName} onChange={(v) => setText("embed.authorName", v)} onCaret={onCaret} max={LIM.authorName} label="작성자 이름" />
            </Sub>
            <Sub label="아이콘" err={problems.authorIcon}>
              <TextBox path="embed.authorIcon" value={e.authorIcon} onChange={(v) => setText("embed.authorIcon", v)} onCaret={onCaret} max={LIM.url} label="작성자 아이콘 주소" placeholder="https://… 또는 {avatar}" invalid={!!problems.authorIcon} />
            </Sub>
          </Blk>

          <Blk label="제목" changed={chg.has("제목")} right={count(e.title.length, LIM.title)}>
            <TextBox path="embed.title" value={e.title} onChange={(v) => setText("embed.title", v)} onCaret={onCaret} max={LIM.title} label="제목" />
            <Sub label="제목 링크" err={problems.url}>
              <TextBox path="embed.url" value={e.url} onChange={(v) => setText("embed.url", v)} onCaret={onCaret} max={LIM.url} label="제목 링크" placeholder="https://… 또는 {site}/level" invalid={!!problems.url} />
            </Sub>
          </Blk>

          <Blk label="설명" changed={chg.has("설명")} right={count(e.description.length, LIM.description)}>
            <TextBox path="embed.description" value={e.description} onChange={(v) => setText("embed.description", v)} onCaret={onCaret} max={LIM.description} rows={5} label="설명" />
          </Blk>

          <Blk label="이미지" changed={chg.has("이미지")}>
            <Sub label="썸네일 · 오른쪽 위" err={problems.thumbnail}>
              <TextBox path="embed.thumbnail" value={e.thumbnail} onChange={(v) => setText("embed.thumbnail", v)} onCaret={onCaret} max={LIM.url} label="썸네일 주소" placeholder="https://… 또는 {avatar}" invalid={!!problems.thumbnail} />
            </Sub>
            {/* 카드가 켜져 있으면 이 자리는 카드가 쓴다 — 적어 둔 주소는 카드를 못 그렸을 때만 */}
            <Sub label={cardOn ? "큰 이미지 · 카드" : "큰 이미지 · 아래"} err={problems.image}>
              <TextBox path="embed.image" value={e.image} onChange={(v) => setText("embed.image", v)} onCaret={onCaret} max={LIM.url} label="큰 이미지 주소" placeholder={cardOn ? "카드 이미지" : "https://…"} invalid={!!problems.image} disabled={cardOn} />
            </Sub>
          </Blk>

          <Blk label="필드" changed={chg.has("필드")} right={count(e.fields.length, LIM.fields)}>
            {e.fields.map((f, i) => (
              <div key={f.id} className="mt-2 first:mt-0 border border-[#ededed]">
                <div className="flex items-center h-10 pl-3 pr-1 border-b border-[#ededed] bg-[#f7f7f7]">
                  <span className="w-12 shrink-0 text-[12px] font-black tabular-nums">필드 {i + 1}</span>
                  <Switch on={f.inline} onChange={(v) => setFieldInline(f.id, v)} label={`필드 ${i + 1} 나란히`} />
                  <span className="ml-2 text-[12px] font-bold text-[#5a5a5a]">나란히</span>
                  <span className="ml-auto flex items-center shrink-0">
                    <IconBtn label="위로" onClick={() => moveField(i, -1)} disabled={i === 0}>
                      <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                    </IconBtn>
                    <IconBtn label="아래로" onClick={() => moveField(i, 1)} disabled={i === e.fields.length - 1}>
                      <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </IconBtn>
                    <IconBtn label="삭제" onClick={() => removeField(f.id)}>
                      <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </IconBtn>
                  </span>
                </div>
                <div className="p-3">
                  <TextBox path={`f:${f.id}:name`} value={f.name} onChange={(v) => setText(`f:${f.id}:name`, v)} onCaret={onCaret} max={LIM.fieldName} label={`필드 ${i + 1} 이름`} placeholder="이름" />
                  <div className="mt-2">
                    <TextBox path={`f:${f.id}:value`} value={f.value} onChange={(v) => setText(`f:${f.id}:value`, v)} onCaret={onCaret} max={LIM.fieldValue} rows={2} label={`필드 ${i + 1} 값`} placeholder="값" />
                  </div>
                </div>
              </div>
            ))}
            <Btn variant="secondary" size="sm" className={e.fields.length ? "mt-3" : ""} onClick={addField} disabled={e.fields.length >= LIM.fields}>필드 추가</Btn>
          </Blk>

          <Blk label="푸터" changed={chg.has("푸터") || chg.has("시각")} right={count(e.footerText.length, LIM.footerText)}>
            <TextBox path="embed.footerText" value={e.footerText} onChange={(v) => setText("embed.footerText", v)} onCaret={onCaret} max={LIM.footerText} label="푸터 글" />
            <Sub label="아이콘" err={problems.footerIcon}>
              <TextBox path="embed.footerIcon" value={e.footerIcon} onChange={(v) => setText("embed.footerIcon", v)} onCaret={onCaret} max={LIM.url} label="푸터 아이콘 주소" placeholder="https://… 또는 {site}/logo.png" invalid={!!problems.footerIcon} />
            </Sub>
            <div className="mt-3 flex items-center">
              <Switch on={e.timestamp} onChange={(v) => setEmb("timestamp", v)} label="시각 표시" />
              <span className="ml-2.5 text-[13px] font-bold text-[#131313]">시각 표시</span>
            </div>
          </Blk>
        </>
      )}
    </Panel>
  );
}
