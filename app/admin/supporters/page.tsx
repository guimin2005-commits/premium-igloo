"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../../components/Lux";
import {
  inputClass,
  FilterChips,
  EmptyRow,
  ListFrame,
  Btn,
  Toggle,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
  AdminHero,
  AdminTabs,
  TableScroll,
} from "../ui";

// 📌 서포터즈 관리 화면 — 두 탭(?tab=).
//    평가: 역할 보유자 전원의 그 달 활동(채팅·음성)을 한 표로 놓고 등급·XP·POINT·코멘트를
//          적어 임시 저장(draft)한 뒤, 확인을 거쳐 지급(paid)한다. 활동량은 근거일 뿐 금액을
//          정하는 건 관리자다 — 그래서 자동 계산 없이 입력칸으로 둔다. 지급은 되돌릴 수 없어 paid 행은 잠근다.
//    신고·피드백: 서포터즈가 올린 유저 신고·피드백을 읽고 답변·처리 상태를 남긴다.

type Eval = {
  grade: string;
  xp: number;
  point: number;
  note: string;
  status: "draft" | "paid";
  paidAt?: string | null;
};
type Row = {
  userId: string;
  name: string;
  avatar: string;
  chatCount: number;
  voiceMin: number;
  eval: Eval | null;
};
// 입력 도중에는 숫자 칸을 비울 수 있어야 해서 문자열로 들고 있다가 저장할 때 숫자로 바꾼다
type Edit = { grade: string; xp: string; point: string; note: string };
type Goals = { chat: number; voiceMin: number };

type ReportType = "report" | "feedback";
type ReportStatus = "open" | "done";
type ReportFilter = ReportStatus | "all";
type Report = {
  _id: string;
  userId: string;
  userName: string;
  type: ReportType;
  target: string;
  content: string;
  status: ReportStatus;
  adminReply: string;
  repliedAt: string | null;
  createdAt: string;
};

type TabId = "eval" | "reports";
const TAB_META: Record<TabId, { short: string; title: string }> = {
  eval: { short: "평가", title: "서포터즈 평가" },
  reports: { short: "신고·피드백", title: "서포터즈 신고·피드백" },
};

// 서버(SupporterEval.note / SupporterReport.adminReply)가 1000자에서 자르므로 화면도 같은 값으로 막는다
const NOTE_MAX = 1000;
const REPLY_MAX = 1000;
const NOTE_PREVIEW = 40;

