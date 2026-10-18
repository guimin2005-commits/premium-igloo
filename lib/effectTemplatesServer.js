// 📌 종류별 효과 문구(2026-10-18 — lib/itemEffects 「종류별 효과 문구」) 서버 읽기.
//    Setting "effectTemplates" = { [효과 on]: 틀 }. 초안 모드(localhost)는 초안을 덧씌운 값(catalogFindOne) — 고친 틀은 「반영」 때 실사이트로.
//    connectToDatabase(lib/mongodb)가 부를 때마다 15초가 지났으면 다시 읽어 setEffectTemplates — 효과 문구를 만드는 모든 API(인벤토리 · 상품 상세 ·
//    세트 · 패스 보상 · 관리 목록)가 따로 부르지 않아도 같은 틀을 쓴다. 못 읽으면 직전 틀 그대로(연결은 막지 않는다)
//    봇은 이 설정을 읽지 않는다(봇은 효과 문구를 쓰지 않음)
import Setting from "@/models/Setting";
import { catalogFindOne } from "@/lib/catalogDraft";
import { EFFECT_TEMPLATES_KEY, setEffectTemplates } from "@/lib/itemEffects";

const TTL_MS = 15_000;
// 라우트마다 모듈이 따로 잡혀도 한 벌 — 지금 틀(lib/itemEffects)도 globalThis 에 둔다
const state = globalThis.__igEffectTemplatesLoad || (globalThis.__igEffectTemplatesLoad = { at: 0, pending: null });

export async function loadEffectTemplates({ force = false } = {}) {
  if (!force && Date.now() - state.at < TTL_MS) return;
  if (state.pending) return state.pending;
  state.pending = (async () => {
    try {
      const doc = await catalogFindOne(Setting, { key: EFFECT_TEMPLATES_KEY }, { select: { value: 1 } });
      setEffectTemplates(doc?.value || {});
    } catch (e) {
      console.error("효과 문구 읽기 오류:", e);
    } finally {
      state.at = Date.now();
      state.pending = null;
    }
  })();
  return state.pending;
}

// 저장 직후 — 방금 쓴 값을 바로 지금 틀로(다음 읽기까지 기다리지 않게)
export function rememberEffectTemplates(value) {
  setEffectTemplates(value || {});
  state.at = Date.now();
}
