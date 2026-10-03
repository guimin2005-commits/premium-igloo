"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MESSAGE_GROUPS,
  MESSAGE_DEFS,
  MESSAGE_KEYS,
  COMMON_VARS,
  COLOR_PRESETS,
  LIMITS,
  renderTemplate,
  sampleVars,
  resolveColor,
  formatUntil,
  isCardKey,
  defaultTemplate,
  sanitizeTemplate,
  progressBar,
} from "@/lib/botMessages";
import { CARD_SIZE, CARD_TIERS, sampleCardData } from "@/lib/botCards";
import { playTone } from "@/lib/sfx";
import { AdminPage, Panel, Btn, Switch, SaveBar, StatusChip, ConfirmDialog, Segmented, inputClass, useAdminGuard } from "../ui";

// 📌 봇 메시지 편집 — 레벨업 · 역할 지급 · DM · 명령어 응답의 임베드 디자인과 문구를 키마다 고친다.
//    왼쪽(모바일은 위) 키 목록 → 편집 → 디스코드처럼 그린 미리보기. 넓은 화면(xl)에서는 세 칸이 나란히.
//    · 초안은 키마다 따로 들고 있어 다른 키로 옮겨도 고치던 것이 남는다(목록에 빨간 점). 저장은 지금 키만.
//    · 미리보기는 lib/botMessages.js 의 renderTemplate(봇과 같은 규칙)에 예시 값(sampleVars)을 넣은 결과를 그린다.
//    · 채널은 레벨 설정에서 고른다 — 여기서는 '보내는 곳' 한 줄만.
//    · 카드 키(CARD_KEYS)는 이미지 카드 켜기/끄기 — 켜지면 미리보기의 큰 이미지 자리에 카드(등급 칩으로 바꿔 보기).
//    API: /api/admin/bot-messages (GET 목록 · PUT 저장 · DELETE 기본값으로 · POST 테스트 발송) · /card?key=&tier= (카드 PNG)

const API = "/api/admin/bot-messages";
const CARD_API = "/api/admin/bot-messages/card";
// 등급에 따라 그림이 바뀌는 카드 — 출석(강조색 하나) · RANKER(금은동)는 등급 칩이 없다
const TIER_CARD_KEYS = new Set(["levelUp", "roleGrant", "cmdLevel", "cmdRank"]);
const TIER_OPTIONS = (CARD_TIERS as { name: string }[]).map((t, i) => ({ v: String(i), l: t.name }));
const DEFAULT_CARD_TIER = 1; // 브론즈 — 예시 레벨(128)의 등급
const JSON_HEADERS = { "Content-Type": "application/json" };

