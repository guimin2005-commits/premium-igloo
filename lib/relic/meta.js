// 📌 유물 「사건의 지평선」 이름 · 저장 값 모양만(그림 코드 없이) — 인벤토리 · 레벨 페이지가 부른다. 그림은 lib/relic(index)
//   저장 값(pick): { key: "horizon", core: "void" | "white" | "gold" | "sakura", frame, border, bg, bar: 1 | 2 | 3, icon: 0 | 1 | 2 | 3 }
//   icon — 대시보드 카드 단추 아이콘(2026-11-03): 0 기본(지금 선 아이콘 · 운영자 "기존 것도 선택 가능하게") · 1 궤도 · 2 파편 · 3 렌즈(lib/relic/icons). 예전 값(칸 없음)은 0
export const RELIC_KEY = "horizon";
export const RELIC_NAME = "사건의 지평선";
export const RELIC_COLOR = "#3fe0d0"; // 유물 등급 색(lib/rarity)
export const CORE_KEYS = ["void", "white", "gold", "sakura"];
const clamp3 = (v) => (v === 2 || v === 3 ? v : 1);
const clamp03 = (v) => (v === 1 || v === 2 || v === 3 ? v : 0);
// 모르는 값은 기본(보이드 · 1)
export const normPick = (p) => ({ key: RELIC_KEY, core: CORE_KEYS.includes(p?.core) ? p.core : "void", frame: clamp3(p?.frame), border: clamp3(p?.border), bg: clamp3(p?.bg), bar: clamp3(p?.bar), icon: clamp03(p?.icon) });
