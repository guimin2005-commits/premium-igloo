"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const ADMIN_USERS = ["elahw.06"];
const TEMPLATE_KEY = "xp_command_template";
const DEFAULT_TEMPLATE = "/xp add @{user} {amount}";

export default function PayoutAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [payouts, setPayouts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "paid" | "all">("pending");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(TEMPLATE_KEY) : null;
    if (saved) setTemplate(saved);
  }, []);

  const fetchPayouts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/payout", { cache: "no-store" });
      const json = await res.json();
      if (json.success) setPayouts(json.data);
    } catch { /* noop */ } finally { setIsLoading(false); }
  };

  useEffect(() => { if (isAdmin) fetchPayouts(); }, [isAdmin]);

  const saveTemplate = (v: string) => {
    setTemplate(v);
    try { localStorage.setItem(TEMPLATE_KEY, v); } catch { /* noop */ }
  };

  const buildCommand = (p: any) =>
    template.replace(/\{user\}/g, p.userName).replace(/\{amount\}/g, String(p.amount)).replace(/\{userId\}/g, p.userId || "");

  const copyCommand = async (p: any) => {
    try {
      await navigator.clipboard.writeText(buildCommand(p));
      setCopiedId(p._id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* noop */ }
  };

  const toggleStatus = async (p: any) => {
    const next = p.status === "paid" ? "pending" : "paid";
    setPayouts(prev => prev.map(x => x._id === p._id ? { ...x, status: next } : x));
    try {
      await fetch("/api/payout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p._id, status: next }) });
    } catch { fetchPayouts(); }
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/payout?id=${deleteId}`, { method: "DELETE" });
      if (res.ok) setPayouts(prev => prev.filter(x => x._id !== deleteId));
    } catch { /* noop */ } finally { setDeleteId(null); }
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const pending = payouts.filter(p => p.status === "pending");
  const visible = filter === "all" ? payouts : payouts.filter(p => p.status === filter);
  const totalPendingXp = pending.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <main className="w-full max-w-4xl mx-auto px-6 py-16 flex-1 flex flex-col">
      <div className="mb-8 border-b border-white/10 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">XP 지급 대기열</h1>
          <p className="text-gray-400 text-sm">보상으로 발생한 XP를 봇 명령어로 지급한 뒤 완료 처리하세요.</p>
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

      <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 mb-6">
        <label className="block text-xs font-bold text-gray-400 mb-2">명령어 템플릿 <span className="text-gray-600 font-normal">— {"{user}"}, {"{amount}"}, {"{userId}"} 치환</span></label>
        <input value={template} onChange={(e) => saveTemplate(e.target.value)} className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white text-sm font-mono outline-none focus:border-[#e91e3f] transition-colors" />
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
                  <span className="text-[#e91e3f] font-black text-sm">+{p.amount.toLocaleString()} XP</span>
                  {p.status === "paid" && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">지급 완료</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">{p.reason || "-"}</p>
                <p className="text-[10px] text-gray-600 mt-1 font-mono break-all">{buildCommand(p)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => copyCommand(p)} className="px-3 py-2 bg-[#2a2a2a] hover:bg-[#333] text-white text-xs font-bold rounded-lg transition-colors">{copiedId === p._id ? "복사됨!" : "명령어 복사"}</button>
                <button onClick={() => toggleStatus(p)} className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors ${p.status === "paid" ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-[#e91e3f] text-white hover:bg-[#d01634]"}`}>{p.status === "paid" ? "되돌리기" : "지급 완료"}</button>
                <button onClick={() => setDeleteId(p._id)} className="px-3 py-2 bg-white/5 hover:bg-red-500/10 text-red-500/70 hover:text-red-500 text-xs font-bold rounded-lg transition-colors">삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">지급 항목 삭제</h2>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">해당 지급 항목을 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
