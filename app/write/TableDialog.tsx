"use client";

import React, { useEffect, useRef, useState } from "react";
import { Btn } from "../admin/ui";
import { RenderFormattedText } from "../components/FormattedText";
import { buildTable, type Grid } from "../components/mdTable";
import { PostBodyFrame } from "./PostPreview";

/* 📌 표 그리기 창 — 편집 칸 [표] 에서 그 자리로 뜬다(화면 이동 없음).
   칸 격자를 바로 고치고, 아래 미리보기는 넣을 글자(buildTable)를 실제 렌더러로 그린 것 — 넣은 뒤 모양과 같다.
   첫 줄은 늘 머리(렌더러 규칙). Tab = 다음 칸(마지막 칸이면 줄 추가) · Enter = 아래 칸 · 표 계산기(엑셀 · 시트)에서 복사한 칸은 붙여넣으면 펼쳐진다.
   껍데기는 이 화면의 설문 미리보기와 같은 모양(모바일 바텀시트 / PC 가운데), 층은 이미지 넣기 창과 같은 z-[100].
   높이는 고정(WalletHistory 와 같은 h-[..dvh]) — 줄을 더하고 뺄 때 창이 커지며 [+ 행] · × 가 움직이지 않게, 늘어나는 건 안쪽 스크롤 칸만.
   폭은 PC 에서 미리보기가 실제 본문 칸(820 · 대회 828)을 줄이지 않고 담는 940. */

const blank = (rows: number, cols: number): Grid => Array.from({ length: rows }, () => Array<string>(cols).fill(""));
const delBtn = "w-8 h-8 inline-flex items-center justify-center rounded-full text-[16px] font-bold text-[#a3a3a3] hover:text-[#d01634] hover:bg-[#f2f2f2] transition-colors outline-none";

