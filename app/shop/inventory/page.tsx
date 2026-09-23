"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import BackLink from "../../components/BackLink";
import ItemIcon from "../../components/ItemIcon";
import { itemTypeLabel } from "@/lib/items";
import ArcticHeader from "../ArcticHeader";
import ArcticDock from "../ArcticDock";
import ArcticFooter from "../ArcticFooter";

// 📌 인벤토리(ARCTIC) — 스토어 세계 안의 보유 아이템 화면.
//    내 정보(ARCTIC 맥락)에서 인벤토리를 누르면 레벨 페이지의 잉크 HUD 로 튀지 않고 여기로 온다.
//    데이터는 레벨 페이지의 가방과 같은 /api/shop/my-items — 표기(아이콘·색·유형)도 같다.
const GROUPS = [
  { id: "all", label: "전체" },
  { id: "role", label: "역할" },
  { id: "perk", label: "권한" },
  { id: "item", label: "아이템" },
  { id: "physical", label: "실물" },
  { id: "level", label: "레벨 보상" },
];
const groupOf = (it: any) => (it.source === "level" ? "level" : it.type || it.kind || "item");

export default function ShopInventoryPage() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "";
  const back = from === "me" ? { href: "/profile?from=arctic", label: "내 정보" } : { href: "/level?tab=arctic", label: "ARCTIC" };

  const [items, setItems] = useState<any[] | null>(null);
  const [synced, setSynced] = useState(true);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/shop/my-items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setItems(Array.isArray(d?.data?.items) ? d.data.items : []); setSynced(d?.data?.synced !== false); })
      .catch(() => setItems([]));
  }, [status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length || 0 };
    for (const it of items || []) c[groupOf(it)] = (c[groupOf(it)] || 0) + 1;
    return c;
  }, [items]);
  const list = (items || []).filter((it) => tab === "all" || groupOf(it) === tab);

  if (status === "unauthenticated") {
    return (
      <div className="w-full flex-1 bg-[#f4f3f2] text-[#131313] min-h-screen">
        <ArcticHeader />
        <div className="py-32 text-center px-6 break-keep">
          <h1 className="text-2xl font-black text-[#131313] mb-3">로그인이 필요합니다</h1>
          <p className="text-sm text-[#4b4b4b] mb-7">인벤토리를 보려면 로그인해주세요.</p>
          <button onClick={() => signIn("discord")} className="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-full transition-colors">디스코드 로그인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 bg-[#f4f3f2] text-[#131313] min-h-screen">
      <ArcticHeader />

      <section className="max-w-4xl mx-auto px-6 pt-10 pb-28">
        <BackLink href={back.href} label={back.label} className="mb-5" inline />

        <div className="flex items-end justify-between gap-4 mb-6">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter">인벤토리 {(items?.length || 0) > 0 && <span className="text-[#e91e3f]">{items!.length}</span>}</h1>
          {!synced && <span className="text-[11px] font-bold text-[#a3a3a3]">디스코드 확인 지연 중</span>}
        </div>

        {/* 묶음 칩 — 레벨 페이지 가방과 같은 분류 */}
        <div className="flex gap-1.5 overflow-x-auto no-bar mb-6 -mx-1 px-1">
          {GROUPS.filter((g) => g.id === "all" || counts[g.id]).map((g) => (
            <button key={g.id} onClick={() => setTab(g.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${tab === g.id ? "bg-[#131313] text-white border-[#131313]" : "bg-white border-[#dedddb] text-[#5a5a5a] hover:border-[#a3a3a3]"}`}>
              {g.label}{counts[g.id] ? <span className={`ml-1.5 tabular-nums ${tab === g.id ? "text-white/60" : "text-[#a3a3a3]"}`}>{counts[g.id]}</span> : null}
            </button>
          ))}
        </div>

        {items === null ? (
          <p className="text-[#a3a3a3] text-sm py-16 text-center">데이터 로딩 중...</p>
        ) : list.length === 0 ? (
          <div className="py-16 text-center break-keep">
            <p className="text-sm text-[#8a8a8a]">아직 보유한 아이템이 없습니다.</p>
            <Link href="/level?tab=arctic" className="inline-block mt-4 px-5 py-2.5 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[12px] font-bold transition-colors">ARCTIC 둘러보기</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {list.map((it) => {
              const c = it.color || "#131313";
              const dead = it.status === "pending" || it.status === "missing";
              const dday = it.expiresAt && it.status === "completed" ? Math.max(0, Math.ceil((new Date(it.expiresAt).getTime() - Date.now()) / 86400000)) : null;
              const sub = it.status === "pending" ? "지급 대기" : it.status === "missing" ? "역할 없음" : it.source === "level" ? (it.rewardLevel != null ? `레벨 보상 · Lv.${it.rewardLevel}` : "레벨 보상") : it.source === "pass" ? "시즌 패스" : it.source === "grant" ? "운영진 지급" : itemTypeLabel(it.type);
              return (
                <div key={it.uid} className="bg-white rounded-2xl border border-[#dedddb] p-4 flex flex-col items-center text-center">
                  <span className="relative w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${c}14`, boxShadow: `inset 0 0 0 1px ${c}33` }}>
                    <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={it.source === "level" ? "level" : it.type} size={30} color={c} dim={dead} />
                    {dday !== null && <span className="absolute -top-1.5 -right-1.5 px-1.5 h-[18px] rounded-full bg-[#131313] text-white text-[10px] font-black flex items-center tabular-nums">D-{dday}</span>}
                    {it.status === "pending" && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#a3a3a3]"></span>}
                    {it.status === "missing" && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#e91e3f]"></span>}
                  </span>
                  <span className="mt-3 text-[13px] font-black text-[#131313] leading-tight line-clamp-2 break-keep">{it.name}</span>
                  <span className={`mt-1 text-[11px] font-bold tabular-nums ${dead ? "text-[#e91e3f]" : "text-[#8a8a8a]"}`}>{sub}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <ArcticFooter />
      <ArcticDock activeKey="me" />
    </div>
  );
}
