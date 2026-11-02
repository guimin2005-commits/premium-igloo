// 📌 유물 「사건의 지평선」 이름 · 저장 값 모양만(그림 코드 없이) — 인벤토리 · 레벨 페이지가 부른다. 그림은 lib/relic(index)
//   저장 값(pick): { key: "horizon", core: "void" | "white" | "gold" | "sakura", frame, border, bg, bar: 1 | 2 | 3 }
export const RELIC_KEY = "horizon";
export const RELIC_NAME = "사건의 지평선";
export const RELIC_COLOR = "#3fe0d0"; // 유물 등급 색(lib/rarity)
export const CORE_KEYS = ["void", "white", "gold", "sakura"];
const clamp3 = (v) => (v === 2 || v === 3 ? v : 1);
// 모르는 값은 기본(보이드 · 1)
export const normPick = (p) => ({ key: RELIC_KEY, core: CORE_KEYS.includes(p?.core) ? p.core : "void", frame: clamp3(p?.frame), border: clamp3(p?.border), bg: clamp3(p?.bg), bar: clamp3(p?.bar) });