type Field = { name: string; value: string; inline: boolean };
type Embed = {
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
type Tpl = { enabled: boolean; card: boolean; content: string; embed: Embed };
// 초안의 필드에는 화면 전용 id — 순서를 바꾸거나 지워도 입력칸이 같은 필드를 따라가게 (서버로는 안 보낸다)
type DField = Field & { id: number };
type DEmbed = Omit<Embed, "fields"> & { fields: DField[] };
type Draft = { enabled: boolean; card: boolean; content: string; embed: DEmbed };
type Item = { key: string; custom: boolean; template: Tpl; updatedAt: string | null; updatedBy: string };
type VarDef = { name: string; label: string; sample: unknown };
type Def = { group: string; label: string; vars: VarDef[]; plainEmbed?: unknown };
type REmbed = Omit<Embed, "on">;
type Rendered = { enabled: boolean; content: string; embed: REmbed | null; empty: boolean };
type EmbedText = "color" | "authorName" | "authorIcon" | "title" | "url" | "description" | "thumbnail" | "image" | "footerText" | "footerIcon";

const DEFS = MESSAGE_DEFS as unknown as Record<string, Def>;
const KEYS = MESSAGE_KEYS as string[];
const GROUPS = MESSAGE_GROUPS as { key: string; label: string }[];
const COMMON = COMMON_VARS as VarDef[];
const SWATCHES = (COLOR_PRESETS as { value: string; label: string }[]).filter((p) => p.value !== "tier");
const LIM = LIMITS as Record<string, number>;

// 보내는 곳 — 채널은 레벨 설정(/admin/bot)에서 고른다
const DEST: Record<string, string> = {
  levelUp: "레벨업 채널",
  roleGrant: "역할 지급 채널",
  autoAttend: "출석 알림 채널",
  rankerAnnounce: "레벨업 채널",
  cmdAttendAlready: "명령어를 쓴 채널 · 나만 보기",
  levelClosed: "명령어를 쓴 채널 · 나만 보기",
  passUnclaimed: "유저 DM",
};
// 📌 DEFS[k] 로만 보면 ?key=constructor 같은 이름도 통과해 빈 화면이 된다 — 자기 키만
const isKey = (k: string | null): k is string => !!k && KEYS.includes(k);
const destOf = (key: string) => {
  if (DEST[key]) return DEST[key];
  const g = DEFS[key]?.group;
  return g === "dm" ? "구매자 DM" : g === "command" ? "명령어를 쓴 채널" : "채널";
};

// ── 템플릿 모양 ────────────────────────────────
const TEXT_KEYS: EmbedText[] = ["color", "authorName", "authorIcon", "title", "url", "description", "thumbnail", "image", "footerText", "footerIcon"];
const str = (v: unknown) => (typeof v === "string" ? v : "");

function normTpl(raw: any): Tpl {
  const e = raw?.embed && typeof raw.embed === "object" ? raw.embed : {};
  const embed = { on: e.on !== false, timestamp: !!e.timestamp } as Embed;
  for (const k of TEXT_KEYS) embed[k] = str(e[k]);
  embed.fields = (Array.isArray(e.fields) ? e.fields : []).map((f: any) => ({ name: str(f?.name), value: str(f?.value), inline: !!f?.inline }));
  return { enabled: raw?.enabled !== false, card: raw?.card !== false, content: str(raw?.content), embed };
}
const normItem = (x: any): Item => ({
  key: String(x?.key || ""),
  custom: !!x?.custom,
  template: normTpl(x?.template),
  updatedAt: x?.updatedAt ? String(x.updatedAt) : null,
  updatedBy: str(x?.updatedBy),
});

let fieldSeq = 0;
// prev 를 주면 같은 자리 필드의 id 를 이어 쓴다 — 저장 직후 입력칸이 다시 그려져 커서가 빠지지 않게
const toDEmbed = (e: Embed, prev?: DEmbed): DEmbed => ({ ...e, fields: e.fields.map((f, i) => ({ ...f, id: prev?.fields[i]?.id ?? ++fieldSeq })) });
const toDraft = (t: Tpl, prev?: Draft): Draft => ({
  enabled: t.enabled,
  card: t.card,
  content: t.content,
  embed: toDEmbed(t.embed, prev?.embed),
});
const fromDraft = (d: Draft): Tpl => ({
  enabled: d.enabled,
  card: d.card,
  content: d.content,
  embed: { ...d.embed, fields: d.embed.fields.map(({ name, value, inline }) => ({ name, value, inline })) },
});
const embedSig = (e: Omit<Embed, "fields"> & { fields: Field[] }) =>
  JSON.stringify([e.on, ...TEXT_KEYS.map((k) => e[k]), e.timestamp, e.fields.map((f) => [f.name, f.value, f.inline])]);
const sigOf = (t: Tpl) => JSON.stringify([t.enabled, t.card, t.content, embedSig(t.embed)]);

// 카드 켜기/끄기 짝 — 카드와 쓰는 짧은 기본 임베드 · 카드를 끈 예전 기본 임베드(lib/botMessages.js 의 plainEmbed)
const cardEmbedOf = (key: string): Embed | null => (isCardKey(key) ? normTpl(defaultTemplate(key)).embed : null);
const plainEmbedOf = (key: string): Embed | null => {
  const p = DEFS[key]?.plainEmbed;
  return isCardKey(key) && p ? normTpl(sanitizeTemplate({ embed: p }, key)).embed : null;
};

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
const changedParts = (a: Tpl, b: Tpl) => PARTS.filter((p) => JSON.stringify(p.get(a)) !== JSON.stringify(p.get(b))).map((p) => p.label);

// ── 검사 (서버와 같은 규칙 — 저장 전에 칸 아래에 알린다) ─────────
const URL_FIELDS: [EmbedText, string][] = [
  ["authorIcon", "작성자 아이콘"],
  ["url", "제목 링크"],
  ["thumbnail", "썸네일"],
  ["image", "큰 이미지"],
  ["footerIcon", "푸터 아이콘"],
];
const varNamesOf = (key: string) => new Set([...COMMON, ...(DEFS[key]?.vars || [])].map((v) => v.name));
const COLOR_RE = /^(tier|#[0-9a-f]{6}|#[0-9a-f]{3})$/i;
const HEX6_RE = /^#[0-9a-f]{6}$/i;
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
function problemsOf(d: Draft, key: string): Partial<Record<EmbedText, string>> {
  const out: Partial<Record<EmbedText, string>> = {};
  const c = d.embed.color.trim();
  if (c && !COLOR_RE.test(c)) out.color = "#rrggbb 또는 등급 색만 쓸 수 있습니다";
  const names = varNamesOf(key);
  for (const [f] of URL_FIELDS) if (badUrl(d.embed[f], names)) out[f] = URL_MSG;
  return out;
}
const firstProblem = (p: Partial<Record<EmbedText, string>>) => {
  if (p.color) return `색 — ${p.color}`;
  const hit = URL_FIELDS.find(([f]) => p[f]);
  return hit ? `${hit[1]} — ${URL_MSG}` : "";
};

// ── 변수 넣기용 칸 경로 ────────────────────────
//    "content" · "embed.title" … · 필드는 "f:<id>:name|value"
const FIELD_PATH = /^f:(\d+):(name|value)$/;
function getText(d: Draft, path: string): string | null {
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
function withText(d: Draft, path: string, v: string): Draft {
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
const maxOf = (path: string) => {
  if (MAX_OF[path]) return MAX_OF[path];
  const m = path.match(FIELD_PATH);
  if (m) return m[2] === "name" ? LIM.fieldName : LIM.fieldValue;
  return LIM.url;
};

// ── 디스코드 마크다운 흉내 (미리보기 전용) ─────────────────
//    📌 원문은 전부 이스케이프한 뒤 정해 둔 태그만 끼운다. 주소는 http(s) 만 링크로.
//    멘션 변수(user · first …)의 예시 값은 표시 문자로 감싸 두었다가 멘션 모양으로 바꾼다.
const M_OPEN = "";
const M_CLOSE = "";
const MENTION_VARS = ["user", "first", "second", "third"];
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
function md(src: string) {
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

// cardTier 를 주면(카드 켜짐 · 등급 카드) 예시 레벨 · XP 를 카드 샘플(lib/botCards.js sampleCardData)과 같게 — 글과 카드 숫자가 어긋나지 않게
function previewVars(key: string, cardTier: number | null = null) {
  const v = { ...(sampleVars(key) as Record<string, unknown>) };
  if (cardTier != null && TIER_CARD_KEYS.has(key)) {
    const d = sampleCardData(key, cardTier, null) as { level: number; prevLevel?: number; xp: number; need: number; progress: number; rank?: number; total?: number; role?: string };
    v.level = d.level;
    // 역할 지급 — 그 등급 역할 · 시작 레벨(카드 샘플과 같다). 다른 등급 카드만 XP · 등급 이름
    if (key === "roleGrant") v.role = d.role;
    else {
      v.xp = d.xp;
      v.tier = (CARD_TIERS as { name: string }[])[cardTier]?.name;
    }
    if (key === "levelUp") Object.assign(v, { prevLevel: d.prevLevel, nextXp: d.need, progressBar: progressBar(d.progress) });
    if (key === "cmdLevel") Object.assign(v, { need: d.need, nextLevel: d.level + 1, progressBar: progressBar(d.progress) });
    if (key === "cmdRank") Object.assign(v, { rank: d.rank, total: d.total });
  }
  for (const n of MENTION_VARS) if (typeof v[n] === "string") v[n] = `${M_OPEN}${String(v[n]).replace(/^@/, "")}${M_CLOSE}`;
  return v;
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
`;

// 불러오지 못한 이미지는 자리를 비운다 (주소가 바뀌면 key 로 다시 그린다)
const hideImg = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = "none";
};

// 카드 미리보기 — 봇이 붙이는 PNG 와 같은 템플릿(/api/admin/bot-messages/card). 자리는 카드 비율로 먼저 잡아 두어 불러오는 동안 아래가 밀리지 않게
//   주소가 바뀌면 key 로 다시 그린다(불러오는 중 상태부터)
type CardView = { src: string; ratio: number };
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
function DiscordPreview({ r, clock, off, card }: { r: Rendered | null; clock: string; off: boolean; card: CardView | null }) {
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 편집 부품 ──────────────────────────────────
//    📌 모듈 스코프에 둔다 — 페이지 함수 안에서 정의하면 렌더마다 새 컴포넌트가 되어 타이핑 중 포커스가 날아간다.
type Caret = (path: string, start: number, end: number) => void;

function TextBox({
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

const Dot = () => <span aria-label="바뀜" className="ml-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-[#e91e3f]" />;

// 패널 안 한 묶음 — 이름(바뀐 점 · 오른쪽 글자 수) + 입력
function Blk({ label, changed = false, right, children }: { label: string; changed?: boolean; right?: React.ReactNode; children: React.ReactNode }) {
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
function Sub({ label, err, children }: { label: string; err?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1 text-[12px] font-bold text-[#5a5a5a]">{label}</p>
      {children}
      {err && <p className="mt-1 text-[12px] font-bold text-[#d01634] break-keep">{err}</p>}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
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

const count = (n: number, max: number) => `${n.toLocaleString()} / ${max.toLocaleString()}`;

// ── 효과음 ─────────────────────────────────────
const sfxOk = () => [660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.1, "sine", 0.035), i * 80));
const sfxErr = () => {
  playTone(300, 0.14, "square", 0.035);
  setTimeout(() => playTone(220, 0.2, "square", 0.035), 130);
};

export default function AdminBotMessagesPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/admin/bot-messages 가 서버에서 한다
  const { isAdmin, gate } = useAdminGuard();

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sel, setSel] = useState<string>(KEYS[0]);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clock, setClock] = useState("");
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  // 카드 미리보기 등급 — 키를 옮겨도 그대로 (레벨업 · /레벨 · /랭크 공통)
  const [cardTier, setCardTier] = useState(DEFAULT_CARD_TIER);

  const alive = useRef(true);
  const editorRef = useRef<HTMLDivElement | null>(null);
  // 마지막으로 누른 글 칸과 커서 자리 — 변수 칩이 여기에 넣는다
  const caretRef = useRef<{ path: string; start: number; end: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    if (error) sfxErr();
    else sfxOk();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // 미리보기의 "오늘 오후 9:41" — 서버 그림과 어긋나지 않게 붙은 뒤에 채운다
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  // 주소의 ?key= 로 연 키 — 새로고침해도 보던 메시지에 머문다
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key");
    if (isKey(k)) setSel(k);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch(API, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    if (!alive.current) return;
    const list: Item[] = d?.success && Array.isArray(d.data) ? d.data.map(normItem).filter((x: Item) => isKey(x.key)) : [];
    if (!list.length) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    const map: Record<string, Item> = {};
    const dm: Record<string, Draft> = {};
    for (const it of list) {
      map[it.key] = it;
      dm[it.key] = toDraft(it.template);
    }
    setItems(map);
    setDrafts(dm);
    setLoadFailed(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const item = items[sel] || null;
  const draft = drafts[sel] || null;
  const def = DEFS[sel];

  const dirtyKeys = useMemo(() => {
    const s = new Set<string>();
    for (const k of KEYS) if (items[k] && drafts[k] && sigOf(fromDraft(drafts[k])) !== sigOf(items[k].template)) s.add(k);
    return s;
  }, [items, drafts]);
  const dirty = dirtyKeys.has(sel);
  const chg = useMemo(() => new Set(item && draft && dirty ? changedParts(item.template, fromDraft(draft)) : []), [item, draft, dirty]);
  const problems = useMemo<Partial<Record<EmbedText, string>>>(() => (draft ? problemsOf(draft, sel) : {}), [draft, sel]);

  // 저장 안 한 초안이 있으면 창을 닫기 전에 묻는다
  useEffect(() => {
    if (dirtyKeys.size === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirtyKeys]);

  const cardKey = isCardKey(sel);
  const cardOn = !!draft && cardKey && draft.card;
  const tierCard = cardOn && TIER_CARD_KEYS.has(sel);
  const pv = useMemo(() => previewVars(sel, tierCard ? cardTier : null), [sel, tierCard, cardTier]);
  const rendered = useMemo(
    () => (draft ? (renderTemplate(fromDraft(draft), pv) as unknown as Rendered) : null),
    [draft, pv]
  );
  const cardView = useMemo<CardView | null>(() => {
    if (!cardOn) return null;
    const size = (CARD_SIZE as Record<string, { width: number; height: number }>)[sel];
    const q = new URLSearchParams({ key: sel });
    if (tierCard) q.set("tier", String(cardTier));
    return { src: `${CARD_API}?${q}`, ratio: size ? size.width / size.height : 1200 / 630 };
  }, [cardOn, tierCard, sel, cardTier]);
  // 📌 디스코드는 임베드 하나의 글자 합 6,000 을 넘으면 거절한다 — 봇은 뒤 필드부터 빼서 보낸다
  const overTotal = useMemo(() => {
    if (!draft || !draft.embed.on) return false;
    const e = draft.embed;
    const n = e.title.length + e.description.length + e.authorName.length + e.footerText.length + e.fields.reduce((a, f) => a + f.name.length + f.value.length, 0);
    return n > LIM.total;
  }, [draft]);

  // ── 초안 고치기 ──
  const patch = useCallback((fn: (d: Draft) => Draft) => {
    setDrafts((p) => (p[sel] ? { ...p, [sel]: fn(p[sel]) } : p));
  }, [sel]);
  const setTop = (k: "enabled" | "content", v: boolean | string) => patch((d) => ({ ...d, [k]: v }));
  const setEmb = (k: keyof Omit<Embed, "fields">, v: string | boolean) => patch((d) => ({ ...d, embed: { ...d.embed, [k]: v } }));
  const setText = (path: string, v: string) => patch((d) => withText(d, path, v));
  // 카드 켜기/끄기 — 임베드가 기본 모양 그대로면 짝 모양으로 바꾼다(끄면 예전 임베드, 켜면 카드와 겹치지 않는 짧은 임베드). 고친 임베드는 그대로
  const setCard = (on: boolean) =>
    patch((d) => {
      const from = on ? plainEmbedOf(sel) : cardEmbedOf(sel);
      const to = on ? cardEmbedOf(sel) : plainEmbedOf(sel);
      const swap = !!from && !!to && embedSig(d.embed) === embedSig(from);
      return { ...d, card: on, embed: swap && to ? toDEmbed(to) : d.embed };
    });
  const setFieldInline = (id: number, v: boolean) =>
    patch((d) => ({ ...d, embed: { ...d.embed, fields: d.embed.fields.map((f) => (f.id === id ? { ...f, inline: v } : f)) } }));
  const addField = () => {
    if (!draft) return;
    if (draft.embed.fields.length >= LIM.fields) return showToast(`필드는 ${LIM.fields}개까지입니다.`, true);
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

  const onCaret = useCallback<Caret>((path, start, end) => {
    caretRef.current = { path, start, end };
  }, []);

  // 변수 칩 — 마지막으로 누른 칸의 커서 자리에 {이름}. 누른 칸이 없으면 설명(임베드를 껐으면 본문) 끝에
  const insertVar = (name: string) => {
    if (!draft) return;
    const token = `{${name}}`;
    let a = caretRef.current;
    // 임베드를 끈 뒤엔 숨은 임베드 칸에 넣지 않는다
    if (!a || getText(draft, a.path) == null || (!draft.embed.on && a.path !== "content")) a = { path: draft.embed.on ? "embed.description" : "content", start: -1, end: -1 };
    const cur = getText(draft, a.path) ?? "";
    const s = a.start < 0 ? cur.length : Math.min(a.start, cur.length);
    const e = a.end < 0 ? s : Math.min(Math.max(a.end, s), cur.length);
    const next = cur.slice(0, s) + token + cur.slice(e);
    if (next.length > maxOf(a.path)) return showToast("글자 수 한도를 넘습니다.", true);
    const path = a.path;
    const pos = s + token.length;
    setText(path, next);
    caretRef.current = { path, start: pos, end: pos };
    requestAnimationFrame(() => {
      const el = editorRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-path="${path}"]`);
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(pos, pos);
    });
  };

  const pick = (k: string) => {
    if (k === sel) return;
    setSel(k);
    caretRef.current = null;
    try {
      window.history.replaceState(null, "", `?key=${encodeURIComponent(k)}`);
    } catch {}
    // 모바일은 목록이 위에 있어 고른 뒤 편집 칸으로 내려 준다
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  // ── 저장 ──
  const save = async () => {
    // 📌 바뀐 게 없으면 보내지 않는다 — Ctrl+S 로 기본 디자인 키를 저장하면 '저장한 디자인'이 되어 옛 문구 반영이 끊긴다
    if (!draft || !item || saving || !dirty) return;
    const key = sel;
    const p = firstProblem(problemsOf(draft, key));
    if (p) return showToast(p, true);
    const tpl = fromDraft(draft);
    const sent = sigOf(tpl);
    setSaving(true);
    const res = await fetch(API, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ key, template: tpl, baseUpdatedAt: item.updatedAt }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!alive.current) return;
    setSaving(false);
    if (res?.ok && d?.success && d.data) {
      const saved = normItem(d.data);
      setItems((m) => ({ ...m, [key]: saved }));
      // 저장하는 사이 더 고쳤으면 그 초안은 그대로 둔다
      setDrafts((m) => (m[key] && sigOf(fromDraft(m[key])) === sent ? { ...m, [key]: toDraft(saved.template, m[key]) } : m));
      showToast("저장했습니다.");
      return;
    }
    // 409 — 다른 관리자가 먼저 바꿨다. 기준만 최신으로 바꾸고 초안은 둔다(한 번 더 저장하면 덮어쓴다)
    if (res?.status === 409 && d?.data) setItems((m) => ({ ...m, [key]: normItem(d.data) }));
    showToast(d?.message || "저장하지 못했습니다.", true);
  };
  // Ctrl/⌘ + S — 저장 줄의 저장과 같다
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 되돌리기 — 불러온(저장된) 값으로
  const revert = () => {
    if (!item) return;
    caretRef.current = null;
    setDrafts((m) => ({ ...m, [sel]: toDraft(item.template) }));
  };

  // ── 기본값으로 ── 저장한 디자인이 있으면 지운다(확인 모달), 없으면 초안만 되돌린다
  const askReset = () => {
    if (!item) return;
    if (!item.custom) {
      revert();
      showToast("기본값으로 되돌렸습니다.");
      return;
    }
    setConfirmReset(true);
  };
  const doReset = async () => {
    const key = sel;
    setResetting(true);
    const res = await fetch(`${API}?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!alive.current) return;
    setResetting(false);
    setConfirmReset(false);
    if (res?.ok && d?.success && d.data) {
      const it = normItem(d.data);
      caretRef.current = null;
      setItems((m) => ({ ...m, [key]: it }));
      setDrafts((m) => ({ ...m, [key]: toDraft(it.template) }));
      showToast("기본값으로 되돌렸습니다.");
    } else {
      showToast(d?.message || "되돌리지 못했습니다.", true);
    }
  };

  // ── 테스트 발송 ── 저장 안 한 초안이면 초안 그대로 보낸다. 봇이 10초마다 대기열을 보므로 결과를 2초마다 확인
  const sendTest = async () => {
    if (!draft || !item || testing) return;
    const key = sel;
    if (dirty) {
      const p = firstProblem(problemsOf(draft, key));
      if (p) return showToast(p, true);
    }
    setTesting(true);
    const res = await fetch(API, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(dirty ? { action: "test", key, template: fromDraft(draft) } : { action: "test", key }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!alive.current) return;
    const id = d?.data?.id;
    if (!res?.ok || !d?.success || !id) {
      setTesting(false);
      return showToast(d?.message || "테스트 요청에 실패했습니다.", true);
    }
    showToast("내 DM 으로 보내는 중입니다.");
    const started = Date.now();
    while (alive.current && Date.now() - started < 60_000) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await fetch(`${API}?test=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
      if (!alive.current) return;
      const st = s?.data?.status;
      if (st === "sent") {
        setTesting(false);
        return showToast("DM 으로 보냈습니다.");
      }
      if (st === "failed") {
        setTesting(false);
        return showToast(s?.data?.error || "보내지 못했습니다.", true);
      }
    }
    if (!alive.current) return;
    setTesting(false);
    showToast("봇이 아직 보내지 않았습니다. 봇이 켜지면 보냅니다.", true);
  };

  if (gate) return gate;

  const vars = [...(def?.vars || []), ...COMMON];
  const keyVarCount = def?.vars?.length || 0;
  const tierColor = resolveColor("tier", pv) as string;
  const meta = item
    ? item.custom
      ? `저장 ${formatUntil(item.updatedAt)}${item.updatedBy ? ` · ${item.updatedBy}` : ""}`
      : "기본 디자인"
    : "";
  const dest = destOf(sel);
  const e = draft?.embed;

  return (
    <>
      <AdminPage
        section="SYSTEM : LEVEL"
        title="봇 메시지"
        footer={<SaveBar dirty={!loading && dirty} changes={[...chg]} onSave={save} onReset={revert} saving={saving} />}
      >
        {loadFailed && !loading && (
          <div role="alert" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-[#e91e3f]/[0.08] text-[#d01634] text-[13px] font-bold">
            <p className="min-w-0 grow basis-60">메시지 설정을 불러오지 못했습니다.</p>
            <Btn size="sm" variant="secondary" onClick={load}>다시 불러오기</Btn>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
        ) : item && draft && e && def ? (
          <div className="flex flex-col lg:flex-row lg:items-start">
            {/* ── 키 목록 — PC 왼쪽 칸 / 모바일 위 두 열 ── */}
            <nav aria-label="메시지 목록" className="mb-5 lg:mb-0 lg:mr-5 lg:w-[196px] lg:shrink-0 lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto no-bar">
              <Panel flush>
                {GROUPS.map((g, gi) => {
                  const keys = KEYS.filter((k) => DEFS[k]?.group === g.key);
                  if (!keys.length) return null;
                  return (
                    <div key={g.key} className={gi > 0 ? "border-t border-[#ededed]" : ""}>
                      <p className="px-4 pt-3 pb-1.5 text-[11px] font-black tracking-[0.04em] text-[#8a8a8a]">{g.label}</p>
                      <div className="grid grid-cols-2 lg:grid-cols-1 pb-2">
                        {keys.map((k) => {
                          const on = k === sel;
                          const off = items[k] && !items[k].template.enabled;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => pick(k)}
                              aria-current={on ? "true" : undefined}
                              title={DEFS[k].label}
                              className={`relative flex items-center h-10 pl-4 pr-3 text-left text-[13px] font-bold outline-none focus-visible:bg-[#f2f2f2] transition-colors ${on ? "bg-[#f2f2f2] text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f7f7f7]"}`}
                            >
                              {on && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[2px] bg-[#e91e3f]" />}
                              <span className={`min-w-0 truncate ${off ? "text-[#a3a3a3]" : ""}`}>{DEFS[k].label}</span>
                              <span className="ml-auto pl-2 flex items-center shrink-0">
                                {off && <span className="text-[11px] text-[#a3a3a3]">꺼짐</span>}
                                {dirtyKeys.has(k) && <Dot />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </Panel>
            </nav>

            <div className="min-w-0 flex-1 flex flex-col xl:flex-row xl:items-start">
              {/* ── 편집 ── */}
              <div ref={editorRef} className="min-w-0 flex-1 mb-5 xl:mb-0 xl:mr-5 scroll-mt-24">
                {/* 머리 — 이름 · 보내는 곳 · 저장 시각은 줄 수를 고정해(말줄임) 아래 단추 줄이 키마다 움직이지 않게 */}
                <Panel flush className="mb-5">
                  <div className="px-5 pt-4 pb-3 border-b border-[#ededed]">
                    <h2 className="text-[17px] font-black tracking-tight truncate">{def.label}</h2>
                    <p className="mt-1 text-[12px] text-[#5a5a5a] truncate">
                      보내는 곳 ·{" "}
                      {def.group === "channel" ? (
                        <Link href="/admin/bot" className="font-bold text-[#131313] hover:underline">{dest}</Link>
                      ) : (
                        <span className="font-bold text-[#131313]">{dest}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#8a8a8a] truncate tabular-nums">{meta}</p>
                  </div>
                  {/* 단추 줄 — 켜짐/꺼짐 글자는 고정 폭, 바뀜 점은 띄워 둬서 375px 에서도 한 줄 그대로 */}
                  <div className="flex items-center px-4 md:px-5 py-3">
                    <span className="relative inline-flex items-center shrink-0">
                      <Switch on={draft.enabled} onChange={(v) => setTop("enabled", v)} label="보내기" />
                      <span className={`ml-2 w-8 text-[13px] font-bold ${draft.enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{draft.enabled ? "켜짐" : "꺼짐"}</span>
                      {chg.has("보내기") && <span className="absolute -top-1 -right-2"><Dot /></span>}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      <Btn variant="ghost" size="sm" onClick={askReset} disabled={(!item.custom && !dirty) || resetting}>기본값으로</Btn>
                      <Btn variant="secondary" size="sm" onClick={sendTest} disabled={testing} aria-busy={testing || undefined}>테스트 발송</Btn>
                    </div>
                  </div>
                </Panel>

                {/* 변수 칩 — PC 는 편집 칸 위에 붙어 따라온다, 모바일은 한 줄 가로 스크롤 */}
                <div className="mb-5 lg:sticky lg:top-[72px] z-10">
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
                </div>

                <Panel flush className="mb-5">
                  <Blk label="본문" changed={chg.has("본문")} right={count(draft.content.length, LIM.content)}>
                    <TextBox path="content" value={draft.content} onChange={(v) => setText("content", v)} onCaret={onCaret} max={LIM.content} rows={3} label="본문" />
                  </Blk>
                </Panel>

                {/* 카드 이미지 — 카드 키만. 임베드 패널 머리와 같은 한 줄 */}
                {cardKey && (
                  <Panel flush className="mb-5">
                    <div className="flex items-center px-5 py-3.5">
                      <h2 className="inline-flex items-center text-[15px] font-black tracking-tight">
                        카드 이미지{chg.has("카드") && <Dot />}
                      </h2>
                      <span className="ml-auto inline-flex items-center shrink-0">
                        <Switch on={draft.card} onChange={setCard} label="카드 이미지" />
                      </span>
                    </div>
                  </Panel>
                )}

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
                          <button
                            type="button"
                            onClick={() => setEmb("color", "tier")}
                            aria-pressed={e.color === "tier"}
                            className={`inline-flex items-center h-8 px-3 rounded-full border text-[12px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/20 ${e.color === "tier" ? "border-[#131313] bg-[#131313] text-white" : "border-[#a3a3a3] text-[#131313] hover:border-[#131313]"}`}
                          >
                            <span aria-hidden className="w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: tierColor }} />
                            등급 색
                          </button>
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
              </div>

              {/* ── 미리보기 — 예시 값으로 그린다. PC(xl)는 오른쪽에 붙어 따라온다 ── */}
              <div className="min-w-0 xl:w-[380px] 2xl:w-[460px] xl:shrink-0 xl:sticky xl:top-[88px] xl:max-h-[calc(100vh-104px)] xl:overflow-y-auto no-bar">
                <Panel
                  flush
                  className="overflow-hidden"
                  title="미리보기"
                  right={
                    // 📌 칩 자리는 높이 0 — 칩(24px)이 제목 줄(22.5px)보다 커서, '보내기'를 끄고 켤 때마다 미리보기가 1~2px 오르내리던 것.
                    //    칩은 제목 줄 가운데에 겹쳐 뜨고, 칩이 없는 평소 모습(제목 줄 22.5px)은 예전 그대로
                    <span className="flex items-center gap-2 h-0">
                      {overTotal && <StatusChip tone="warn">6,000자 초과</StatusChip>}
                      {!draft.enabled && <StatusChip>꺼짐</StatusChip>}
                    </span>
                  }
                >
                  {/* 등급 칩 — 등급 카드(레벨업 · 역할 지급 · /레벨 · /랭크)에서 카드가 켜져 있을 때만. 한 줄 가로 스크롤 */}
                  {tierCard && (
                    <div className="flex items-center px-4 py-2.5 border-b border-[#ededed]">
                      <span className="shrink-0 mr-3 text-[12px] font-bold text-[#5a5a5a]">등급</span>
                      <div className="min-w-0 flex-1">
                        <Segmented options={TIER_OPTIONS} value={String(cardTier)} onChange={(v) => setCardTier(Number(v))} />
                      </div>
                    </div>
                  )}
                  <DiscordPreview r={rendered} clock={clock} off={!draft.enabled} card={cardView} />
                </Panel>
              </div>
            </div>
          </div>
        ) : null}
      </AdminPage>

      <ConfirmDialog
        open={confirmReset}
        danger
        title="기본값으로"
        body={`저장한 '${def?.label || ""}' 디자인을 지우고 기본 디자인으로 돌아갑니다.`}
        confirmLabel="되돌리기"
        busy={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={doReset}
      />

      {/* 결과 토스트 — 저장 줄이 떠 있으면 그 위로 */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed ${dirty ? "bottom-[180px] md:bottom-24" : "bottom-[96px] md:bottom-6"} left-1/2 -translate-x-1/2 z-[130] w-max max-w-[calc(100vw-2rem)] px-5 py-3 rounded-full border text-[13px] font-bold break-keep shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] ${toast.error ? "bg-white border-[#e91e3f] text-[#d01634]" : "bg-[#131313] border-[#131313] text-white"}`}
        >
          {toast.error ? "⚠ " : "✓ "}
          {toast.msg}
        </div>
      )}
    </>
  );
}
