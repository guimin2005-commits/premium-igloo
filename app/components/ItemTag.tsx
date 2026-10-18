"use client";

// 📌 글 속 아이템 태그 그림(2026-10-18 — lib/itemTag · GET /api/items/tags) — FormattedText 가 본문의 자리(<span class='itag' data-itag>)에 끼운다.
//    알약(문장 안): 작은 어두운 칸 아이콘 · 이름 · 희귀도 색 테. 카드(태그만 있는 줄): 아이콘 칸(희귀도 띠) · 희귀도 알약 · 분류 · 이름 · 효과(꾸미기는 적용 범위 두 줄) · 가격.
//    판매 중인 상품이 있으면 누르면 상품 상세, 없으면 누를 수 없다. 지워진 아이템(값 없음)은 태그의 이름만 회색 글자. 읽는 동안은 이름만(자리 그대로)
//    dark — 어두운 바탕(대회 글)
import React, { useContext, useEffect, useState } from "react";
import Link from "next/link";
import ItemIcon from "./ItemIcon";
import { rarityOf } from "@/lib/rarity";

export type ItemTagInfo = {
  name: string; category: string; icon: string; imageUrl: string; color: string; type: string; rarity: string;
  effect: string[]; scope: string; product: { id: string; price: string; days: number } | null;
};