const KST = 9 * 60 * 60 * 1000;
// 서버 집계가 KST 월 경계라 칩의 값도 KST 로 만든다 — 월말 밤에 UTC 로 만들면 한 달이 어긋난다
const monthKeyKST = (offset = 0) => {
  const n = new Date(Date.now() + KST);
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const toInt = (v: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const fmtDate = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDateTime = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${fmtDate(v)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// 저장 여부 비교용 지문 — 서버로 나가는 값만 담는다
const sig = (e: Edit) =>
  JSON.stringify({ grade: e.grade.trim(), xp: toInt(e.xp), point: toInt(e.point), note: e.note.trim() });

const editOf = (ev: Eval | null, baseXp: number): Edit =>
  ev
    ? { grade: ev.grade || "", xp: String(ev.xp ?? 0), point: String(ev.point ?? 0), note: ev.note || "" }
    : { grade: "", xp: String(baseXp), point: "0", note: "" };

const pct = (value: number, goal: number) => Math.round((value / goal) * 100);

// 표 한 칸에는 앞 40자만 — 줄바꿈은 칸 높이를 흔들어서 공백으로 편다
const notePreview = (note: string) => {
  const flat = note.replace(/\s+/g, " ").trim();
  return flat.length > NOTE_PREVIEW ? `${flat.slice(0, NOTE_PREVIEW)}…` : flat;
};

const normReport = (r: any): Report => ({
  _id: String(r._id || ""),
  userId: String(r.userId || ""),
  userName: r.userName || r.userId || "",
  type: r.type === "feedback" ? "feedback" : "report",
  target: r.target || "",
  content: r.content || "",
  status: r.status === "done" ? "done" : "open",
  adminReply: r.adminReply || "",
  repliedAt: r.repliedAt || null,
  createdAt: r.createdAt || "",
});

const TYPE_BADGE: Record<ReportType, { l: string; c: string }> = {
  report: { l: "신고", c: "bg-[#e91e3f]/15 text-[#e91e3f]" },
  feedback: { l: "피드백", c: "bg-[#3f83b8]/15 text-[#3f83b8]" },
};

export default function AdminSupportersPage() {
  // 화면 가리개일 뿐이다 — 실제 방어는 /api/admin/supporters* 가 서버에서 한 번 더 한다
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  const searchParams = useSearchParams();
  const tab: TabId = searchParams.get("tab") === "reports" ? "reports" : "eval";

  const thisMonth = useMemo(() => monthKeyKST(0), []);
  const lastMonth = useMemo(() => monthKeyKST(-1), []);
  const [month, setMonth] = useState(thisMonth);

  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [goals, setGoals] = useState<Goals>({ chat: 0, voiceMin: 0 });
  const [baseXp, setBaseXp] = useState(150000);
  const [roleId, setRoleId] = useState("");

  // 행 편집은 로컬에만 두고 저장 버튼을 눌러야 서버로 간다
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [savingId, setSavingId] = useState("");
  const [payTarget, setPayTarget] = useState<Row | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  // 코멘트 모달 — 반영을 눌러야 행 편집(edits)에 들어가고, 서버 저장은 기존 저장 버튼이 한다
  const [noteTarget, setNoteTarget] = useState<Row | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  // ── 신고·피드백 ───────────────────────────────
  const [reportFilter, setReportFilter] = useState<ReportFilter>("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [reportCounts, setReportCounts] = useState({ open: 0, done: 0 });
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsFailed, setReportsFailed] = useState(false);
  const [expandedId, setExpandedId] = useState("");
  const [replyTarget, setReplyTarget] = useState<Report | null>(null);
  const [delTarget, setDelTarget] = useState<Report | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // 작성자는 답변이 달리면 못 지우므로(규칙), 답변한 뒤에 정리할 길은 관리자 삭제뿐이다
  const deleteReport = async () => {
    if (!delTarget || isDeleting) return;
    setIsDeleting(true);
    const res = await fetch(`/api/admin/supporters/reports?id=${encodeURIComponent(delTarget._id)}`, { method: "DELETE" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) {
      setReports((prev) => prev.filter((x) => x._id !== delTarget._id));
      notify("삭제했습니다.");
    } else {
      notify(d?.error || "삭제하지 못했습니다.", true);
    }
    setDelTarget(null);
    setIsDeleting(false);
  };
  const [replyText, setReplyText] = useState("");
  const [replyDone, setReplyDone] = useState(false);
  const [isReplying, setIsReplying] = useState(false);

  const fetchRows = useCallback(
    (m: string) => {
      setIsLoading(true);
      fetch(`/api/admin/supporters?month=${m}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null)
        .then((d) => {
          if (d?.success && Array.isArray(d.rows)) {
            const base = toInt(d.baseXp) || 150000;
            const list: Row[] = d.rows.map((r: any) => ({
              userId: String(r.userId || ""),
              name: r.name || r.userId || "",
              avatar: r.avatar || "",
              chatCount: toInt(r.chatCount),
              voiceMin: toInt(r.voiceMin),
              eval: r.eval
                ? {
                    grade: r.eval.grade || "",
                    xp: toInt(r.eval.xp),
                    point: toInt(r.eval.point),
                    note: r.eval.note || "",
                    status: r.eval.status === "paid" ? "paid" : "draft",
                    paidAt: r.eval.paidAt || null,
                  }
                : null,
            }));
            setRows(list);
            setGoals({ chat: toInt(d.goals?.chat), voiceMin: toInt(d.goals?.voiceMin) });
            setBaseXp(base);
            setRoleId(d.roleId || "");
            // 📌 월을 바꾸면 편집 중이던 값은 버린다 — 같은 userId 라도 다른 달의 평가라 섞이면 안 된다
            setEdits(Object.fromEntries(list.map((r) => [r.userId, editOf(r.eval, base)])));
            setLoadFailed(false);
          } else {
            setRows([]);
            setEdits({});
            setLoadFailed(true);
          }
        })
        .finally(() => setIsLoading(false));
    },
    []
  );

  useEffect(() => {
    if (isAdmin) fetchRows(month);
  }, [isAdmin, month, fetchRows]);

  // 탭과 무관하게 한 번은 받는다 — 평가 탭에 있어도 탭 이름 옆 미처리 건수는 보여야 한다
  const fetchReports = useCallback((filter: ReportFilter) => {
    setReportsLoading(true);
    fetch(`/api/admin/supporters/reports?status=${filter}`, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (d?.success && Array.isArray(d.reports)) {
          setReports(d.reports.map(normReport));
          setReportCounts({ open: toInt(d.counts?.open), done: toInt(d.counts?.done) });
          setReportsFailed(false);
        } else {
          setReports([]);
          setReportsFailed(true);
        }
      })
      .finally(() => setReportsLoading(false));
  }, []);

  useEffect(() => {
    if (isAdmin) fetchReports(reportFilter);
  }, [isAdmin, reportFilter, fetchReports]);

  const setEdit = (userId: string, patch: Partial<Edit>) =>
    setEdits((prev) => ({ ...prev, [userId]: { ...(prev[userId] || editOf(null, baseXp)), ...patch } }));

  // ── 코멘트 모달 ──────────────────────────────
  const openNote = (row: Row) => {
    const e = edits[row.userId] || editOf(row.eval, baseXp);
    setNoteDraft(e.note);
    setNoteTarget(row);
  };
  const applyNote = () => {
    if (!noteTarget) return;
    if (noteTarget.eval?.status !== "paid") setEdit(noteTarget.userId, { note: noteDraft.slice(0, NOTE_MAX) });
    setNoteTarget(null);
  };

  // ── 저장 (draft) ─────────────────────────────
  const saveRow = async (row: Row) => {
    if (savingId) return;
    const e = edits[row.userId] || editOf(row.eval, baseXp);
    setSavingId(row.userId);
    const res = await fetch("/api/admin/supporters", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: row.userId,
        userName: row.name,
        month,
        grade: e.grade.trim(),
        xp: toInt(e.xp),
        point: toInt(e.point),
        note: e.note.trim(),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingId("");

    if (res?.ok && d?.success) {
      // 응답에 평가가 실리면 그것을, 아니면 방금 보낸 값을 draft 로 반영한다
      const saved: Eval = d.eval
        ? {
            grade: d.eval.grade || "",
            xp: toInt(d.eval.xp),
            point: toInt(d.eval.point),
            note: d.eval.note || "",
            status: d.eval.status === "paid" ? "paid" : "draft",
            paidAt: d.eval.paidAt || null,
          }
        : { grade: e.grade.trim(), xp: toInt(e.xp), point: toInt(e.point), note: e.note.trim(), status: "draft", paidAt: null };
      setRows((prev) => prev.map((r) => (r.userId === row.userId ? { ...r, eval: saved } : r)));
      setEdits((prev) => ({ ...prev, [row.userId]: editOf(saved, baseXp) }));
      notify(`${row.name} · ${month} 평가를 저장했습니다.`);
    } else if (res?.status === 409) {
      // 이미 지급된 평가 — 화면이 낡았을 수 있으니 다시 받아 잠근다
      notify("이미 지급된 평가라 수정할 수 없습니다.", true);
      fetchRows(month);
    } else {
      notify(d?.message || d?.error || "저장에 실패했습니다.", true);
    }
  };

  // ── 지급 (draft → paid) ───────────────────────
  const doPay = async () => {
    if (!payTarget || isPaying) return;
    setIsPaying(true);
    const res = await fetch("/api/admin/supporters/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: payTarget.userId, month }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsPaying(false);

    if (res?.ok && d?.success) {
      const name = payTarget.name;
      setPayTarget(null);
      // paidAt 은 서버가 찍는다 — 다시 받아서 잠금과 날짜를 맞춘다
      fetchRows(month);
      notify(`${name} · ${month} 보상을 지급했습니다.`);
    } else {
      notify(d?.message || d?.error || "지급에 실패했습니다.", true);
    }
  };

  // ── 답변 모달 ────────────────────────────────
  const openReply = (r: Report) => {
    setReplyText(r.adminReply);
    setReplyDone(r.status === "done");
    setReplyTarget(r);
  };
  const sendReply = async () => {
    if (!replyTarget || isReplying) return;
    const text = replyText.trim().slice(0, REPLY_MAX);
    const status: ReportStatus = replyDone ? "done" : "open";
    // 답변이 그대로면 보내지 않는다 — 서버가 adminReply 를 받으면 repliedAt 을 새로 찍는다
    const body: { id: string; status: ReportStatus; adminReply?: string } = { id: replyTarget._id, status };
    if (text !== replyTarget.adminReply) body.adminReply = text;

    setIsReplying(true);
    const res = await fetch("/api/admin/supporters/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsReplying(false);

    if (res?.ok && d?.success) {
      const saved: Report = d.report
        ? normReport({ ...replyTarget, ...d.report })
        : { ...replyTarget, status, adminReply: text, repliedAt: text ? new Date().toISOString() : replyTarget.repliedAt };
      const before = replyTarget.status;
      // 지금 칩과 안 맞게 된 건은 목록에서 빼고, 건수는 서버를 다시 부르지 않고 차이만 옮긴다
      setReports((prev) =>
        prev.flatMap((r) => (r._id !== saved._id ? [r] : reportFilter === "all" || reportFilter === saved.status ? [saved] : []))
      );
      if (before !== saved.status) {
        setReportCounts((c) => ({
          open: Math.max(0, c.open + (saved.status === "open" ? 1 : -1)),
          done: Math.max(0, c.done + (saved.status === "done" ? 1 : -1)),
        }));
      }
      setReplyTarget(null);
      notify(saved.status === "done" ? "답변을 저장하고 처리됨으로 표시했습니다." : "답변을 저장했습니다.");
    } else {
      notify(d?.message || d?.error || "저장에 실패했습니다.", true);
    }
  };

  if (gate) return gate;

  const hasGoal = goals.chat > 0 || goals.voiceMin > 0;
  const evaluated = rows.filter((r) => r.eval).length;
  const paid = rows.filter((r) => r.eval?.status === "paid").length;
  // 지급은 서버에 저장된 draft 로 나가므로 모달도 편집칸이 아니라 저장본을 보여 준다
  const payEval = payTarget?.eval || null;
  const dlLabel = "text-xs font-bold text-[#5a5a5a] shrink-0";
  const noteLocked = noteTarget?.eval?.status === "paid";

  // AdminTabs 는 글자만 받는다 — 미처리 건수는 shop 의 "대기 N" 처럼 이름 뒤에 붙인다
  const tabs = (Object.keys(TAB_META) as TabId[]).map((id) => ({
    id,
    short: id === "reports" && reportCounts.open > 0 ? `${TAB_META[id].short} ${reportCounts.open}` : TAB_META[id].short,
  }));

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      <AdminHero size="lg" title={TAB_META[tab].title} />
      <AdminTabs tabs={tabs} current={tab} hrefOf={(id) => `/admin/supporters?tab=${id}`} />

      <div className="w-full max-w-6xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-10">
        {/* ═══ 평가 ═══ */}
        {tab === "eval" && (
          <>
            {loadFailed && (
              <div className="px-4 py-3 rounded-lg border border-[#e91e3f]/30 bg-[#e91e3f]/[0.06] text-[12px] font-bold text-[#c2183a] break-keep">
                목록을 불러오지 못했습니다 (/api/admin/supporters 응답 없음).
                <button onClick={() => fetchRows(month)} className="ml-2 underline underline-offset-2 outline-none focus:outline-none">다시 불러오기</button>
              </div>
            )}

            <Reveal>
              <section>
                {/* flex-col 에서는 gap 이 안 먹는다(Tailwind v4) — 세로 간격은 mb 로 */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between md:gap-4 mb-6">
                  <div className="flex items-center gap-3 mb-3 md:mb-0">
                    <FilterChips
                      options={[
                        { v: thisMonth, l: "이번 달" },
                        { v: lastMonth, l: "지난 달" },
                      ]}
                      value={month}
                      onChange={setMonth}
                    />
                    <span className="text-[12px] font-black text-[#131313] tabular-nums shrink-0">{month}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-[#5a5a5a] tabular-nums">
                    <span>인원 <b className="text-[#131313]">{rows.length}</b></span>
                    <span>평가 완료 <b className="text-[#131313]">{evaluated}</b></span>
                    <span>지급 완료 <b className="text-[#131313]">{paid}</b></span>
                    {hasGoal && (
                      <span>
                        목표{goals.chat > 0 && <> 채팅 <b className="text-[#131313]">{goals.chat.toLocaleString()}</b></>}
                        {goals.voiceMin > 0 && <> 음성 <b className="text-[#131313]">{goals.voiceMin.toLocaleString()}분</b></>}
                      </span>
                    )}
                  </div>
                </div>

                {isLoading ? (
                  <div className="py-10 text-center text-[#8a8a8a] text-sm">불러오는 중...</div>
                ) : loadFailed ? (
                  <EmptyRow>목록을 불러오지 못했습니다.</EmptyRow>
                ) : !roleId && rows.length === 0 ? (
                  <EmptyRow>
                    서포터즈 역할이 지정되지 않았습니다.{" "}
                    <Link href="/admin/bot?tab=roles&sec=supporter" className="text-[#e91e3f] font-bold underline underline-offset-2">
                      역할 지정
                    </Link>
                  </EmptyRow>
                ) : rows.length === 0 ? (
                  <EmptyRow>서포터즈 역할을 가진 멤버가 없습니다.</EmptyRow>
                ) : (
                  <TableScroll>
                    {/* ⚠️ min-w-[1120px] 는 빌드 CSS 에 안 생겨 표가 안 넘쳤다 — 최소폭은 인라인으로 */}
                    <div style={{ minWidth: 1120 }}>
                      <div className="flex items-center gap-3 pb-2.5 text-[10px] font-black tracking-[0.12em] text-[#a3a3a3]">
                        <span className="w-44 shrink-0">서포터즈</span>
                        <span className="w-14 shrink-0 text-right">채팅</span>
                        <span className="w-16 shrink-0 text-right">음성</span>
                        <span className="w-20 shrink-0 text-right">달성률</span>
                        <span className="w-16 shrink-0">등급</span>
                        <span className="w-32 shrink-0">XP</span>
                        <span className="w-28 shrink-0">POINT</span>
                        <span className="flex-1 min-w-0">코멘트</span>
                        <span className="w-28 shrink-0">상태</span>
                        <span className="w-36 shrink-0 text-right">처리</span>
                      </div>

                      <ListFrame>
                        {rows.map((r) => {
                          const e = edits[r.userId] || editOf(r.eval, baseXp);
                          const locked = r.eval?.status === "paid";
                          const dirty = r.eval ? sig(e) !== sig(editOf(r.eval, baseXp)) : true;
                          const canSave = !locked && dirty && !savingId;
                          // 지급은 서버에 저장된 draft 를 기준으로 나간다 — 안 저장한 편집이 있으면 먼저 저장하게 막는다
                          const canPay = r.eval?.status === "draft" && !dirty && !savingId;
                          const busy = savingId === r.userId;
                          const cell = `${inputClass} disabled:opacity-40`;
                          const preview = notePreview(e.note);
                          return (
                            <div key={r.userId} className="flex items-center gap-3 py-3">
                              <span className="w-44 shrink-0 flex items-center gap-2.5 min-w-0">
                                {r.avatar ? (
                                  <img src={r.avatar} alt="" className="w-8 h-8 rounded-full bg-[#dedddb] object-cover shrink-0" />
                                ) : (
                                  <span className="w-8 h-8 rounded-full bg-[#dedddb] shrink-0"></span>
                                )}
                                <span className="min-w-0">
                                  <span className="block text-[13px] font-bold text-[#131313] truncate">{r.name}</span>
                                  <span className="block text-[10px] text-[#a3a3a3] tabular-nums truncate">{r.userId}</span>
                                </span>
                              </span>
                              <span className="w-14 shrink-0 text-right text-[13px] font-black text-[#131313] tabular-nums">
                                {r.chatCount.toLocaleString()}
                              </span>
                              <span className="w-16 shrink-0 text-right text-[13px] font-black text-[#131313] tabular-nums">
                                {r.voiceMin.toLocaleString()}<span className="text-[10px] font-bold text-[#8a8a8a]">분</span>
                              </span>
                              <span className="w-20 shrink-0 text-right tabular-nums">
                                {!hasGoal ? (
                                  <span className="text-[12px] text-[#a3a3a3]">-</span>
                                ) : (
                                  <>
                                    {goals.chat > 0 && (
                                      <span className={`block text-[11px] font-bold ${pct(r.chatCount, goals.chat) >= 100 ? "text-[#e91e3f]" : "text-[#5a5a5a]"}`}>
                                        채팅 {pct(r.chatCount, goals.chat)}%
                                      </span>
                                    )}
                                    {goals.voiceMin > 0 && (
                                      <span className={`block text-[11px] font-bold ${pct(r.voiceMin, goals.voiceMin) >= 100 ? "text-[#e91e3f]" : "text-[#5a5a5a]"}`}>
                                        음성 {pct(r.voiceMin, goals.voiceMin)}%
                                      </span>
                                    )}
                                  </>
                                )}
                              </span>
                              <span className="w-16 shrink-0">
                                <input
                                  type="text"
                                  value={e.grade}
                                  maxLength={8}
                                  placeholder="A"
                                  disabled={locked || busy}
                                  onChange={(ev) => setEdit(r.userId, { grade: ev.target.value })}
                                  className={cell}
                                />
                              </span>
                              <span className="w-32 shrink-0">
                                <input
                                  type="number"
                                  min={0}
                                  value={e.xp}
                                  placeholder={String(baseXp)}
                                  disabled={locked || busy}
                                  onChange={(ev) => setEdit(r.userId, { xp: ev.target.value })}
                                  className={cell}
                                />
                              </span>
                              <span className="w-28 shrink-0">
                                <input
                                  type="number"
                                  min={0}
                                  value={e.point}
                                  placeholder="0"
                                  disabled={locked || busy}
                                  onChange={(ev) => setEdit(r.userId, { point: ev.target.value })}
                                  className={cell}
                                />
                              </span>
                              <span className="flex-1 min-w-0 flex items-center gap-2">
                                <span
                                  className={`flex-1 min-w-0 truncate text-[12px] ${preview ? "text-[#131313]" : "text-[#a3a3a3]"}`}
                                  title={preview ? e.note : undefined}
                                >
                                  {preview || "없음"}
                                </span>
                                {/* 처리 열의 Btn 과 크기가 겹치지 않게 목록 행의 글자 단추(shop 의 수정·삭제)와 같은 모양으로 */}
                                <button
                                  type="button"
                                  onClick={() => openNote(r)}
                                  disabled={busy}
                                  className="shrink-0 text-xs font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors disabled:opacity-40 outline-none focus:outline-none"
                                >
                                  코멘트
                                </button>
                              </span>
                              <span className="w-28 shrink-0">
                                {locked ? (
                                  <>
                                    <span className="block text-[11px] font-black text-[#e91e3f]">지급 완료</span>
                                    <span className="block text-[10px] text-[#8a8a8a] tabular-nums">{fmtDate(r.eval?.paidAt)}</span>
                                  </>
                                ) : r.eval ? (
                                  <>
                                    <span className="block text-[11px] font-black text-[#131313]">저장됨</span>
                                    {dirty && <span className="block text-[10px] font-bold text-[#e91e3f]">저장되지 않은 변경</span>}
                                  </>
                                ) : (
                                  <span className="text-[11px] font-bold text-[#a3a3a3]">미평가</span>
                                )}
                              </span>
                              <span className="w-36 shrink-0 flex items-center justify-end gap-2">
                                <Btn variant="ghost" onClick={() => saveRow(r)} disabled={!canSave}>
                                  {busy ? "저장 중" : "저장"}
                                </Btn>
                                <Btn
                                  onClick={() => setPayTarget(r)}
                                  disabled={!canPay}
                                  title={locked ? "지급 완료" : !r.eval ? "먼저 저장하세요" : dirty ? "변경을 먼저 저장하세요" : undefined}
                                >
                                  지급
                                </Btn>
                              </span>
                            </div>
                          );
                        })}
                      </ListFrame>
                    </div>
                  </TableScroll>
                )}

                <p className="mt-6 text-xs text-[#8a8a8a] leading-relaxed break-keep">XP 는 봇이 1분 안에 지급합니다.</p>
              </section>
            </Reveal>
          </>
        )}

        {/* ═══ 신고·피드백 ═══ */}
        {tab === "reports" && (
          <Reveal>
            <section>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between md:gap-4 mb-6">
                <FilterChips
                  className="mb-3 md:mb-0"
                  options={[
                    { v: "open", l: `미처리 ${reportCounts.open}` },
                    { v: "done", l: `처리됨 ${reportCounts.done}` },
                    { v: "all", l: "전체" },
                  ]}
                  value={reportFilter}
                  onChange={(v) => { setExpandedId(""); setReportFilter(v as ReportFilter); }}
                />
                <button
                  onClick={() => fetchReports(reportFilter)}
                  disabled={reportsLoading}
                  className="self-start md:self-auto text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors disabled:opacity-40 outline-none focus:outline-none"
                >
                  새로 고침
                </button>
              </div>

              {reportsLoading ? (
                <div className="py-10 text-center text-[#8a8a8a] text-sm">불러오는 중...</div>
              ) : reportsFailed ? (
                <EmptyRow>
                  목록을 불러오지 못했습니다.{" "}
                  <button onClick={() => fetchReports(reportFilter)} className="text-[#e91e3f] font-bold underline underline-offset-2 outline-none focus:outline-none">
                    다시 불러오기
                  </button>
                </EmptyRow>
              ) : reports.length === 0 ? (
                <EmptyRow>
                  {reportFilter === "open" ? "미처리 건이 없습니다." : reportFilter === "done" ? "처리된 건이 없습니다." : "접수된 건이 없습니다."}
                </EmptyRow>
              ) : (
                <ListFrame>
                  {reports.map((r) => {
                    const badge = TYPE_BADGE[r.type];
                    const open = expandedId === r._id;
                    // 세 줄을 넘길 만한 길이일 때만 펼치기 단추를 둔다 — 짧은 글에 단추가 붙으면 눈만 어지럽다
                    const long = r.content.length > 160 || r.content.split("\n").length > 3;
                    return (
                      <div key={r._id} className="py-4">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${badge.c}`}>{badge.l}</span>
                          <span className="text-[13px] font-bold text-[#131313] truncate max-w-40 md:max-w-xs">{r.userName}</span>
                          {r.type === "report" && r.target && (
                            <span className="text-[11px] text-[#5a5a5a] truncate max-w-40 md:max-w-xs">
                              대상 <b className="text-[#131313]">{r.target}</b>
                            </span>
                          )}
                          <span className="text-[10px] text-[#a3a3a3] tabular-nums">{fmtDateTime(r.createdAt)}</span>
                          <span className="ml-auto flex items-center gap-3 shrink-0">
                            <span className={`text-[11px] font-black ${r.status === "done" ? "text-[#8a8a8a]" : "text-[#e91e3f]"}`}>
                              {r.status === "done" ? "처리됨" : "미처리"}
                            </span>
                            <button
                              type="button"
                              onClick={() => openReply(r)}
                              className="text-xs font-bold text-[#e91e3f] hover:text-[#c8172f] transition-colors outline-none focus:outline-none"
                            >
                              답변
                            </button>
                            <button
                              type="button"
                              onClick={() => setDelTarget(r)}
                              className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                            >
                              삭제
                            </button>
                          </span>
                        </div>

                        <p className={`text-[13px] text-[#131313] leading-relaxed whitespace-pre-wrap break-words ${open ? "" : "line-clamp-3"}`}>
                          {r.content}
                        </p>
                        {long && (
                          <button
                            onClick={() => setExpandedId(open ? "" : r._id)}
                            className="mt-1 text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                          >
                            {open ? "접기" : "펼치기"}
                          </button>
                        )}

                        {r.adminReply && (
                          <div className="mt-3 pl-3 border-l-2 border-black/10">
                            <span className="block text-[10px] font-black tracking-[0.08em] text-[#a3a3a3] mb-1 tabular-nums">
                              답변{r.repliedAt ? ` · ${fmtDateTime(r.repliedAt)}` : ""}
                            </span>
                            <p className="text-[12px] text-[#5a5a5a] leading-relaxed whitespace-pre-wrap break-words">{r.adminReply}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </ListFrame>
              )}

              <p className="mt-6 text-xs text-[#8a8a8a] leading-relaxed break-keep">답변은 작성한 서포터즈 본인에게 보입니다.</p>
            </section>
          </Reveal>
        )}
      </div>

      {/* ── 코멘트 ── */}
      <ConfirmDialog
        open={!!noteTarget}
        title={noteLocked ? "코멘트 (지급 완료)" : "코멘트"}
        confirmLabel={noteLocked ? "닫기" : "반영"}
        onCancel={() => setNoteTarget(null)}
        onConfirm={applyNote}
        body={
          noteTarget ? (
            <div>
              <p className="text-[12px] text-[#5a5a5a] mb-3 truncate">{noteTarget.name} · {month}</p>
              <textarea
                rows={6}
                maxLength={NOTE_MAX}
                value={noteDraft}
                readOnly={noteLocked}
                autoFocus={!noteLocked}
                onChange={(ev) => setNoteDraft(ev.target.value)}
                placeholder="코멘트"
                className={`${inputClass} resize-none leading-relaxed ${noteLocked ? "opacity-70" : ""}`}
              />
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-[#8a8a8a] tabular-nums">
                <span>서포터즈 본인에게 보입니다.</span>
                <span>{noteDraft.length} / {NOTE_MAX}</span>
              </div>
            </div>
          ) : null
        }
      />

      {/* ── 답변 ── */}
      <ConfirmDialog
        open={!!delTarget}
        danger
        title="제출 건 삭제"
        confirmLabel="삭제"
        busy={isDeleting}
        body={delTarget ? (<><span className="block font-bold text-[#131313]">{delTarget.userName} · {delTarget.type === "report" ? "신고" : "피드백"}</span><span className="block mt-1 text-[#5a5a5a] break-words">{delTarget.content.slice(0, 120)}</span></>) : null}
        onConfirm={deleteReport}
        onCancel={() => { if (!isDeleting) setDelTarget(null); }}
      />
      <ConfirmDialog
        open={!!replyTarget}
        title="답변"
        confirmLabel="저장"
        busy={isReplying}
        onCancel={() => { if (!isReplying) setReplyTarget(null); }}
        onConfirm={sendReply}
        body={
          replyTarget ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${TYPE_BADGE[replyTarget.type].c}`}>
                  {TYPE_BADGE[replyTarget.type].l}
                </span>
                <span className="font-bold text-[#131313] truncate">{replyTarget.userName}</span>
                {replyTarget.type === "report" && replyTarget.target && (
                  <span className="text-[#5a5a5a] truncate">대상 <b className="text-[#131313]">{replyTarget.target}</b></span>
                )}
              </div>
              <div className="max-h-32 overflow-y-auto no-bar text-[12px] text-[#131313] leading-relaxed whitespace-pre-wrap break-words bg-black/[0.03] border border-black/[0.06] rounded-lg px-3 py-2">
                {replyTarget.content}
              </div>
              <div>
                <textarea
                  rows={5}
                  maxLength={REPLY_MAX}
                  value={replyText}
                  autoFocus
                  onChange={(ev) => setReplyText(ev.target.value)}
                  placeholder="답변 (비워 두면 상태만 바뀝니다)"
                  className={`${inputClass} resize-none leading-relaxed`}
                />
                <p className="text-right mt-1 text-[10px] text-[#8a8a8a] tabular-nums">{replyText.length} / {REPLY_MAX}</p>
              </div>
              <Toggle on={replyDone} onClick={() => setReplyDone((v) => !v)} onLabel="처리됨으로 표시" offLabel="미처리로 둠" className="" />
            </div>
          ) : null
        }
      />

      {/* ── 지급 확인 ── */}
      <ConfirmDialog
        open={!!payTarget}
        title="보상 지급"
        confirmLabel="지급"
        busy={isPaying}
        onCancel={() => { if (!isPaying) setPayTarget(null); }}
        onConfirm={doPay}
        body={
          payTarget && payEval ? (
            <div className="space-y-2 tabular-nums">
              <div className="flex items-center justify-between gap-4">
                <span className={dlLabel}>대상</span>
                <span className="text-[#131313] font-bold truncate">{payTarget.name} · {month}</span>
              </div>
              {payEval.grade && (
                <div className="flex items-center justify-between gap-4">
                  <span className={dlLabel}>등급</span>
                  <span className="text-[#131313] font-bold">{payEval.grade}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className={dlLabel}>XP</span>
                <span className="text-[#131313] font-black">{payEval.xp.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className={dlLabel}>POINT</span>
                <span className="text-[#3f9e93] font-black">{payEval.point.toLocaleString()}</span>
              </div>
              <p className="pt-2 text-[11px] text-[#8a8a8a]">지급 후에는 수정할 수 없습니다.</p>
            </div>
          ) : null
        }
      />

      {noticeEl}
    </main>
  );
}
