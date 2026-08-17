"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

/* 📌 대진표 렌더러
   그룹([승자조]/[패자조]/[결승]) + "라운드명:" + "팀A vs 팀B > 승자" 파싱

   ⚠️ 구조가 핵심이다.
   승자조와 패자조를 위아래로 따로 그려두면 "이 둘이 결승에서 만난다"는 사실이 전혀 안 보인다.
   그래서 승자조·패자조를 왼쪽에 나란히 두고, 결승을 오른쪽 한가운데에 놓은 뒤
   두 조의 마지막 경기에서 결승으로 실제 합류선을 그린다(실측 → SVG). */

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

const G = "#00e07b";   // 승자조
const A = "#fbbf24";   // 패자조
const COL_W = 208;     // 라운드 컬럼 폭
const CONN_W = 36;     // 라운드 사이 연결선 폭
const MERGE_W = 92;    // 조 → 결승 합류선이 지나갈 폭
const LINE = "rgba(255,255,255,0.14)";

const SECTION_META: Record<string, { label: string; color: string; sub: string }> = {
  W: { label: "승자조", color: G, sub: "지면 패자조로 내려갑니다" },
  L: { label: "패자조", color: A, sub: "한 번 더 지면 탈락입니다" },
  F: { label: "결승", color: "#ffffff", sub: "승자조 1위 vs 패자조 1위" },
  S: { label: "", color: "#9ca3af", sub: "" },
};

/* 매치 한 칸 — 두 팀이 위아래로 붙고, 이긴 쪽이 살아난다.
   slotTags 가 있으면 각 자리가 "어디서 올라온 자리"인지 이름표를 붙인다 (결승 전용). */
