"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { LuxStyles } from "../../components/Lux";
import BackLink from "../../components/BackLink";
import ArcticDock from "../../arctic/ArcticDock";
import { useSearchParams } from "next/navigation";

const FILTERS = [{ label: "전체", key: "all" }, { label: "심사 중", key: "심사 중" }, { label: "합격", key: "합격" }, { label: "불합격", key: "불합격" }];

// 📌 구인 지원 내역 — 내 정보에서 분리한 페이지. 새 지원은 /recruit 에서.
export default function MyAppliesPage() {
  const { data: session, status } = useSession();
  const fromArctic = useSearchParams().get("from") === "arctic";
  const q = fromArctic ? "?from=arctic" : "";
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    fetch(`/api/user/applies?user=${encodeURIComponent(session.user.name)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(d?.success && Array.isArray(d.data) ? d.data.map((item: any) => ({
        id: item._id, title: `${item.position || "스태프"} 지원서`, role: item.position || "스태프",
        date: item.createdAt ? new Date(item.createdAt).toISOString().split("T")[0] : "날짜 없음",
        status: item.status || "심사 중",
      })) : []))
      .catch(() => setRows([]));
  }, [status, session]);

  const list = (rows || []).filter((rec) => {
    if (filter === "all") return true;
    if (filter === "불합격") return rec.status === "불합격" || rec.status === "취소/반려" || rec.status === "취소";
    return rec.status === filter;
  });

  const cancelApply = async () => {
    if (!cancelId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/user/applies?id=${cancelId}`, { method: "DELETE" });
      if (res.ok) { setRows((prev) => (prev ? prev.filter((r) => r.id !== cancelId) : prev)); setToast("지원을 취소했습니다."); }
      else setToast("지원 취소 중 오류가 발생했습니다.");
    } catch {
      setToast("서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
      setCancelId(null);
      setTimeout(() => setToast(""), 2400);
    }
  };

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <LuxStyles />
      <section className="w-full max-w-4xl mx-auto px-6 pt-8 pb-20">
        <BackLink href={`/profile${q}`} label="내 정보" />
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">구인 지원 내역 {(rows?.length || 0) > 0 && <span className="text-[#e91e3f]">{rows!.length}</span>}</h1>
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${filter === f.key ? "bg-[#131313] text-white border-[#131313]" : "bg-transparent border-[#dedddb] text-[#8a8a8a] hover:border-[#a3a3a3] hover:text-[#4b4b4b]"}`}>{f.label}</button>
              ))}
            </div>
            <Link href="/recruit" className="px-3.5 py-1.5 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[11px] font-bold transition-colors">구인 보기</Link>
          </div>
        </div>

        <div className="border-t border-black/[0.08]">
          {rows === null ? (
            <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
          ) : list.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">해당 조건의 지원 내역이 없습니다.</p>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {list.map((rec) => (
                <div key={rec.id} className="py-4 px-1 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-[#131313] mb-1">{rec.title}</h4>
                    <p className="text-xs text-[#8a8a8a]">분야: <span className="text-[#4b4b4b] font-medium">{rec.role}</span> · {rec.date}</p>
                  </div>
                  <div className="flex gap-3 items-center">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${rec.status === "합격" ? "bg-[#e8f3e6] text-[#3f7a35] border-[#cfe5cb]" : rec.status === "취소" || rec.status === "취소/반려" || rec.status === "불합격" ? "bg-[#fdeaea] text-[#c62828] border-[#f5cdcd]" : "bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]"}`}>{rec.status}</span>
                    {rec.status === "심사 중" && (
                      <button onClick={() => setCancelId(rec.id)} className="text-xs font-bold px-3 py-1 bg-[#e9e8e6] text-[#4b4b4b] hover:bg-[#e91e3f] hover:text-white rounded-full transition-colors outline-none focus:outline-none">지원 취소</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {cancelId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#131313]/45 backdrop-blur-sm p-4" onClick={() => !busy && setCancelId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white border border-[#dedddb] rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-[#131313] mb-3">지원 취소</h2>
            <p className="text-sm text-[#5a5a5a] mb-8 leading-relaxed break-keep">취소하면 다시 지원해야 합니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelId(null)} disabled={busy} className="flex-1 py-3 bg-[#e9e8e6] hover:bg-[#dedddb] text-[#131313] font-bold rounded-xl transition-colors">닫기</button>
              <button onClick={cancelApply} disabled={busy} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors disabled:opacity-50">{busy ? "처리 중..." : "취소하기"}</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[120] px-4 py-2.5 rounded-full bg-[#131313] text-white text-[12px] font-bold shadow-lg">{toast}</div>
      )}
      {fromArctic && <ArcticDock activeKey="me" />}
    </main>
  );
}
