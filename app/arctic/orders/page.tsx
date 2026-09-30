"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import ArcticStoreBar from "../ArcticStoreBar";
import ArcticDock from "../ArcticDock";
import ArcticFooter from "../ArcticFooter";
import { ITEM_TYPE_LABEL } from "@/lib/items";
import { groupOrders, orderSummary } from "@/lib/orderGroups";

const STATUS_META: Record<string, { label: string; cls: string; desc: string }> = {
  pending: { label: "처리 대기", cls: "bg-[#fdf3e3] text-[#a8763a]", desc: "지급·발송을 준비하고 있습니다" },
  completed: { label: "완료", cls: "bg-[#e8f3e6] text-[#3f7a35]", desc: "지급이 완료되었습니다" },
  cancelled: { label: "취소", cls: "bg-[#fdeaea] text-[#d01634]", desc: "취소되어 XP가 환불되었습니다" },
  refunded: { label: "환불", cls: "bg-[#fdeaea] text-[#d01634]", desc: "환불되어 XP·빙옥을 돌려드렸습니다" },
  expired: { label: "기간 만료", cls: "bg-[#f2f2f2] text-[#8a8a8a]", desc: "이용 기간이 끝났습니다" },
};
// 돌려받은 건 — '사용한 XP'에서 빼고 금액에 취소선을 긋는다
const REFUNDED = ["cancelled", "refunded"];

// 유형 라벨 — lib/items.js 가 단일 원천 (아이템 유형 포함)
const TYPE_LABEL: Record<string, string> = ITEM_TYPE_LABEL;

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

  // 📌 주문 묶음 — 한 결제의 같은 상품(1개 단위 여러 개)은 한 줄 "수량 N"(lib/orderGroups.js). 상태로 거른 뒤 묶는다
  const shown = useMemo(
    () => groupOrders(filter ? orders.filter((o) => o.status === filter) : orders),
    [orders, filter]
  );
  const groups = useMemo(() => groupOrders(orders), [orders]);
  // 실제로 낸 값 — 빙옥을 섞어 낸 건은 XP 몫만 XP 합계에 (옛 건은 결제 기록이 없어 price)
  const paidXpOf = (o: any) => (o.billed || o.paidXp > 0 || o.paidPoint > 0 ? o.paidXp || 0 : o.price || 0);
  const totalSpent = orders.filter((o) => !REFUNDED.includes(o.status)).reduce((n, o) => n + paidXpOf(o), 0);
  // 📌 빙옥으로 적을 건 — 빙옥 전용 상품(o.pointOnly — 늘 빙옥, 0 이어도)이거나 XP 없이 빙옥만 낸 건
  const inPoint = (o: any) => !!o.pointOnly || (!(paidXpOf(o) > 0) && o.paidPoint > 0);
  const pendingCount = groupOrders(orders.filter((o) => o.status === "pending")).length;

  const chip = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
      active ? "bg-[#e91e3f] text-white border-[#e91e3f]" : "bg-white text-[#5a5a5a] border-[#ededed] hover:border-[#a3a3a3]"
    }`;

  if (status === "loading" || isLoading) {
    return (
      <div className="w-full flex-1 bg-white min-h-screen">
        <div className="py-32 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="w-full flex-1 bg-white min-h-screen">
        <div className="py-32 text-center px-6 break-keep">
          <h1 className="text-2xl font-black text-[#131313] mb-3">로그인이 필요합니다</h1>
          <p className="text-sm text-[#5a5a5a] mb-7">구매 내역을 보려면 로그인해주세요.</p>
          <button onClick={() => signIn("discord")} className="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-full transition-colors">디스코드 로그인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 bg-white text-[#131313] min-h-screen">
      <ArcticStoreBar crumbs={[{ label: "구매 내역" }]} width="max-w-4xl" />
      <section className="max-w-4xl mx-auto px-6 pt-10 pb-24">

        <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-8">구매 내역</h1>

        {/* 요약 */}
        {orders.length > 0 && (
          <div className="grid grid-cols-3 bg-white rounded-2xl border border-[#ededed] divide-x divide-[#ededed] mb-6 overflow-hidden">
            {[
              { n: groups.length.toLocaleString(), l: "전체 주문" },
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
            {[{ v: "", l: "전체" }, { v: "pending", l: "처리 대기" }, { v: "completed", l: "완료" }, { v: "cancelled", l: "취소" }, { v: "refunded", l: "환불" }, { v: "expired", l: "기간 만료" }].map((f) => (
              <button key={f.v} onClick={() => setFilter(f.v)} className={chip(filter === f.v)}>{f.l}</button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="py-24 text-center break-keep bg-white rounded-2xl border border-[#ededed]">
            <p className="text-sm font-bold text-[#131313] mb-1.5">
              {orders.length === 0 ? "아직 구매한 상품이 없습니다" : "해당 상태의 주문이 없습니다"}
            </p>
            <p className="text-xs text-[#8a8a8a] mb-7">
              {orders.length === 0 ? "ARCTIC에서 XP로 역할과 혜택을 만나보세요." : "다른 상태를 선택해보세요."}
            </p>
            {orders.length === 0 && (
              <Link href="/arctic" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
                상품 보러가기
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#ededed] overflow-hidden divide-y divide-[#ededed]">
            {shown.map((o) => {
              const meta = STATUS_META[o.status] || STATUS_META.pending;
              const sum = orderSummary(o);
              return (
                <div key={o._id} className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${meta.cls}`}>{meta.label}</span>
                        <span className="text-[10px] font-bold text-[#8a8a8a]">{TYPE_LABEL[o.itemType] || "상품"}</span>
                      </div>
                      <h3 className="text-sm font-bold text-[#131313] truncate">{o.itemName}</h3>
                      {/* 여러 개 산 줄 — 수량과 쓴 · 돌려받은 개수. 한 개짜리 소모권은 썼으면 "사용함" */}
                      <p className="text-[11px] text-[#a3a3a3] mt-0.5 tabular-nums">
                        {fmtDate(o.createdAt)}
                        {o.qty > 1 && ` · 수량 ${o.qty}`}
                        {sum && ` · ${sum}`}
                        {o.qty === 1 && o.consumedAt && " · 사용함"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-base font-black tabular-nums ${REFUNDED.includes(o.status) ? "text-[#a3a3a3] line-through" : "text-[#131313]"}`}>
                        -{inPoint(o) ? `${(o.paidPoint || 0).toLocaleString()}` : `${paidXpOf(o).toLocaleString()}`}
                      </div>
                      <div className="text-[10px] font-bold text-[#8a8a8a]">
                        {inPoint(o) ? "빙옥" : "XP"}
                        {!inPoint(o) && paidXpOf(o) > 0 && o.paidPoint > 0 && ` + ${o.paidPoint.toLocaleString()} 빙옥`}
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#8a8a8a]">{meta.desc}</p>

                  {o.contact && (
                    <div className="mt-3 text-[11px] text-[#5a5a5a] bg-[#f2f2f2] rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                      <span className="font-bold text-[#8a8a8a]">수령 정보 · </span>{o.contact}
                    </div>
                  )}
                  {o.adminNote && (
                    <div className="mt-2 text-[11px] text-[#3f7a35] bg-[#e8f3e6] rounded-lg px-3 py-2">
                      <span className="font-bold">운영진 메모 · </span>{o.adminNote}
                    </div>
                  )}
                  {o.error && (
                    <div className="mt-2 text-[11px] text-[#d01634] bg-[#fdeaea] rounded-lg px-3 py-2">
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