// ── 값 읽기 — 화면 하나에 한 벌(같은 아이템을 여러 글 · 미리보기에서 다시 읽지 않게). 없는 아이템은 null ──
const cache = new Map<string, ItemTagInfo | null>();
const waiting = new Map<string, Promise<void>>();
function load(ids: string[]): Promise<void> {
  const need = ids.filter((id) => !cache.has(id) && !waiting.has(id));
  if (!need.length) return Promise.all(ids.map((id) => waiting.get(id)).filter(Boolean)).then(() => undefined);
  const p = fetch(`/api/items/tags?ids=${need.join(",")}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => {
      const data = d?.success && d.data && typeof d.data === "object" ? d.data : null;
      // 못 읽었으면(오류) 캐시에 두지 않는다 — 다음에 다시 읽게. 읽었는데 없는 아이템만 null
      if (data) for (const id of need) cache.set(id, data[id] || null);
    })
    .catch(() => {})
    .finally(() => need.forEach((id) => waiting.delete(id)));
  need.forEach((id) => waiting.set(id, p));
  return Promise.all(ids.map((id) => waiting.get(id)).filter(Boolean)).then(() => undefined);
}
export function useItemTags(ids: string[]) {
  const key = ids.join(",");
  const [, bump] = useState(0);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    load(key.split(",")).then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [key]);
  return (id: string): { info: ItemTagInfo | null; loaded: boolean } => ({ info: cache.get(id) ?? null, loaded: cache.has(id) });
}

// 희귀도 알약(밝은 판) — 상품 상세 알약(app/arctic/item/[id])과 같은 식: 등급 색 테 60% · 옅은 바탕 10% · 글자는 4.5:1 까지 어둡게
const rgbOf = (hex: string) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [154, 163, 178];
};
const lumOf = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastOf = (a: number[], b: number[]) => {
  const [x, y] = [lumOf(a), lumOf(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const pillStyle = (hex: string, dark: boolean): React.CSSProperties => {
  const c = rgbOf(hex);
  if (dark) return { color: `rgb(${c.map((v) => Math.round(v + (255 - v) * 0.55)).join(",")})`, border: `1px solid rgba(${c.join(",")},0.7)`, background: `rgba(${c.join(",")},0.16)` };
  const bg = c.map((v) => Math.round(v * 0.1 + 255 * 0.9));
  let ink = [0, 0, 0];
  for (let k = 1; k >= 0; k -= 0.02) {
    const t = c.map((v) => Math.round(v * k));
    if (contrastOf(t, bg) >= 4.6) { ink = t; break; }
  }
  return { color: `rgb(${ink.join(",")})`, border: `1px solid rgba(${c.join(",")},0.6)`, background: `rgba(${c.join(",")},0.1)` };
};
const SNAP_W: React.CSSProperties = { width: "calc-size(fit-content, round(up, size, 1px))" };
const TILE = "#131313";

// 📌 누르기 끄기(2026-10-18 운영자 "글 미리보기에서는 아이템 클릭 안 되게" — 미리보기에서 눌러 상품 상세로 가 쓰던 글이 날아갔다).
//    false 로 감싼 곳(글쓰기 화면 — 미리보기 · 표 창)은 상품이 있어도 그냥 상자(누르는 모양도 없음). FormattedText 의 포털에도 이어진다
export const ItemTagLinkCtx = React.createContext(true);

// 감싸기 — 판매 중인 상품이면 상품 상세로 가는 링크, 아니면 그냥 상자
function Wrap({ href, className, style, children }: { href: string; className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return href ? <Link href={href} className={className} style={style}>{children}</Link> : <span className={className} style={style}>{children}</span>;
}

export function ItemTag({ name, info, loaded, solo, dark = false }: { name: string; info: ItemTagInfo | null; loaded: boolean; solo: boolean; dark?: boolean }) {
  const linkable = useContext(ItemTagLinkCtx);
  const label = info?.name || name || "아이템";
  // 지워진 아이템 — 이름만 회색(누를 수 없다)
  if (loaded && !info) return <span className={dark ? "text-white/40" : "text-[#a3a3a3]"}>{label}</span>;
  // 읽는 중 — 이름만(굵게, 자리 그대로)
  if (!info) return <span className="font-bold">{label}</span>;
  const r = rarityOf(info.rarity);
  const href = linkable && info.product ? `/arctic/item/${info.product.id}` : "";
  const ink = dark ? "text-white" : "text-[#131313]";
  const sub = dark ? "text-white/55" : "text-[#5a5a5a]";
  if (!solo) {
    return (
      <Wrap href={href}
        className={`inline-flex items-center gap-1.5 h-6 pl-0.5 pr-2.5 mx-0.5 align-middle rounded-full border whitespace-nowrap no-underline transition-colors ${dark ? "bg-white/5" : "bg-white"} ${href ? (dark ? "hover:bg-white/10" : "hover:bg-[#f7f7f7]") : ""}`}
        style={{ borderColor: `rgba(${rgbOf(r.c).join(",")},0.7)`, ...SNAP_W }}>
        <span aria-hidden className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center overflow-hidden" style={{ background: TILE }}>
          <ItemIcon icon={info.icon} imageUrl={info.imageUrl} type={info.type} size={14} color={info.color || undefined} />
        </span>
        <span className={`text-[13px] font-bold leading-[22px] ${ink}`}>{label}</span>
      </Wrap>
    );
  }
  const lines = info.scope ? [] : info.effect;
  return (
    <Wrap href={href}
      className={`flex items-center gap-3.5 max-w-[560px] p-3 pr-4 rounded-2xl border no-underline whitespace-normal transition-colors ${dark ? "border-white/15 bg-white/5" : "border-[#ededed] bg-white"} ${href ? (dark ? "hover:border-white/35" : "hover:border-[#a3a3a3]") : ""}`}>
      <span aria-hidden className="relative shrink-0 w-14 h-14 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: TILE }}>
        <ItemIcon icon={info.icon} imageUrl={info.imageUrl} type={info.type} size={36} color={info.color || undefined} />
        <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: r.c }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="shrink-0 inline-flex items-center justify-center h-5 px-2 rounded-full text-[11px] font-black leading-[18px] whitespace-nowrap" style={{ ...pillStyle(r.c, dark), ...SNAP_W }}>{r.l}</span>
          {info.category && <span className={`min-w-0 truncate text-[11px] font-bold ${sub}`}>{info.category}</span>}
        </span>
        <span className={`block mt-1 text-[15px] font-black leading-snug break-keep ${ink}`}>{label}</span>
        {info.scope ? (
          <>
            <span className={`block mt-1 text-[11px] font-bold leading-none ${sub}`}>적용 범위</span>
            <span className={`block mt-1 text-[12px] font-bold break-keep ${dark ? "text-white/75" : "text-[#3a3a3a]"}`}>{info.scope}</span>
          </>
        ) : lines.map((l, i) => <span key={i} className={`block mt-0.5 text-[12px] font-bold break-keep ${sub}`}>{l}</span>)}
      </span>
      {info.product && (
        <span className="shrink-0 flex flex-col items-end gap-0.5">
          <span className={`text-[13px] font-black tabular-nums whitespace-nowrap ${ink}`}>{info.product.price}</span>
          {info.product.days > 0 && <span className={`text-[11px] font-bold ${sub}`}>{info.product.days}일</span>}
        </span>
      )}
    </Wrap>
  );
}
