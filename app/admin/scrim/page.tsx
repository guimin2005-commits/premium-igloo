"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { EsportsStyles } from "../../components/Esports";

/* 📌 스크림 운영 — 팀 등록 (관리자 전용)
   실제 화면은 각 팀의 룸(/tournament/team/[id])이고, 여기서는 팀을 만들고 어디로 들어갈지 고른다.
   매칭과 통합 시간은 여러 팀에 걸친 일이라 한 팀의 룸이 아니라 여기(운영 콘솔)에 둔다. */

const G = "#00e07b";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const DAY = 864e5;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sKey = (d: Date, m: number) => `${ymd(d)}|${m}`;
const dL = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const dF = (d: Date) => `${dL(d)}(${WD[d.getDay()]})`;
const hourLabel = (h: number) => `${pad(h % 24)}:00`;
const midnight = (d: Date | number | string) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

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
  const [tab, setTab] = useState<"teams" | "match" | "time">("teams");
  const [edit, setEdit] = useState<string | null>(null); // 수정 중인 팀
  const [eName, setEName] = useState("");
  const [eTag, setETag] = useState("");
  const [eColor, setEColor] = useState(PALETTE[0]);
  const [roster, setRoster] = useState<string | null>(null); // 로스터 편집 중인 팀
  const [mName, setMName] = useState("");
  const [mPos, setMPos] = useState("");
  const [mId, setMId] = useState("");

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

        {/* 탭 — 매칭·통합 시간은 여러 팀에 걸친 일이라 룸이 아니라 여기에 둔다 */}
        <div className="flex flex-wrap gap-1 mb-7">
          {([["teams", "팀", "TEAMS"], ["match", "스크림 매칭", "MATCH"], ["time", "통합 시간", "TIME"]] as const).map(([k, label, code]) => {
            const on = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                className={"esp-cut-sm px-3 md:px-5 py-2 md:py-2.5 text-[11px] md:text-sm font-black shrink-0 flex items-center gap-2 transition-all " + (on ? "text-[#04120b]" : "bg-white/[0.03] text-gray-500 hover:text-white hover:bg-white/[0.07]")}
                style={on ? { background: G } : undefined}>
                <span className={"text-[9px] esp-mono " + (on ? "text-[#04120b]/60" : "text-gray-700")}>{code}</span>
                {label}
              </button>
            );
          })}
        </div>

        {tab === "teams" && (
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
                      {edit === t._id ? (
                        /* 이름·태그·색을 그 자리에서 고친다 */
                        <div className="p-4 border-t border-white/[0.07] space-y-2.5">
                          <input value={eName} onChange={(e) => setEName(e.target.value)} maxLength={30} placeholder="팀 이름"
                            className="w-full esp-cut-sm bg-black/40 border border-white/10 px-3 py-2 text-[12px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors" />
                          <input value={eTag} onChange={(e) => setETag(e.target.value.toUpperCase())} maxLength={4} placeholder="태그"
                            className="w-full esp-cut-sm bg-black/40 border border-white/10 px-3 py-2 text-[12px] font-black tracking-widest text-white outline-none focus:border-[#00e07b] transition-colors" />
                          <div className="flex flex-wrap gap-1.5">
                            {PALETTE.map((c) => (
                              <button key={c} onClick={() => setEColor(c)} aria-label={`색 ${c}`} className="w-6 h-6 esp-cut-sm transition-transform active:scale-90"
                                style={{ background: `${c}2e`, border: `1px solid ${eColor === c ? c : "rgba(255,255,255,.1)"}`, boxShadow: eColor === c ? `inset 0 0 0 2px ${c}` : undefined }} />
                            ))}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button disabled={busy || !eName.trim()}
                              onClick={async () => { const r = await post({ action: "team:update", teamId: t._id, name: eName, tag: eTag, color: eColor }); if (r) { setToast("팀 정보를 바꿨습니다"); setEdit(null); } }}
                              className="flex-1 esp-cut-sm py-2 text-[11px] font-black disabled:opacity-35" style={{ background: G, color: "#04120b" }}>저장</button>
                            <button onClick={() => setEdit(null)} className="px-4 esp-cut-sm py-2 text-[11px] font-black bg-white/[0.05] text-gray-400 hover:text-white transition-colors">취소</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex border-t border-white/[0.07]">
                          <button disabled={busy}
                            onClick={() => { setEdit(t._id); setEName(t.name); setETag(t.tag || ""); setEColor(t.color); }}
                            className="flex-1 py-2 text-[10px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-40">
                            수정
                          </button>
                          <button disabled={busy}
                            onClick={() => setRoster(roster === t._id ? null : t._id)}
                            className="flex-1 py-2 text-[10px] font-black text-gray-400 border-l border-white/[0.07] hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-40">
                            로스터
                          </button>
                          <button disabled={busy}
                            onClick={async () => { if (!confirm(`${t.name} 팀을 삭제할까요? 응답과 경기 기록도 함께 지워집니다.`)) return; const r = await post({ action: "team:delete", teamId: t._id }); if (r) setToast("팀을 삭제했습니다"); }}
                            className="flex-1 py-2 text-[10px] font-black text-rose-400/70 border-l border-white/[0.07] hover:bg-rose-500/10 hover:text-rose-300 transition-colors disabled:opacity-40">
                            삭제
                          </button>
                        </div>
                      )}

                      {roster === t._id && (
                        <div className="p-4 border-t border-white/[0.07]">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-black esp-mono text-gray-500">ROSTER {t.members.length}</span>
                            <button disabled={busy}
                              onClick={async () => { const r = await post({ action: "team:syncNames", teamId: t._id }); if (r) setToast(r.changed ? `${r.changed}명의 이름을 디스코드 닉네임으로 맞췄습니다` : "바꿀 이름이 없습니다"); }}
                              className="ml-auto esp-cut-sm px-2.5 py-1 text-[10px] font-black bg-white/[0.05] text-gray-400 hover:text-white transition-colors disabled:opacity-40">
                              디스코드 이름으로 동기화
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            {t.members.length === 0 && <p className="text-[11px] font-bold text-gray-700 py-2">로스터가 비어 있습니다.</p>}
                            {t.members.map((m: any, mi: number) => (
                              <div key={mi} className="flex flex-wrap items-center gap-1.5">
                                <input defaultValue={m.name} maxLength={30}
                                  onBlur={async (e) => { const v = e.target.value.trim(); if (!v || v === m.name) return; const r = await post({ action: "team:updateMember", teamId: t._id, idx: mi, name: v }); if (r) setToast("이름을 바꿨습니다"); }}
                                  className="esp-cut-sm flex-1 min-w-[110px] bg-black/40 border border-white/10 px-2.5 py-1.5 text-[12px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors" />
                                <input defaultValue={m.pos} maxLength={6} placeholder="포지션"
                                  onBlur={async (e) => { const v = e.target.value.trim(); if (v === (m.pos || "")) return; await post({ action: "team:updateMember", teamId: t._id, idx: mi, pos: v }); }}
                                  className="esp-cut-sm w-[72px] bg-black/40 border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-gray-300 outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
                                <input defaultValue={m.discordId} maxLength={21} placeholder="디스코드 ID"
                                  onBlur={async (e) => { const v = e.target.value.trim(); if (v === (m.discordId || "")) return; const r = await post({ action: "team:updateMember", teamId: t._id, idx: mi, discordId: v }); if (r) setToast("디스코드 ID를 바꿨습니다"); }}
                                  className="esp-cut-sm w-[132px] bg-black/40 border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-gray-400 tabular-nums outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
                                <button disabled={busy}
                                  onClick={async () => { await post({ action: "team:updateMember", teamId: t._id, idx: mi, leader: !m.leader }); }}
                                  className="esp-cut-sm px-2 py-1.5 text-[10px] font-black transition-colors disabled:opacity-40"
                                  style={m.leader ? { background: G, color: "#04120b" } : { background: "rgba(255,255,255,.05)", color: "#6b7280" }}>
                                  팀장
                                </button>
                                <button disabled={busy}
                                  onClick={async () => { if (!confirm(`${m.name} 님을 로스터에서 뺄까요?`)) return; const r = await post({ action: "team:removeMember", teamId: t._id, idx: mi }); if (r) setToast("팀원을 뺐습니다"); }}
                                  className="px-1.5 text-[13px] font-black text-rose-400/70 hover:text-rose-300 disabled:opacity-40">×</button>
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/[0.07]">
                            <input value={mName} onChange={(e) => setMName(e.target.value)} maxLength={30} placeholder="이름"
                              className="esp-cut-sm flex-1 min-w-[110px] bg-black/40 border border-white/10 px-2.5 py-1.5 text-[12px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
                            <input value={mPos} onChange={(e) => setMPos(e.target.value)} maxLength={6} placeholder="포지션"
                              className="esp-cut-sm w-[72px] bg-black/40 border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-gray-300 outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
                            <input value={mId} onChange={(e) => setMId(e.target.value)} maxLength={21} placeholder="디스코드 ID"
                              className="esp-cut-sm w-[132px] bg-black/40 border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-gray-400 tabular-nums outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
                            <button disabled={busy || !mName.trim()}
                              onClick={async () => { const r = await post({ action: "team:addMember", teamId: t._id, name: mName, pos: mPos, discordId: mId }); if (r) { setToast("팀원을 추가했습니다"); setMName(""); setMPos(""); setMId(""); } }}
                              className="esp-cut-sm px-3 py-1.5 text-[11px] font-black disabled:opacity-35" style={{ background: G, color: "#04120b" }}>추가</button>
                          </div>

                          <p className="mt-3 text-[10px] font-bold text-gray-600 leading-relaxed">
                            이름은 입력 후 다른 곳을 누르면 저장됩니다. 디스코드 ID 를 바꾸면 그 사람이 낸 일정 응답은 초기화됩니다.
                          </p>
                        </div>
                      )}
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
        )}

        {tab === "match" && <MatchView data={data} busy={busy} post={post} setToast={setToast} />}
        {tab === "time" && season && (
          <SeasonForm season={season} busy={busy} onSave={async (pl) => { const r = await post({ action: "season:update", ...pl }); if (r) setToast("통합 시간을 바꿨습니다 — 모든 팀에 적용됩니다"); }} />
        )}
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

/* ── 스크림 매칭 — 두 팀을 골라 겹치는 시간을 계산하고 경기를 확정한다.
      한 팀의 룸이 아니라 여기 있는 이유: 매칭은 두 팀 사이의 일이다. ── */
function MatchView({ data, busy, post, setToast }: { data: any; busy: boolean; post: (p: any) => Promise<any>; setToast: (m: string) => void }) {
  const G2 = "#00e07b";
  const teams: any[] = data?.teams || [];
  const fixtures: any[] = data?.fixtures || [];
  const season = data?.season;
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);

  const DAYS = useMemo(() => {
    if (!season) return [];
    const s = midnight(season.startAt);
    return Array.from({ length: season.days }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; });
  }, [season]);
  const SLOTS = useMemo(() => {
    if (!season) return [];
    const o: number[] = [];
    for (let m = season.fromHour * 60; m < season.toHour * 60; m += season.stepMin) o.push(m);
    return o;
  }, [season]);

  const sL = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const sF = (m: number) => { const h = Math.floor(m / 60), hh = h % 24, mm = m % 60; return `${pad(hh)}:${pad(mm)}`; };
  const readyOf = (t: any) => t.members.length > 0 && t.members.filter((m: any) => m.discordId && t.avail.some((x: any) => x.userId === m.discordId)).length >= t.members.length;
  const cntAt = (t: any, d: Date, s: number) => t.avail.filter((x: any) => x.slots.includes(sKey(d, s))).length;

  const TA = teams.find((t) => t._id === a);
  const TB = teams.find((t) => t._id === b);

  const ranked = useMemo(() => {
    if (!TA || !TB) return [];
    const o: any[] = [];
    DAYS.forEach((d) => SLOTS.forEach((s) => {
      const ca = cntAt(TA, d, s), cb = cntAt(TB, d, s);
      o.push({ d, s, ca, cb, min: Math.min(ca, cb) });
    }));
    return o.sort((x, y) => y.min - x.min || y.ca + y.cb - (x.ca + x.cb));
  }, [TA, TB, DAYS, SLOTS]);
  const top = ranked[0];

  const Pick = ({ label, sel, onPick, exclude }: { label: string; sel: string | null; onPick: (id: string) => void; exclude: string | null }) => (
    <div>
      <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">{label}</span>
      <div className="space-y-1.5">
        {teams.filter((t) => t._id !== exclude).map((t) => {
          const ready = readyOf(t);
          const on = sel === t._id;
          const sent = t.members.filter((m: any) => m.discordId && t.avail.some((x: any) => x.userId === m.discordId)).length;
          return (
            <button key={t._id} disabled={!ready} onClick={() => onPick(t._id)} aria-pressed={on}
              className={"esp-cut-sm w-full flex items-center gap-2.5 p-2.5 border text-left transition-colors " + (!ready ? "opacity-40 cursor-not-allowed" : "hover:bg-white/[0.05]")}
              style={on ? { borderColor: t.color, background: t.color + "14" } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
              <span className="esp-cut-sm grid place-items-center shrink-0 w-8 h-8 text-[11px] font-black"
                style={{ background: t.color + "1c", border: "1px solid " + t.color + "55", color: t.color }}>{t.tag || "TM"}</span>
              <span className="min-w-0 flex-1">
                <b className="block text-[12px] font-black truncate">{t.name}</b>
                <span className="block text-[9px] font-black esp-mono mt-0.5" style={{ color: ready ? G2 : "#5c5c63" }}>
                  {ready ? "READY" : sent + "/" + t.members.length}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="grid gap-7 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
      <aside className="lg:sticky lg:top-5 space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Match Up</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
        </div>
        <Pick label="팀 A" sel={a} onPick={(id) => setA(a === id ? null : id)} exclude={b} />
        <Pick label="팀 B" sel={b} onPick={(id) => setB(b === id ? null : id)} exclude={a} />
        <p className="text-[10px] font-bold text-gray-600 leading-relaxed">조율이 끝난 팀만 고를 수 있습니다.</p>
      </aside>

      <div className="min-w-0">
        {TA && TB ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Overlap</span>
              <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
              <span className="text-[10px] font-black esp-mono text-gray-600">{TA.name} {TA.members.length} · {TB.name} {TB.members.length}</span>
            </div>
            <p className="text-[11px] font-bold text-gray-600 mb-4">숫자는 <b className="text-gray-300">더 적은 쪽 팀</b>의 가능 인원입니다. 양 팀 전원 가능한 칸에 초록 테두리가 붙습니다.</p>

            <div className="overflow-x-auto no-bar -mx-1 px-1">
              <table style={{ borderCollapse: "separate", borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th className="w-px" />
                    {SLOTS.map((s) => <th key={s} className="pb-1 text-[9px] font-black esp-mono text-gray-600">{sL(s)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((d) => (
                    <tr key={d.getTime()}>
                      <th className="text-left pr-2 whitespace-nowrap">
                        <span className="block text-[11px] font-black tabular-nums text-gray-300">{dL(d)}</span>
                        <span className={"block text-[9px] font-black " + (d.getDay() === 6 ? "text-sky-400/70" : d.getDay() === 0 ? "text-rose-400/70" : "text-gray-600")}>{WD[d.getDay()]}</span>
                      </th>
                      {SLOTS.map((s) => {
                        const ca = cntAt(TA, d, s), cb = cntAt(TB, d, s), mn = Math.min(ca, cb);
                        const cap = Math.max(1, Math.min(TA.members.length, TB.members.length));
                        const full = ca === TA.members.length && cb === TB.members.length && mn > 0;
                        return (
                          <td key={s} className="p-0">
                            <span title={TA.name + " " + ca + " · " + TB.name + " " + cb}
                              className="w-[44px] h-[34px] lg:w-[54px] lg:h-[38px] border text-[11px] font-black tabular-nums grid place-items-center"
                              style={{
                                background: mn ? "rgba(0,224,123," + (0.10 + (mn / cap) * 0.55).toFixed(3) + ")" : "rgba(255,255,255,.02)",
                                borderColor: full ? G2 : "rgba(255,255,255,.07)",
                                boxShadow: full ? "inset 0 0 0 1px " + G2 : undefined,
                                color: mn ? "#e6f7ee" : "#3f3f46",
                              }}>{mn || ""}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="esp-cut border border-white/[0.08] bg-white/[0.02] mt-6">
              <div className="px-5 py-2.5 border-b border-white/[0.07] flex items-center gap-2">
                <span className="text-[10px] font-black esp-mono text-gray-500">RECOMMENDED</span>
                <span className="ml-auto text-[12px] font-black tabular-nums" style={{ color: G2 }}>
                  {top?.min ? dF(top.d) + " " + sF(top.s) : "겹치는 시간 없음"}
                </span>
              </div>
              <div className="px-5 py-5 flex items-center gap-4">
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <span className="esp-cut-sm grid place-items-center shrink-0 w-10 h-10 text-[12px] font-black"
                    style={{ background: TA.color + "1c", border: "1px solid " + TA.color + "55", color: TA.color }}>{TA.tag || "TM"}</span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-black truncate">{TA.name}</span>
                    <span className="block text-[10px] font-black esp-mono text-gray-600">{top ? top.ca + "/" + TA.members.length : "—"}</span>
                  </span>
                </div>
                <span className="text-[13px] font-black esp-mono text-gray-700">VS</span>
                <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
                  <span className="min-w-0 text-right">
                    <span className="block text-[12px] font-black truncate">{TB.name}</span>
                    <span className="block text-[10px] font-black esp-mono text-gray-600">{top ? top.cb + "/" + TB.members.length : "—"}</span>
                  </span>
                  <span className="esp-cut-sm grid place-items-center shrink-0 w-10 h-10 text-[12px] font-black"
                    style={{ background: TB.color + "1c", border: "1px solid " + TB.color + "55", color: TB.color }}>{TB.tag || "TM"}</span>
                </div>
              </div>
              <button disabled={busy || !top?.min}
                onClick={async () => {
                  if (!top?.min) return;
                  const at = new Date(top.d); at.setHours(Math.floor(top.s / 60), top.s % 60, 0, 0);
                  const r = await post({ action: "fixture:create", teamAId: TA._id, teamBId: TB._id, at: at.toISOString(), usCount: top.ca, themCount: top.cb });
                  if (r) setToast(dF(top.d) + " " + sF(top.s) + " · " + TA.name + " vs " + TB.name + " 확정");
                }}
                className="w-full py-3.5 text-[12px] font-black border-t border-white/[0.07] transition-colors disabled:opacity-35"
                style={{ background: G2, color: "#04120b" }}>
                이 시각으로 스크림 확정
              </button>
            </div>
          </>
        ) : (
          <div className="esp-cut border border-dashed border-white/10 px-6 py-16 text-center">
            <p className="text-[12px] font-bold text-gray-500">왼쪽에서 두 팀을 고르면 겹치는 시간이 나옵니다</p>
          </div>
        )}

        {/* 확정된 경기 */}
        <div className="flex items-center gap-3 mt-9 mb-3">
          <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Fixtures</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          <span className="text-[10px] font-black esp-mono text-gray-600">{fixtures.length}건</span>
        </div>
        {fixtures.length === 0 ? (
          <p className="py-6 text-[11px] font-bold text-gray-700">아직 확정된 경기가 없습니다.</p>
        ) : fixtures.map((f: any) => {
          const A = teams.find((t) => t._id === f.teamAId);
          const B = teams.find((t) => t._id === f.teamBId);
          const at = new Date(f.at);
          return (
            <div key={f._id} className="flex flex-wrap items-center gap-3 py-3 border-b border-white/[0.06]">
              <span className="w-[112px] shrink-0 text-[11px] font-bold esp-mono text-gray-400">{dF(at)} {pad(at.getHours())}:{pad(at.getMinutes())}</span>
              <span className="flex-1 min-w-0 text-[12px] font-black text-gray-300 truncate">
                {A?.name || "?"} <span className="text-gray-700 mx-1.5">vs</span> {B?.name || "?"}
              </span>
              {f.winnerId ? (
                <span className="shrink-0 esp-cut-sm px-2.5 py-1 text-[10px] font-black" style={{ background: G2, color: "#04120b" }}>
                  {f.winnerId === "draw" ? "무승부" : (f.winnerId === f.teamAId ? A?.name : B?.name) + " 승"}
                </span>
              ) : (
                <span className="flex gap-1 shrink-0">
                  {[["A 승", f.teamAId], ["B 승", f.teamBId], ["무", "draw"]].map(([l, w]) => (
                    <button key={l as string} disabled={busy}
                      onClick={async () => { const r = await post({ action: "fixture:result", fixtureId: f._id, winnerId: w }); if (r) setToast("결과를 기록했습니다"); }}
                      className="esp-cut-sm px-2.5 py-1 text-[10px] font-black bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/[0.1] transition-colors disabled:opacity-40">{l as string}</button>
                  ))}
                </span>
              )}
              <button disabled={busy}
                onClick={async () => { const r = await post({ action: "fixture:delete", fixtureId: f._id }); if (r) setToast("경기를 삭제했습니다"); }}
                className="shrink-0 text-[10px] font-black text-rose-400/70 hover:text-rose-300 disabled:opacity-40">삭제</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ── 통합 시간 조정 — 전 팀 공통. 네이티브 select/date 는 쓰지 않는다 ── */
function SeasonForm({ season, busy, onSave }: { season: any; busy: boolean; onSave: (p: any) => void }) {
  const G2 = "#00e07b";
  const [start, setStart] = useState(() => midnight(season.startAt));
  const [days, setDays] = useState(season.days);
  const [from, setFrom] = useState(season.fromHour);
  const [to, setTo] = useState(season.toHour);
  const [step, setStep] = useState(season.stepMin);
  const [dueDay, setDueDay] = useState(() => midnight(season.dueAt));
  const [dueMin, setDueMin] = useState(() => { const d = new Date(season.dueAt); return d.getHours() * 60 + d.getMinutes(); });

  const end = (() => { const e = new Date(start); e.setDate(e.getDate() + days - 1); return e; })();
  const cells = days * Math.max(0, Math.ceil(((to - from) * 60) / step));

  const Step = ({ label, value, sub, minus, plus, mOff, pOff }: any) => (
    <div>
      <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">{label}</span>
      <div className="esp-cut-sm inline-flex items-stretch border border-white/10 bg-white/[0.03]">
        <button type="button" onClick={minus} disabled={mOff} className="w-9 text-[16px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:text-gray-700 disabled:hover:bg-transparent transition-colors">−</button>
        <span className="min-w-[92px] px-2 py-2.5 text-center border-x border-white/10">
          <span className="block text-[13px] font-black tabular-nums">{value}</span>
          {sub && <span className="block text-[9px] font-bold text-gray-600 mt-0.5">{sub}</span>}
        </span>
        <button type="button" onClick={plus} disabled={pOff} className="w-9 text-[16px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:text-gray-700 disabled:hover:bg-transparent transition-colors">+</button>
      </div>
    </div>
  );
  const Strip = ({ sel, onPick }: { sel: Date; onPick: (d: Date) => void }) => (
    <div className="flex gap-1.5 overflow-x-auto no-bar pb-1">
      {Array.from({ length: 21 }, (_, i) => {
        const d = midnight(Date.now() + DAY * i);
        const on = d.getTime() === sel.getTime();
        return (
          <button key={i} type="button" onClick={() => onPick(d)} aria-pressed={on}
            className="esp-cut-sm shrink-0 min-w-[54px] px-1 py-2 border text-center transition-colors"
            style={on ? { borderColor: G2, background: `${G2}1a` } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
            <span className="block text-[12px] font-black tabular-nums" style={{ color: on ? G2 : "#cbd5e1" }}>{dL(d)}</span>
            <span className="block text-[9px] font-black esp-mono text-gray-600 mt-0.5">{i === 0 ? "TODAY" : WD[d.getDay()]}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
      <div className="min-w-0 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Period</span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          </div>
          <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">시작 날짜</span>
          <Strip sel={start} onPick={setStart} />
          <div className="flex flex-wrap gap-4 mt-4">
            <Step label="기간" value={`${days}일`} sub={`~ ${dF(end)}`} minus={() => setDays((v: number) => Math.max(1, v - 1))} plus={() => setDays((v: number) => Math.min(21, v + 1))} mOff={days <= 1} pOff={days >= 21} />
            <div>
              <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">단위</span>
              <div className="esp-cut-sm inline-flex border border-white/10 bg-white/[0.03]">
                {[60, 30].map((v) => (
                  <button key={v} onClick={() => setStep(v)} aria-pressed={step === v}
                    className="px-4 py-2.5 text-[12px] font-black border-l border-white/10 first:border-l-0 transition-colors"
                    style={step === v ? { background: `${G2}1f`, color: G2 } : { color: "#8b8b93" }}>{v === 60 ? "1시간" : "30분"}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Hours</span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          </div>
          <div className="flex flex-wrap gap-4">
            <Step label="시작 시각" value={hourLabel(from)} minus={() => setFrom((v: number) => Math.max(0, v - 1))} plus={() => setFrom((v: number) => Math.min(to - 1, v + 1))} mOff={from <= 0} pOff={from >= to - 1} />
            <Step label="종료 시각" value={hourLabel(to)}  minus={() => setTo((v: number) => Math.max(from + 1, v - 1))} plus={() => setTo((v: number) => Math.min(30, v + 1))} mOff={to <= from + 1} pOff={to >= 30} />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Deadline</span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          </div>
          <Strip sel={dueDay} onPick={setDueDay} />
          <div className="mt-4">
            <Step label="마감 시각" value={`${pad(Math.floor(dueMin / 60))}:${pad(dueMin % 60)}`}
              minus={() => setDueMin((v: number) => (v + 1440 - 30) % 1440)} plus={() => setDueMin((v: number) => (v + 30) % 1440)} />
          </div>
        </div>
      </div>

      <aside className="xl:sticky xl:top-20">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Summary</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
        </div>
        <div className="esp-cut border border-white/[0.08] bg-white/[0.02] p-5 text-[12px] font-bold text-gray-400 leading-relaxed">
          <b className="text-white tabular-nums">{dF(start)}</b> 부터 <b className="text-white tabular-nums">{days}일</b>간<br />
          매일 <b className="text-white">{hourLabel(from)}~{hourLabel(to)}</b> · <b className="text-white">{step === 60 ? "1시간" : "30분"}</b> 단위<br />
          한 사람이 볼 칸 <b className="text-white tabular-nums">{cells}칸</b>
          {cells > 90 && <span className="text-amber-300"> — 많으면 응답률이 떨어집니다</span>}
        </div>
        <p className="mt-3 text-[11px] font-bold text-gray-600 leading-relaxed">
          이 설정은 <b className="text-gray-300">모든 팀에 함께</b> 적용됩니다. 팀마다 다르면 팀 간 겹치는 시간을 계산할 수 없습니다.
        </p>
        <button disabled={busy}
          onClick={() => {
            const due = new Date(dueDay); due.setHours(Math.floor(dueMin / 60), dueMin % 60, 0, 0);
            onSave({ startAt: start.toISOString(), days, fromHour: from, toHour: to, stepMin: step, dueAt: due.toISOString() });
          }}
          className="w-full mt-4 esp-cut-sm py-3.5 text-[12px] font-black transition-all active:scale-[.98] disabled:opacity-40"
          style={{ background: G2, color: "#04120b" }}>
          전체 팀에 적용
        </button>
        <p className="mt-3 text-[10px] font-bold text-rose-400/70 leading-relaxed">
          기간이나 시간대를 줄이면 그 바깥의 기존 응답은 계산에서 빠집니다.
        </p>
      </aside>
    </div>
  );
}
