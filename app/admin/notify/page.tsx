"use client";

// 📌 회원 통지 발송 — 목록 화면 틀(머리 → 왼쪽 작성 패널 | 오른쪽 발송 이력 표 → 줄을 누르면 상세 칸).
//    예전엔 가운데 좁은 폭에 작성 카드와 이력이 위아래로 쌓여, 이력을 보려면 폼을 한참 지나 내려가야 했다.
//    넓은 화면(xl)에서는 둘을 나란히 두고, 이력 한 줄의 본문 · 삭제는 오른쪽 상세 칸으로 옮겼다.
//    두 열은 flex 로 — 임의 grid-template 은 이 빌드에서 컴파일되지 않는다(메모: tailwind-v4-quirks).

import React, { useState, useEffect, useRef } from "react";
import { RenderFormattedText } from "../../components/FormattedText";
// 알림 모달 · 확인 모달 · 입력칸은 관리자 공용 것을 쓴다 — 이 파일이 따로 들고 있던 복사본은 뺐다
import {
  AdminPage,
  Panel,
  FieldRow,
  Segmented,
  Btn,
  Toolbar,
  StatusChip,
  DataTable,
  DetailPane,
  DefRow,
  inputClass,
  useAdminGuard,
  useNotice,
  ConfirmDialog,
  type Column,
} from "../ui";

// 📌 통지 유형 → 공용 상태 칩 색. 예전 전용 배지(테두리 + 흐린 면) 대신 관리자 화면 칩 한 벌로 맞춘다
const TYPE_TONE: Record<string, "bad" | "warn" | "info" | "ok" | "neutral"> = {
  경고: "bad",
  제재: "warn",
  안내: "info",
  축하: "ok",
  일반: "neutral",
};
const TYPES = ["경고", "제재", "안내", "축하", "일반"];
const TYPE_OPTIONS = TYPES.map((t) => ({ v: t, l: t }));

const fmtFull = (d: any) => new Date(d).toLocaleString("ko-KR");
// 표 안 일시는 짧게 — 초 · 오전/오후를 빼 한 칸 폭을 줄인다(상세 칸에는 전체 형식)
const fmtShort = (d: any) =>
  new Date(d).toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function TypeChip({ type }: { type: string }) {
  return <StatusChip tone={TYPE_TONE[type] || "neutral"} className="shrink-0">{type}</StatusChip>;
}

