"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  inputClass,
  labelClass,
  AdminPage,
  AdminTabs,
  Segmented,
  Toolbar,
  DataTable,
  DetailPane,
  DefRow,
  StatusChip,
  EmptyRow,
  Btn,
  Toggle,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
  type Column,
} from "../ui";

// 📌 서포터즈 관리 화면 — 두 탭(?tab=).
//    평가: 역할 보유자 전원의 그 달 활동(채팅·음성)을 한 표로 놓고 등급·XP·POINT·코멘트를
//          적어 임시 저장(draft)한 뒤, 확인을 거쳐 지급(paid)한다. 활동량은 근거일 뿐 금액을
//          정하는 건 관리자다 — 그래서 자동 계산 없이 입력칸으로 둔다. 지급은 되돌릴 수 없어 paid 행은 잠근다.
//    신고·피드백: 서포터즈가 올린 유저 신고·피드백을 읽고 답변·처리 상태를 남긴다.
//
// 📌 2026-09 관리자 개편 — 목록 화면 틀(머리 + 탭 → 한 줄 도구 → 전체 폭 표 → 오른쪽 상세 칸)로 옮겼다.
//    예전엔 표 한 줄에 입력칸 · 저장 · 지급을 다 넣어 최소폭 1120px 로 가로 스크롤이 생겼고,
//    코멘트 · 답변은 모달을 따로 열었다. 이제 표는 읽기만 하고, 줄을 누르면 상세 칸에서
//    평가 입력(코멘트 포함) · 저장 · 지급, 답변 · 처리 상태 · 삭제를 한곳에서 한다.

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

// 종류 표시는 공용 상태 칩으로 — 화면마다 따로 칠하던 배지 색을 걷었다
const TYPE_BADGE: Record<ReportType, { l: string; tone: "bad" | "info" }> = {
  report: { l: "신고", tone: "bad" },
  feedback: { l: "피드백", tone: "info" },
};

// 모바일 줄 카드에는 머리글이 없어서 숫자 앞에 이름을 붙인다 (PC 표에서는 숨김)
const Mob = ({ children }: { children: ReactNode }) => (
  <span className="md:hidden font-normal text-[#5a5a5a]">{children} </span>
);

