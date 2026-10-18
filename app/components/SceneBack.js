"use client";

// 📌 카드 배경 겹 · 배경이 정한 레벨 막대 — 레벨 카드 · 인벤토리 장착 판이 같이 쓴다(SkinFrame 과 따로 — 테두리 그림 코드를 같이 싣지 않게)
import { sceneMetaOf } from "@/lib/cardScenes";

// 📌 카드 배경(2026-10-15) — 카드 바탕 장면을 통째로 바꾼다. 부르는 쪽(레벨 카드 · 인벤토리 장착 판)이 카드 맨 아래 겹에 깐다.
//    그림은 도트(가로 폭에 맞춰 위에서부터 · 확대는 칸 그대로). glow — 등급 빛(부르는 쪽 색)을 장면 위에 옅게 다시 얹는다
//    카드가 그림보다 길면(폭 × h / w 넘게) 그림 아래는 meta.foot(그림 맨 아래 줄 색 — 눈밭)으로 카드 끝까지 잇는다(옆은 자르지 않는다 — 글 자리 기준이 위)
export function SceneBack({ scene, glow = "" }) {
  const m = sceneMetaOf(scene);
  if (!m) return null;
  return (
    <>
      <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden" style={{ backgroundColor: m.foot || m.bg }}>
        <div style={{ width: "100%", aspectRatio: `${m.w} / ${m.h}`, backgroundColor: m.bg, backgroundImage: `url(${m.src})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", imageRendering: "pixelated" }}></div>
      </div>
      {glow && <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: glow, opacity: m.glow }}></div>}
    </>
  );
}
// 카드 배경이 정한 레벨 막대 모양("" 이면 기본 막대)
export const sceneBarOf = (scene) => sceneMetaOf(scene)?.bar || "";
// 📌 「유령 꼬리」 막대(sc_ghost) — 짙은 테 상자 안에 유령 꼬리 빛이 차오르고 왼쪽 끝엔 랜턴, 빛 끝은 흰 두 칸. 칸 2px 도트
//    (시안 .claude/mockups/ghost-event/cos/card.mjs BARS.mix(f, false) — 운영자 "2번 효과에 3번 틀" · "앞에 유령 모양 없애" · 구분선 없음)
//    빛 맨 위 줄에 #72c3e6 반짝 칸(빛 처음부터 2 · 18px, 22px 마다 — 빛 끝 8px 앞까지). 랜턴은 상자 왼쪽 18px 바깥 —
//    부르는 쪽이 상자를 글 줄 + 12px 에 둔다(시안 자리: 상자 x 40 · 랜턴 x 22 — 랜턴이 글 줄 28 보다 6px 바깥)
const LANT = ["..GG...", ".G..G..", "..gg...", ".dgggd.", "dLffFLd", "dLfWfLd", "dLFWFLd", "dLFfFLd", "dLLFLLd", ".dgggd.", "..ddd.."];
const LANT_PAL = { G: "#e2b04a", g: "#ffe08a", d: "#5a3a12", L: "#1a3a52", f: "#45b4ff", F: "#9ff8ff", W: "#ffffff" };
export function GhostTrailBar({ pct = 0, className = "" }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className={`relative ${className}`} style={{ height: 12 }}>
      <svg aria-hidden width="14" height="22" viewBox="0 0 14 22" shapeRendering="crispEdges" className="absolute" style={{ left: -18, top: -5 }}>
        {LANT.flatMap((r, j) => [...r].map((ch, i) => (LANT_PAL[ch] ? <rect key={`${i}-${j}`} x={i * 2} y={j * 2} width="2" height="2" fill={LANT_PAL[ch]} /> : null)))}
      </svg>
      <div className="absolute inset-0" style={{ background: "#0a0716" }}>
        <div className="absolute overflow-hidden" style={{ left: 2, right: 2, top: 2, bottom: 2, background: "#221a52" }}>
          <div className="absolute left-0 top-0 bottom-0" style={{ width: `${p}%`, minWidth: p > 0 ? 6 : 0, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)", background: "linear-gradient(180deg, #3f86c4 0 25%, #b4ecf9 25% 50%, #eafcff 50% 75%, #3f86c4 75% 100%)" }}>
            <div className="absolute left-0 top-0" style={{ right: 8, height: 2, backgroundImage: "repeating-linear-gradient(90deg, transparent 0 2px, #72c3e6 2px 4px, transparent 4px 18px, #72c3e6 18px 20px, transparent 20px 22px)" }}></div>
            <div className="absolute right-0 top-0 bottom-0" style={{ width: 2, background: "#ffffff" }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 📌 카드 스킨 장식 — 레벨 페이지 프로필 카드(잉크 판)에 착용한 카드 스킨을 얹는다.
//    "'카드' 스킨인 만큼 좀 꾸며 달라"(테두리만으론 심심) — 스킨마다 액자 + 장식 요소:
//      골드   금박 결 무늬 · 이중 테 · 네 모서리 장식 · 위아래 문장 · 반짝임
//      오로라 밤하늘 별 · 위에서 드리우는 빛 커튼(가는 세로 빛줄) · 물결 선 · 빛 테
//    아이스 · 크림슨(2026-10-05 도트로 다시 그림)과 시즌 2(새로운 세계 · 항해도 · 비공정)는 lib/cardSkins 의 SVG 문자열 함수를 그대로 쓴다 — 봇 카드와 한 벌
//    등급 색(카드 오른쪽 위 번지는 빛 · 링 · 문장)과 헷갈리지 않게 카드를 넓게 번지는 빛으로 칠하지 않는다 — 선 · 점 · 무늬 · 작은 장식만.
//    아바타(왼쪽 위)와 글자 뒤에는 옅게, 진한 장식은 가장자리 · 모서리(오른쪽 위 · 아래쪽)에. 봇 이미지 카드(lib/botCards.js SKIN_DECO)와 같은 말.
//    부모는 relative overflow-hidden 이어야 한다. 크기를 재서 그리므로 처음 한 번은 비어 있다가 나타난다(자리를 차지하지 않아 아무것도 밀지 않는다)
