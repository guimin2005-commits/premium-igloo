"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { LuxStyles } from "../../../components/Lux";
import { EsportsStyles } from "../../../components/Esports";

const ADMIN_USERS = ["elahw.06"];

const TYPE_LABEL: Record<string, string> = { short: "단답형", long: "장문형", single: "객관식", multi: "복수선택" };

// 문항별 집계
type Agg = { q: any; counts: { label: string; n: number }[]; texts: { name: string; value: string }[]; answered: number };

export default function SurveyStatsPage() {
  const router = useRouter();
  const params = useParams();
  const postId = String(params?.id || "");
  const { data: session, status } = useSession() as any;
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [post, setPost] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [tab, setTab] = useState<"stats" | "list">("stats");
  const [q, setQ] = useState("");                                 // 응답자 검색
  const [detail, setDetail] = useState<any>(null);                // 개별 응답 모달
  const [toast, setToast] = useState("");

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/survey?postId=${postId}&all=1`, { cache: "no-store" });
      const d = await res.json();
      if (res.status === 403) { setDenied(true); return; }
      if (d?.success) { setRows(d.data || []); setPost(d.post || null); }
    } catch { /* noop */ } finally { setLoading(false); }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) { setDenied(true); setLoading(false); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAdmin, postId]);

  // 설명(note) 블록은 응답 대상이 아니라 통계에서 제외
  const questions: any[] = (post?.survey?.questions || []).filter((q: any) => q.type !== "note");

  // ── 집계 ──
  const aggs: Agg[] = useMemo(() => {
    return questions.map((q) => {
      const counts: Record<string, number> = {};
      const texts: { name: string; value: string }[] = [];
      let answered = 0;
      for (const r of rows) {
        const a = (r.answers || []).find((x: any) => x.qid === q.qid);
        const v = a?.value;
        const isEmpty = v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
        if (isEmpty) continue;
        answered++;
        if (q.type === "single" || q.type === "multi") {
          const list = Array.isArray(v) ? v : [v];
          for (const item of list) {
            // '기타: xxx' 는 '기타'로 묶고 원문은 아래 목록에 남김
            const key = String(item).startsWith("기타:") ? "기타(직접 입력)" : String(item);
            counts[key] = (counts[key] || 0) + 1;
            if (String(item).startsWith("기타:")) texts.push({ name: r.userName || "-", value: String(item).replace(/^기타:\s*/, "") });
          }
        } else {
          texts.push({ name: r.userName || "-", value: Array.isArray(v) ? v.join(", ") : String(v) });
        }
      }
      // 정의된 선택지 순서 우선, 그 뒤 기타
      const ordered: { label: string; n: number }[] = [];
      for (const opt of q.options || []) ordered.push({ label: opt, n: counts[opt] || 0 });
      for (const k of Object.keys(counts)) if (!(q.options || []).includes(k)) ordered.push({ label: k, n: counts[k] });
      return { q, counts: ordered, texts, answered };
    });
  }, [questions, rows]);

  const filteredRows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((r) =>
      (r.userName || "").toLowerCase().includes(kw) ||
      (r.answers || []).some((a: any) => String(Array.isArray(a.value) ? a.value.join(" ") : a.value || "").toLowerCase().includes(kw))
    );
  }, [rows, q]);

  // ── CSV 내보내기 ──
  const exportCsv = () => {
    const head = ["번호", "닉네임", "디스코드 ID", "제출시각", ...questions.map((x) => x.label)];
    const esc = (s: any) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(",")];
    rows.slice().reverse().forEach((r, i) => {
      const cells = [
        i + 1, r.userName || "", r.userId || "", new Date(r.createdAt).toLocaleString("ko-KR"),
        ...questions.map((qq) => {
          const a = (r.answers || []).find((x: any) => x.qid === qq.qid);
          const v = a?.value;
          return Array.isArray(v) ? v.join(" / ") : v || "";
        }),
      ];
      lines.push(cells.map(esc).join(","));
    });
    // 엑셀 한글 깨짐 방지용 BOM
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(post?.title || "설문").replace(/[\\/:*?"<>|]/g, "")}_응답_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("CSV 파일을 내려받았습니다.");
  };

  const copyIds = () => {
    const ids = rows.map((r) => r.userName).filter(Boolean).join("\n");
    navigator.clipboard.writeText(ids);
    notify(`참가자 ${rows.length}명의 닉네임을 복사했습니다.`);
  };

  const removeOne = async (r: any) => {
    if (!confirm(`${r.userName || "해당 유저"}님의 응답을 삭제하시겠습니까?\n삭제 후에는 되돌릴 수 없습니다.`)) return;
    const d = await fetch(`/api/survey?id=${r._id}`, { method: "DELETE" }).then((x) => x.json());
    if (d.success) { setRows((p) => p.filter((x) => x._id !== r._id)); setDetail(null); notify("응답을 삭제했습니다."); }
    else notify(d.message || "삭제에 실패했습니다.");
  };

  // ── 접근 제한 ──
  if (denied) {
    return (
      <main className="flex-1 w-full flex items-center justify-center px-6 py-32">
        <LuxStyles />
        <EsportsStyles />
        <div className="text-center">
          <p className="text-[10px] font-black tracking-[0.4em] text-gray-600 uppercase mb-4">Restricted</p>
          <h1 className="text-2xl font-black text-white mb-3">열람 권한이 없습니다</h1>
          <p className="text-sm text-gray-500 mb-8">설문 응답과 통계는 운영진만 확인할 수 있습니다.</p>
          <button onClick={() => router.push("/tournament")} className="text-xs font-black text-white bg-white/10 hover:bg-white/15 px-6 py-3 rounded-full transition-colors">대회 목록으로</button>
        </div>
      </main>
    );
  }

  const total = rows.length;
  const closed = !!post?.survey?.closed;

  return (
    <main className="flex-1 w-full flex flex-col relative">
      <LuxStyles />
      <EsportsStyles />

      {/* ── 헤더 ── */}
      <section className="relative w-full pt-14 pb-8 px-6 border-b border-white/[0.08]">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none" />
        <div className="max-w-6xl mx-auto relative z-10">
          <button onClick={() => router.push("/tournament")} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-white transition-colors mb-6">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            대회 목록
          </button>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-px bg-[#00e07b]" />
                <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Survey Result</span>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${closed ? "bg-white/10 text-gray-400 border border-white/15" : "bg-[#00e07b]/15 text-[#00e07b] border border-[#00e07b]/25"}`}>{closed ? "접수 마감" : "접수 중"}</span>
              </div>
              <h1 className="text-2xl md:text-4xl font-black tracking-tight text-white leading-tight break-keep">{post?.survey?.title || post?.title || "설문 결과"}</h1>
              <p className="text-sm text-gray-500 mt-2">{post?.title}{post?.tournamentGame ? ` · ${post.tournamentGame}` : ""}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={copyIds} disabled={!total} className="text-[11px] font-black text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 px-4 py-2.5 esp-cut-sm transition-colors">참가자 닉네임 복사</button>
              <button onClick={exportCsv} disabled={!total} className="text-[11px] font-black text-[#04120b] bg-[#00e07b] hover:bg-[#3dffa6] disabled:opacity-40 px-4 py-2.5 esp-cut-sm transition-colors">CSV 내려받기</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 요약 지표 (헤어라인 그리드) ── */}
      <section className="w-full px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 border-b border-white/[0.08] md:divide-x divide-white/[0.08]">
          {[
            { k: "총 응답", v: total, s: "명" },
            { k: "문항 수", v: questions.length, s: "개" },
            { k: "최근 제출", v: rows[0] ? new Date(rows[0].createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) : "-", s: "" },
            { k: "평균 응답률", v: questions.length && total ? Math.round((aggs.reduce((s, a) => s + a.answered, 0) / (questions.length * total)) * 100) : 0, s: "%" },
          ].map((m, i) => (
            <div key={i} className={`py-6 md:px-6 ${i % 2 === 1 ? "pl-5 border-l border-white/[0.08] md:border-l-0 md:pl-6" : ""} ${i < 2 ? "border-b md:border-b-0 border-white/[0.08]" : ""}`}>
              <p className="text-[10px] font-black tracking-[0.2em] text-gray-600 uppercase mb-2">{m.k}</p>
              <p className="text-2xl md:text-3xl font-black text-white tabular-nums">{m.v}<span className="text-sm text-gray-500 ml-1">{m.s}</span></p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 탭 ── */}
      <div className="w-full px-6 sticky top-16 z-20 bg-[#090909]/85 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-6xl mx-auto flex gap-6">
          {[{ id: "stats", label: "문항별 통계" }, { id: "list", label: `개별 응답 (${total})` }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id as any)} className={`relative py-4 text-sm font-black transition-colors ${tab === t.id ? "text-white" : "text-gray-600 hover:text-gray-400"}`}>
              {t.label}
              {tab === t.id && <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-[#00e07b]" />}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-6xl mx-auto px-6 py-10 flex-1">
        {loading ? (
          <p className="text-center py-24 text-sm text-gray-500 font-bold">불러오는 중…</p>
        ) : total === 0 ? (
          <div className="text-center py-24">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl border border-white/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586" /></svg>
            </div>
            <p className="text-white font-black text-lg mb-2">아직 접수된 응답이 없습니다</p>
            <p className="text-sm text-gray-500">참가자가 신청서를 제출하면 이곳에 통계가 표시됩니다.</p>
          </div>
        ) : tab === "stats" ? (
          /* ── 문항별 통계 ── */
          <div className="space-y-10">
            {aggs.map((a, qi) => {
              const max = Math.max(1, ...a.counts.map((c) => c.n));
              const isChoice = a.q.type === "single" || a.q.type === "multi";
              return (
                <div key={a.q.qid}>
                  <div className="flex items-start gap-3 pb-3 border-b border-white/[0.08]">
                    <span className="shrink-0 mt-0.5 text-[11px] font-black text-gray-600 tabular-nums">{String(qi + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-black text-white leading-snug break-keep">{a.q.label}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        <span className="text-[10px] font-black tracking-wider text-gray-600 uppercase">{TYPE_LABEL[a.q.type] || a.q.type}</span>
                        <span className="text-[10px] font-bold text-gray-600 border-l border-white/15 pl-3">응답 {a.answered} / {total}</span>
                        {a.q.required && <span className="text-[10px] font-bold text-red-400/80 border-l border-white/15 pl-3">필수</span>}
                      </div>
                    </div>
                  </div>

                  {isChoice ? (
                    <div className="pt-5 space-y-2.5">
                      {a.counts.length === 0 && <p className="text-sm text-gray-600">응답 없음</p>}
                      {a.counts.map((c, ci) => {
                        const pct = a.answered ? Math.round((c.n / a.answered) * 100) : 0;
                        return (
                          <div key={ci} className="flex items-center gap-4">
                            <p className="w-32 sm:w-44 shrink-0 text-[13px] font-bold text-gray-300 truncate" title={c.label}>{c.label}</p>
                            <div className="flex-1 h-7 bg-white/[0.03] relative overflow-hidden">
                              <div
                                className={`h-full transition-all duration-700 ${c.n === max && c.n > 0 ? "bg-[#00e07b]/70" : "bg-white/15"}`}
                                style={{ width: `${(c.n / max) * 100}%` }}
                              />
                            </div>
                            <p className="w-20 shrink-0 text-right text-[13px] font-black text-white tabular-nums">
                              {c.n}<span className="text-gray-600 font-bold ml-1.5 text-[11px]">{pct}%</span>
                            </p>
                          </div>
                        );
                      })}
                      {/* 기타 직접 입력 원문 */}
                      {a.texts.length > 0 && (
                        <div className="pt-4 mt-2 border-t border-white/[0.06]">
                          <p className="text-[10px] font-black tracking-[0.2em] text-gray-600 uppercase mb-2.5">기타 입력 내용</p>
                          <div className="space-y-1.5">
                            {a.texts.map((t, ti) => (
                              <p key={ti} className="text-sm text-gray-300 border-l border-white/10 pl-3">
                                <span className="text-gray-600 text-xs mr-2">{t.name}</span>{t.value}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="pt-5">
                      {a.texts.length === 0 ? (
                        <p className="text-sm text-gray-600">응답 없음</p>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-x-8">
                          {a.texts.map((t, ti) => (
                            <div key={ti} className="py-2.5 border-b border-white/[0.06] flex gap-3">
                              <span className="shrink-0 w-24 text-xs font-bold text-gray-600 truncate">{t.name}</span>
                              <span className="text-sm text-gray-200 break-words min-w-0">{t.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── 개별 응답 목록 ── */
          <div>
            <div className="flex items-center gap-3 mb-5">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="닉네임 또는 답변 내용 검색"
                className="flex-1 bg-transparent border-b border-white/10 focus:border-[#00e07b]/60 px-1 py-3 text-base text-white placeholder-gray-600 outline-none transition-colors"
              />
              <span className="text-xs font-bold text-gray-600 shrink-0 tabular-nums">{filteredRows.length} / {total}</span>
            </div>

            <div className="border-t border-white/[0.08]">
              {filteredRows.map((r, i) => (
                <button
                  key={r._id}
                  onClick={() => setDetail(r)}
                  className="w-full text-left flex items-center gap-4 px-1 py-4 border-b border-white/[0.08] hover:bg-white/[0.02] transition-colors group"
                >
                  <span className="w-8 shrink-0 text-xs font-black text-gray-700 tabular-nums">{String(total - rows.indexOf(r)).padStart(2, "0")}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.avatar ? <img src={r.avatar} alt="" className="w-9 h-9 rounded-full shrink-0" /> : <span className="w-9 h-9 rounded-full bg-white/10 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-white truncate group-hover:text-[#00e07b] transition-colors">{r.userName || "알 수 없음"}</span>
                    <span className="block text-xs text-gray-600 truncate mt-0.5">
                      {(r.answers || []).slice(0, 3).map((a: any) => (Array.isArray(a.value) ? a.value.join(", ") : a.value)).filter(Boolean).join(" · ") || "-"}
                    </span>
                  </span>
                  <span className="hidden sm:block shrink-0 text-[11px] text-gray-600 tabular-nums">{new Date(r.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <svg className="w-4 h-4 shrink-0 text-gray-700 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                </button>
              ))}
              {filteredRows.length === 0 && <p className="py-16 text-center text-sm text-gray-600">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}
      </div>

      {/* ── 개별 응답 상세 ── */}
      {detail && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm sm:p-4" onClick={() => setDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#101010] border border-white/10 w-full max-w-xl rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
            <div className="shrink-0 flex items-center gap-3 px-6 py-5 border-b border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {detail.avatar ? <img src={detail.avatar} alt="" className="w-10 h-10 rounded-full" /> : <span className="w-10 h-10 rounded-full bg-white/10" />}
              <div className="min-w-0 flex-1">
                <p className="text-base font-black text-white truncate">{detail.userName || "알 수 없음"}</p>
                <p className="text-[11px] text-gray-500">{new Date(detail.createdAt).toLocaleString("ko-KR")}</p>
              </div>
              <button onClick={() => setDetail(null)} className="shrink-0 p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
              {(detail.answers || []).map((a: any, i: number) => (
                <div key={i} className="py-3.5 border-b border-white/[0.07] last:border-0">
                  <p className="text-[11px] font-black tracking-wider text-gray-600 mb-1.5">{a.label}</p>
                  <p className="text-sm text-gray-100 whitespace-pre-wrap break-words">{Array.isArray(a.value) ? (a.value.join(", ") || "-") : (a.value || "-")}</p>
                </div>
              ))}
            </div>
            <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-white/10 bg-[#0d0d0d]">
              <button onClick={() => { navigator.clipboard.writeText(detail.userName || ""); notify("닉네임을 복사했습니다."); }} className="flex-1 py-3 rounded-xl text-sm font-bold bg-white/5 hover:bg-white/10 text-gray-300 transition-colors">닉네임 복사</button>
              <button onClick={() => removeOne(detail)} className="px-5 py-3 rounded-xl text-sm font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors">응답 삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-white text-black text-sm font-black px-5 py-3 rounded-full shadow-2xl animate-in fade-in">{toast}</div>
      )}
    </main>
  );
}