const Loading = () => <div className="py-12 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>;

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
  // 상세 칸에 연 서포터즈 — 편집값(edits)은 칸을 닫아도 남아 표의 "저장되지 않은 변경"으로 보인다
  const [selId, setSelId] = useState("");

  // ── 신고·피드백 ───────────────────────────────
  const [reportFilter, setReportFilter] = useState<ReportFilter>("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [reportCounts, setReportCounts] = useState({ open: 0, done: 0 });
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsFailed, setReportsFailed] = useState(false);
  // 답변 대상 = 상세 칸에 연 건. 줄을 누르면 openReply 로 답변칸을 채워 연다
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

  // ── 답변 (상세 칸) ───────────────────────────
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
  const dlLabel = "text-[12px] font-bold text-[#5a5a5a] shrink-0";

  // 한 줄의 편집 상태 — 표와 상세 칸이 같은 판정을 쓴다
  const stateOf = (r: Row) => {
    const e = edits[r.userId] || editOf(r.eval, baseXp);
    const locked = r.eval?.status === "paid";
    const dirty = r.eval ? sig(e) !== sig(editOf(r.eval, baseXp)) : true;
    return {
      e,
      locked,
      dirty,
      canSave: !locked && dirty && !savingId,
      // 지급은 서버에 저장된 draft 를 기준으로 나간다 — 안 저장한 편집이 있으면 먼저 저장하게 막는다
      canPay: r.eval?.status === "draft" && !dirty && !savingId,
      busy: savingId === r.userId,
    };
  };

  const statusChips = (r: Row) => {
    const { locked, dirty } = stateOf(r);
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {locked ? (
          <StatusChip tone="ok">지급 완료</StatusChip>
        ) : r.eval ? (
          <>
            <StatusChip tone="info">저장됨</StatusChip>
            {dirty && <StatusChip tone="warn">저장되지 않은 변경</StatusChip>}
          </>
        ) : (
          <StatusChip tone="neutral">미평가</StatusChip>
        )}
      </span>
    );
  };

  const rateLine = (label: string, value: number, goal: number, block: boolean) => (
    <span className={`${block ? "block" : ""} text-[12px] font-bold tabular-nums ${pct(value, goal) >= 100 ? "text-[#e91e3f]" : "text-[#5a5a5a]"}`}>
      {label} {pct(value, goal)}%
    </span>
  );

  const evalCols: Column<Row>[] = [
    {
      key: "who",
      label: "서포터즈",
      mobile: "title",
      render: (r) => (
        <span className="flex items-center gap-2.5 min-w-0">
          {r.avatar ? (
            <img src={r.avatar} alt="" className="w-8 h-8 rounded-full bg-[#f2f2f2] object-cover shrink-0" />
          ) : (
            <span className="w-8 h-8 rounded-full bg-[#f2f2f2] shrink-0" />
          )}
          <span className="min-w-0 max-w-40">
            <span className="block text-[13px] font-bold text-[#131313] truncate">{r.name}</span>
            <span className="block text-[11px] font-normal text-[#8a8a8a] tabular-nums truncate">{r.userId}</span>
          </span>
        </span>
      ),
    },
    {
      key: "chat",
      label: "채팅",
      align: "right",
      render: (r) => (
        <span className="font-bold text-[#131313] tabular-nums"><Mob>채팅</Mob>{r.chatCount.toLocaleString()}</span>
      ),
    },
    {
      key: "voice",
      label: "음성",
      align: "right",
      render: (r) => (
        <span className="font-bold text-[#131313] tabular-nums">
          <Mob>음성</Mob>{r.voiceMin.toLocaleString()}<span className="ml-0.5 text-[12px] font-normal text-[#8a8a8a]">분</span>
        </span>
      ),
    },
    {
      key: "rate",
      label: "달성률",
      align: "right",
      mobile: "hide",
      render: (r) =>
        !hasGoal ? (
          <span className="text-[#a3a3a3]">-</span>
        ) : (
          <>
            {goals.chat > 0 && rateLine("채팅", r.chatCount, goals.chat, true)}
            {goals.voiceMin > 0 && rateLine("음성", r.voiceMin, goals.voiceMin, true)}
          </>
        ),
    },
    {
      key: "grade",
      label: "등급",
      render: (r) => {
        const g = stateOf(r).e.grade.trim();
        return g ? (
          <span className="font-bold text-[#131313]"><Mob>등급</Mob>{g}</span>
        ) : (
          <span className="text-[#a3a3a3]"><Mob>등급</Mob>-</span>
        );
      },
    },
    {
      key: "xp",
      label: "XP",
      align: "right",
      render: (r) => (
        <span className="font-bold text-[#131313] tabular-nums"><Mob>XP</Mob>{toInt(stateOf(r).e.xp).toLocaleString()}</span>
      ),
    },
    {
      key: "point",
      label: "빙옥",
      align: "right",
      render: (r) => (
        <span className="font-bold text-[#131313] tabular-nums"><Mob>빙옥</Mob>{toInt(stateOf(r).e.point).toLocaleString()}</span>
      ),
    },
    {
      key: "note",
      label: "코멘트",
      mobile: "hide",
      render: (r) => {
        const { e } = stateOf(r);
        const preview = notePreview(e.note);
        return (
          <span className={`block max-w-40 truncate ${preview ? "text-[#131313]" : "text-[#a3a3a3]"}`} title={preview ? e.note : undefined}>
            {preview || "없음"}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "상태",
      render: (r) => (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {statusChips(r)}
          {r.eval?.status === "paid" && <span className="text-[12px] text-[#8a8a8a] tabular-nums">{fmtDate(r.eval?.paidAt)}</span>}
        </span>
      ),
    },
  ];

  const reportCols: Column<Report>[] = [
    {
      key: "type",
      label: "종류",
      mobile: "title",
      render: (r) => <StatusChip tone={TYPE_BADGE[r.type].tone}>{TYPE_BADGE[r.type].l}</StatusChip>,
    },
    {
      key: "user",
      label: "작성자",
      mobile: "title",
      render: (r) => <span className="block max-w-40 truncate font-bold text-[#131313]">{r.userName}</span>,
    },
    {
      key: "target",
      label: "대상",
      render: (r) =>
        r.type === "report" && r.target ? (
          <span className="block max-w-40 truncate"><Mob>대상</Mob><b className="text-[#131313]">{r.target}</b></span>
        ) : (
          <span className="hidden md:inline text-[#a3a3a3]">-</span>
        ),
    },
    {
      key: "content",
      label: "내용",
      render: (r) => (
        <span className="block max-w-64 md:max-w-md truncate text-[#131313]">{r.content.replace(/\s+/g, " ").trim()}</span>
      ),
    },
    {
      key: "reply",
      label: "답변",
      mobile: "hide",
      render: (r) =>
        r.adminReply ? (
          <span className="text-[12px] text-[#8a8a8a] tabular-nums whitespace-nowrap">{fmtDateTime(r.repliedAt) || "있음"}</span>
        ) : (
          <span className="text-[#a3a3a3]">-</span>
        ),
    },
    {
      key: "at",
      label: "접수",
      render: (r) => <span className="text-[12px] text-[#8a8a8a] tabular-nums whitespace-nowrap">{fmtDateTime(r.createdAt)}</span>,
    },
    {
      key: "status",
      label: "상태",
      render: (r) => (r.status === "done" ? <StatusChip tone="ok">처리됨</StatusChip> : <StatusChip tone="warn">미처리</StatusChip>),
    },
  ];

  // 상세 칸 — 탭을 옮기면 다른 탭의 칸은 닫힌 것으로 본다
  const selRow = tab === "eval" ? rows.find((r) => r.userId === selId) || null : null;
  const sel = selRow ? stateOf(selRow) : null;
  // 삭제로 목록에서 빠진 건은 칸도 닫는다
  const replyOpen = tab === "reports" && !!replyTarget && reports.some((x) => x._id === replyTarget._id);

  return (
    <>
      <AdminPage
        section="운영"
        title={TAB_META[tab].title}
        tabs={
          <AdminTabs
            tabs={(Object.keys(TAB_META) as TabId[]).map((id) => ({
              id,
              short: TAB_META[id].short,
              n: id === "reports" ? reportCounts.open : undefined,
            }))}
            current={tab}
            hrefOf={(id) => `/admin/supporters?tab=${id}`}
          />
        }
      >
        {/* ═══ 평가 ═══ */}
        {tab === "eval" && (
          <>
            <Toolbar
              right={
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#5a5a5a] tabular-nums">
                  <span>인원 <b className="text-[#131313]">{rows.length}</b></span>
                  <span>평가 완료 <b className="text-[#131313]">{evaluated}</b></span>
                  <span>지급 완료 <b className="text-[#131313]">{paid}</b></span>
                  {hasGoal && (
                    <span>
                      목표{goals.chat > 0 && <> 채팅 <b className="text-[#131313]">{goals.chat.toLocaleString()}</b></>}
                      {goals.voiceMin > 0 && <> 음성 <b className="text-[#131313]">{goals.voiceMin.toLocaleString()}분</b></>}
                    </span>
                  )}
                </span>
              }
            >
              <Segmented
                options={[
                  { v: thisMonth, l: "이번 달" },
                  { v: lastMonth, l: "지난 달" },
                ]}
                value={month}
                onChange={setMonth}
              />
              <span className="text-[13px] font-bold text-[#131313] tabular-nums">{month}</span>
            </Toolbar>

            {isLoading ? (
              <Loading />
            ) : loadFailed ? (
              // 예전엔 위 배너 + 아래 빈 칸으로 같은 실패를 두 번 알렸다 — 한 칸으로 합친다
              <EmptyRow>
                목록을 불러오지 못했습니다 (/api/admin/supporters 응답 없음).{" "}
                <button onClick={() => fetchRows(month)} className="text-[#e91e3f] font-bold underline underline-offset-2 outline-none focus-visible:underline">
                  다시 불러오기
                </button>
              </EmptyRow>
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
              <DataTable
                columns={evalCols}
                rows={rows}
                rowKey={(r) => r.userId}
                onRowClick={(r) => setSelId(r.userId)}
                selectedKey={selRow ? selRow.userId : null}
              />
            )}
          </>
        )}

        {/* ═══ 신고·피드백 ═══ */}
        {tab === "reports" && (
          <>
            <Toolbar
              right={
                <Btn variant="secondary" size="sm" onClick={() => fetchReports(reportFilter)} disabled={reportsLoading}>
                  새로 고침
                </Btn>
              }
            >
              <Segmented
                options={[
                  { v: "open", l: "미처리", n: reportCounts.open },
                  { v: "done", l: "처리됨", n: reportCounts.done },
                  { v: "all", l: "전체" },
                ]}
                value={reportFilter}
                onChange={(v) => setReportFilter(v as ReportFilter)}
              />
            </Toolbar>

            {reportsLoading ? (
              <Loading />
            ) : reportsFailed ? (
              <EmptyRow>
                목록을 불러오지 못했습니다.{" "}
                <button onClick={() => fetchReports(reportFilter)} className="text-[#e91e3f] font-bold underline underline-offset-2 outline-none focus-visible:underline">
                  다시 불러오기
                </button>
              </EmptyRow>
            ) : reports.length === 0 ? (
              <EmptyRow>
                {reportFilter === "open" ? "미처리 건이 없습니다." : reportFilter === "done" ? "처리된 건이 없습니다." : "접수된 건이 없습니다."}
              </EmptyRow>
            ) : (
              <DataTable
                columns={reportCols}
                rows={reports}
                rowKey={(r) => r._id}
                // 답변을 보내는 중에는 다른 건으로 바꾸지 않는다 — 보내는 대상이 바뀌면 안 된다
                onRowClick={(r) => { if (!isReplying) openReply(r); }}
                selectedKey={replyOpen && replyTarget ? replyTarget._id : null}
              />
            )}
          </>
        )}
      </AdminPage>

      {/* ── 평가 상세 — 활동 근거 · 평가 입력 · 저장 · 지급 ── */}
      <DetailPane
        open={!!selRow}
        onClose={() => setSelId("")}
        title={selRow?.name || ""}
        sub={selRow ? <span className="tabular-nums">{selRow.userId} · {month}</span> : null}
        badge={selRow ? statusChips(selRow) : null}
        footer={
          selRow && sel && !sel.locked ? (
            <>
              <Btn variant="secondary" className="ml-auto" onClick={() => saveRow(selRow)} disabled={!sel.canSave}>
                {sel.busy ? "저장 중" : "저장"}
              </Btn>
              <Btn
                onClick={() => setPayTarget(selRow)}
                disabled={!sel.canPay}
                title={!selRow.eval ? "먼저 저장하세요" : sel.dirty ? "변경을 먼저 저장하세요" : undefined}
              >
                지급
              </Btn>
            </>
          ) : null
        }
      >
        {selRow && sel && (
          <>
            <dl className="mb-5">
              <DefRow k="채팅"><span className="tabular-nums">{selRow.chatCount.toLocaleString()}</span></DefRow>
              <DefRow k="음성"><span className="tabular-nums">{selRow.voiceMin.toLocaleString()}분</span></DefRow>
              <DefRow k="달성률">
                {!hasGoal ? (
                  <span className="font-normal text-[#a3a3a3]">-</span>
                ) : (
                  <span className="inline-flex flex-wrap gap-x-3">
                    {goals.chat > 0 && rateLine("채팅", selRow.chatCount, goals.chat, false)}
                    {goals.voiceMin > 0 && rateLine("음성", selRow.voiceMin, goals.voiceMin, false)}
                  </span>
                )}
              </DefRow>
              {sel.locked && (
                <DefRow k="지급일"><span className="tabular-nums">{fmtDate(selRow.eval?.paidAt) || "-"}</span></DefRow>
              )}
            </dl>

            {/* 등급 · XP · 빙옥은 한 줄 세 칸 — 폭이 좁은 상세 칸이라 이름을 위에 둔다 */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="min-w-0">
                <label htmlFor="sup-grade" className={labelClass}>등급</label>
                <input
                  id="sup-grade"
                  type="text"
                  value={sel.e.grade}
                  maxLength={8}
                  placeholder="A"
                  disabled={sel.locked || sel.busy}
                  onChange={(ev) => setEdit(selRow.userId, { grade: ev.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="sup-xp" className={labelClass}>XP</label>
                <input
                  id="sup-xp"
                  type="number"
                  min={0}
                  value={sel.e.xp}
                  placeholder={String(baseXp)}
                  disabled={sel.locked || sel.busy}
                  onChange={(ev) => setEdit(selRow.userId, { xp: ev.target.value })}
                  className={`${inputClass} tabular-nums`}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="sup-point" className={labelClass}>빙옥</label>
                <input
                  id="sup-point"
                  type="number"
                  min={0}
                  value={sel.e.point}
                  placeholder="0"
                  disabled={sel.locked || sel.busy}
                  onChange={(ev) => setEdit(selRow.userId, { point: ev.target.value })}
                  className={`${inputClass} tabular-nums`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="sup-note" className={labelClass}>코멘트</label>
              {/* 지급 뒤에도 읽을 수는 있게 disabled 대신 readOnly 로 잠근다 */}
              <textarea
                id="sup-note"
                rows={6}
                maxLength={NOTE_MAX}
                value={sel.e.note}
                readOnly={sel.locked}
                disabled={!sel.locked && sel.busy}
                onChange={(ev) => setEdit(selRow.userId, { note: ev.target.value.slice(0, NOTE_MAX) })}
                placeholder="코멘트"
                className={`${inputClass} resize-none leading-relaxed ${sel.locked ? "!bg-[#f2f2f2]" : ""}`}
              />
              <div className="flex items-center justify-between gap-3 mt-1.5 text-[12px]">
                <span className="text-[#5a5a5a]">서포터즈 본인에게 보입니다.</span>
                <span className="shrink-0 text-[#8a8a8a] tabular-nums">{sel.e.note.length} / {NOTE_MAX}</span>
              </div>
            </div>
          </>
        )}
      </DetailPane>

      {/* ── 신고·피드백 상세 — 원문 · 답변 · 처리 상태 · 삭제 ── */}
      <DetailPane
        open={replyOpen}
        onClose={() => { if (!isReplying) setReplyTarget(null); }}
        title={replyTarget?.userName || ""}
        badge={
          replyTarget ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <StatusChip tone={TYPE_BADGE[replyTarget.type].tone}>{TYPE_BADGE[replyTarget.type].l}</StatusChip>
              {replyTarget.status === "done" ? <StatusChip tone="ok">처리됨</StatusChip> : <StatusChip tone="warn">미처리</StatusChip>}
            </span>
          ) : null
        }
        sub={
          replyTarget ? (
            <>
              {replyTarget.type === "report" && replyTarget.target && (
                <>대상 <b className="text-[#131313]">{replyTarget.target}</b> · </>
              )}
              <span className="text-[#8a8a8a] tabular-nums">{fmtDateTime(replyTarget.createdAt)}</span>
            </>
          ) : null
        }
        footer={
          replyTarget ? (
            <>
              <Btn variant="secondary" onClick={() => setDelTarget(replyTarget)} disabled={isReplying}>삭제</Btn>
              <Btn className="ml-auto" onClick={sendReply} disabled={isReplying}>{isReplying ? "저장 중…" : "저장"}</Btn>
            </>
          ) : null
        }
      >
        {replyTarget && (
          <>
            <p className="pb-5 mb-5 border-b border-[#ededed] text-[14px] text-[#131313] leading-relaxed whitespace-pre-wrap break-words">
              {replyTarget.content}
            </p>
            <div className="mb-4">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="sup-reply" className={labelClass}>답변</label>
                {replyTarget.repliedAt && (
                  <span className="text-[12px] text-[#8a8a8a] tabular-nums">{fmtDateTime(replyTarget.repliedAt)}</span>
                )}
              </div>
              <textarea
                id="sup-reply"
                rows={5}
                maxLength={REPLY_MAX}
                value={replyText}
                onChange={(ev) => setReplyText(ev.target.value)}
                placeholder="답변 (비워 두면 상태만 바뀝니다)"
                className={`${inputClass} resize-none leading-relaxed`}
              />
              <div className="flex items-center justify-between gap-3 mt-1.5 text-[12px]">
                <span className="text-[#5a5a5a]">답변은 작성한 서포터즈 본인에게 보입니다.</span>
                <span className="shrink-0 text-[#8a8a8a] tabular-nums">{replyText.length} / {REPLY_MAX}</span>
              </div>
            </div>
            <Toggle on={replyDone} onClick={() => setReplyDone((v) => !v)} onLabel="처리됨으로 표시" offLabel="미처리로 둠" />
          </>
        )}
      </DetailPane>

      {/* ── 삭제 확인 ── */}
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
                <span className={dlLabel}>빙옥</span>
                <span className="text-[#3f9e93] font-black">{payEval.point.toLocaleString()}</span>
              </div>
              {/* 표 아래 따로 있던 봇 지급 안내는 지급하는 이 자리로 옮겼다 */}
              <p className="pt-2 text-[12px] text-[#5a5a5a]">지급 후에는 수정할 수 없습니다. XP 는 봇이 1분 안에 지급합니다.</p>
            </div>
          ) : null
        }
      />

      {noticeEl}
    </>
  );
}
