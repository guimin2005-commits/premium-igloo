"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import ArcticHeader from "../ArcticHeader";
import ArcticDock from "../ArcticDock";
import ArcticFooter from "../ArcticFooter";

const STATUS_META: Record<string, { label: string; cls: string; desc: string }> = {
  pending: { label: "처리 대기", cls: "bg-[#fdf3e3] text-[#a8763a]", desc: "지급·발송을 준비하고 있습니다" },
  completed: { label: "완료", cls: "bg-[#e8f3e6] text-[#3f7a35]", desc: "지급이 완료되었습니다" },
  cancelled: { label: "취소", cls: "bg-[#fdeaea] text-[#c62828]", desc: "취소되어 XP가 환불되었습니다" },
};

const TYPE_LABEL: Record<string, string> = { role: "역할", perk: "권한", physical: "기프트카드" };

const fmtDate = (v: string | Date) => {
  const d = new Date(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// 📌 구매 내역 페이지 — 상태별 필터와 진행 안내
export default function OrdersPage() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";

  const [orders, setOrders] = useState<any[]>([]);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    Promise.all([
      fetch("/api/shop/purchase", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([ord, me]) => {
      setOrders(Array.isArray(ord?.data) ? ord.data : []);
      if (me?.success) setMyXp(me.data.xp);
    }).finally(() => setIsLoading(false));
  }, [status]);

  const shown = useMemo(
    () => (filter ? orders.filter((o) => o.status === filter) : orders),
    [orders, filter]
  );
  const totalSpent = orders.filter((o) => o.status !== "cancelled").reduce((n, o) => n + (o.price || 0), 0);
  const pendingCount = orders.filter((o) => o.status === "pending").length;

  const chip = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
      active ? "bg-[#e91e3f] text-white border-[#e91e3f]" : "bg-white text-[#4b4b4b] border-[#e2e0dc] hover:border-[#a3a3a3]"
    }`;

  if (status === "loading" || isLoading) {
    return (
      <div className="w-full flex-1 bg-[#f5f3f0] min-h-screen">
        <ArcticHeader />
        <div className="py-32 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="w-full flex-1 bg-[#f5f3f0] min-h-screen">
        <ArcticHeader />
        <div className="py-32 text-center px-6 break-keep">
          <h1 className="text-2xl font-black text-[#131313] mb-3">로그인이 필요합니다</h1>
          <p className="text-sm text-[#4b4b4b] mb-7">구매 내역을 보려면 로그인해주세요.</p>
          <button onClick={() => signIn("discord")} className="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-full transition-colors">디스코드 로그인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 bg-[#f5f3f0] text-[#131313] min-h-screen">
      <ArcticHeader />

      <section className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        <Link href="/shop" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] mb-5 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          계속 쇼핑하기
        </Link>

        <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-8">구매 내역</h1>

        {/* 요약 */}
        {orders.length > 0 && (
          <div className="grid grid-cols-3 bg-white rounded-2xl border border-[#e2e0dc] divide-x divide-[#ececea] mb-6 overflow-hidden">
            {[
              { n: orders.length.toLocaleString(), l: "전체 주문" },
              { n: pendingCount.toLocaleString(), l: "처리 대기", accent: pendingCount > 0 },
              { n: totalSpent.toLocaleString(), l: "사용한 XP" },
            ].map((s, i) => (
              <div key={i} className="px-4 py-5 text-center">
                <div className={`text-xl md:text-2xl font-black tracking-tight tabular-nums ${s.accent ? "text-[#e91e3f]" : "text-[#131313]"}`}>{s.n}</div>
                <div className="text-[10px] font-bold tracking-[0.15em] text-[#8a8a8a] mt-1 uppercase">{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* 필터 */}
        {orders.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {[{ v: "", l: "전체" }, { v: "pending", l: "처리 대기" }, { v: "completed", l: "완료" }, { v: "cancelled", l: "취소" }].map((f) => (
              <button key={f.v} onClick={() => setFilter(f.v)} className={chip(filter === f.v)}>{f.l}</button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="py-24 text-center break-keep bg-white rounded-2xl border border-[#e2e0dc]">
            <p className="text-sm font-bold text-[#131313] mb-1.5">
              {orders.length === 0 ? "아직 구매한 상품이 없습니다" : "해당 상태의 주문이 없습니다"}
            </p>
            <p className="text-xs text-[#8a8a8a] mb-7">
              {orders.length === 0 ? "ARCTIC에서 XP로 역할과 혜택을 만나보세요." : "다른 상태를 선택해보세요."}
            </p>
            {orders.length === 0 && (
              <Link href="/shop" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
                상품 보러가기
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden divide-y divide-[#ececea]">
            {shown.map((o) => {
              const meta = STATUS_META[o.status] || STATUS_META.pending;
              return (
                <div key={o._id} className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${meta.cls}`}>{meta.label}</span>
                        <span className="text-[10px] font-bold text-[#8a8a8a]">{TYPE_LABEL[o.itemType] || "상품"}</span>
                      </div>
                      <h3 className="text-sm font-bold text-[#131313] truncate">{o.itemName}</h3>
                      <p className="text-[11px] text-[#a3a3a3] mt-0.5">{fmtDate(o.createdAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-base font-black tabular-nums ${o.status === "cancelled" ? "text-[#a3a3a3] line-through" : "text-[#131313]"}`}>
                        -{(o.price || 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] font-bold text-[#8a8a8a]">XP</div>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#8a8a8a]">{meta.desc}</p>

                  {o.contact && (
                    <div className="mt-3 text-[11px] text-[#5a5a5a] bg-[#f5f3f0] rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                      <span className="font-bold text-[#8a8a8a]">수령 정보 · </span>{o.contact}
                    </div>
                  )}
                  {o.adminNote && (
                    <div className="mt-2 text-[11px] text-[#3f7a35] bg-[#e8f3e6] rounded-lg px-3 py-2">
                      <span className="font-bold">운영진 메모 · </span>{o.adminNote}
                    </div>
                  )}
                  {o.error && (
                    <div className="mt-2 text-[11px] text-[#c62828] bg-[#fdeaea] rounded-lg px-3 py-2">
                      지급 실패 · {o.error} — 운영진에게 문의해주세요.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <ArcticFooter />
      <ArcticDock />
    </div>
  );
}
