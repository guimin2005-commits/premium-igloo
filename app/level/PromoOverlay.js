"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VOICE_TIERS } from "@/lib/voiceTiers";
import { preloadSfx, playSfx } from "@/lib/sfxFiles";

// 📌 승급 화면 — 등급이 오른 뒤 LEVEL 에 들어오면 한 번 뜬다(본 등급은 UserXp.promoSeen — app/api/xp/promo-seen).
//    2026-10-08 운영자 "조각이 한 겹씩 조립": 이전 엠블럼이 빛으로 녹아 사라지고, 새 엠블럼이 부품 단위로 맞춰진다 —
//      받침이 올라오고 → 쐐기가 박히고 → 아래 날개 → 바깥 날개가 아래 겹부터 한 겹씩 펼쳐지고 → (수정) → 뿔이 솟고 → 뒤 날개 → 구슬 · 별 · 가운데 날.
//    부품 그림은 public/tier-emblems/<키>-parts.json(scripts/gen-tier-emblems.mjs), 다 맞춰지면 한 장짜리 그림(<키>-lg.svg)으로 바꿔 칸 이음매가 안 보이게.
//    효과음은 합성 소리 파일(public/sfx — scripts/gen-promo-sfx.mjs): 바람 · 조각이 맞춰질 때마다 찰칵(오르내리는 음) · 쿵 · 화음. 완성 순간 빛이 동그랗게 퍼지고 위아래로 둥실(모든 등급 — 10/9 "하위 티어들도"), 숨 쉬는 빛 · 되풀이 빛은 마스터부터.
//    움직임 줄이기면 끝 화면만(소리는 화음만)
const MASTER = VOICE_TIERS.findIndex((t) => t.key === "master");
const T_OLD = 120, T0 = 700, STEP = 120, DUR = 420; // ms — 이전 엠블럼이 녹기 시작 · 조립 시작 · 부품 사이 간격 · 부품 하나가 맞춰지는 시간
// 📌 부품이 제자리에 닿는 때 — 움직임 곡선(cubic-bezier(0.2,0.9,0.3,1))이 앞에서 빨라 DUR 의 약 30% 에 거의 닿는다. 찰칵 · 쿵을 여기에 맞춘다("애니메이션이랑 안 맞아")
const LAND = Math.round(DUR * 0.3);
// 📌 소리 크기 — 승급 화면 소리 전체에 곱한다(2026-10-08 "너무 크다 소리가" → 약 -8dB). 소리끼리의 비율은 그대로
const VOL = 0.16; // 10/8 "조금만 더 줄이고" → 10/9 "좀만 더 낮춰 약간" → 10/9 "아직도 좀 큰 거 같고"
// 📌 찰칵 음 — 도레미솔라(반음 0 · 2 · 4 · 7 · 9 · 12) 안에서 올라가되 짝수 번째는 위 · 홀수 번째는 아래로 오르내리고,
//    같은 음이 연달아 나오지 않게, 마지막은 꼭 맨 위(10/9 "변음을 준다거나"). 예: 이글루 15번 = 0 4 2 0 4 2 7 4 7 4 9 7 9 7 12
//    LOCK_EVEN: 이 횟수까지는 원래 크기, 넘으면 하나하나를 √(LOCK_EVEN / 횟수) 배로(이글루 15번 ≈ 0.63)
const LOCK_SCALE = [0, 2, 4, 7, 9, 12];
const LOCK_EVEN = 6;
function lockNotes(n) {
  const L = LOCK_SCALE.length, a = [];
  for (let i = 0; i < n - 1; i++) {
    const t = (i * (L - 1)) / (n - 1), f = Math.floor(t), c = Math.ceil(t);
    const cand = [...new Set((i % 2 ? [f, f - 1, c + 1] : [c, c + 1, f]).map((k) => Math.max(0, Math.min(L - 2, k))))];
    a.push(cand.find((k) => k !== a[i - 1]) ?? cand[0]);
  }
  a.push(L - 1);
  return a.map((k) => LOCK_SCALE[k]);
}
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// 부품 → 조립 순서 · 움직임(오른쪽 기준 각도 — 왼쪽은 거울)
//   rise: 아래에서 올라옴 · pop: 커지며 박힘 · fold: 아래로 접혀 있다가 펼쳐짐 · drop: 위에서 내려와 박힘 · up: 아래에서 밀려 올라옴
function planOf(parts) {
  const outers = parts.filter((p) => /^outer\d/.test(p.id)).map((p) => +p.id.slice(5));
  const maxOuter = outers.length ? Math.max(...outers) : -1;
  const rank = (id) => {
    if (id === "inner") return [0, "rise"];
    if (id === "wedge") return [1, "pop"];
    if (id === "lower") return [2, "fold"];
    if (/^outer\d/.test(id)) return [3 + (maxOuter - +id.slice(5)), "fold"]; // 아래(번호 큰) 겹부터
    const base = 4 + maxOuter;
    if (id === "shard") return [base, "pop"];
    if (/^horn\d/.test(id)) return [base + 1 + +id.slice(4) * 0.6, "fold"];
    if (/^back\d/.test(id)) return [base + 2.4 + +id.slice(4) * 0.6, "fold"];
    if (id === "fin") return [base + 3.2, "up"];
    if (id === "orb" || id === "star") return [base + 3.6, "drop"];
    return [base + 3, "pop"];
  };
  const list = parts.map((p) => { const [r, kind] = rank(p.id); return { ...p, r, kind }; });
  const ranks = [...new Set(list.map((p) => p.r))].sort((a, b) => a - b);
  return list.map((p) => {
    const step = ranks.indexOf(p.r), start = T0 + step * STEP;
    const sgn = p.side === "L" ? -1 : 1, h = hash(step, p.side === "L" ? 1 : 2);
    const v = p.kind === "rise" ? { tx: 0, ty: 7, rot: 0, sc: 0.96 }
      : p.kind === "pop" ? { tx: 0, ty: 0, rot: 0, sc: 0.3 }
      : p.kind === "drop" ? { tx: 0, ty: -9, rot: 0, sc: 1.35 }
      : p.kind === "up" ? { tx: 0, ty: 9, rot: 0, sc: 0.9 }
      : { tx: sgn * 1.5, ty: 2, rot: sgn * (34 + h * 14), sc: 0.82 };
    return { ...p, start, ...v, step };
  });
}

