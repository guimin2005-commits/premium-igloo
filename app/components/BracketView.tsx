"use client";

import React, { useState, useEffect, useRef } from "react";

// 📌 대진표 렌더러 — 그룹([승자조]/[패자조]/[결승]) + "라운드명:" + "팀A vs 팀B > 승자" 파싱
//   · 패자부활전(더블 엘리미네이션) 지원 · 가로 스크롤 없이 폭에 맞춰 자동 축소(scale-to-fit)
type BM = { a: string; b: string; winner: string };
type BR = { name: string; matches: BM[] };
type BSection = { key: "W" | "L" | "F" | "S"; label: string; rounds: BR[] };

export const parseBracketSections = (text: string): BSection[] => {
  const sections: BSection[] = [];
  let sec: BSection | null = null;
  let round: BR | null = null;
  const openSection = (key: BSection["key"], label: string) => { sec = { key, label, rounds: [] }; sections.push(sec); round = null; };

  (text || "").split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const gm = line.match(/^\[(.+)\]$/);
    if (gm) {
      const name = gm[1].trim();
      const key: BSection["key"] = /패자|loser/i.test(name) ? "L" : /결승|grand|final/i.test(name) ? "F" : "W";
      openSection(key, name);
      return;
    }
    if (line.endsWith(":")) {
      if (!sec) openSection("S", "");
      round = { name: line.slice(0, -1).trim(), matches: [] };
      sec!.rounds.push(round);
      return;
    }
    const [matchPart, winnerPart] = line.split(">");
    const teams = matchPart.split(/vs/i);
    if (teams.length !== 2) return;
    if (!sec) openSection("S", "");
    if (!round) { round = { name: "대진", matches: [] }; sec!.rounds.push(round); }
    round.matches.push({ a: teams[0].trim(), b: teams[1].trim(), winner: (winnerPart || "").trim() });
  });
  return sections.filter((s) => s.rounds.some((r) => r.matches.length));
};

const SECTION_META: Record<string, { label: string; dot: string; text: string }> = {
  W: { label: "승자조", dot: "bg-emerald-400", text: "text-emerald-400" },
  L: { label: "패자조", dot: "bg-orange-400", text: "text-orange-400" },
  F: { label: "결승", dot: "bg-[#e91e3f]", text: "text-[#e91e3f]" },
  S: { label: "", dot: "bg-gray-500", text: "text-gray-400" },
};

const BracketMatchCard = ({ m }: { m: BM }) => (
  <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden text-xs">
    {[m.a, m.b].map((team, tIdx) => {
      const isWinner = m.winner && team === m.winner;
      const isLoser = m.winner && team && team !== m.winner;
      return (
        <div key={tIdx} className={`px-3 py-2 flex items-center justify-between gap-2 ${tIdx === 0 ? "border-b border-white/5" : ""} ${isWinner ? "bg-[#e91e3f]/10" : ""}`}>
          <span className={`truncate ${isWinner ? "text-[#e91e3f] font-black" : isLoser ? "text-gray-600 line-through decoration-white/20" : "text-gray-200 font-medium"}`}>{team || "—"}</span>
          {isWinner && <span className="text-[9px] font-black text-[#e91e3f] shrink-0">WIN</span>}
        </div>
      );
    })}
  </div>
);

const BracketSection = ({ sec }: { sec: BSection }) => {
  const meta = SECTION_META[sec.key];
  return (
    <div className="flex flex-col gap-2">
      {sec.key !== "S" && (
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}></span>
          <span className={`text-[10px] font-black tracking-[0.2em] uppercase ${meta.text}`}>{sec.label || meta.label}</span>
        </div>
      )}
      <div className="flex gap-3 items-stretch">
        {sec.rounds.map((round, rIdx) => (
          <div key={rIdx} className="w-40 shrink-0 flex flex-col">
            <p className="text-[9px] font-black tracking-[0.15em] text-gray-500 uppercase mb-2 text-center truncate">{round.name}</p>
            <div className="flex-1 flex flex-col justify-around gap-2.5">
              {round.matches.map((m, mIdx) => <BracketMatchCard key={mIdx} m={m} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 폭에 맞춰 자동 축소 — 가로 스크롤 없이 한 눈에
export const BracketView = ({ text, showHeader = true }: { text: string; showHeader?: boolean }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ scale: 1, h: 0 });

  const sections = parseBracketSections(text);

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current, inner = innerRef.current;
      if (!wrap || !inner) return;
      const cw = wrap.clientWidth;
      const iw = inner.offsetWidth;
      const scale = iw > cw ? cw / iw : 1;
      setDims({ scale, h: inner.offsetHeight * scale });
    };
    measure();
    // 폰트 지연 로드/반응형 변화에도 재계산되도록 wrapper와 inner 모두 관찰
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [text]);

  if (!text?.trim() || sections.length === 0) return null;

  return (
    <div className={showHeader ? "mb-8" : ""}>
      {showHeader && (
        <div className="flex items-baseline gap-4 mb-4">
          <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">BRACKET</span>
          <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
        </div>
      )}
      <div ref={wrapRef} className="w-full overflow-hidden" style={{ height: dims.h ? dims.h : undefined }}>
        <div ref={innerRef} className="inline-flex flex-col gap-5" style={{ transformOrigin: "top left", transform: `scale(${dims.scale})` }}>
          {sections.map((sec, i) => <BracketSection key={i} sec={sec} />)}
        </div>
      </div>
    </div>
  );
};

export default BracketView;
