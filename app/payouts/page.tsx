"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isAdminName } from "@/lib/admins";
import { openLogin } from "../components/LoginPrompt";

// 📌 XP 지급은 봇 큐가 30초마다 자동으로 한다 — 이 화면은 기록 조회와 아직 지급되지 않은 건의 취소만.
//    예전의 명령어 복사 · '지급 완료/되돌리기' 토글은 봇 큐와 부딪혀(이미 준 건 재지급 · 안 준 건 닫힘) 걷어냈다.
//    남은 상태 변경은 대기로 남은 빙옥 기록을 완료로 되돌리는 것뿐이다 (app/api/payout PUT).
//    📌 2026-10-04 "아직 대기 중인 건만 지울 수 있게(=지급 취소) 하고, 완료 기록은 남김" — 취소는 대기 · 실패한 XP 건만(app/api/payout DELETE)

export default function PayoutAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && isAdminName(session?.user?.name);

  const [payouts, setPayouts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "paid" | "all">("pending");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; err: boolean } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (text: string, err = false) => {
    setNotice({ text, err });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  };
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const fetchPayouts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/payout", { cache: "no-store" });
      const json = await res.json();
      if (json.success) setPayouts(json.data);
    } catch { /* noop */ } finally { setIsLoading(false); }
  };

  useEffect(() => { if (isAdmin) fetchPayouts(); }, [isAdmin]);

  // 대기로 남은 빙옥 기록만 — 빙옥은 사이트가 이미 반영했고 봇은 집지 않는다
  const markPointPaid = async (p: any) => {
    try {
      const res = await fetch("/api/payout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p._id, status: "paid" }) });
      if (res.ok) setPayouts(prev => prev.map(x => x._id === p._id ? { ...x, status: "paid" } : x));
      else fetchPayouts();
    } catch { fetchPayouts(); }
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    try {
      const res = await fetch(`/api/payout?id=${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setPayouts(prev => prev.filter(x => x._id !== id));
        notify("지급을 취소했습니다.");
      } else {
        notify(json?.error || "취소하지 못했습니다.", true);
        fetchPayouts();
      }
    } catch {
      notify("취소하지 못했습니다.", true);
    } finally { setDeleteId(null); }
  };
  // 취소할 수 있는 건 — 아직 지급되지 않은 XP 건(대기 · 실패). 빙옥 · 처리 중 · 완료는 기록으로 남는다
  const cancelable = (p: { currency?: string; status?: string }) => p.currency !== "point" && (p.status === "pending" || p.status === "failed");

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => openLogin()} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const pending = payouts.filter(p => p.status === "pending");
  const visible = filter === "all" ? payouts : payouts.filter(p => p.status === filter);
  const totalPendingXp = pending.filter(p => p.currency !== "point").reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <main className="w-full max-w-4xl mx-auto px-6 py-16 flex-1 flex flex-col">
      <div className="mb-8 border-b border-white/10 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">XP 지급 대기열</h1>
        </div>
        <button onClick={() => router.push("/admin")} className="px-5 py-2.5 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors shrink-0">← 관리자</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#121212] border border-white/5 rounded-2xl p-4">
          <p className="text-xs text-gray-500 mb-1">지급 대기</p>
          <p className="text-2xl font-black text-[#e91e3f]">{pending.length}건</p>
        </div>
        <div className="bg-[#121212] border border-white/5 rounded-2xl p-4">
          <p className="text-xs text-gray-500 mb-1">대기 중 총 XP</p>
          <p className="text-2xl font-black text-white">{totalPendingXp.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        {[{ k: "pending", l: "지급 대기" }, { k: "paid", l: "지급 완료" }, { k: "all", l: "전체" }].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k as any)} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${filter === f.k ? "bg-white text-black border-white" : "bg-transparent border-white/10 text-gray-400 hover:border-white/20"}`}>{f.l}</button>
        ))}
      </div>

      {isLoading ? <div className="text-center py-16 text-gray-500">불러오는 중...</div> : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-600 bg-white/[0.02] rounded-2xl border border-white/5">해당하는 지급 항목이 없습니다.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(p => (
            <div key={p._id} className={`rounded-2xl border p-5 flex flex-col md:flex-row md:items-center gap-4 ${p.status === "paid" ? "border-white/5 bg-white/[0.01] opacity-60" : "border-white/10 bg-[#121212]"}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-white text-sm">{p.userName}</span>
                  <span className="text-[#e91e3f] font-black text-sm">{p.amount > 0 ? "+" : ""}{p.amount.toLocaleString()} {p.currency === "point" ? "빙옥" : "XP"}</span>
                  {p.status === "paid" && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">지급 완료</span>}
                  {p.status === "processing" && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">처리 중</span>}
                  {p.status === "failed" && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400">실패</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">{p.reason || "-"}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {p.status === "pending" && p.currency === "point" && (
                  <button onClick={() => markPointPaid(p)} className="px-3 py-2 text-xs font-bold rounded-lg transition-colors bg-[#e91e3f] text-white hover:bg-[#d01634]">지급 완료</button>
                )}
                {cancelable(p) && (
                  <button onClick={() => setDeleteId(p._id)} className="px-3 py-2 bg-white/5 hover:bg-red-500/10 text-red-500/70 hover:text-red-500 text-xs font-bold rounded-lg transition-colors">지급 취소</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overlay-in">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">지급 취소</h2>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">해당 지급을 취소하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">닫기</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors">지급 취소</button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div role="status" className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] max-w-[calc(100vw-32px)] px-4 py-2.5 rounded-xl text-sm font-bold shadow-2xl ${notice.err ? "bg-[#e91e3f] text-white" : "bg-white text-black"}`}>
          {notice.text}
        </div>
      )}
    </main>
  );
}