// 읽음 · DM · 유저가 지움 — 표 한 칸과 상세 칸에서 같은 모양으로
//    wrap: 상세 칸처럼 폭이 좁을 수 있는 곳에서는 줄을 넘긴다(표 칸은 한 줄 고정)
function StateChips({ n, wrap = false }: { n: any; wrap?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 ${wrap ? "flex-wrap" : "whitespace-nowrap"}`}>
      <StatusChip tone={n.read ? "info" : "neutral"}>{n.read ? "읽음" : "안 읽음"}</StatusChip>
      <StatusChip tone={n.dmSent ? "ok" : "neutral"}>{n.dmSent ? "DM 발송됨" : "DM 미발송"}</StatusChip>
      {n.hiddenAt && <StatusChip tone="neutral">유저가 지움</StatusChip>}
    </span>
  );
}

// 본문 서식 버튼 — 입력칸 위 한 줄 (렌더 안에서 매번 새로 만들던 것을 밖으로)
function ToolBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f2f2f2] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
      {children}
    </button>
  );
}

const Req = () => <span className="text-[#e91e3f]">*</span>;

export default function AdminNotifyPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/notifications 가 서버에서 한 번 더 한다.
  // 예전에는 이 파일이 관리자 목록을 직접 들고 있어, 관리자가 늘면 여기만 조용히 어긋났다.
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  const [sent, setSent] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // 상세 칸에 연 이력 — id 만 들고 목록에서 찾는다(삭제되면 저절로 닫힌다)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [recipient, setRecipient] = useState("");
  const [type, setType] = useState("경고");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchSent = () => {
    fetch("/api/notifications?sent=1", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setSent(Array.isArray(data?.data) ? data.data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isAdmin) fetchSent();
  }, [isAdmin]);

  // ── 마크다운 서식 삽입 (글 작성 페이지와 동일) ──
  const insertWrap = (symbol: string, placeholder = "텍스트") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const cur = ta.value;
    const selected = cur.substring(start, end);
    const inner = selected || placeholder;
    const next = cur.substring(0, start) + symbol + inner + symbol + cur.substring(end);
    setContent(next);
    setTimeout(() => {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(start + symbol.length, start + symbol.length + inner.length);
    }, 0);
  };

  const insertTable = (rows = 2, cols = 2) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const cur = ta.value;
    const headerRow = Array(cols).fill("헤더").map((h, i) => `${h}${i + 1}`).join(" | ");
    const separatorRow = Array(cols).fill("---").join(" | ");
    const dataRow = Array(cols).fill("데이터").map((d, i) => `${d}${i + 1}`).join(" | ");
    const tableLines = [`| ${headerRow} |`, `| ${separatorRow} |`];
    for (let i = 0; i < rows; i++) tableLines.push(`| ${dataRow} |`);
    const table = tableLines.join("\n");
    const next = cur.substring(0, start) + (start > 0 ? "\n" : "") + table + "\n" + cur.substring(start);
    setContent(next);
    setTimeout(() => ta.focus({ preventScroll: true }), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!recipient.trim() || !title.trim() || !content.trim()) {
      notify("수신자 · 제목 · 본문을 모두 입력해 주세요.", true);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, type, title, content }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTitle("");
        setContent("");
        // 수신자/유형은 연속 발송 편의를 위해 유지
        fetchSent();
        // 저장은 됐는데 DM 만 실패하는 경우가 있어, 어디까지 갔는지는 알려야 한다
        const msg = data.userFound
          ? data.dmSent
            ? "통지를 발송했습니다."
            : "통지를 저장했지만 DM 발송에 실패했습니다. 수신자가 DM을 막아 뒀을 수 있습니다."
          : "통지를 저장했지만 디스코드에서 해당 사용자명을 찾지 못해 DM은 보내지 못했습니다.";
        notify(msg);
      } else {
        notify(data.error || "발송에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirmId || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/notifications?id=${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        setSent((prev) => prev.filter((n) => n._id !== deleteConfirmId));
        notify("통지 기록을 삭제했습니다.");
      } else {
        notify("삭제에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다 (관리자 화면마다 복사돼 있던 것)
  if (gate) return gate;

  const selected = selectedId ? sent.find((n) => n._id === selectedId) || null : null;

  // 📌 이력 표 — 유형 칩은 제목 칸 앞에 붙여 칸 하나를 아낀다(xl 두 열에서 표 폭이 좁다).
  //    제목 칸만 남는 폭을 다 받고 말줄임(w-full max-w-0), 나머지 칸은 한 줄 고정.
  const columns: Column<any>[] = [
    {
      key: "title",
      label: "제목",
      mobile: "title",
      className: "w-full max-w-0",
      render: (n) => (
        <span className="flex items-center gap-2 min-w-0">
          <TypeChip type={n.type} />
          <span className="min-w-0 truncate font-bold text-[#131313]">{n.title}</span>
        </span>
      ),
    },
    {
      key: "recipient",
      label: "수신자",
      className: "whitespace-nowrap",
      render: (n) => (
        <span className="block max-w-40 truncate font-bold text-[#131313]">
          <span className="md:hidden">→ </span>
          {n.recipientName}
        </span>
      ),
    },
    { key: "state", label: "상태", className: "whitespace-nowrap", render: (n) => <StateChips n={n} /> },
    {
      key: "at",
      label: "일시",
      align: "right",
      className: "whitespace-nowrap",
      render: (n) => <span className="text-[#8a8a8a] tabular-nums">{fmtShort(n.createdAt)}</span>,
    },
  ];

  return (
    <AdminPage section="운영" title="회원 통지 발송" desc="통지는 사이트 알림함에 기록되고 디스코드 DM으로도 전송됩니다.">
      <div className="flex flex-col xl:flex-row xl:items-start">
        {/* ── 통지서 작성 — xl 에서 왼쪽 고정 폭(유형 알약 다섯 개가 한 줄에 드는 폭) ── */}
        <div className="min-w-0 xl:w-[540px] 2xl:w-[620px] xl:shrink-0 mb-6 xl:mb-0 xl:mr-6">
          <Panel flush title="통지서 작성" right={<span className="text-[12px] text-[#8a8a8a]">발신 · 고급 이글루 운영팀</span>}>
            <form onSubmit={handleSubmit}>
              {/* 표시 이름으로 넣으면 유저를 못 찾아 DM 만 조용히 빠진다 */}
              <FieldRow label={<>수신자 <Req /></>} hint="표시 이름이 아닌 디스코드 고유 사용자명(핸들)이어야 합니다.">
                <input type="text" required placeholder="예: elahw.06" value={recipient} onChange={(e) => setRecipient(e.target.value)} className={inputClass} />
              </FieldRow>

              <FieldRow label={<>통지 유형 <Req /></>}>
                <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
              </FieldRow>

              <FieldRow label={<>제목 <Req /></>} hint="제목은 디스코드 DM 알림에도 표시됩니다.">
                <input type="text" required placeholder="예: 커뮤니티 이용 규칙 위반에 대한 경고 통지" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              </FieldRow>

              {/* 본문 + 서식 툴바 — 입력칸 테두리(#a3a3a3) 안에 버튼 줄과 글칸을 함께 둔다 */}
              <FieldRow label={<>본문 <Req /></>} top>
                <div className="rounded-lg border border-[#a3a3a3] bg-white overflow-hidden transition-colors focus-within:border-[#131313] focus-within:ring-2 focus-within:ring-[#131313]/10">
                  <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-[#ededed]">
                    <ToolBtn onClick={() => insertWrap("**")}><span className="font-extrabold text-[13px]">B</span> 굵게</ToolBtn>
                    <ToolBtn onClick={() => insertWrap("__")}><span className="underline text-[13px]">U</span> 밑줄</ToolBtn>
                    <ToolBtn onClick={() => insertWrap("~~")}><span className="line-through text-[13px]">S</span> 취소선</ToolBtn>
                    <ToolBtn onClick={() => insertWrap("==")}><span className="text-[13px] font-extrabold text-[#e91e3f]">A</span> 강조</ToolBtn>
                    <span className="w-px h-4 bg-[#ededed] mx-1"></span>
                    <ToolBtn onClick={() => insertTable(2, 2)}><span className="text-[13px] font-bold">⊞</span> 표</ToolBtn>
                  </div>
                  <textarea
                    ref={textareaRef}
                    required
                    rows={7}
                    placeholder="통지 내용을 작성하세요"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="block w-full bg-white px-3 py-2.5 text-[14px] text-[#131313] outline-none resize-none leading-relaxed placeholder:text-[#a3a3a3] [&::-webkit-scrollbar]:hidden"
                  />
                </div>
              </FieldRow>

              {/* 미리보기 — 제목이나 본문이 있을 때만 */}
              {(title.trim() || content.trim()) && (
                <FieldRow label="미리보기" top>
                  <div className="rounded-lg border border-[#ededed] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TypeChip type={type} />
                      <span className="ml-auto text-[12px] text-[#8a8a8a]">운영팀 · 방금</span>
                    </div>
                    <h4 className="text-[14px] md:text-[15px] font-bold text-[#131313] break-keep mb-2">{title || <span className="text-[#a3a3a3]">제목 미입력</span>}</h4>
                    <div className="text-[14px] text-[#5a5a5a]">
                      {content.trim() ? <RenderFormattedText text={content} /> : <span className="text-[#a3a3a3]">본문 미입력</span>}
                    </div>
                  </div>
                </FieldRow>
              )}

              <div className="flex justify-end px-5 py-4">
                <Btn type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                  {isSubmitting ? "발송 중..." : "통지 발송"}
                </Btn>
              </div>
            </form>
          </Panel>
        </div>

        {/* ── 발송 이력 — 남은 폭 전부. 줄을 누르면 상세 칸 ── */}
        <section className="flex-1 min-w-0">
          <Toolbar right={<span className="text-[12px] text-[#8a8a8a] tabular-nums">{sent.length}건</span>}>
            <h2 className="text-[15px] font-black tracking-tight">발송 이력</h2>
          </Toolbar>
          {isLoading ? (
            <div className="py-12 text-center text-[13px] text-[#8a8a8a]">불러오는 중...</div>
          ) : (
            <DataTable
              columns={columns}
              rows={sent}
              rowKey={(n) => n._id}
              onRowClick={(n) => setSelectedId(n._id)}
              selectedKey={selectedId}
              empty="발송한 통지가 없습니다."
            />
          )}
        </section>
      </div>

      {/* ── 이력 상세 — 본문 · 메타 · 삭제 ── */}
      <DetailPane
        open={!!selected}
        onClose={() => setSelectedId(null)}
        badge={selected ? <TypeChip type={selected.type} /> : undefined}
        title={selected?.title}
        footer={
          selected ? (
            <Btn variant="danger" className="ml-auto" onClick={() => setDeleteConfirmId(selected._id)}>
              삭제
            </Btn>
          ) : undefined
        }
      >
        {selected && (
          <>
            <dl className="mb-5">
              <DefRow k="수신자">{selected.recipientName}</DefRow>
              <DefRow k="발송 일시"><span className="tabular-nums">{fmtFull(selected.createdAt)}</span></DefRow>
              <DefRow k="상태"><StateChips n={selected} wrap /></DefRow>
              {selected.readAt && <DefRow k="읽은 시각"><span className="tabular-nums">{fmtFull(selected.readAt)}</span></DefRow>}
              {selected.hiddenAt && <DefRow k="지운 시각"><span className="tabular-nums">{fmtFull(selected.hiddenAt)}</span></DefRow>}
              {selected.sentBy && <DefRow k="발신 관리자">{selected.sentBy}</DefRow>}
            </dl>
            <p className="text-[12px] font-bold text-[#5a5a5a] mb-2">본문</p>
            <div className="text-[14px] text-[#131313] leading-relaxed break-keep">
              <RenderFormattedText text={selected.content || ""} />
            </div>
          </>
        )}
      </DetailPane>

      {/* ── 통지 기록 삭제 확인 — 수신자 알림함에서도 사라지므로 되돌릴 수 없다 ── */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        danger
        busy={isDeleting}
        title="통지 기록 삭제"
        confirmLabel="삭제"
        body="수신자의 알림함에서도 사라집니다."
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {noticeEl}
    </AdminPage>
  );
}