export default function TableDialog({
  initial,
  replace,
  category,
  onClose,
  onApply,
}: {
  initial: Grid | null; // 커서가 표 안이면 그 표, 아니면 null(새 표)
  replace: boolean;
  category: string; // 미리보기 면 · 본문 틀(대회는 어두운 면)
  onClose: () => void;
  onApply: (md: string) => void;
}) {
  // 새 표는 예전 [표] 단추와 같은 크기 — 2열 · 머리 + 2줄
  const [grid, setGrid] = useState<Grid>(() => (initial && initial.length ? initial.map((r) => [...r]) : blank(3, 2)));
  const cols = grid[0]?.length || 1;
  const cells = useRef(new Map<string, HTMLInputElement>());
  const pending = useRef<string | null>(null); // 줄을 더한 뒤 옮겨 갈 칸 "줄:열"

  useEffect(() => {
    const k = pending.current;
    if (!k) return;
    pending.current = null;
    cells.current.get(k)?.focus();
  }, [grid]);

  const focusCell = (r: number, c: number) => cells.current.get(`${r}:${c}`)?.focus();
  const setCell = (r: number, c: number, v: string) =>
    setGrid((g) => g.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  const addRow = (focusCol?: number) => {
    if (focusCol != null) pending.current = `${grid.length}:${focusCol}`;
    setGrid((g) => [...g, Array<string>(g[0]?.length || 1).fill("")]);
  };
  const addCol = () => setGrid((g) => g.map((r) => [...r, ""]));
  const delRow = (r: number) => setGrid((g) => (g.length > 1 ? g.filter((_, i) => i !== r) : g));
  const delCol = (c: number) => setGrid((g) => (g[0].length > 1 ? g.map((r) => r.filter((_, j) => j !== c)) : g));

  // 여러 칸 붙여넣기 — 탭 = 옆 칸, 줄바꿈 = 아랫줄. 모자라면 줄 · 열을 늘린다
  const onPaste = (r: number, c: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n+$/, "");
    if (!/[\t\n]/.test(t)) return;
    e.preventDefault();
    const block = t.split("\n").map((l) => l.split("\t"));
    setGrid((g) => {
      const rows = Math.max(g.length, r + block.length);
      const nc = Math.max(g[0]?.length || 1, c + Math.max(...block.map((b) => b.length)));
      const out = Array.from({ length: rows }, (_, i) => Array.from({ length: nc }, (_, j) => g[i]?.[j] ?? ""));
      block.forEach((b, i) => b.forEach((v, j) => { out[r + i][c + j] = v.trim(); }));
      return out;
    });
  };

  // Esc — 창 어디에 포커스가 있든(빈 곳 · 지운 줄의 × · Safari 단추) 닫힌다
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
      onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // 바깥 막은 누른 곳 · 뗀 곳이 둘 다 막일 때만 닫는다 — 칸 글자를 끌어 고르다 창 밖에서 놓아도 안 닫힌다
  const downOnBackdrop = useRef(false);

  const onKey = (r: number, c: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // 한글 조합 중 Enter · Tab 은 글자 확정용 — 가로채지 않는다
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const last = r === grid.length - 1;
    if (e.key === "Tab" && !e.shiftKey && last && c === cols - 1) {
      e.preventDefault();
      addRow(0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (last) addRow(c);
      else focusCell(r + 1, c);
    }
  };

  // 끝에 붙은 빈 줄은 넣지 않는다(마지막 칸 Enter 로 생긴 줄) — 머리 줄은 남긴다. 미리보기도 넣을 글자 그대로
  let used = grid.length;
  while (used > 1 && grid[used - 1].every((v) => !v.trim())) used--;
  const md = buildTable(grid.slice(0, used));
  const empty = grid.every((r) => r.every((v) => !v.trim()));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); downOnBackdrop.current = false; }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={replace ? "표 고치기" : "본문에 표 넣기"}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#ededed] w-full max-w-[940px] rounded-t-2xl sm:rounded-2xl h-[85dvh] sm:h-[min(720px,92dvh)] flex flex-col shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] overflow-hidden text-[#131313]"
      >
        <div className="shrink-0 flex items-center gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-[#ededed]">
          <h2 className="min-w-0 flex-1 text-[17px] font-black tracking-tight">{replace ? "표 고치기" : "본문에 표 넣기"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* 스크롤바 자리를 늘 잡는다 — 내용이 차서 스크롤바가 생길 때 격자 · × 가 옆으로 밀리지 않게(ui.tsx DetailPane 과 같다) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5" style={{ scrollbarGutter: "stable" }}>
          <div className="flex items-center gap-2 mb-3">
            <Btn variant="secondary" size="sm" onClick={() => addRow()}>+ 행</Btn>
            <Btn variant="secondary" size="sm" onClick={addCol}>+ 열</Btn>
          </div>

          {/* 칸 격자 — 열이 많으면 격자만 가로로 민다(창 · 화면은 넘치지 않는다). 밀 수 있다는 게 보이게 가로 스크롤바는 둔다 */}
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  {Array.from({ length: cols }, (_, c) => (
                    <th key={c} className="p-0 pb-1 text-center font-normal">
                      {cols > 1 && <button type="button" tabIndex={-1} aria-label={`${c + 1}열 삭제`} onClick={() => delCol(c)} className={delBtn}>×</button>}
                    </th>
                  ))}
                  <th className="w-9 p-0" />
                </tr>
              </thead>
              <tbody>
                {grid.map((row, r) => (
                  <tr key={r}>
                    {row.map((v, c) => (
                      <td key={c} className="p-0 border border-[#a3a3a3]">
                        <input
                          ref={(el) => { if (el) cells.current.set(`${r}:${c}`, el); else cells.current.delete(`${r}:${c}`); }}
                          type="text"
                          size={1}
                          value={v}
                          autoFocus={r === 0 && c === 0}
                          aria-label={r === 0 ? `머리 ${c + 1}열` : `${r}행 ${c + 1}열`}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onKeyDown={(e) => onKey(r, c, e)}
                          onPaste={(e) => onPaste(r, c, e)}
                          className={`block w-full min-w-[112px] h-10 px-3 text-base md:text-[14px] text-[#131313] outline-none focus:relative focus:ring-2 focus:ring-inset focus:ring-[#131313]/40 ${r === 0 ? "bg-[#f2f2f2] font-bold" : "bg-white"}`}
                        />
                      </td>
                    ))}
                    <td className="w-9 p-0 pl-1 text-center">
                      {r > 0 && <button type="button" tabIndex={-1} aria-label={`${r}행 삭제`} onClick={() => delRow(r)} className={delBtn}>×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-5 mb-2 text-[12px] font-bold text-[#5a5a5a]">미리보기</p>
          <PostBodyFrame category={category} className="rounded-xl border border-[#ededed] px-4 py-1 overflow-x-auto">
            <RenderFormattedText text={md} />
          </PostBodyFrame>
        </div>

        <div className="shrink-0 px-5 sm:px-6 pt-3.5 border-t border-[#ededed] flex justify-end gap-2" style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn disabled={empty} onClick={() => onApply(md)}>{replace ? "바꾸기" : "넣기"}</Btn>
        </div>
      </div>
    </div>
  );
}
