"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { EsportsStyles } from "../../components/Esports";

/* 📌 스크림 운영 — 팀 등록 (관리자 전용)
   실제 화면은 각 팀의 룸(/tournament/team/[id])이고, 여기서는 팀을 만들고 어디로 들어갈지 고른다.
   매칭·통합 시간 조정은 룸 안의 '운영 화면' 스위치를 켜면 나온다. */

const G = "#00e07b";
const PALETTE = ["#7dd3fc", "#a5b4fc", "#fcd34d", "#f0abfc", "#6ee7b7", "#fca5a5", "#c4b5fd", "#fdba74"];

export default function AdminScrimPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && !!session?.user?.name;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [auctions, setAuctions] = useState<any[]>([]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/scrim", { cache: "no-store" });
      const d = await r.json();
      if (d?.success) setData(d);
    } catch { /* 실패는 아래 빈 목록으로 드러난다 */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/auction", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setAuctions(Array.isArray(d?.data) ? d.data : Array.isArray(d?.auctions) ? d.auctions : []))
      .catch(() => {});
  }, []);

  const post = async (payload: any) => {
    setBusy(true);
    try {
      const r = await fetch("/api/scrim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d?.success) { setToast(d?.message || "처리하지 못했습니다"); return null; }
      await load();
      return d;
    } catch { setToast("서버 통신 오류"); return null; }
    finally { setBusy(false); }
  };

  if (status === "loading" || loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>;
  if (!isAdmin || (data && !data.isAdmin)) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const teams: any[] = data?.teams || [];
  const season = data?.season;
  const fixtures: any[] = data?.fixtures || [];
  const readyCount = teams.filter((t) => t.members.length > 0 && t.members.filter((m: any) => m.discordId && t.avail.some((a: any) => a.userId === m.discordId)).length >= t.members.length).length;

  return (
    <main className="w-full">
      <EsportsStyles />
      <div className="max-w-[1100px] mx-auto px-4 pb-24">

        <header className="relative pt-9 pb-7 overflow-hidden">
          <div className="absolute inset-0 esp-mesh pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-2 h-2 esp-blink" style={{ background: G, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
              <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G }}>{season?.title || "스크림 리그"}</span>
              <span className="h-px flex-1 max-w-[200px] bg-gradient-to-r from-[#00e07b]/40 to-transparent" />
            </div>
            <h1 className="text-[28px] md:text-[34px] font-black tracking-tighter leading-none">스크림 운영</h1>

            <div className="mt-6 grid grid-cols-3 border-t" style={{ borderColor: `${G}33` }}>
              {[
                { k: "TEAMS", l: "등록 팀", v: teams.length },
                { k: "READY", l: "조율 완료", v: readyCount },
                { k: "FIXTURES", l: "확정 경기", v: fixtures.length },
              ].map((m, i) => (
                <div key={m.k} className={`py-3.5 md:px-5 ${i > 0 ? "border-l border-white/[0.07] pl-4 md:pl-5" : ""}`}>
                  <p className="text-[9px] font-black esp-mono text-gray-600 mb-1.5">{m.k}</p>
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-2xl md:text-[28px] font-black tabular-nums text-white">{String(m.v).padStart(2, "0")}</span>
                    <span className="text-[10px] font-bold text-gray-600">{m.l}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          {/* 팀 목록 */}
          <section className="min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G }}>Teams</span>
              <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
              <span className="text-[10px] font-black esp-mono text-gray-600">{teams.length}팀</span>
            </div>

            {teams.length === 0 ? (
              <div className="esp-cut border border-dashed border-white/10 px-6 py-14 text-center">
                <p className="text-[12px] font-bold text-gray-500">아직 등록된 팀이 없습니다</p>
                <p className="mt-2 text-[11px] text-gray-700">오른쪽에서 팀을 만들거나 경매 결과를 가져오세요</p>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {teams.map((t) => {
                  const sent = t.members.filter((m: any) => m.discordId && t.avail.some((a: any) => a.userId === m.discordId)).length;
                  const ready = t.members.length > 0 && sent >= t.members.length;
                  return (
                    <div key={t._id} className="esp-cut border border-white/[0.08] bg-white/[0.02]">
                      <Link href={`/tournament/team/${t._id}`} className="flex items-center gap-3 p-4 hover:bg-white/[0.04] transition-colors">
                        <span className="esp-cut-sm grid place-items-center shrink-0 w-11 h-11 text-[13px] font-black tracking-tight"
                          style={{ background: `${t.color}1c`, border: `1px solid ${t.color}55`, color: t.color }}>{t.tag || "TM"}</span>
                        <span className="min-w-0 flex-1">
                          <b className="block text-[13px] font-black truncate">{t.name}</b>
                          <span className="block text-[10px] font-black esp-mono mt-1" style={{ color: ready ? G : "#8b8b93" }}>
                            {t.members.length === 0 ? "로스터 없음" : ready ? "READY" : `${sent}/${t.members.length}`}
                            <span className="text-gray-700 ml-2">{t.wins}승 {t.losses}패</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-gray-600 text-[16px]">›</span>
                      </Link>
                      <button disabled={busy}
                        onClick={async () => { if (!confirm(`${t.name} 팀을 삭제할까요? 응답과 경기 기록도 함께 지워집니다.`)) return; const r = await post({ action: "team:delete", teamId: t._id }); if (r) setToast("팀을 삭제했습니다"); }}
                        className="w-full py-2 text-[10px] font-black text-rose-400/70 border-t border-white/[0.07] hover:bg-rose-500/10 hover:text-rose-300 transition-colors disabled:opacity-40">
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 팀 추가 */}
          <aside className="lg:sticky lg:top-5 space-y-6">
            <section>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G }}>New Team</span>
                <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
              </div>
              <div className="esp-cut border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
                <div>
                  <span className="block text-[10px] font-black esp-mono text-gray-600 mb-1.5">팀 이름</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="예) 이글루 페이커즈"
                    className="w-full esp-cut-sm bg-black/40 border border-white/10 px-3 py-2.5 text-[13px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
                </div>
                <div>
                  <span className="block text-[10px] font-black esp-mono text-gray-600 mb-1.5">태그 (엠블럼 3~4자)</span>
                  <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={4} placeholder="IGL"
                    className="w-full esp-cut-sm bg-black/40 border border-white/10 px-3 py-2.5 text-[13px] font-black tracking-widest text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
                </div>
                <div>
                  <span className="block text-[10px] font-black esp-mono text-gray-600 mb-1.5">팀 색</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE.map((c) => (
                      <button key={c} onClick={() => setColor(c)} aria-pressed={color === c} aria-label={`색 ${c}`}
                        className="w-7 h-7 esp-cut-sm transition-transform active:scale-90"
                        style={{ background: `${c}2e`, border: `1px solid ${color === c ? c : "rgba(255,255,255,.1)"}`, boxShadow: color === c ? `inset 0 0 0 2px ${c}` : undefined }} />
                    ))}
                  </div>
                </div>
                <button disabled={busy || !name.trim()}
                  onClick={async () => { const r = await post({ action: "team:create", name, tag, color }); if (r) { setToast(`${name} 팀을 만들었습니다`); setName(""); setTag(""); } }}
                  className="w-full esp-cut-sm py-3 text-[12px] font-black transition-all active:scale-[.98] disabled:opacity-35"
                  style={{ background: G, color: "#04120b" }}>팀 만들기</button>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G }}>Import</span>
                <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
              </div>
              <div className="esp-cut border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-[11px] font-bold text-gray-500 leading-relaxed">
                  경매 결과에서 팀과 로스터를 통째로 가져옵니다. 이미 가져온 팀은 건너뜁니다.
                </p>
                <div className="mt-3 space-y-1.5 max-h-[240px] overflow-y-auto">
                  {auctions.length === 0 && <p className="text-[11px] font-bold text-gray-700 py-3">불러올 경매가 없습니다.</p>}
                  {auctions.map((a: any) => (
                    <button key={a._id} disabled={busy}
                      onClick={async () => { const r = await post({ action: "team:importAuction", auctionId: a._id }); if (r) setToast(r.made ? `${r.made}개 팀을 가져왔습니다` : "새로 가져올 팀이 없습니다"); }}
                      className="esp-cut-sm w-full flex items-center gap-2 px-3 py-2.5 border border-white/[0.08] bg-white/[0.02] text-left hover:bg-white/[0.06] transition-colors disabled:opacity-40">
                      <span className="min-w-0 flex-1">
                        <b className="block text-[12px] font-black truncate">{a.title}</b>
                        <span className="block text-[10px] font-black esp-mono text-gray-600 mt-0.5">{a.status} · {a.leaders?.length || 0}팀</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-black" style={{ color: G }}>가져오기</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {toast && (
        <div className="fixed left-4 right-4 bottom-6 lg:left-auto lg:right-8 z-[60] max-w-[400px] mx-auto lg:mx-0 esp-cut-sm flex items-center gap-3 min-h-[46px] px-5 py-3 border border-white/10 bg-[#0d0f0e]/96 backdrop-blur-xl text-[12px] font-bold text-gray-200">
          <span className="w-1.5 h-1.5 shrink-0" style={{ background: G }} />
          {toast}
        </div>
      )}
    </main>
  );
}