export default function PromoOverlay({ from, to, onClose }) {
  const t = VOICE_TIERS[to], f = from != null && from >= 0 ? VOICE_TIERS[from] : null;
  const high = to >= MASTER;
  const [art, setArt] = useState(null); // { n, parts }
  const [ready, setReady] = useState(false);
  const [sndReady, setSndReady] = useState(false); // 효과음 파일을 받았거나 기다리기를 그만둠
  const [reduce] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const btnRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.race([preloadSfx(["promo-rise", "promo-lock", "promo-boom", high ? "promo-fanfare-hi" : "promo-fanfare", "promo-click"]), new Promise((ok) => setTimeout(ok, 1500))])
      .then(() => alive && setSndReady(true));
    fetch(`/tier-emblems/${t.key}-parts.json`).then((r) => r.json()).then((j) => alive && setArt(j)).catch(() => alive && setArt({ n: 48, parts: [] }));
    return () => { alive = false; };
  }, [t.key, high]);

  const plan = useMemo(() => (art?.parts?.length ? planOf(art.parts) : []), [art]);
  const lastStep = plan.reduce((m, p) => Math.max(m, p.step), 0);
  const T_DONE = T0 + lastStep * STEP + LAND + 80; // 마지막 부품이 닿고 한 박자 뒤 — 번쩍 · 쿵 · 화음

  // 소리 · 닫기 · 스크롤 잠금 — 부품 그림을 읽은 뒤 시작(움직임과 소리가 맞게)
  useEffect(() => {
    if (!art || !sndReady) return;
    const ts = [], snd = []; // snd: 예약한 소리 끄기 — 일찍 닫으면 남은 찰칵 · 쿵 · 화음이 화면 없이 울리지 않게
    if (!reduce) {
      if (f) snd.push(playSfx("promo-rise", { vol: 0.7 * VOL, delay: 0 })); // 바람이 가장 셀 때(0.8초) = 이전 엠블럼이 사라지고 조립이 시작될 때
      // 찰칵 — 부품이 맞춰지는 순간마다(같은 때 맞춰지는 좌우는 한 번). 10/9 "고티어로 갈수록 너무 길어져 · 변음을" →
      //   횟수를 줄였더니 "구리다 · 답답해"(소리 없이 맞춰지는 조각이 생김) → 조각마다 다시 울리고, 음은 도레미솔라 안에서
      //   한 칸씩 오르내리며 올라가 끝에서 가장 높게(lockNotes) · 조금씩 흔들림. 찰칵이 많은 고티어는 하나하나를 조금 작게
      const steps = [...new Set(plan.map((p) => p.step))].sort((a, b) => a - b);
      const each = Math.min(1, Math.sqrt(LOCK_EVEN / Math.max(1, steps.length)));
      const notes = lockNotes(steps.length);
      steps.forEach((s, i) => {
        const note = notes[i];
        const wob = hash(i + 1, to + 7) - 0.5;
        snd.push(playSfx("promo-lock", { rate: 0.8 * Math.pow(2, note / 12) * (1 + wob * 0.04), vol: 0.5 * VOL * each * (1 + wob * 0.25), delay: (T0 + s * STEP + LAND - 10) / 1000 }));
      });
      snd.push(playSfx("promo-boom", { vol: 0.9 * VOL, delay: (T_DONE - 10) / 1000 }));
    }
    snd.push(playSfx(high ? "promo-fanfare-hi" : "promo-fanfare", { vol: 0.75 * VOL, delay: reduce ? 0 : (T_DONE + 60) / 1000 }));
    ts.push(setTimeout(() => { setReady(true); btnRef.current?.focus(); }, reduce ? 0 : T_DONE + 900));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { ts.forEach(clearTimeout); snd.forEach((c) => c && c()); document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [art, sndReady]); // eslint-disable-line react-hooks/exhaustive-deps


  if (!t) return null;
  const n = art?.n || 48, chars = [...t.name];
  const sil = plan.flatMap((p) => p.paths.map(([, d]) => d)).join("");
  return (
    <div role="dialog" aria-modal="true" aria-label={`${t.name} 승급`} className="fixed inset-0 z-[600] flex items-center justify-center px-4 select-none" onClick={() => ready && onClose()}>
      <style dangerouslySetInnerHTML={{ __html: `
        .pa { animation-fill-mode: both; }
        @keyframes paFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes paMelt { 0% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1) blur(0) } 45% { opacity: 1; filter: brightness(2.4) blur(0) } 100% { opacity: 0; transform: translateY(-14px) scale(.78); filter: brightness(3) blur(3px) } }
        @keyframes paRing { 0% { opacity: .85; transform: scale(.25) } 100% { opacity: 0; transform: scale(2.4) } }
        @keyframes paWave { 0% { opacity: 0; transform: scale(.35) } 12% { opacity: .95 } 100% { opacity: 0; transform: scale(3.2) } }
        @keyframes paBloom { 0% { opacity: 0; transform: scale(.25) } 18% { opacity: 1 } 100% { opacity: 0; transform: scale(2.8) } }
        @keyframes paAura { 0% { opacity: 0 } 25% { opacity: 1 } 100% { opacity: .7 } }
        @keyframes paGlowOn { 0% { filter: drop-shadow(0 0 0 transparent) brightness(1) } 25% { filter: drop-shadow(0 0 22px var(--gc)) brightness(1.4) } 100% { filter: drop-shadow(0 0 9px var(--gc)) brightness(1) } }
        @keyframes paBreathe { 0%, 100% { filter: drop-shadow(0 0 9px var(--gc)) } 50% { filter: drop-shadow(0 0 16px var(--gc)) } }
        @keyframes paPart {
          0% { opacity: 0; transform: translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(var(--sc)) }
          55% { opacity: 1 }
          78% { transform: translate(0, 0) rotate(calc(var(--rot) * -0.07)) scale(1.04) }
          100% { opacity: 1; transform: none }
        }
        @keyframes paFlash { 0% { opacity: 0 } 25% { opacity: .95 } 100% { opacity: 0 } }
        @keyframes paShow { from { opacity: 0 } to { opacity: 1 } }
        @keyframes paHide { from { opacity: 1 } to { opacity: 0 } }
        @keyframes paSweep { 0% { transform: translateX(-30px) } 100% { transform: translateX(78px) } }
        @keyframes paSweepLoop { 0% { transform: translateX(-30px) } 30%, 100% { transform: translateX(78px) } }
        @keyframes paFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes paTwinkle { 0%, 100% { opacity: .15; transform: scale(.7) } 50% { opacity: 1; transform: scale(1) } }
        @keyframes paUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes paChar { 0% { opacity: 0; transform: translateY(18px) scale(.6); filter: brightness(2.5) } 60% { opacity: 1; transform: translateY(-4px) scale(1.12) } 100% { opacity: 1; transform: none; filter: none } }
        @keyframes paKick { from { opacity: 0; letter-spacing: 1.4em } to { opacity: 1; letter-spacing: .5em } }
        .pa-part { transform-box: view-box; }
        @media (prefers-reduced-motion: reduce) { .pa { animation: none !important; } .pa-gone { display: none; } }
      ` }} />
      {/* 바탕 — 어두운 판 + 엠블럼 뒤 등급 색 빛무리 */}
      <div aria-hidden className="pa absolute inset-0" style={{ background: "rgba(11,11,13,0.94)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "paFade .35s ease-out" }} />
      {/* 부품 그림을 읽은 뒤에 나머지를 그린다 — 모든 움직임이 같은 순간에 시작하게 */}
      {art && sndReady && <>
      <div aria-hidden className="pa absolute inset-0" style={{ background: `radial-gradient(360px 300px at 50% 40%, ${t.c}46 0%, ${t.c}14 45%, ${t.c}00 75%)`, animation: `paAura 1.4s ${T_DONE - 40}ms ease-out both` }} />

      <div className="relative flex flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
        <div className="relative w-[144px] h-[144px] sm:w-[192px] sm:h-[192px]">
          {/* 이전 엠블럼 — 밝아지며 녹아 위로 사라진다 */}
          {f && !reduce && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/tier-emblems/${f.key}-lg.svg`} alt="" aria-hidden className="pa pa-gone absolute inset-[18%] w-[64%] h-[64%]" style={{ animation: `paMelt .6s ${T_OLD}ms ease-in both` }} />
          )}
          <span aria-hidden className="pa pa-gone absolute inset-0 rounded-full" style={{ border: `2px solid ${t.c}`, boxShadow: `0 0 22px ${t.c}`, animation: `paRing .9s ${T0 - 160}ms ease-out both` }} />
          {/* 📌 완성 — 엠블럼에서 빛이 동그랗게 퍼진다(2026-10-08 "빛나면서 빛이 퍼지는 · 지금도 원형으로 있는 것처럼"): 빛 덩어리 하나 + 고리 세 겹 */}
          <span aria-hidden className="pa pa-gone absolute left-1/2 top-1/2 w-[220px] h-[220px] -ml-[110px] -mt-[110px] rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, #ffffffee 0%, ${t.c}cc 22%, ${t.c}55 46%, ${t.c}00 70%)`, animation: `paBloom 1.1s ${T_DONE - 20}ms cubic-bezier(0.2,0.8,0.3,1) both` }} />
          {[0, 170, 340].map((d, i) => (
            <span key={i} aria-hidden className="pa pa-gone absolute inset-0 rounded-full pointer-events-none"
              style={{ border: `${i ? 2 : 3}px solid ${i === 1 ? "#ffffff" : t.c}`, boxShadow: `0 0 18px ${t.c}, inset 0 0 12px ${t.c}`, animation: `paWave ${1100 + i * 200}ms ${T_DONE - 20 + d}ms cubic-bezier(0.2,0.7,0.3,1) both` }} />
          ))}

          <div aria-hidden className="pa absolute inset-0" style={reduce ? { filter: `drop-shadow(0 0 9px ${t.c})` } : { "--gc": t.c, animation: `paGlowOn 1.2s ${T_DONE - 20}ms ease-out both, paFloat 3.2s ${T_DONE + 700}ms ease-in-out infinite${high ? `, paBreathe 3.2s ${T_DONE + 1300}ms ease-in-out infinite` : ""}` }}>
            {/* 부품 — 정해진 순서로 한 겹씩 맞춰진다(부품마다 빛내지 않는다 — "그 살짝 빛나는 거 없애") */}
            {!reduce && plan.length > 0 && (
              <svg viewBox={`0 0 ${n} ${n}`} className="pa absolute inset-0 w-full h-full overflow-visible" shapeRendering="crispEdges" style={{ animation: `paHide 0s ${T_DONE + 110}ms both` }}>
                {plan.map((p, i) => (
                  <g key={i} className="pa pa-part" style={{ "--tx": `${p.tx}px`, "--ty": `${p.ty}px`, "--rot": `${p.rot}deg`, "--sc": p.sc, transformOrigin: `${n / 2}px ${n * 0.6}px`, animation: `paPart ${DUR}ms ${p.start}ms cubic-bezier(0.2,0.9,0.3,1) both` }}>
                    {p.paths.map(([col, d], j) => <path key={j} d={d} fill={col} />)}
                  </g>
                ))}
              </svg>
            )}
            {/* 다 맞춰지면 한 장짜리 그림 — 칸 이음매가 안 보이게. 번쩍 · 빛 훑기는 그 위 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/tier-emblems/${t.key}-lg.svg`} alt="" className="pa absolute inset-0 w-full h-full" style={reduce ? undefined : { animation: `paShow 0s ${T_DONE + 100}ms both` }} />
            {!reduce && sil && (
              <svg viewBox={`0 0 ${n} ${n}`} className="absolute inset-0 w-full h-full overflow-visible" shapeRendering="crispEdges">
                <defs>
                  <clipPath id="pa-sil"><path d={sil} /></clipPath>
                  <linearGradient id="pa-band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".7" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
                </defs>
                <g clipPath="url(#pa-sil)">
                  <path className="pa" d={sil} fill="#ffffff" style={{ animation: `paFlash .55s ${T_DONE - 40}ms ease-out both` }} />
                  <g transform={`rotate(22 ${n / 2} ${n / 2})`}>
                    <rect className="pa" x="0" y={-n / 2} width={n * 0.22} height={n * 2} fill="url(#pa-band)"
                      style={{ animation: high ? `paSweep .7s ${T_DONE + 120}ms ease-in-out both, paSweepLoop 4.2s ${T_DONE + 1900}ms ease-in-out infinite` : `paSweep .7s ${T_DONE + 120}ms ease-in-out both` }} />
                  </g>
                </g>
              </svg>
            )}
          </div>
        </div>

        {/* 글자 — "승급" 자간이 모이고, 등급 이름이 한 글자씩 */}
        <p className="pa mt-6 text-[11px] font-black text-white/50 uppercase" style={{ letterSpacing: "0.5em", animation: `paKick .6s ${T_DONE + 180}ms cubic-bezier(0.16,1,0.3,1) both` }}>승급</p>
        <p className="mt-2 text-[40px] sm:text-[48px] font-black tracking-tight leading-none" style={{ color: t.c }}>
          {chars.map((ch, i) => (
            <span key={i} className="pa inline-block" style={{ animation: `paChar .5s ${T_DONE + 280 + i * 70}ms cubic-bezier(0.34,1.56,0.64,1) both` }}>{ch}</span>
          ))}
        </p>
        {f && <p className="pa mt-3 text-[13px] font-bold text-white/45" style={{ animation: `paUp .5s ${T_DONE + 380 + chars.length * 70}ms ease-out both` }}>{f.name} → {t.name}</p>}
        <button
          ref={btnRef}
          type="button"
          onClick={() => { playSfx("promo-click", { vol: 0.8 * VOL }); onClose(); }}
          className="pa mt-8 inline-flex items-center h-11 px-9 rounded-full bg-white hover:bg-[#f2f2f2] text-[#131313] text-[14px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
          style={{ animation: `paUp .5s ${T_DONE + 540 + chars.length * 70}ms ease-out both` }}
        >
          확인
        </button>
      </div>
      </>}
    </div>
  );
}
