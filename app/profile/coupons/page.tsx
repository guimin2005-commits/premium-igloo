"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BackLink from "../../components/BackLink";
import ArcticDock from "../../arctic/ArcticDock";
import { ICON_PATHS } from "../../components/Icons";
import { isAdminName } from "@/lib/admins";

// 📌 쿠폰함 — 전역 바의 쿠폰 아이콘 · 내 정보 · 모바일 메뉴가 모두 여기로 온다 (예전엔 레이아웃 위의 모달).
//    코드 하나로 두 가지를 받는다: 할인 쿠폰은 아래 목록에 남고, 보상 코드(XP · 역할)는 입력 즉시 지급 대기로 넘어간다.
//    그래서 ARCTIC 이 닫혀 있어도 열리는 내 정보 쪽에 둔다 (알림함 /profile/notice 와 같은 자리).

type Coupon = { id: string; name: string; type: string; value: number; maxDiscount?: number; minTotal?: number; expiresAt?: string | null };

// 조작 요소 테두리는 #a3a3a3, 글자는 16px — 그보다 작으면 iOS 가 입력칸을 누를 때 화면을 확대한다
const INPUT_CLS = "flex-1 min-w-0 h-12 px-4 bg-white border border-[#a3a3a3] text-[16px] font-bold uppercase outline-none focus:border-[#131313] transition-colors placeholder:normal-case placeholder:font-medium placeholder:text-[#8a8a8a]";
const BTN_CLS = "shrink-0 h-12 px-7 rounded-full bg-[#131313] hover:bg-[#3a3a3a] disabled:opacity-40 text-white text-[14px] font-extrabold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40";

const benefitOf = (c: Coupon) => {
  const base = c.type === "percent" ? `${c.value}% 할인` : `${(c.value || 0).toLocaleString()} XP 할인`;
  const cap = c.type === "percent" && (c.maxDiscount || 0) > 0 ? ` · 최대 ${c.maxDiscount!.toLocaleString()} XP` : "";
  const min = (c.minTotal || 0) > 0 ? ` · ${c.minTotal!.toLocaleString()} XP 이상` : "";
  return base + cap + min;
};
const ddayOf = (s?: string | null) => (s ? Math.max(0, Math.ceil((new Date(s).getTime() - Date.now()) / 86400000)) : null);
const untilOf = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }) + "까지" : "";

export default function CouponBoxPage() {
  const { data: session, status } = useSession();
  const fromArctic = useSearchParams().get("from") === "arctic";
  const q = fromArctic ? "?from=arctic" : "";
  const isAdmin = isAdminName(session?.user?.name);

  const [rows, setRows] = useState<Coupon[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = () =>
    fetch("/api/shop/my-coupons", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d?.data) ? d.data : []))
      .catch(() => setRows([]));

  useEffect(() => { if (status === "authenticated") load(); }, [status]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/shop/my-coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, userId: (session?.user as any)?.id, userName: session?.user?.name }),
      });
      const d = await res.json();
      const ok = res.ok && !!d.success;
      setResult({ ok, message: d.message || (ok ? "쿠폰을 등록했습니다." : "사용할 수 없는 쿠폰입니다.") });
      if (ok) { setCode(""); load(); }
    } catch {
      setResult({ ok: false, message: "서버와 통신하는 중 오류가 발생했습니다." });
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-[#8a8a8a]">로딩 중...</div>;
  if (status === "unauthenticated") {
    return (
      <main className="w-full flex-1 flex flex-col items-center justify-center px-6 py-40 text-center text-[#131313] break-keep">
        <h2 className="text-2xl font-black mb-4 tracking-tight">로그인 필요</h2>
        <p className="text-[#5a5a5a] mb-8 text-sm">쿠폰함을 보려면 로그인해 주세요.</p>
        <button onClick={() => signIn("discord", { callbackUrl: "/profile/coupons" })}
          className="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]/40 focus-visible:ring-offset-2">
          디스코드 로그인
        </button>
      </main>
    );
  }

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <section className="w-full max-w-4xl mx-auto px-6 pt-8 pb-20">
        <BackLink href={`/profile${q}`} label="내 정보" />
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-6">
          쿠폰함 {(rows?.length || 0) > 0 && <span className="text-[#e91e3f] tabular-nums">{rows!.length}</span>}
        </h1>

        {/* 코드 등록 */}
        <form onSubmit={submit} className="flex gap-2.5">
          <label htmlFor="coupon-code" className="sr-only">쿠폰 코드</label>
          <input id="coupon-code" value={code} onChange={(e) => { setCode(e.target.value); if (result) setResult(null); }}
            placeholder="쿠폰 코드 입력" autoComplete="off" className={INPUT_CLS} />
          <button type="submit" disabled={busy || !code.trim()} className={BTN_CLS}>{busy ? "확인 중" : "등록"}</button>
        </form>
        {result && (
          <p role="status" className={`mt-3 text-[13px] font-bold break-keep ${result.ok ? "text-[#3f7a35]" : "text-[#d01634]"}`}>{result.message}</p>
        )}

        {/* 보유 쿠폰 — 할인 쿠폰만 남는다 (보상 코드는 입력 즉시 지급) */}
        <div className="mt-10 border-t border-[#131313]">
          {rows === null ? (
            <p className="py-12 text-center text-sm text-[#8a8a8a]">불러오는 중...</p>
          ) : rows.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#5a5a5a]">보유한 쿠폰이 없습니다.</p>
          ) : (
            rows.map((c) => {
              const d = ddayOf(c.expiresAt);
              return (
                <div key={c.id} className="flex items-center gap-3.5 py-4 border-b border-[#ededed]">
                  <span aria-hidden className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#e91e3f]/[0.08] text-[#d01634]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.ticket} /></svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-extrabold truncate">{c.name}</p>
                    <p className="mt-0.5 text-[12px] text-[#5a5a5a] break-keep">
                      {benefitOf(c)}
                      {c.expiresAt && <span className="text-[#8a8a8a] tabular-nums"> · {untilOf(c.expiresAt)}</span>}
                    </p>
                  </div>
                  {d !== null && (
                    <span className={`shrink-0 text-[12px] font-black tabular-nums ${d <= 3 ? "text-[#d01634]" : "text-[#5a5a5a]"}`}>D-{d}</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {isAdmin && (
          <Link href="/admin/shop?tab=coupons" className="inline-block mt-6 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">
            쿠폰 관리 (관리자) →
          </Link>
        )}
      </section>

      {fromArctic && <ArcticDock activeKey="me" />}
    </main>
  );
}
