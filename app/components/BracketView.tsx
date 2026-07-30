"use client";

import React, { useState, useEffect, useRef } from "react";

// 📌 대진표 렌더러 — 그룹([승자조]/[패자조]/[결승]) + "라운드명:" + "팀A vs 팀B > 승자" 파싱
//   · 패자부활전(더블 엘리미네이션) 지원 · 연결선(브라켓 트리) · #GAME 라벨
//   · mode="fit": 폭에 맞춰 축소/확대 · mode="contain": 폭·높이 모두 맞춰 중앙 배치(전체화면용)
type BM = { a: string; b: string; winner: string; _game?: number };
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

const COL_W = 190; // 매치 박스(=라운드 컬럼) 폭
const CONN_W = 34; // 연결선 컬럼 폭
const LINE = "rgba(255,255,255,0.18)";

const MatchBox = ({ m, roundName }: { m: BM; roundName?: string }) => (
  <div className="relative" style={{ width: COL_W }}>
    <div className="absolute -top-[15px] left-0 right-0 flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-[9px] font-black text-orange-400 tracking-wider">#GAME {m._game}</span>
      {roundName && <span className="text-[9px] font-black text-gray-600 tracking-wider truncate">{roundName}</span>}
    </div>
    <div className="rounded-md border border-white/10 bg-[#161616] overflow-hidden shadow-sm">
      {[m.a, m.b].map((team, ti) => {
        const isWin = !!m.winner && team === m.winner;
        const isLose = !!m.winner && !!team && team !== m.winner;
        return (
          <div key={ti} className={`flex items-stretch ${ti === 0 ? "border-b border-white/10" : ""} ${isWin ? "bg-[#e91e3f]/12" : ""}`}>
            <div className={`w-6 shrink-0 border-r border-white/10 ${isWin ? "bg-[#e91e3f]/25" : "bg-white/[0.04]"}`}></div>
            <span className={`flex-1 min-w-0 truncate text-[11px] py-1.5 px-2 ${isWin ? "text-[#e91e3f] font-black" : isLose ? "text-gray-600" : "text-gray-100 font-bold"}`}>{team || "—"}</span>
            {isWin && <span className="text-[8px] font-black text-[#e91e3f] self-center pr-2 shrink-0">WIN</span>}
          </div>
        );
      })}
    </div>
  </div>
);

// 라운드 A(nA) → 라운드 B(nB) 연결선. nA==2·nB이면 페어를 하나로 합치는 엘보, 아니면 직선 스텁으로 안전 폴백
const Connector = ({ nA, nB }: { nA: number; nB: number }) => {
  const seg = (style: React.CSSProperties, key: string) => (
    <div key={key} className="absolute" style={{ background: LINE, ...style }} />
  );
  if (nB > 0 && nA === 2 * nB) {
    return (
      <div className="flex flex-col shrink-0" style={{ width: CONN_W }}>
        {Array.from({ length: nB }).map((_, i) => (
          <div key={i} className="relative flex-1">
            {seg({ left: 0, width: "50%", top: "25%", height: 2 }, "t")}
            {seg({ left: 0, width: "50%", top: "75%", height: 2 }, "b")}
            {seg({ left: "50%", top: "25%", height: "50%", width: 2 }, "v")}
            {seg({ left: "50%", width: "50%", top: "50%", height: 2 }, "o")}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col shrink-0" style={{ width: CONN_W }}>
      {Array.from({ length: Math.max(nA, nB) }).map((_, i) => (
        <div key={i} className="relative flex-1">{seg({ left: 0, width: "100%", top: "50%", height: 2 }, "s")}</div>
      ))}
    </div>
  );
};

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
      <div className="flex items-stretch pt-4">
        {sec.rounds.map((round, ri) => (
          <React.Fragment key={ri}>
            <div className="flex flex-col shrink-0" style={{ width: COL_W }}>
              {round.matches.map((m, mi) => (
                <div key={mi} className="flex-1 flex items-center min-h-[64px]">
                  <MatchBox m={m} roundName={mi === 0 ? round.name : undefined} />
                </div>
              ))}
            </div>
            {ri < sec.rounds.length - 1 && <Connector nA={round.matches.length} nB={sec.rounds[ri + 1].matches.length} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// mode: "fit" = 폭 기준 축소/확대(인라인) · "contain" = 폭·높이 모두 맞춰 중앙(전체화면)
export const BracketView = ({ text, showHeader = true, maxScale = 1, mode = "fit" }: { text: string; showHeader?: boolean; maxScale?: number; mode?: "fit" | "contain" }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ scale: 1, h: 0 });

  const sections = parseBracketSections(text);
  // #GAME 번호 — 전체 대진표에서 순차 부여
  let gc = 0;
  sections.forEach((s) => s.rounds.forEach((r) => r.matches.forEach((m) => { m._game = ++gc; })));

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current, inner = innerRef.current;
      if (!wrap || !inner) return;
      const cw = wrap.clientWidth, iw = inner.offsetWidth, ih = inner.offsetHeight;
      if (!iw) return;
      if (mode === "contain") {
        const ch = wrap.clientHeight || 1;
        const scale = Math.min(cw / iw, ch / ih, maxScale);
        setDims({ scale, h: 0 });
      } else {
        const scale = Math.min(cw / iw, maxScale);
        setDims({ scale, h: ih * scale });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [text, maxScale, mode]);

  if (!text?.trim() || sections.length === 0) return null;

  const content = sections.map((sec, i) => <BracketSection key={i} sec={sec} />);

  if (mode === "contain") {
    return (
      <div ref={wrapRef} className="w-full h-full flex items-center justify-center overflow-hidden">
        <div ref={innerRef} className="inline-flex flex-col gap-6" style={{ transformOrigin: "center center", transform: `scale(${dims.scale})` }}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className={showHeader ? "mb-8" : ""}>
      {showHeader && (
        <div className="flex items-baseline gap-4 mb-4">
          <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">BRACKET</span>
          <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
        </div>
      )}
      <div ref={wrapRef} className="w-full overflow-hidden" style={{ height: dims.h ? dims.h : undefined }}>
        <div ref={innerRef} className="inline-flex flex-col gap-6" style={{ transformOrigin: "top left", transform: `scale(${dims.scale})` }}>
          {content}
        </div>
      </div>
    </div>
  );
};

export default BracketView;
