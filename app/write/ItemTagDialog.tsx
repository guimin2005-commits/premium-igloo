"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Segmented, inputClass } from "../admin/ui";
import ItemIcon from "../components/ItemIcon";
import { rarityOf, normalizeRarity } from "@/lib/rarity";
import { cosmeticKeysOf, productIconOf } from "@/lib/cosmeticArt";

/* 📌 아이템 태그 넣기 창(2026-10-18 운영자 "공지 글에서도 … 아이템? 태그? 느낌으로") — 편집 칸 도구 줄 「아이템」에서 그 자리로 뜬다.
   등록 아이템(관리자 아이템 목록 — /api/admin/items)을 이름 · 분류 · 그룹으로 찾아 고르면 커서 자리에 [[item:<id>:<이름>]](lib/itemTag).
   「알약」은 문장 안 그 자리에, 「카드」는 한 줄을 통째로(앞뒤 줄바꿈) — 글에서는 작은 알약 · 큰 카드로 그린다(app/components/ItemTag).
   껍데기는 표 넣기 창(./TableDialog)과 같은 모양 · 층(z-[100]). 높이 고정 — 찾는 동안 창이 줄었다 늘었다 하지 않게. Enter = 맨 위 아이템 */

export type TagMode = "inline" | "card";
type Row = { _id: string; name?: string; shortName?: string; categoryLabel?: string; group?: string; icon?: string; imageUrl?: string; color?: string; type?: string; rarity?: string; effects?: unknown };

export default function ItemTagDialog({ mode, onMode, onClose, onPick }: {
  mode: TagMode;
  onMode: (m: TagMode) => void;
  onClose: () => void;
  onPick: (id: string, name: string, mode: TagMode) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const downOnBackdrop = useRef(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.success && Array.isArray(d.data)) setRows(d.data);
        else { setRows([]); setError("아이템 목록을 읽지 못했습니다."); }
      })
      .catch(() => { if (alive) { setRows([]); setError("아이템 목록을 읽지 못했습니다."); } });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const all = rows || [];
    if (!words.length) return all;
    return all.filter((r) => {
      const hay = `${r.shortName || ""} ${r.name || ""} ${r.categoryLabel || ""} ${r.group || ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, q]);
  const nameOf = (r: Row) => r.shortName || r.name || "아이템";
  const pick = (r: Row) => onPick(String(r._id), nameOf(r), mode);
  // 꾸미기는 인벤토리 · 상점과 같은 도트 아이콘(lib/cosmeticArt)
  const artOf = (r: Row) => {
    const fx = r.effects && typeof r.effects === "object" && !Array.isArray(r.effects) ? (r.effects as { list?: unknown[] }).list : r.effects;
    return productIconOf({ icon: r.icon, imageUrl: r.imageUrl, cosmeticKeys: cosmeticKeysOf({ type: r.type, effects: Array.isArray(fx) ? fx : [] }) }) || { icon: r.icon || "", imageUrl: r.imageUrl || "" };
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); downOnBackdrop.current = false; }}
    >
      <div role="dialog" aria-modal="true" aria-label="아이템 넣기" onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#ededed] w-full max-w-[600px] rounded-t-2xl sm:rounded-2xl h-[80dvh] sm:h-[min(640px,90dvh)] flex flex-col shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] overflow-hidden text-[#131313]">
        <div className="shrink-0 flex items-center gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-[#ededed]">
          <h2 className="min-w-0 flex-1 text-[17px] font-black tracking-tight">아이템 넣기</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="shrink-0 px-5 sm:px-6 pt-4 pb-3 border-b border-[#ededed] flex flex-wrap items-center gap-2.5">
          <input type="search" value={q} autoFocus placeholder="이름 · 분류 · 그룹" aria-label="아이템 찾기"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && list[0]) { e.preventDefault(); pick(list[0]); } }}
            className={`${inputClass} min-w-0 flex-1 basis-[220px]`} />
          <Segmented options={[{ v: "inline", l: "문장 안 알약" }, { v: "card", l: "한 줄 카드" }]} value={mode} onChange={(v) => onMode(v as TagMode)} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-2" style={{ scrollbarGutter: "stable" }}>
          {rows == null ? (
            <p className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>
          ) : error ? (
            <p className="py-10 text-center text-[13px] font-bold text-[#d01634]">{error}</p>
          ) : !list.length ? (
            <p className="py-10 text-center text-[13px] text-[#8a8a8a]">맞는 아이템이 없습니다</p>
          ) : (
            list.map((r) => {
              const rar = rarityOf(normalizeRarity(r.rarity));
              const art = artOf(r);
              return (
                <button key={String(r._id)} type="button" onClick={() => pick(r)}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left hover:bg-[#f7f7f7] outline-none focus-visible:bg-[#f2f2f2] transition-colors">
                  <span aria-hidden className="relative shrink-0 w-9 h-9 rounded-md flex items-center justify-center overflow-hidden bg-[#131313]">
                    <ItemIcon icon={art.icon} imageUrl={art.imageUrl} type={r.type || "item"} size={24} color={r.color || undefined} />
                    <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: rar.c }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold truncate">{nameOf(r)}</span>
                    <span className="block text-[12px] text-[#8a8a8a] truncate">{[rar.l, r.categoryLabel, r.group].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