const MatchBox = ({ m, slotTags }: { m: BM; slotTags?: [{ t: string; c: string }, { t: string; c: string }] }) => {
  const decided = !!m.winner;
  return (
    <div className="relative" style={{ width: COL_W }}>
      <div className="esp-cut-sm border border-white/[0.10] bg-[#101012] overflow-hidden">
        {[m.a, m.b].map((team, ti) => {
          const isWin = decided && team === m.winner;
          const isLose = decided && !!team && team !== m.winner;
          const tag = slotTags?.[ti];
          return (
            <div key={ti}
              className={`px-3 py-2.5 ${ti === 0 ? "border-b border-white/[0.08]" : ""}`}
              style={isWin ? { background: `${G}14` } : undefined}>
              {tag && (
                <p className="text-[8px] font-black esp-mono mb-1 truncate" style={{ color: tag.c }}>{tag.t}</p>
              )}
              <div className="flex items-center gap-2">
                {/* 승패 막대 — 빈 칸이 아니라 의미가 있는 자리 */}
                <span className="w-[3px] h-4 shrink-0"
                  style={{ background: isWin ? G : isLose ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.16)" }} />
                <span className={`flex-1 min-w-0 truncate text-[13px] ${isWin ? "font-black" : isLose ? "font-bold text-gray-600" : "font-bold text-gray-200"}`}
                  style={isWin ? { color: G } : undefined}>
                  {team || "미정"}
                </span>
                {isWin && <span className="shrink-0 text-[9px] font-black esp-mono" style={{ color: G }}>WIN</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 라운드 A(nA) → 라운드 B(nB) 연결선. nA==2·nB 이면 페어를 하나로 합치는 엘보, 아니면 직선 스텁
const Connector = ({ nA, nB }: { nA: number; nB: number }) => {
  const seg = (style: React.CSSProperties, key: string) => (
    <div key={key} className="absolute" style={{ background: LINE, ...style }} />
  );
  if (nB > 0 && nA === 2 * nB) {
    return (
      <div className="flex flex-col shrink-0" style={{ width: CONN_W }}>
        {Array.from({ length: nB }).map((_, i) => (
          <div key={i} className="relative flex-1">
            {seg({ left: 0, width: "50%", top: "25%", height: 1 }, "t")}
            {seg({ left: 0, width: "50%", top: "75%", height: 1 }, "b")}
            {seg({ left: "50%", top: "25%", height: "50%", width: 1 }, "v")}
            {seg({ left: "50%", width: "50%", top: "50%", height: 1 }, "o")}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col shrink-0" style={{ width: CONN_W }}>
      {Array.from({ length: Math.max(nA, nB) }).map((_, i) => (
        <div key={i} className="relative flex-1">{seg({ left: 0, width: "100%", top: "50%", height: 1 }, "s")}</div>
      ))}
    </div>
  );
};

/* 한 조(승자조·패자조·결승)를 가로로 그린다.
   anchorRef 는 합류선을 이을 기준 컬럼 — 승자조/패자조는 마지막 라운드, 결승은 첫 라운드. */
const Branch = ({ sec, anchor, anchorRef, finalSlots }: {
  sec: BSection;
  anchor?: "last" | "first";
  anchorRef?: React.RefObject<HTMLDivElement | null>;
  finalSlots?: boolean;
}) => {
  const meta = SECTION_META[sec.key];
  const anchorIdx = anchor === "first" ? 0 : sec.rounds.length - 1;

  return (
    <div className="flex flex-col gap-3">
      {sec.key !== "S" && (
        <div className="flex items-baseline gap-2">
          <span className="w-1.5 h-1.5 shrink-0" style={{ background: meta.color, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
          <span className="text-[11px] font-black esp-mono uppercase" style={{ color: meta.color }}>{sec.label || meta.label}</span>
          {meta.sub && <span className="text-[10px] font-bold text-gray-600 truncate">{meta.sub}</span>}
        </div>
      )}

      {/* 라운드 이름은 매치마다 반복하지 않고 컬럼 머리글로 한 번만 */}
      <div className="flex items-stretch">
        {sec.rounds.map((round, ri) => (
          <React.Fragment key={ri}>
            <div className="shrink-0" style={{ width: COL_W }}>
              <p className="text-[10px] font-black esp-mono text-gray-500 pb-2 border-b border-white/[0.08] truncate">
                {round.name || `${ri + 1}라운드`}
              </p>
            </div>
            {ri < sec.rounds.length - 1 && <div className="shrink-0" style={{ width: CONN_W }} />}
          </React.Fragment>
        ))}
      </div>

      <div className="flex items-stretch">
        {sec.rounds.map((round, ri) => (
          <React.Fragment key={ri}>
            <div
              ref={anchorRef && ri === anchorIdx ? anchorRef : undefined}
              className="flex flex-col shrink-0"
              style={{ width: COL_W }}>
              {round.matches.map((m, mi) => (
                <div key={mi} className="flex-1 flex items-center min-h-[76px]">
                  <MatchBox
                    m={m}
                    slotTags={finalSlots && ri === 0 && mi === 0
                      ? [{ t: "승자조 1위", c: G }, { t: "패자조 1위", c: A }]
                      : undefined}
                  />
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

type Link = { d: string; color: string; tip: [number, number] };

/* 승자조 · 패자조 → 결승. 조를 왼쪽에 쌓고 결승을 오른쪽 한가운데 두고 실제로 선을 잇는다. */
const MergedBracket = ({ W, L, F, rest }: { W: BSection; L: BSection | null; F: BSection; rest: BSection[] }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const wRef = useRef<HTMLDivElement>(null);
  const lRef = useRef<HTMLDivElement>(null);
  const fRef = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const c = boxRef.current, f = fRef.current;
    if (!c || !f) return;
    const cb = c.getBoundingClientRect();
    // 전체화면 모드에서 부모가 scale() 되어 있으면 rect 가 배율만큼 부풀어 있다 — 되돌린다
    const k = c.offsetWidth ? cb.width / c.offsetWidth : 1;
    const px = (v: number) => v / (k || 1);
    const fb = f.getBoundingClientRect();
    const toX = px(fb.left - cb.left);
    const toY = px(fb.top - cb.top + fb.height / 2);

    const out: Link[] = [];
    ([[wRef.current, G], [lRef.current, A]] as const).forEach(([el, color]) => {
      if (!el) return;
      const b = el.getBoundingClientRect();
      const x1 = px(b.right - cb.left);
      const y1 = px(b.top - cb.top + b.height / 2);
      const mx = x1 + (toX - x1) / 2;
      out.push({ d: `M ${x1} ${y1} H ${mx} V ${toY} H ${toX - 7}`, color, tip: [toX - 7, toY] });
    });

    setSize((p) => (Math.abs(p.w - px(cb.width)) < 1 && Math.abs(p.h - px(cb.height)) < 1 ? p : { w: px(cb.width), h: px(cb.height) }));
    setLinks(out);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 120); // 폰트 로딩 후 한 번 더
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); clearTimeout(t); };
  }, [measure]);

  return (
    <div className="flex flex-col gap-10">
      <div ref={boxRef} className="relative inline-flex items-stretch">
        {/* 왼쪽 — 승자조 / 패자조 */}
        <div className="flex flex-col gap-10 shrink-0">
          <Branch sec={W} anchor="last" anchorRef={wRef} />
          {L && <Branch sec={L} anchor="last" anchorRef={lRef} />}
        </div>

        {/* 합류선이 지나갈 자리 */}
        <div className="shrink-0" style={{ width: MERGE_W }} />

        {/* 오른쪽 — 결승. 두 조의 한가운데에 놓인다 */}
        <div className="flex flex-col justify-center shrink-0">
          <Branch sec={F} anchor="first" anchorRef={fRef} finalSlots />
        </div>

        {/* 실측한 합류선 */}
        <svg className="absolute left-0 top-0 pointer-events-none" width={size.w || 1} height={size.h || 1}>
          {links.map((l, i) => (
            <g key={i}>
              <path d={l.d} fill="none" stroke={l.color} strokeWidth={1.5} strokeOpacity={0.75} />
              <path d={`M ${l.tip[0]} ${l.tip[1] - 4} L ${l.tip[0] + 7} ${l.tip[1]} L ${l.tip[0]} ${l.tip[1] + 4} Z`} fill={l.color} fillOpacity={0.85} />
            </g>
          ))}
        </svg>
      </div>

      {rest.map((s, i) => <Branch key={i} sec={s} />)}
    </div>
  );
};

/* maxScale 은 예전 축소 뷰어의 잔재 — 남은 호출부 호환을 위해 받기만 하고 쓰지 않는다.
   전체화면 뷰어는 없앴다. 대진표는 제 크기로 두고 옆으로 흐르게 한다. */
export const BracketView = ({ text, showHeader = true }: { text: string; showHeader?: boolean; maxScale?: number }) => {
  const sections = parseBracketSections(text);
  // #GAME 번호 — 전체 대진표에서 순차 부여
  let gc = 0;
  sections.forEach((s) => s.rounds.forEach((r) => r.matches.forEach((m) => { m._game = ++gc; })));

  if (!text?.trim() || sections.length === 0) return null;

  const W = sections.find((s) => s.key === "W") || null;
  const F = sections.find((s) => s.key === "F") || null;
  const L = sections.find((s) => s.key === "L") || null;

  const content = W && F
    ? <MergedBracket W={W} L={L} F={F} rest={sections.filter((s) => s !== W && s !== L && s !== F)} />
    : <div className="flex flex-col gap-10">{sections.map((sec, i) => <Branch key={i} sec={sec} />)}</div>;

  /* ⚠️ 폭에 맞춰 scale() 로 줄이던 것을 없앴다. 라운드가 늘수록 글씨가 읽을 수 없게 작아진다.
        대진표는 원래 가로로 긴 물건이니 제 크기를 유지하고 옆으로 흐르게 둔다 (스크롤 바는 감춘다). */
  return (
    <div className={showHeader ? "mb-8" : ""}>
      {showHeader && (
        <div className="flex items-baseline gap-4 mb-4">
          <span className="text-[10px] font-black esp-mono uppercase text-[#00e07b]">Bracket</span>
          <div className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/30 to-transparent"></div>
        </div>
      )}
      <div className="w-full overflow-x-auto no-bar">
        <div className="inline-block pb-1">{content}</div>
      </div>
    </div>
  );
};

export default BracketView;
