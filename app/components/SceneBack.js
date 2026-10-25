"use client";

// 📌 카드 배경 겹 · 배경이 정한 레벨 막대 — 레벨 카드 · 인벤토리 장착 판이 같이 쓴다(SkinFrame 과 따로 — 테두리 그림 코드를 같이 싣지 않게)
import { sceneMetaOf } from "@/lib/cardScenes";

// 📌 카드 배경(2026-10-15) — 카드 바탕 장면을 통째로 바꾼다. 부르는 쪽(레벨 카드 · 인벤토리 장착 판)이 카드 맨 아래 겹에 깐다.
//    그림은 도트(가로 폭에 맞춰 위에서부터 · 확대는 칸 그대로). glow — 등급 빛(부르는 쪽 색)을 장면 위에 옅게 다시 얹는다
//    카드가 그림보다 길면(폭 × h / w 넘게) 그림 아래는 meta.foot(그림 맨 아래 줄 색 — 눈밭)으로 카드 끝까지 잇는다(옆은 자르지 않는다 — 글 자리 기준이 위)
//    📌 움직이는 배경(meta.anim — 2026-10-25 「바람의 클로버 언덕」): 같은 자리에 겹 셋 — base(바탕) → 구름 띠(두 장을 이어 CSS 로 칸 하나씩 오른쪽으로 끝없이 · cloudSec 초에 한 바퀴) → live(움직이는 webp).
//       움직임 줄이기면 globals.css 가 움직이는 겹(.scene-live)을 숨기고 멈춘 그림(.scene-still — meta.src)을 보인다
const pix = (src) => ({ backgroundImage: `url(${src})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", imageRendering: "pixelated" });
export function SceneBack({ scene, glow = "" }) {
  const m = sceneMetaOf(scene);
  if (!m) return null;
  const a = m.anim;
  return (
    <>
      <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden" style={{ backgroundColor: m.foot || m.bg }}>
        {a ? (
          <div className="relative overflow-hidden" style={{ width: "100%", aspectRatio: `${m.w} / ${m.h}`, backgroundColor: m.bg }}>
            <div className="scene-still absolute inset-0" style={pix(m.src)}></div>
            <div className="scene-live absolute inset-0" style={pix(a.base)}>
              <div className="scene-cloud absolute left-0 top-0 h-full" style={{ width: "200%", animationDuration: `${a.cloudSec}s`, backgroundImage: `url(${a.clouds})`, backgroundSize: "50% 100%", backgroundRepeat: "repeat-x", imageRendering: "pixelated" }}></div>
              <div className="absolute inset-0" style={pix(a.live)}></div>
            </div>
          </div>
        ) : (
          <div style={{ width: "100%", aspectRatio: `${m.w} / ${m.h}`, backgroundColor: m.bg, ...pix(m.src) }}></div>
        )}
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

// 📌 「덩굴 줄기」 막대(sc_clover — 바람의 클로버 언덕) — 짙은 홈(테 · 빈 관 두 톤) 안에서 세 톤 줄기(밝은 위 · 몸 · 짙은 밑)가 자라고,
//    18px 마다 위아래 번갈아 잎이 테를 뚫고 돋고, 줄기 끝엔 흰 꽃 한 칸이 박힌 세잎 봉오리. 칸 2px 도트 · 높이 12px(봇 lib/botCards.js cloverBar 와 같은 그림 — 칸 4px)
//    잎은 줄기 끝 12px 앞까지(봉오리 자리 비움). 부르는 쪽이 글 줄 폭 그대로 둔다(유령 꼬리처럼 밖으로 나가는 것 없음)
const VINE = { frame: "#0a1517", track: "#1f3537", track2: "#182a2c", s1: "#a6e57c", s2: "#5aa83e", s3: "#24502a", lL: "#c8f2a0", lM: "#6cc24a", lD: "#3f8a35" };
// 잎 무늬 한 마디(18칸 = 36px) — 0열 = 위 잎 왼쪽 잎자루 칸. 위 잎(0~3열 · 0 · 1줄) · 아래 잎(9~12열 · 4 · 5줄)
const VINE_LEAVES = [[1, 0, 2, VINE.lL], [3, 0, 1, VINE.lM], [0, 1, 1, VINE.s2], [1, 1, 2, VINE.lM], [9, 4, 1, VINE.s2], [10, 4, 2, VINE.lM], [10, 5, 1, VINE.lM], [11, 5, 2, VINE.lD]];
const VINE_LEAF_URI = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="12" shape-rendering="crispEdges">${VINE_LEAVES.map(([x, y, w, c]) => `<rect x="${x * 2}" y="${y * 2}" width="${w * 2}" height="2" fill="${c}"/>`).join("")}</svg>`)}")`;
const VINE_BUD = [".oLLo.", "oLMMDo", "oLDWMo", "LMDDMD", "oMDoDo", ".oo.o."];
const VINE_BUD_PAL = { o: VINE.frame, L: "#c8f2a0", M: "#8fd46a", D: "#4c9a3a", W: "#ffffff" };
export function CloverVineBar({ pct = 0, className = "" }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const row = (top, bg, extra = {}) => <div className="absolute" style={{ left: 2, right: 2, top, height: 2, background: bg, ...extra }}></div>;
  return (
    <div className={`relative ${className}`} style={{ height: 12 }}>
      {row(2, VINE.frame)}
      {row(4, VINE.track)}
      {row(6, VINE.track2)}
      {row(8, VINE.frame)}
      <div className="absolute" style={{ left: 0, top: 4, width: 2, height: 4, background: VINE.frame }}></div>
      <div className="absolute" style={{ right: 0, top: 4, width: 2, height: 4, background: VINE.frame }}></div>
      {p > 0 && (
        <div className="absolute top-0 bottom-0" style={{ left: 2, width: `calc((100% - 16px) * ${p / 100})`, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }}>
          <div className="absolute left-0 right-0" style={{ top: 4, height: 6, background: `linear-gradient(180deg, ${VINE.s1} 0 2px, ${VINE.s2} 2px 4px, ${VINE.s3} 4px 6px)` }}></div>
          {/* 잎 — 잎 k(18k px 부터 8px)는 18k < 줄기 폭 − 24px 일 때만(봇 cloverBar 의 i < f − 7). 폭을 잎 마디로 끊어 반쪽 잎이 남지 않게(round() 를 못 읽으면 right 12px 로) */}
          <div className="absolute top-0 overflow-hidden" style={{ left: 6, right: 12, width: "calc(round(up, 100% - 24px, 18px) - 10px)", height: 12, backgroundImage: VINE_LEAF_URI, backgroundRepeat: "repeat-x", backgroundPosition: "0 0" }}></div>
          <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges" className="absolute top-0" style={{ left: "100%" }}>
            {VINE_BUD.flatMap((r, j) => [...r].map((ch, i) => (VINE_BUD_PAL[ch] ? <rect key={`${i}-${j}`} x={i * 2} y={j * 2} width="2" height="2" fill={VINE_BUD_PAL[ch]} /> : null)))}
          </svg>
        </div>
      )}
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
