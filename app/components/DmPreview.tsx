"use client";

import React from "react";
import {
  NUDGE_AUTHOR, nudgeTitle, nudgeBody, nudgeFooter, nudgeCta,
  fixtureTitle, fixtureBody, fixtureFooter, fixtureCta,
  fmtKst, untilLabel,
} from "@/lib/nudgeMessage";

/* 📌 DM 미리보기 — 디스코드 임베드가 실제로 어떻게 보이는지 그린다.
   봇이 만드는 임베드와 같은 문구 파일(lib/nudgeMessage)을 쓴다.
   여기서 다르게 보이면 미리보기가 아니라 거짓말이 된다.

   두 종류를 그린다:
     nudge   — 캘린더 미제출 재촉 (초록)
     fixture — 확정된 경기 일정 (파랑) */

const G = "#00e07b";
const BLUE = "#38bdf8";

type Copy = { title?: string; message?: string; footer?: string; cta?: string };

export default function DmPreview({
  variant = "nudge", teamName, oppName, dueAt, at, matchKind, copy,
}: {
  variant?: "nudge" | "fixture";
  teamName: string;
  oppName?: string;
  dueAt?: string | Date | null;
  at?: string | Date | null;      // 경기 시각 (fixture)
  matchKind?: string;             // scrim | official
  copy?: Copy;
}) {
  const isFixture = variant === "fixture";
  const bar = isFixture ? BLUE : G;
  const title = isFixture ? fixtureTitle(copy?.title) : nudgeTitle(copy?.title);
  const body = isFixture ? fixtureBody(copy?.message) : nudgeBody(copy?.message);
  const foot = isFixture ? fixtureFooter(copy?.footer) : nudgeFooter(copy?.footer);
  const cta = isFixture ? fixtureCta(copy?.cta) : nudgeCta(copy?.cta);

  const Field = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
    <span className="block">
      <span className="block text-[11px] font-black text-gray-200">{k}</span>
      <span className="block text-[12px] text-gray-400 mt-0.5 tabular-nums">{v}</span>
      {sub && <span className="block text-[12px] text-gray-400">{sub}</span>}
    </span>
  );

  return (
    <div className="esp-cut border border-white/[0.08] bg-[#0b0d0c] p-4">
      {/* 보낸 사람 줄 */}
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/[0.06]">
        <span className="w-6 h-6 shrink-0 rounded-full grid place-items-center text-[10px] font-black" style={{ background: `${G}22`, color: G }}>봇</span>
        <span className="text-[11px] font-black text-gray-300">고급 펭귄</span>
        <span className="text-[9px] font-black esp-mono px-1.5 py-0.5 rounded bg-[#5865F2]/25 text-[#a5b0ff]">APP</span>
        <span className="ml-auto text-[10px] font-bold text-gray-700">개인 DM</span>
      </div>

      {/* 임베드 — 왼쪽 색 막대가 디스코드 임베드의 표식이다 */}
      <div className="flex rounded-[4px] overflow-hidden bg-[#232428]">
        <span className="w-1 shrink-0" style={{ background: bar }} />
        <div className="min-w-0 flex-1 px-3.5 py-3">
          <p className="text-[11px] font-bold text-gray-400 mb-1.5">{NUDGE_AUTHOR}</p>
          <p className="text-[14px] font-black mb-1.5" style={{ color: "#00a8fc" }}>{title}</p>
          <p className="text-[12.5px] leading-[1.6] text-gray-300 whitespace-pre-wrap break-words">{body}</p>

          <div className="flex flex-wrap gap-x-10 gap-y-3 mt-3">
            {isFixture ? (
              <>
                <Field k="우리 팀" v={teamName || "—"} />
                <Field k="상대" v={oppName || "—"} />
                {at && (
                  <span className="block w-full">
                    <Field k={matchKind === "official" ? "공식전" : "스크림"} v={fmtKst(at)} sub={untilLabel(at)} />
                  </span>
                )}
              </>
            ) : (
              <>
                <Field k="팀" v={teamName || "—"} />
                {dueAt && <Field k="마감" v={fmtKst(dueAt)} sub={untilLabel(dueAt)} />}
              </>
            )}
          </div>

          <p className="text-[10.5px] font-bold text-gray-500 mt-3">{foot}</p>
        </div>
      </div>

      {/* 링크 버튼 — 주소를 본문에 넣지 않으니 지저분한 링크 미리보기도 안 붙는다 */}
      <div className="mt-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[3px] bg-[#4e5058] text-[12px] font-bold text-white">
          {cta}
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </span>
      </div>
    </div>
  );
}
