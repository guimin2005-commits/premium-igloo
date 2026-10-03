/* 📌 화면이 보낸 봇 메시지 템플릿 검사 — 관리 › 봇 메시지 저장(app/api/admin/bot-messages)과
   글마다 고친 디스코드 공지 디자인(lib/noticeAnnounce.js)이 같은 규칙을 쓴다. 서버 전용 */
import { MESSAGE_DEFS, COMMON_VARS, LIMITS, sanitizeTemplate } from "@/lib/botMessages";

// 주소 칸 — 디스코드가 http(s) 가 아닌 주소를 받으면 메시지 전체를 거절한다
export const URL_FIELDS = [
  ["authorIcon", "작성자 아이콘"],
  ["url", "제목 링크"],
  ["thumbnail", "썸네일"],
  ["image", "큰 이미지"],
  ["footerIcon", "푸터 아이콘"],
];

// 📌 MESSAGE_DEFS[key] 로만 보면 "constructor" · "__proto__" 같은 이름도 통과한다 — 자기 키만
export const isKey = (key) => Object.prototype.hasOwnProperty.call(MESSAGE_DEFS, key);

const varNamesOf = (key) => new Set([...COMMON_VARS, ...(MESSAGE_DEFS[key]?.vars || [])].map((v) => v.name));

// 📌 주소는 "https://…" 또는 이 키의 변수로 시작하는 것만 ("{avatar}" · "{site}/logo.png" · "{renewUrl}")
//    모르는 변수는 치환되지 않은 채 남아 주소가 깨지므로 막는다. 잘못된 칸의 이름을 돌려준다.
export function badUrlField(key, embed) {
  const names = varNamesOf(key);
  for (const [f, label] of URL_FIELDS) {
    const v = String(embed?.[f] || "");
    if (!v) continue;
    if (/[\s<>"]/.test(v)) return label;
    const m = v.match(/^\{([a-zA-Z][a-zA-Z0-9]*)\}/);
    if (m) {
      if (!names.has(m[1])) return label;
      continue;
    }
    if (!/^https?:\/\/[^\s<>"]+$/i.test(v)) return label;
  }
  return null;
}

// 화면이 보낸 템플릿 → 저장할 모양 { tpl } 또는 { error }
//    길이 · 필드 수는 sanitizeTemplate 이 디스코드 한도로 자르고, 색 · 주소는 여기서 거절한다(조용히 비우면 관리자가 모른다)
//    card(이미지 카드)는 참/거짓만 — 카드 키가 아니면 false 로 정리된다
export function cleanTemplate(key, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "템플릿 형식이 올바르지 않습니다." };
  const e = raw.embed && typeof raw.embed === "object" ? raw.embed : {};
  if (Array.isArray(e.fields) && e.fields.length > LIMITS.fields) return { error: `필드는 ${LIMITS.fields}개까지입니다.` };
  if (raw.card !== undefined && typeof raw.card !== "boolean") return { error: "카드 이미지 값이 올바르지 않습니다." };
  const rawColor = String(e.color ?? "").trim();
  const tpl = sanitizeTemplate(raw, key);
  if (rawColor && !tpl.embed.color) return { error: "색은 #rrggbb 또는 등급 색만 쓸 수 있습니다." };
  for (const [f] of URL_FIELDS) tpl.embed[f] = tpl.embed[f].trim();
  const bad = badUrlField(key, tpl.embed);
  if (bad) return { error: `${bad} 주소는 http(s) 주소나 {avatar} 같은 변수만 쓸 수 있습니다.` };
  return { tpl };
}
