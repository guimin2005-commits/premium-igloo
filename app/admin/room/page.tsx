"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { EsportsStyles } from "../../components/Esports";
import DmPreview from "../../components/DmPreview";
import { DEFAULTS, LIMITS } from "@/lib/nudgeMessage";

/* 📌 대회 룸 운영 (관리자 전용)
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
/* ⚠️ 칸의 '분' 은 1440 을 넘을 수 있다 (종료 시각이 24시를 넘는 경우 = 익일).
   기준 날짜만 그대로 찍으면 25:00 칸이 화면엔 "8/18 01:00", 저장은 8/19 01:00 이 되어
   표기와 실제가 하루 어긋난다. 실제 시각은 반드시 이 함수로 만든다. */
const atOf = (d: Date, m: number) => new Date(midnight(d).getTime() + m * 60000);
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// 📌 경기 시각 표기 — 자정~새벽은 전날 '밤 24:00' 으로 적는다 (조율 격자와 같은 기준)
const NIGHT_UNTIL = 6;
const atLabel = (d: Date) => {
  const h = d.getHours();
  if (h < NIGHT_UNTIL) {
    const prev = new Date(d.getTime() - 86400000);
    return `${dF(prev)} 밤 ${pad(h + 24)}:${pad(d.getMinutes())}`;
  }
  return `${dF(d)} ${pad(h)}:${pad(d.getMinutes())}`;
};


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
  const [tab, setTab] = useState<"teams" | "match" | "notice" | "time">("teams");
  const [edit, setEdit] = useState<string | null>(null); // 수정 중인 팀
  const [eName, setEName] = useState("");
  const [eTag, setETag] = useState("");
  const [eColor, setEColor] = useState(PALETTE[0]);
  const [eIntro, setEIntro] = useState("");
  const [roster, setRoster] = useState<string | null>(null); // 로스터 편집 중인 팀
  const [mName, setMName] = useState("");
  const [mPos, setMPos] = useState("");
  const [mId, setMId] = useState("");
  const [tournaments, setTournaments] = useState<any[]>([]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/room", { cache: "no-store" });
      const d = await r.json();
      if (d?.success) setData(d);
    } catch { /* 실패는 아래 빈 목록으로 드러난다 */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/posts?category=대회", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setTournaments(Array.isArray(d?.data) ? d.data : [])).catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/auction", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setAuctions(Array.isArray(d?.data) ? d.data : Array.isArray(d?.auctions) ? d.auctions : []))
      .catch(() => {});
  }, []);

  const post = async (payload: any) => {
    setBusy(true);
    try {
      const r = await fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
              <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G }}>{season?.title || "대회 룸"}</span>
              <span className="h-px flex-1 max-w-[200px] bg-gradient-to-r from-[#00e07b]/40 to-transparent" />
            </div>
            <h1 className="text-[28px] md:text-[34px] font-black tracking-tighter leading-none">대회 룸 운영</h1>

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
          {([["teams", "팀", "TEAMS"], ["match", "스크림 매칭", "MATCH"], ["notice", "대회 공지", "NOTICE"], ["time", "룸 설정", "SETUP"]] as const).map(([k, label, code]) => {
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
              <div className="grid gap-2.5 sm:grid-cols-2 items-start">
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
                          <textarea value={eIntro} onChange={(e) => setEIntro(e.target.value)} maxLength={300} rows={2} placeholder="팀 소개 (룸 상단에 보입니다)"
                            className="esp-cut-sm w-full bg-black/40 border border-white/10 px-3 py-2 text-[11px] font-medium text-gray-200 outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700 resize-y" />
                          <div className="flex gap-2 pt-1">
                            <button disabled={busy || !eName.trim()}
                              onClick={async () => { const r = await post({ action: "team:update", teamId: t._id, name: eName, tag: eTag, color: eColor, intro: eIntro }); if (r) { setToast("팀 정보를 바꿨습니다"); setEdit(null); } }}
                              className="flex-1 esp-cut-sm py-2 text-[11px] font-black disabled:opacity-35" style={{ background: G, color: "#04120b" }}>저장</button>
                            <button onClick={() => setEdit(null)} className="px-4 esp-cut-sm py-2 text-[11px] font-black bg-white/[0.05] text-gray-400 hover:text-white transition-colors">취소</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex border-t border-white/[0.07]">
                          <button disabled={busy}
                            onClick={() => { setEdit(t._id); setEName(t.name); setETag(t.tag || ""); setEColor(t.color); setEIntro(t.intro || ""); }}
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
                                  리더
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

            {/* 📌 미제출자 재촉 — 전체 팀을 한 번에 찌른다 */}
            <section className="mt-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G }}>Nudge</span>
                <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
              </div>
              <button disabled={busy}
                onClick={async () => { const r = await post({ action: "nudge:send", teamId: "all" }); if (r) setToast(r.queued ? `${r.queued}명에게 DM 을 보냅니다${r.skipped ? ` (${r.skipped}명은 최근 발송)` : ""}` : "지금 보낼 대상이 없습니다"); }}
                className="esp-cut-sm w-full py-3 text-[12px] font-black border transition-all active:scale-[.99] disabled:opacity-40"
                style={{ borderColor: `${G}55`, background: `${G}14`, color: G }}>
                전체 팀 미제출자에게 DM 보내기
              </button>
              {(data?.nudges || []).length > 0 && (
                <div className="mt-3 esp-cut border border-white/[0.08] bg-white/[0.02] p-3 max-h-[220px] overflow-y-auto no-bar">
                  {(data.nudges || []).slice(0, 20).map((n: any) => {
                    // 아직 안 나간 예약은 시각을 보여주고 취소할 수 있어야 한다
                    const waiting = n.status === "pending" && n.sendAt && new Date(n.sendAt).getTime() > Date.now();
                    const when = waiting ? new Date(n.sendAt) : null;
                    return (
                    <div key={n._id} className="flex items-center gap-2 py-1.5 text-[11px] font-bold">
                      <span className="min-w-0 flex-1 truncate text-gray-300">{n.userName || n.userId}</span>
                      {n.kind === "test" && <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-white/[0.07] text-gray-400">시험</span>}
                      {n.type === "fixture" && <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-300">일정</span>}
                      <span className="shrink-0 text-[10px] text-gray-600 truncate max-w-[80px]">{n.teamName}</span>
                      {when && (
                        <span className="shrink-0 text-[10px] font-black esp-mono text-sky-300 tabular-nums">{dL(when)} {pad(when.getHours())}:{pad(when.getMinutes())}</span>
                      )}
                      <span className={`shrink-0 text-[9px] font-black esp-mono ${n.status === "sent" ? "text-[#00e07b]" : n.status === "failed" ? "text-rose-400" : waiting ? "text-sky-300" : "text-amber-300"}`}
                        title={n.error || ""}>
                        {n.status === "sent" ? "보냄" : n.status === "failed" ? "실패" : waiting ? "예약" : "대기"}
                      </span>
                      {n.status === "pending" && (
                        <button disabled={busy}
                          onClick={async () => { const r = await post({ action: "nudge:cancel", nudgeId: n._id }); if (r) setToast("예약을 취소했습니다"); }}
                          className="shrink-0 text-[9px] font-black text-rose-400/70 hover:text-rose-300 disabled:opacity-40">취소</button>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>
        </div>
        )}

        {tab === "match" && <MatchView data={data} busy={busy} post={post} setToast={setToast} />}
        {tab === "notice" && <NoticeView data={data} busy={busy} post={post} setToast={setToast} />}
        {tab === "time" && season && (
          <SeasonForm season={season} busy={busy} tournaments={tournaments} sampleTeam={data?.teams?.[0]?.name}
            onSave={async (pl) => { const r = await post({ action: "season:update", ...pl }); if (r) setToast("룸 설정을 저장했습니다 — 모든 팀에 적용됩니다"); }}
            onSaveNudge={async (n) => { const r = await post({ action: "season:update", nudge: n }); if (r) { setToast("재촉 DM 문구를 저장했습니다"); } }}
            onTest={async (n) => { const r = await post({ action: "nudge:test", teamId: data?.teams?.[0]?._id || "", ...n }); if (r) setToast("내 디스코드 DM 으로 보냈습니다"); }} />
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

/* ── 대회 공지 — 소식(Notice)과는 다르다. 이 대회에 참가한 팀만 보는 운영 공지이고,
      공개 날짜를 따로 잡아 미리 써둔 뒤 그날부터 뜨게 할 수 있다. ── */
function NoticeView({ data, busy, post, setToast }: { data: any; busy: boolean; post: (p: any) => Promise<any>; setToast: (m: string) => void }) {
  const G2 = "#00e07b";
  const notices: any[] = data?.notices || [];
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pinned, setPinned] = useState(false);
  const [important, setImportant] = useState(false);
  const [day, setDay] = useState(() => midnight(Date.now()));
  const [min, setMin] = useState(() => { const d = new Date(); return d.getHours() * 60; });
  const [editing, setEditing] = useState<string | null>(null);

  const at = () => { const d = new Date(day); d.setHours(Math.floor(min / 60), min % 60, 0, 0); return d; };

  // 지난 날짜로도 적을 수 있어야 한다 — 뒤늦게 올리는 공지의 표기 일자를 맞추려면 필요하다
  const BACK = 30, FWD = 30;
  const Strip = ({ sel, onPick }: { sel: Date; onPick: (d: Date) => void }) => (
    <div className="flex gap-1.5 overflow-x-auto no-bar pb-1">
      {Array.from({ length: BACK + FWD + 1 }, (_, i) => {
        const off = i - BACK;
        const d = midnight(Date.now() + DAY * off);
        const on = d.getTime() === sel.getTime();
        const past = off < 0;
        return (
          <button key={i} type="button" onClick={() => onPick(d)} aria-pressed={on}
            ref={(el) => { if (el && on) el.scrollIntoView({ block: "nearest", inline: "center" }); }}
            className="esp-cut-sm shrink-0 min-w-[54px] px-1 py-2 border text-center transition-colors"
            style={on ? { borderColor: G2, background: `${G2}1a` } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
            <span className="block text-[12px] font-black tabular-nums" style={{ color: on ? G2 : past ? "#6b7280" : "#cbd5e1" }}>{dL(d)}</span>
            <span className="block text-[9px] font-black esp-mono text-gray-600 mt-0.5">{off === 0 ? "TODAY" : WD[d.getDay()]}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <section className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Notices</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          <span className="text-[10px] font-black esp-mono text-gray-600">{notices.length}건</span>
        </div>

        {notices.length === 0 ? (
          <div className="esp-cut border border-dashed border-white/10 px-6 py-14 text-center">
            <p className="text-[12px] font-bold text-gray-500">아직 대회 공지가 없습니다</p>
            <p className="mt-2 text-[11px] text-gray-700">오른쪽에서 작성하세요 — 사이트 소식과는 별개입니다</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {notices.map((n: any) => {
              const pub = new Date(n.publishAt);
              const scheduled = pub.getTime() > Date.now();
              return (
                <div key={n._id} className="esp-cut border bg-white/[0.02]"
                  style={{ borderColor: n.important ? "rgba(251,113,133,.4)" : "rgba(255,255,255,.08)" }}>
                  <div className="px-4 pt-3.5 pb-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      {(n.pinned || n.important || scheduled) && (
                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                          {n.pinned && <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black" style={{ background: G2, color: "#04120b" }}>고정</span>}
                          {n.important && <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black bg-rose-500/20 text-rose-300">중요</span>}
                          {scheduled && <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black bg-amber-400/15 text-amber-300">예약</span>}
                        </div>
                      )}
                      <p className="text-[14px] font-black text-white break-keep">{n.title}</p>
                      {n.body && <p className="mt-2 text-[12px] font-medium text-gray-400 leading-relaxed whitespace-pre-line break-keep">{n.body}</p>}
                    </div>
                    {/* 날짜는 제목과 같은 줄 오른쪽 — 배지가 없을 때 빈 줄이 생기지 않도록 */}
                    <span className="shrink-0 text-right pt-0.5">
                      <span className="block text-[10px] font-black esp-mono text-gray-500 tabular-nums">{dF(pub)}</span>
                      <span className="block text-[10px] font-black esp-mono text-gray-700 tabular-nums mt-0.5">{pad(pub.getHours())}:{pad(pub.getMinutes())}</span>
                    </span>
                  </div>
                  <div className="flex border-t border-white/[0.07]">
                    <button disabled={busy}
                      onClick={async () => { const r = await post({ action: "notice:update", noticeId: n._id, pinned: !n.pinned }); if (r) setToast(n.pinned ? "고정을 풀었습니다" : "상단에 고정했습니다"); }}
                      className="flex-1 py-2 text-[10px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-40">
                      {n.pinned ? "고정 해제" : "고정"}
                    </button>
                    <button disabled={busy}
                      onClick={async () => { const r = await post({ action: "notice:update", noticeId: n._id, important: !n.important }); if (r) setToast("표시를 바꿨습니다"); }}
                      className="flex-1 py-2 text-[10px] font-black text-gray-400 border-l border-white/[0.07] hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-40">
                      {n.important ? "중요 해제" : "중요"}
                    </button>
                    <button disabled={busy}
                      onClick={() => { setEditing(n._id); setTitle(n.title); setText(n.body || ""); setPinned(n.pinned); setImportant(n.important); setDay(midnight(n.publishAt)); const d = new Date(n.publishAt); setMin(d.getHours() * 60 + d.getMinutes()); }}
                      className="flex-1 py-2 text-[10px] font-black text-gray-400 border-l border-white/[0.07] hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-40">
                      수정
                    </button>
                    <button disabled={busy}
                      onClick={async () => { if (!confirm("이 공지를 삭제할까요?")) return; const r = await post({ action: "notice:delete", noticeId: n._id }); if (r) setToast("공지를 삭제했습니다"); }}
                      className="flex-1 py-2 text-[10px] font-black text-rose-400/70 border-l border-white/[0.07] hover:bg-rose-500/10 hover:text-rose-300 transition-colors disabled:opacity-40">
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <aside className="lg:sticky lg:top-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>{editing ? "Edit" : "New Notice"}</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
        </div>
        <div className="esp-cut border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <div>
            <span className="block text-[10px] font-black esp-mono text-gray-600 mb-1.5">제목</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="예) 1주차 일정 안내"
              className="esp-cut-sm w-full bg-black/40 border border-white/10 px-3 py-2.5 text-[13px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
          </div>
          <div>
            <span className="block text-[10px] font-black esp-mono text-gray-600 mb-1.5">내용</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={5} placeholder="줄바꿈 그대로 표시됩니다"
              className="esp-cut-sm w-full bg-black/40 border border-white/10 px-3 py-2.5 text-[12px] font-medium text-gray-200 outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700 resize-y" />
          </div>

          <div>
            <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">공개 날짜</span>
            <Strip sel={day} onPick={setDay} />
            {/* 시와 분을 나눠 돌린다 — 30분 단위 하나로는 원하는 시각에 못 맞춘다 */}
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {([["시", 60, 24], ["분", 5, 60]] as const).map(([label, unit, mod]) => (
                <div key={label} className="esp-cut-sm inline-flex items-stretch border border-white/10 bg-white/[0.03]">
                  <button type="button" aria-label={`${label} 줄이기`}
                    onClick={() => setMin((v) => (unit === 60 ? (v + 1440 - 60) % 1440 : Math.floor(v / 60) * 60 + ((v % 60) + 60 - 5) % 60))}
                    className="w-8 text-[15px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white transition-colors">−</button>
                  <span className="min-w-[56px] px-2 py-2 text-center border-x border-white/10">
                    <span className="block text-[13px] font-black tabular-nums">{unit === 60 ? pad(Math.floor(min / 60)) : pad(min % 60)}</span>
                    <span className="block text-[9px] font-bold text-gray-600">{label}</span>
                  </span>
                  <button type="button" aria-label={`${label} 늘리기`}
                    onClick={() => setMin((v) => (unit === 60 ? (v + 60) % 1440 : Math.floor(v / 60) * 60 + ((v % 60) + 5) % 60))}
                    className="w-8 text-[15px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white transition-colors">+</button>
                </div>
              ))}
              <button type="button" onClick={() => { setDay(midnight(Date.now())); const d = new Date(); setMin(d.getHours() * 60 + Math.floor(d.getMinutes() / 5) * 5); }}
                className="esp-cut-sm px-3 py-2 text-[10px] font-black bg-white/[0.05] text-gray-400 hover:text-white transition-colors">지금</button>
              <span className="text-[10px] font-bold text-gray-600 leading-tight">
                {at().getTime() > Date.now() ? <span className="text-amber-300">이 시각부터 공개</span> : "바로 공개"}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            {[[pinned, setPinned, "상단 고정"], [important, setImportant, "중요"]].map(([v, set, label]: any, i) => (
              <button key={i} type="button" onClick={() => set(!v)} aria-pressed={v}
                className="esp-cut-sm flex-1 py-2 text-[11px] font-black transition-colors"
                style={v ? { background: G2, color: "#04120b" } : { background: "rgba(255,255,255,.05)", color: "#8b8b93" }}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button disabled={busy || !title.trim()}
              onClick={async () => {
                const payload = { title, body: text, pinned, important, publishAt: at().toISOString() };
                const r = editing
                  ? await post({ action: "notice:update", noticeId: editing, ...payload })
                  : await post({ action: "notice:create", ...payload });
                if (r) { setToast(editing ? "공지를 수정했습니다" : "공지를 등록했습니다"); setEditing(null); setTitle(""); setText(""); setPinned(false); setImportant(false); }
              }}
              className="flex-1 esp-cut-sm py-3 text-[12px] font-black disabled:opacity-35" style={{ background: G2, color: "#04120b" }}>
              {editing ? "수정 저장" : "공지 등록"}
            </button>
            {editing && (
              <button onClick={() => { setEditing(null); setTitle(""); setText(""); setPinned(false); setImportant(false); }}
                className="px-4 esp-cut-sm py-3 text-[12px] font-black bg-white/[0.05] text-gray-400 hover:text-white transition-colors">취소</button>
            )}
          </div>

          <p className="text-[10px] font-bold text-gray-600 leading-relaxed">
            사이트 <b className="text-gray-400">소식</b> 공지와는 별개입니다. 이 공지는 대회 룸에 들어온 팀만 봅니다.
            공개 날짜를 앞으로 잡으면 그 전까지는 관리자에게만 보입니다.
          </p>
        </div>
      </aside>
    </div>
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
  const [kind, setKind] = useState<"scrim" | "official">("scrim");
  // 📌 몇 대 몇 — 스코어를 적고 있는 경기와 그 값
  const [scoreFx, setScoreFx] = useState<string | null>(null);
  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");
  /* 📌 경기 시각 — 기본은 가장 많이 겹치는 칸이지만, 운영진이 직접 정할 수 있어야 한다.
     겹치는 사람이 적어도 그 시간에 하기로 했으면 그게 맞는 시각이다. */
  const [pickDay, setPickDay] = useState<Date | null>(null);
  const [pickMin, setPickMin] = useState<number | null>(null);
  // 일정 알림을 보내기 전에 무엇이 누구에게 가는지 보여주는 창
  const [notifyFx, setNotifyFx] = useState<any>(null);
  const [notifyAt, setNotifyAt] = useState<Date | null>(null);   // 예약 시각 (null = 지금)

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
  const pickTeam = (side: "a" | "b", id: string | null) => {
    // 상대가 바뀌면 겹치는 시간도 달라진다 — 직접 고른 시각은 초기화한다
    setPickDay(null); setPickMin(null);
    (side === "a" ? setA : setB)(id);
  };

  /* 실제로 확정할 시각. 직접 고른 값이 우선이고, 없으면 가장 많이 겹치는 칸을 쓴다. */

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
  /* 실제로 확정할 시각 — 직접 고른 값이 우선, 없으면 가장 많이 겹치는 칸 */
  const chosen = pickDay && pickMin !== null ? { d: pickDay, s: pickMin } : (top?.min ? { d: top.d, s: top.s } : null);
  const chosenAt = chosen ? atOf(chosen.d, chosen.s) : null;   // 화면과 저장이 함께 쓰는 실제 시각
  /* 자정을 넘긴 칸은 날짜가 하루 뒤로 찍힌다. 실제 시각은 그게 맞지만
     팀 입장에선 "어느 날 밤" 인지가 더 익숙하다 — 그 경우에만 덧붙인다. */
  const nightOf = chosen && chosenAt && ymd(chosenAt) !== ymd(chosen.d) ? chosen.d : null;
  const chosenCa = chosen && TA ? cntAt(TA, chosen.d, chosen.s) : 0;
  const chosenCb = chosen && TB ? cntAt(TB, chosen.d, chosen.s) : 0;

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
        <Pick label="팀 A" sel={a} onPick={(id) => pickTeam("a", a === id ? null : id)} exclude={b} />
        <Pick label="팀 B" sel={b} onPick={(id) => pickTeam("b", b === id ? null : id)} exclude={a} />
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
            <p className="text-[11px] font-bold text-gray-600 mb-4">
              숫자는 <b className="text-gray-300">더 적은 쪽 팀</b>의 가능 인원입니다. 양 팀 전원 가능한 칸에 초록 테두리가 붙습니다.
              <b className="text-gray-300"> 칸을 누르면 그 시각으로 잡습니다.</b>
            </p>

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
                        const picked = !!chosen && sKey(chosen.d, chosen.s) === sKey(d, s);
                        return (
                          <td key={s} className="p-0">
                            <button type="button" title={TA.name + " " + ca + " · " + TB.name + " " + cb}
                              onClick={() => { setPickDay(d); setPickMin(s); }}
                              aria-pressed={picked}
                              className="w-[44px] h-[34px] lg:w-[54px] lg:h-[38px] border text-[11px] font-black tabular-nums grid place-items-center transition-colors"
                              style={{
                                background: mn ? "rgba(0,224,123," + (0.10 + (mn / cap) * 0.55).toFixed(3) + ")" : "rgba(255,255,255,.02)",
                                borderColor: picked ? "#fff" : full ? G2 : "rgba(255,255,255,.07)",
                                boxShadow: picked ? "inset 0 0 0 2px #fff" : full ? "inset 0 0 0 1px " + G2 : undefined,
                                color: mn ? "#e6f7ee" : "#3f3f46",
                              }}>{mn || ""}</button>
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
                <span className="ml-auto flex items-baseline gap-2 min-w-0">
                  {nightOf && <span className="shrink-0 text-[10px] font-bold text-gray-500">{dF(nightOf)} 밤</span>}
                  <span className="text-[12px] font-black tabular-nums" style={{ color: chosenAt ? G2 : "#6b7280" }}>
                    {chosenAt ? dF(chosenAt) + " " + hhmm(chosenAt) : "시각을 정해주세요"}
                  </span>
                </span>
              </div>
              <div className="px-5 py-5 flex items-center gap-4">
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <span className="esp-cut-sm grid place-items-center shrink-0 w-10 h-10 text-[12px] font-black"
                    style={{ background: TA.color + "1c", border: "1px solid " + TA.color + "55", color: TA.color }}>{TA.tag || "TM"}</span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-black truncate">{TA.name}</span>
                    <span className="block text-[10px] font-black esp-mono text-gray-600">{chosen ? chosenCa + "/" + TA.members.length : "—"}</span>
                  </span>
                </div>
                <span className="text-[13px] font-black esp-mono text-gray-700">VS</span>
                <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
                  <span className="min-w-0 text-right">
                    <span className="block text-[12px] font-black truncate">{TB.name}</span>
                    <span className="block text-[10px] font-black esp-mono text-gray-600">{chosen ? chosenCb + "/" + TB.members.length : "—"}</span>
                  </span>
                  <span className="esp-cut-sm grid place-items-center shrink-0 w-10 h-10 text-[12px] font-black"
                    style={{ background: TB.color + "1c", border: "1px solid " + TB.color + "55", color: TB.color }}>{TB.tag || "TM"}</span>
                </div>
              </div>
              {/* 📌 시각 직접 정하기 — 격자에 없는 날짜·시간도 잡을 수 있어야 한다 */}
              <div className="px-5 py-4 border-t border-white/[0.07] space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black esp-mono text-gray-600">경기 시각</span>
                  {pickDay && (
                    <button onClick={() => { setPickDay(null); setPickMin(null); }}
                      className="ml-auto text-[10px] font-bold text-gray-600 hover:text-white underline underline-offset-2 transition-colors">
                      가장 겹치는 시각으로
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-bar pb-1">
                  {Array.from({ length: 21 }, (_, i) => midnight(Date.now() + DAY * i)).map((d, i) => {
                    const on = !!chosenAt && ymd(chosenAt) === ymd(d);
                    return (
                      <button key={i} type="button"
                        onClick={() => {
                          // 날짜를 직접 고르면 '기준일 + 25:00' 같은 표기를 그 날짜의 실제 시각으로 정리한다
                          const mod = chosenAt ? chosenAt.getHours() * 60 + chosenAt.getMinutes() : (season ? (season.fromHour * 60) % 1440 : 1200);
                          setPickDay(d); setPickMin(mod);
                        }}
                        aria-pressed={on}
                        className="esp-cut-sm shrink-0 min-w-[52px] px-1 py-2 border text-center transition-colors"
                        style={on ? { borderColor: G2, background: G2 + "1a" } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
                        <span className="block text-[12px] font-black tabular-nums" style={{ color: on ? G2 : "#cbd5e1" }}>{dL(d)}</span>
                        <span className="block text-[9px] font-black esp-mono text-gray-600 mt-0.5">{i === 0 ? "TODAY" : WD[d.getDay()]}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black esp-mono text-gray-600 shrink-0">시각</span>
                  <div className="esp-cut-sm inline-flex items-stretch border border-white/10 bg-white/[0.03]">
                    <button type="button" disabled={!chosen}
                      onClick={() => { if (!chosen) return; setPickDay(chosen.d); setPickMin(Math.max(0, chosen.s - 30)); }}
                      className="w-9 text-[16px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:text-gray-700 transition-colors">−</button>
                    <span className="min-w-[86px] px-2 py-2 text-center border-x border-white/10 text-[13px] font-black tabular-nums">
                      {chosenAt ? hhmm(chosenAt) : "--:--"}
                    </span>
                    <button type="button" disabled={!chosen}
                      onClick={() => { if (!chosen) return; setPickDay(chosen.d); setPickMin(Math.min(2879, chosen.s + 30)); }}
                      className="w-9 text-[16px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:text-gray-700 transition-colors">+</button>
                  </div>
                  {chosen && (
                    <span className="text-[10px] font-bold text-gray-600 min-w-0 truncate">
                      {chosenCa + chosenCb > 0 ? `양 팀 ${chosenCa} · ${chosenCb}명 가능` : "이 시각은 아무도 표시하지 않았습니다"}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex border-t border-white/[0.07]">
                {([["scrim", "스크림"], ["official", "공식전"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                    className="flex-1 py-2.5 text-[11px] font-black border-l border-white/[0.07] first:border-l-0 transition-colors"
                    style={kind === k ? { background: "rgba(0,224,123,.14)", color: G2 } : { color: "#8b8b93" }}>{l}</button>
                ))}
              </div>
              <button disabled={busy || !chosenAt}
                onClick={async () => {
                  if (!chosenAt) return;
                  const r = await post({ action: "fixture:create", teamAId: TA._id, teamBId: TB._id, kind, at: chosenAt.toISOString(), usCount: chosenCa, themCount: chosenCb });
                  if (r) setToast((nightOf ? dF(nightOf) + " 밤 " : "") + dF(chosenAt) + " " + hhmm(chosenAt) + " · " + TA.name + " vs " + TB.name + " 확정");
                }}
                className="w-full py-3.5 text-[12px] font-black border-t border-white/[0.07] transition-colors disabled:opacity-35"
                style={{ background: G2, color: "#04120b" }}>
                이 시각으로 {kind === "official" ? "공식전" : "스크림"} 확정
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
              <span className="w-[142px] shrink-0 text-[11px] font-bold esp-mono text-gray-400">{atLabel(at)}</span>
              <span className="flex-1 min-w-0 text-[12px] font-black text-gray-300 truncate">
                {A?.name || "?"} <span className="text-gray-700 mx-1.5">vs</span> {B?.name || "?"}
              </span>
              {f.winnerId ? (
                <span className="flex items-center gap-2 shrink-0">
                  {/* 스코어를 기록했으면 몇 대 몇인지 함께 보여준다 */}
                  {(f.scoreA > 0 || f.scoreB > 0) && (
                    <span className="esp-cut-sm px-2.5 py-1 text-[11px] font-black tabular-nums bg-white/[0.06] text-gray-200">
                      {f.scoreA} <span className="text-gray-600 mx-0.5">:</span> {f.scoreB}
                    </span>
                  )}
                  <span className="esp-cut-sm px-2.5 py-1 text-[10px] font-black" style={{ background: G2, color: "#04120b" }}>
                    {f.winnerId === "draw" ? "무승부" : (f.winnerId === f.teamAId ? A?.name : B?.name) + " 승"}
                  </span>
                  <button disabled={busy}
                    onClick={async () => { const r = await post({ action: "fixture:result", fixtureId: f._id, winnerId: "", scoreA: 0, scoreB: 0 }); if (r) { setScoreFx(null); setToast("결과를 지웠습니다"); } }}
                    className="text-[10px] font-black text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-40">다시</button>
                </span>
              ) : scoreFx === f._id ? (
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-black esp-mono text-gray-600">{A?.tag || "A"}</span>
                  <input type="number" min={0} max={99} value={scoreA} onChange={(e) => setScoreA(e.target.value)}
                    className="esp-cut-sm w-12 px-2 py-1 text-center text-[12px] font-black tabular-nums bg-white/[0.05] border border-white/10 text-white outline-none focus:border-white/35" />
                  <span className="text-[11px] font-black text-gray-600">:</span>
                  <input type="number" min={0} max={99} value={scoreB} onChange={(e) => setScoreB(e.target.value)}
                    className="esp-cut-sm w-12 px-2 py-1 text-center text-[12px] font-black tabular-nums bg-white/[0.05] border border-white/10 text-white outline-none focus:border-white/35" />
                  <span className="text-[10px] font-black esp-mono text-gray-600">{B?.tag || "B"}</span>
                  <button disabled={busy}
                    onClick={async () => {
                      const sa = Math.max(0, Math.min(99, Math.floor(Number(scoreA) || 0)));
                      const sb = Math.max(0, Math.min(99, Math.floor(Number(scoreB) || 0)));
                      // 승패는 숫자에서 갈린다 — 같으면 무승부
                      const winnerId = sa === sb ? "draw" : sa > sb ? f.teamAId : f.teamBId;
                      const r = await post({ action: "fixture:result", fixtureId: f._id, winnerId, scoreA: sa, scoreB: sb });
                      if (r) { setScoreFx(null); setToast(sa + " : " + sb + " 로 기록했습니다"); }
                    }}
                    className="esp-cut-sm px-2.5 py-1 text-[10px] font-black transition-colors disabled:opacity-40"
                    style={{ background: G2, color: "#04120b" }}>기록</button>
                  <button onClick={() => setScoreFx(null)} className="text-[10px] font-black text-gray-600 hover:text-gray-300 transition-colors">취소</button>
                </span>
              ) : (
                <span className="flex gap-1 shrink-0">
                  {[["A 승", f.teamAId], ["B 승", f.teamBId], ["무", "draw"]].map(([l, w]) => (
                    <button key={l as string} disabled={busy}
                      onClick={async () => { const r = await post({ action: "fixture:result", fixtureId: f._id, winnerId: w }); if (r) setToast("결과를 기록했습니다"); }}
                      className="esp-cut-sm px-2.5 py-1 text-[10px] font-black bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/[0.1] transition-colors disabled:opacity-40">{l as string}</button>
                  ))}
                  <button disabled={busy}
                    onClick={() => { setScoreFx(f._id); setScoreA(String(f.scoreA || 0)); setScoreB(String(f.scoreB || 0)); }}
                    className="esp-cut-sm px-2.5 py-1 text-[10px] font-black border border-white/15 text-gray-300 hover:text-white hover:border-white/35 transition-colors disabled:opacity-40">몇 대 몇</button>
                </span>
              )}
              <button disabled={busy} onClick={() => { setNotifyFx(f); setNotifyAt(null); }}
                className="shrink-0 esp-cut-sm px-2.5 py-1 text-[10px] font-black border transition-colors disabled:opacity-40"
                style={{ borderColor: "rgba(56,189,248,.4)", background: "rgba(56,189,248,.12)", color: "#7dd3fc" }}>알림</button>
              <button disabled={busy}
                onClick={async () => { const r = await post({ action: "fixture:delete", fixtureId: f._id }); if (r) setToast("경기를 삭제했습니다"); }}
                className="shrink-0 text-[10px] font-black text-rose-400/70 hover:text-rose-300 disabled:opacity-40">삭제</button>
            </div>
          );
        })}
      </div>

      {/* 📌 일정 알림 — 누구에게 무엇이 가는지 보고 나서 보낸다 */}
      {notifyFx && (() => {
        const A = teams.find((t) => t._id === notifyFx.teamAId);
        const B = teams.find((t) => t._id === notifyFx.teamBId);
        const targets = [...(A?.members || []), ...(B?.members || [])].filter((m: any) => m.discordId);
        return (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-5" onClick={() => setNotifyFx(null)}>
            <div className="esp-cut w-full sm:max-w-[460px] max-h-[88dvh] overflow-y-auto no-bar border border-white/10 bg-[#0b0d0c] p-6" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] font-black esp-mono text-gray-600 mb-1">FIXTURE NOTICE</p>
              <h3 className="text-[17px] font-black tracking-tight mb-4">이 내용으로 양 팀에 DM 을 보냅니다</h3>

              <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">받는 사람 {targets.length}명</span>
              <div className="flex flex-wrap gap-1.5 mb-5">
                {targets.map((m: any, i: number) => (
                  <span key={i} className="esp-cut-sm px-2.5 py-1 text-[11px] font-black border border-white/10 bg-white/[0.03] text-gray-300">{m.name}</span>
                ))}
              </div>

              <DmPreview variant="fixture" teamName={A?.name || "우리 팀"} oppName={B?.name || "상대"}
                at={notifyFx.at} matchKind={notifyFx.kind} copy={season?.fixtureMsg} />
              <p className="mt-2 text-[11px] font-bold text-gray-600">받는 사람마다 '우리 팀' 과 '상대' 가 각자 기준으로 바뀝니다.</p>

              <SendWhen value={notifyAt} onChange={setNotifyAt} anchor={new Date(notifyFx.at)} />

              <div className="flex gap-2 mt-5">
                <button onClick={() => setNotifyFx(null)}
                  className="flex-1 esp-cut-sm py-3 text-[12px] font-black bg-white/[0.05] text-gray-400 hover:text-white transition-colors">취소</button>
                <button disabled={busy} onClick={async () => {
                  const r = await post({ action: "fixture:notify", fixtureId: notifyFx._id, sendAt: notifyAt?.toISOString() });
                  const when = notifyAt ? `${dF(notifyAt)} ${pad(notifyAt.getHours())}:${pad(notifyAt.getMinutes())} 에 ` : "";
                  setNotifyFx(null);
                  if (r) setToast(r.queued ? `${when}${r.queued}명에게 DM 을 보냅니다${r.skipped ? ` (${r.skipped}명은 이미 받음)` : ""}` : "이미 모두 받았습니다");
                }}
                  className="flex-[1.4] esp-cut-sm py-3 text-[12px] font-black transition-all active:scale-[.98] disabled:opacity-40"
                  style={{ background: "#38bdf8", color: "#04121a" }}>
                  {notifyAt ? `${targets.length}명 예약` : `${targets.length}명에게 보내기`}
                </button>
              </div>
              <button disabled={busy} onClick={async () => {
                const r = await post({ action: "fixture:notifyTest", fixtureId: notifyFx._id });
                if (r) setToast("내 디스코드 DM 으로 보냈습니다");
              }}
                className="w-full mt-2 esp-cut-sm py-2.5 text-[11px] font-black border border-white/12 bg-white/[0.03] text-gray-400 hover:text-white transition-colors disabled:opacity-40">
                나에게 먼저 보내보기
              </button>
              <p className="mt-3 text-[10px] font-bold text-gray-600 leading-relaxed">
                이미 이 경기 알림을 받은 사람은 건너뜁니다. DM 이 막혀 있으면 실패로 남습니다.
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}


/* 📌 언제 보낼지 — 지금 / 정해둔 시각.
   보내는 순간을 사람이 정하는 구조라, 예약도 같은 화면에서 고를 수 있어야 한다.
   기준 시각(경기 시각 등)이 있으면 "N시간 전" 을 바로 고를 수 있게 해 준다. */
function SendWhen({ value, onChange, anchor }: { value: Date | null; onChange: (d: Date | null) => void; anchor?: Date | null }) {
  const G2 = "#00e07b";
  const now = Date.now();
  const presets: { label: string; at: Date | null }[] = [{ label: "지금 보내기", at: null }];
  [1, 3].forEach((h) => presets.push({ label: `${h}시간 뒤`, at: new Date(now + h * 3600e3) }));
  if (anchor) {
    [24, 3].forEach((h) => {
      const at = new Date(anchor.getTime() - h * 3600e3);
      if (at.getTime() - now > 60e3) presets.push({ label: `경기 ${h}시간 전`, at });
    });
  }
  const same = (a: Date | null, b: Date | null) =>
    (!a && !b) || (!!a && !!b && Math.abs(a.getTime() - b.getTime()) < 60e3);

  return (
    <div className="mt-4">
      <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">언제 보낼까요</span>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((x) => {
          const on = same(value, x.at);
          return (
            <button key={x.label} type="button" onClick={() => onChange(x.at)}
              className="esp-cut-sm px-2.5 py-1.5 text-[11px] font-black border transition-colors"
              style={on ? { borderColor: G2, background: G2 + "16", color: G2 } : { borderColor: "rgba(255,255,255,.10)", background: "rgba(255,255,255,.02)", color: "#c7c7cc" }}>
              {x.label}
            </button>
          );
        })}
      </div>
      {value && (
        <div className="flex items-center gap-2 mt-2.5">
          <div className="esp-cut-sm inline-flex items-stretch border border-white/10 bg-white/[0.03]">
            <button type="button" onClick={() => onChange(new Date(Math.max(now + 61e3, value.getTime() - 1800e3)))}
              className="w-8 text-[15px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white transition-colors">−</button>
            <span className="px-3 py-1.5 text-center border-x border-white/10 text-[12px] font-black tabular-nums">
              {dF(value)} {pad(value.getHours())}:{pad(value.getMinutes())}
            </span>
            <button type="button" onClick={() => onChange(new Date(value.getTime() + 1800e3))}
              className="w-8 text-[15px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white transition-colors">+</button>
          </div>
          <span className="text-[10px] font-bold text-gray-600">30분 단위로 조절</span>
        </div>
      )}
    </div>
  );
}

/* ── 통합 시간 조정 — 전 팀 공통. 네이티브 select/date 는 쓰지 않는다 ── */
function SeasonForm({ season, busy, onSave, onSaveNudge, onTest, tournaments, sampleTeam }: { season: any; busy: boolean; onSave: (p: any) => void; onSaveNudge: (n: any) => void; onTest: (n: any) => void; tournaments: any[]; sampleTeam?: string }) {
  const G2 = "#00e07b";
  const [start, setStart] = useState(() => midnight(season.startAt));
  const [days, setDays] = useState(season.days);
  const [from, setFrom] = useState(season.fromHour);
  const [to, setTo] = useState(season.toHour);
  const [step, setStep] = useState(season.stepMin);
  const [dueDay, setDueDay] = useState(() => midnight(season.dueAt));
  const [dueMin, setDueMin] = useState(() => { const d = new Date(season.dueAt); return d.getHours() * 60 + d.getMinutes(); });
  const [title, setTitle] = useState(season.title || "");
  const [tid, setTid] = useState(season.tournamentId || "");
  const [notice, setNotice] = useState(season.notice || "");
  const [nudge, setNudge] = useState({
    title: season.nudge?.title || "",
    message: season.nudge?.message || "",
    footer: season.nudge?.footer || "",
    cta: season.nudge?.cta || "",
  });
  const setN = (k: string, v: string) => setNudge((o) => ({ ...o, [k]: v }));
  const nudgeDirty =
    nudge.title !== (season.nudge?.title || "") ||
    nudge.message !== (season.nudge?.message || "") ||
    nudge.footer !== (season.nudge?.footer || "") ||
    nudge.cta !== (season.nudge?.cta || "");

  // 미리보기는 지금 화면의 마감 시각을 그대로 쓴다 (저장 전에도 바뀐 게 보이도록)
  const previewDue = (() => { const d = new Date(dueDay); d.setHours(Math.floor(dueMin / 60), dueMin % 60, 0, 0); return d; })();

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
        {/* 이 룸이 어느 대회의 룸인지 — 대회는 서로 겹치지 않으므로 하나만 가리킨다 */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Tournament</span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          </div>
          <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">룸 이름</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="예) 2026 여름 리그"
            className="esp-cut-sm w-full bg-black/40 border border-white/10 px-3 py-2.5 text-[13px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />

          <span className="block text-[10px] font-black esp-mono text-gray-600 mt-4 mb-2">연동할 대회</span>
          <div className="space-y-1.5 max-h-[220px] overflow-y-auto no-bar">
            <button type="button" onClick={() => setTid("")} aria-pressed={!tid}
              className="esp-cut-sm w-full flex items-center gap-2 px-3 py-2.5 border text-left transition-colors"
              style={!tid ? { borderColor: G2, background: `${G2}14` } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
              <span className="text-[12px] font-black text-gray-300">연동 안 함</span>
              <span className="ml-auto text-[10px] font-bold text-gray-600">대회 없이 룸만 운영</span>
            </button>
            {tournaments.map((t: any) => {
              const on = tid === String(t._id);
              return (
                <button key={t._id} type="button" onClick={() => setTid(String(t._id))} aria-pressed={on}
                  className="esp-cut-sm w-full flex items-center gap-2 px-3 py-2.5 border text-left transition-colors"
                  style={on ? { borderColor: G2, background: `${G2}14` } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[12px] font-black truncate">{t.title}</b>
                    <span className="block text-[10px] font-bold text-gray-600 mt-0.5 truncate">{t.tournamentDate || "일정 미정"}</span>
                  </span>
                  {on && <span className="shrink-0 text-[10px] font-black" style={{ color: G2 }}>연동됨</span>}
                </button>
              );
            })}
            {tournaments.length === 0 && <p className="text-[11px] font-bold text-gray-700 py-3">등록된 대회가 없습니다.</p>}
          </div>

          <span className="block text-[10px] font-black esp-mono text-gray-600 mt-4 mb-2">룸 공지 (선택)</span>
          <input value={notice} onChange={(e) => setNotice(e.target.value)} maxLength={200} placeholder="룸 상단에 한 줄로 뜹니다"
            className="esp-cut-sm w-full bg-black/40 border border-white/10 px-3 py-2.5 text-[12px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
        </div>

        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Period</span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          </div>
          {/* 연동 대회에 팀 배정일·대회 당일이 있으면 그 사이(연습 주간)로 한 번에 맞춘다 */}
          {(() => {
            const t = tournaments.find((x: any) => String(x._id) === tid);
            if (!t?.tournamentTeamDay || !t?.tournamentEventDay) return null;
            const from = new Date(t.tournamentTeamDay); from.setDate(from.getDate() + 1);
            const to = new Date(t.tournamentEventDay); to.setDate(to.getDate() - 1);
            const days = Math.round((midnight(to).getTime() - midnight(from).getTime()) / DAY) + 1;
            if (days < 1) return null;
            return (
              <button type="button" onClick={() => { setStart(midnight(from)); setDays(days); }}
                className="esp-cut-sm w-full mb-3 px-3 py-2.5 text-[11px] font-black border transition-colors"
                style={{ borderColor: G2 + "55", color: G2 }}>
                연습 주간으로 맞추기 — {dF(from)} ~ {dF(to)} ({days}일)
              </button>
            );
          })()}
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

        {/* 📌 자동 재촉 — 봇이 미제출자에게 개인 DM 을 보낸다 */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Nudge</span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          </div>
          <p className="text-[11px] font-bold text-gray-600 leading-relaxed mb-4">
            팀 탭의 <b className="text-gray-300">DM 보내기</b> 버튼을 누를 때만 나갑니다. 저절로 보내지지 않습니다.
            빈 칸은 기본 문구로 돌아갑니다.
          </p>

          <div className="space-y-4">
            <div>
              <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">제목</span>
              <input value={nudge.title} onChange={(e) => setN("title", e.target.value)} maxLength={LIMITS.title}
                placeholder={DEFAULTS.title}
                className="esp-cut-sm w-full bg-black/40 border border-white/10 px-3 py-2.5 text-[13px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
            </div>
            <div>
              <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">내용</span>
              <textarea value={nudge.message} onChange={(e) => setN("message", e.target.value)} rows={4} maxLength={LIMITS.body}
                placeholder={DEFAULTS.body}
                className="esp-cut-sm w-full bg-black/40 border border-white/10 px-3 py-2.5 text-[13px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700 resize-none leading-relaxed" />
              <span className="block text-right text-[10px] font-black esp-mono text-gray-700 mt-1 tabular-nums">{nudge.message.length}/{LIMITS.body}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">아래 작은 글씨</span>
                <input value={nudge.footer} onChange={(e) => setN("footer", e.target.value)} maxLength={LIMITS.footer}
                  placeholder={DEFAULTS.footer}
                  className="esp-cut-sm w-full bg-black/40 border border-white/10 px-3 py-2.5 text-[13px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
              </div>
              <div>
                <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">버튼 문구</span>
                <input value={nudge.cta} onChange={(e) => setN("cta", e.target.value)} maxLength={LIMITS.cta}
                  placeholder={DEFAULTS.cta}
                  className="esp-cut-sm w-full bg-black/40 border border-white/10 px-3 py-2.5 text-[13px] font-bold text-white outline-none focus:border-[#00e07b] transition-colors placeholder:text-gray-700" />
              </div>
            </div>
          </div>

          {/* 📌 실제로 나갈 DM 그대로 — 마감·링크는 문구를 직접 써도 항상 붙는다 */}
          <span className="block text-[10px] font-black esp-mono text-gray-600 mt-5 mb-2">이렇게 갑니다</span>
          <DmPreview teamName={sampleTeam || "우리 팀"} dueAt={previewDue} copy={nudge} />
          <div className="flex gap-2 mt-3">
            <button type="button" disabled={busy} onClick={() => onTest(nudge)}
              className="flex-1 esp-cut-sm py-2.5 text-[11px] font-black border transition-colors disabled:opacity-40"
              style={{ borderColor: "rgba(255,255,255,.12)", background: "rgba(255,255,255,.03)", color: "#cbd5e1" }}>
              나에게 먼저 보내보기
            </button>
            {/* 문구만 따로 저장한다 — 기간·시간대를 건드리다 만 상태여도 안전하게 */}
            <button type="button" disabled={busy || !nudgeDirty} onClick={() => onSaveNudge(nudge)}
              className="flex-1 esp-cut-sm py-2.5 text-[11px] font-black transition-all active:scale-[.98] disabled:opacity-35"
              style={{ background: G2, color: "#04120b" }}>
              {nudgeDirty ? "문구 저장" : "저장됨"}
            </button>
          </div>
          <p className="mt-2 text-[11px] font-bold text-gray-600 leading-relaxed">
            저장하지 않은 문구도 그대로 시험해 볼 수 있습니다. 팀 이름과 링크는 받는 사람의 팀에 맞춰 각각 바뀝니다.
          </p>
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
            onSave({
              title, tournamentId: tid, notice, startAt: start.toISOString(), days,
              fromHour: from, toHour: to, stepMin: step, dueAt: due.toISOString(),
              nudge,
            });
          }}
          className="w-full mt-4 esp-cut-sm py-3.5 text-[12px] font-black transition-all active:scale-[.98] disabled:opacity-40"
          style={{ background: G2, color: "#04120b" }}>
          룸 설정 저장
        </button>
        <p className="mt-3 text-[10px] font-bold text-rose-400/70 leading-relaxed">
          기간이나 시간대를 줄이면 그 바깥의 기존 응답은 계산에서 빠집니다.
        </p>
      </aside>
    </div>
  );
}
