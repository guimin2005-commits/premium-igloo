"use client";

// 📌 「사건의 지평선」 카드 단추 아이콘(2026-11-03 — 커스텀 창 「아이콘」 1 궤도 · 2 파편 · 3 렌즈) — 그림은 lib/relic/icons
//    자리는 지금 아이콘 칸(24 × 24) 그대로 두고, 그림은 그 둘레 48 × 48 로 넘친다(고리 · 파편이 칸 밖까지). 레벨 페이지가 next/dynamic 으로 부른다
//    움직임: 한 화면의 아이콘이 타이머 하나를 함께 쓴다(110ms — 시안 GIF 와 같은 박자). 움직임 줄이기 설정이면 멈춘 한 장
import { useEffect, useRef } from "react";
import { relicIconSvg, ICON_LOOP_MS } from "@/lib/relic/icons";

const subs = new Set();
let timer = null;
const tick = () => { const t = (performance.now() % ICON_LOOP_MS) / ICON_LOOP_MS; subs.forEach((f) => f(t)); };
const subscribe = (f) => {
  subs.add(f);
  if (!timer) timer = setInterval(tick, 110);
  return () => { subs.delete(f); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
};

export default function RelicIcon({ kind, style, core, i = 0, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const draw = (t) => { g.innerHTML = relicIconSvg(kind, style, core, t, i); };
    draw(0.3);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    return subscribe(draw);
  }, [kind, style, core, i]);
  return (
    <span aria-hidden className={`relative block w-6 h-6 ${className}`}>
      <svg viewBox="-24 -24 48 48" className="absolute pointer-events-none overflow-visible" style={{ left: -12, top: -12, width: 48, height: 48 }}>
        <g ref={ref} />
      </svg>
    </span>
  );
}
