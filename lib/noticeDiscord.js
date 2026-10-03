/* 📌 사이트 공지 → 디스코드 공지 — 글에서 봇 메시지 변수(noticePost)를 만든다.
   글쓰기 화면(미리보기 · 편집 팝업)과 서버(대기열 lib/noticeAnnounce.js)가 같은 함수를 쓴다 — mongoose 를 쓰지 않는다.
   보내는 건 봇(bot/src/features/noticeAnnounce.js). 디자인 기본값은 lib/botMessages.js MESSAGE_DEFS.noticePost */
import { SITE_URL } from "@/lib/botMessages";

export const NOTICE_KEY = "noticePost";
export const NOTICE_BUTTON_LABEL = "사이트에서 보기";
export const BUTTON_LABEL_MAX = 80; // 디스코드 버튼 글자 한도
export const SUMMARY_MAX = 400;

// 멘션 — 고른 것만 울린다(봇이 allowedMentions 로 막는다)
export const MENTIONS = [
  { v: "none", l: "없음" },
  { v: "everyone", l: "@everyone" },
  { v: "here", l: "@here" },
];
export const cleanMention = (v) => (v === "everyone" || v === "here" ? v : "none");
export const mentionText = (v) => (v === "everyone" ? "@everyone" : v === "here" ? "@here" : "");

// 링크 버튼 { on, label } — 글자는 비우면 기본 글자
export function cleanButton(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const label = String(r.label ?? "").replace(/\s+/g, " ").trim().slice(0, BUTTON_LABEL_MAX);
  return { on: r.on !== false, label };
}
export const buttonLabelOf = (b) => (b && String(b.label || "").trim()) || NOTICE_BUTTON_LABEL;

const safeUrl = (u) => {
  const s = String(u || "").trim();
  return /^https?:\/\/[^\s<>"]+$/i.test(s) ? s : "";
};

// 사이트 서식(app/components/FormattedText.tsx) → 디스코드 서식. 줄 하나 안의 글자만
//   ==강조== → 굵게 · {복사코드} → 코드 · 주소가 http(s) 가 아닌 링크는 글자만 · 줄 앞 "* " → "• "
//   디스코드만 아는 줄 앞 기호(# 제목 · -# · > 인용)는 글자 그대로 보이게 막는다
function inlineToDiscord(s) {
  return String(s)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, u) => (safeUrl(u) ? `[${label}](${safeUrl(u)})` : label))
    .replace(/\{([^}]+)\}/g, (_m, c) => "`" + String(c).replace(/`/g, "") + "`")
    .replace(/==(.*?)==/g, "**$1**")
    .replace(/^(\s*)\*[ \t]+/, "$1• ")
    .replace(/^(\s*)(#{1,3} |-# |>)/, "$1\\$2");
}

const isTableSep = (l) => /^\|[\s|:-]+\|$/.test(l);
const cellsOf = (l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

// 본문 → { text, firstImage } — 이미지 줄은 빼고(첫 이미지는 배너 후보), 표는 칸을 " · " 로 이은 줄로
export function toDiscordText(content) {
  const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let firstImage = "";
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim());
      i -= 1;
      const table = rows.length >= 2 && isTableSep(rows[1]);
      rows.forEach((r, j) => {
        if (isTableSep(r)) return;
        const c = cellsOf(r).filter(Boolean).map(inlineToDiscord);
        if (c.length) out.push(table && j === 0 ? c.map((x) => `**${x}**`).join(" · ") : c.join(" · "));
      });
      continue;
    }
    const line = lines[i].replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, _a, u) => {
      const s = safeUrl(u);
      if (s && !firstImage) firstImage = s;
      return "";
    });
    if (t && !line.trim()) continue; // 이미지만 있던 줄
    out.push(inlineToDiscord(line));
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), firstImage };
}

// 앞 max 자 — 문단 · 띄어쓰기에서 끊고, 잘린 서식(굵게 · 밑줄 · 취소 · 코드 · 링크)은 닫거나 뺀다
export function cutSummary(text, max = SUMMARY_MAX) {
  const v = String(text || "");
  if (v.length <= max) return v;
  let head = v.slice(0, max);
  const nl = head.lastIndexOf("\n");
  const sp = head.lastIndexOf(" ");
  if (nl >= max * 0.5) head = head.slice(0, nl);
  else if (sp >= max * 0.7) head = head.slice(0, sp);
  if (/[\uD800-\uDBFF]$/.test(head)) head = head.slice(0, -1);
  head = head.replace(/\[[^\]\n]*(\]\([^)\n]*)?$/, ""); // 닫히지 않은 링크
  for (const mk of ["**", "__", "~~"]) if ((head.split(mk).length - 1) % 2) head += mk;
  if ((head.split("`").length - 1) % 2) head += "`";
  return `${head.trimEnd()}…`;
}

// 공지 태그 — 목록(app/notice/NoticeClient.tsx tagOf)과 같은 기준
export function noticeTagOf(post) {
  const t = String(post?.noticeTag || "");
  if (t === "중요" || t === "필독" || post?.isImportant) return "중요";
  if (t === "업데이트") return "업데이트";
  return "일반";
}

export const noticeUrlOf = (id) => (id ? `${SITE_URL}/notice/${id}` : `${SITE_URL}/notice`);

// 📌 글 → 봇 메시지 변수 { title, summary, url, tag, banner, author } (멘션은 봇이 글마다 고른 값으로 넣는다)
//    배너는 글의 배너, 없으면 본문 첫 이미지
export function noticeVars(post) {
  const { text, firstImage } = toDiscordText(post?.content);
  return {
    title: String(post?.title || "").trim(),
    summary: cutSummary(text),
    url: noticeUrlOf(post?._id ? String(post._id) : ""),
    tag: noticeTagOf(post),
    banner: safeUrl(post?.bannerUrl) || firstImage,
    author: String(post?.author || ""),
  };
}

// 글마다 고친 디자인을 만들 때 글자로 풀어 넣는 변수 — 주소 · 멘션 · 공통 변수는 {이름} 그대로 둔다(봇이 채운다)
export const LITERAL_VARS = ["title", "summary", "tag", "banner", "author"];
