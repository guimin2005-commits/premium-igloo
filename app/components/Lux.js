"use client";

import React, { useState, useEffect, useRef } from "react";

// 📌 공용 럭셔리 디자인 시스템 — SYSTEM : LEVEL 페이지와 동일한 디자인 언어

// 스크롤 등장 모션 (Intersection Observer)
export const Reveal = ({ children, delay = 0, className = "" }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

// 숫자 카운트업
export const CountUp = ({ end, duration = 1400, suffix = "" }) => {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(end * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, end, duration]);

  return <span ref={ref}>{value.toLocaleString()}{suffix}</span>;
};

// 에디토리얼 섹션 헤더 (01 / 02 넘버링)
export const SectionHeader = ({ no, title, desc }) => (
  <div className="mb-8">
    <div className="flex items-baseline gap-4 mb-2">
      <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
    </div>
    <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">{title}</h3>
    {desc && <p className="text-xs text-gray-500 mt-2 leading-relaxed">{desc}</p>}
  </div>
);

// 그라디언트 보더 럭스 카드
export const LuxCard = ({ children, className = "", glow = false, onClick }) => (
  <div
    onClick={onClick}
    className={`relative rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-px ${glow ? "shadow-[0_20px_60px_-20px_rgba(233,30,63,0.25)]" : ""} ${onClick ? "cursor-pointer" : ""}`}
  >
    <div className={`rounded-2xl bg-[#111111]/95 backdrop-blur-sm h-full ${className}`}>
      {children}
    </div>
  </div>
);

// 페이지 히어로 (그리드 배경 + 시머 타이틀)
export const PageHero = ({ eyebrow, title, accent, desc, children }) => (
  <section className="relative w-full pt-16 pb-12 md:pt-24 md:pb-16 px-6">
    <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
    <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
    <div className="max-w-5xl mx-auto relative z-10">
      <Reveal>
        <div className="flex items-center gap-3 mb-5">
          <span className="w-8 h-px bg-[#e91e3f]"></span>
          <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">{eyebrow || "Premium Igloo Official"}</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none mb-5">
          <span className="text-white">{title}</span>
          {accent && <span className="lux-shimmer ml-3">{accent}</span>}
        </h1>
        {desc && <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-xl">{desc}</p>}
        {children}
      </Reveal>
    </div>
  </section>
);

// 공용 CSS (히어로 그리드/시머) — 페이지당 1회 삽입
export const LuxStyles = () => (
  <style dangerouslySetInnerHTML={{__html: `
    @keyframes shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes pulseGlow {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.2); }
    }
    .lux-shimmer {
      background: linear-gradient(110deg, #ffffff 20%, #e91e3f 40%, #ff7a92 50%, #e91e3f 60%, #ffffff 80%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: shimmer 6s linear infinite;
    }
    .lux-grid-bg {
      background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
      background-size: 44px 44px;
      mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
      -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
    }
  `}} />
);
