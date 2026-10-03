// 📌 관리자 지급 대상 찾기(서버 전용) — 여러 명 지급(app/api/xp/grant · app/api/admin/items/grant 의 targets)과
//    미리 확인(app/api/admin/targets)이 같은 규칙을 쓴다. 키 나누기는 lib/adminTargetKeys.js(화면과 같은 함수).
//    키마다 한 명 지급의 대상 찾기와 같은 규칙: 유저 ID 가 맞으면 그 한 명만. 아니면 사용자명 · 표시 이름으로 찾고,
//    여러 명이 걸리면 "겹침"(표시 이름은 고유하지 않다 — 남의 사용자명과 같을 수도 있다).
//    DB 왕복은 키 수와 상관없이 두 번 — ID 를 $in 으로 한 번, ID 로 못 찾은 키의 이름을 $in 으로 한 번.
import UserXp from "@/models/UserXp";
import { parseTargetKeys, MAX_TARGETS } from "@/lib/adminTargetKeys";

export { parseTargetKeys, MAX_TARGETS };

const nameOf = (r) => r.displayName || r.username || "";

// keys(parseTargetKeys 결과) · proj(UserXp 투영) → { found, missing, ambiguous }
//    found     — UserXp lean 문서. 입력 순서, 같은 사람(ID 와 이름을 둘 다 적은 경우 등)은 한 번만
//    missing   — 아무도 안 걸린 키
//    ambiguous — [{ key, candidates: [{ userId, name }] }] 이름이 여러 명에게 걸린 키
export async function resolveTargets(keys, proj = {}) {
  const list = Array.isArray(keys) ? keys.map((k) => String(k)).filter(Boolean) : [];
  if (!list.length) return { found: [], missing: [], ambiguous: [] };
  // 이름 맞추기에 쓰는 칸은 늘 읽는다 (포함 투영만 쓴다)
  const p = { ...proj, userId: 1, username: 1, displayName: 1 };

  const byIdRows = await UserXp.find({ userId: { $in: list } }, p).lean();
  const byId = new Map(byIdRows.map((r) => [r.userId, r]));

  const rest = list.filter((k) => !byId.has(k));
  const nameRows = rest.length
    ? await UserXp.find({ $or: [{ username: { $in: rest } }, { displayName: { $in: rest } }] }, p).lean()
    : [];

  const found = [];
  const missing = [];
  const ambiguous = [];
  const taken = new Set();
  const take = (r) => {
    if (taken.has(r.userId)) return;
    taken.add(r.userId);
    found.push(r);
  };

  for (const key of list) {
    const hit = byId.get(key);
    if (hit) { take(hit); continue; }
    // 한 사람이 사용자명 · 표시 이름 둘 다로 걸려도 한 명
    const seen = new Set();
    const cands = [];
    for (const r of nameRows) {
      if ((r.username === key || r.displayName === key) && !seen.has(r.userId)) {
        seen.add(r.userId);
        cands.push(r);
      }
    }
    if (cands.length === 0) missing.push(key);
    else if (cands.length === 1) take(cands[0]);
    else ambiguous.push({ key, candidates: cands.map((r) => ({ userId: r.userId, name: nameOf(r) })) });
  }
  return { found, missing, ambiguous };
}

// 📌 여러 명 지급은 전부 아니면 없음 — 못 찾은 키 · 겹치는 이름이 하나라도 있으면 아무에게도 주지 않는다(409)
export const unresolvedMessage = (missing, ambiguous) =>
  [
    missing.length ? `찾지 못한 대상 ${missing.length}명` : "",
    ambiguous.length ? `이름이 겹치는 대상 ${ambiguous.length}명` : "",
  ].filter(Boolean).join(" · ");
