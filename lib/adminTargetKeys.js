// 📌 관리자 지급 대상 칸 나누기 — 여러 명을 한 칸에 붙여 넣는다(줄바꿈 · 쉼표).
//    DB · 서버 의존이 없어 화면(app/admin/bot)도 같은 함수로 나눈다 — 화면이 미리 확인한 키와 서버가 지급하는 키가 늘 같다.
//    대상을 DB 에서 찾는 쪽은 lib/adminTargets.js(서버 전용, 이 함수도 그대로 내보낸다).

// 한 번에 지정할 수 있는 사람 수 — 넘으면 호출부가 400 으로 막는다(여기서 자르지 않는다: 잘린 채 지급되면 누가 빠졌는지 모른다)
export const MAX_TARGETS = 200;

// 디스코드 멘션 <@123> · <@!123> — 복사해 온 멘션은 숫자(유저 ID)만 쓴다
const MENTION_RE = /^<@!?(\d+)>$/;
const SPLIT_RE = /[\n\r,]+/;

// text | string[] → 키 목록. trim · 빈 것 제거 · 멘션은 숫자만 · 순서 유지 중복 제거.
//    배열도 칸마다 다시 나눈다 — 이미 나눈 키를 다시 넣어도 결과가 같다(화면이 나눈 목록을 서버가 다시 나눠도 그대로)
export function parseTargetKeys(input) {
  const raw = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    if (v == null || typeof v === "object") continue;
    for (const part of String(v).split(SPLIT_RE)) {
      let key = part.trim();
      if (!key) continue;
      const m = key.match(MENTION_RE);
      if (m) key = m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
