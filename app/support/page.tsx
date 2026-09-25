"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { ADMIN_USERS } from "@/lib/admins";
import { ICON_PATHS } from "../components/Icons";

// 📌 1:1 문의 — 화이트 & 블랙.
//    유저: 예전 서식의 흐름 — 왼쪽 문의 입력(라벨 좌측 줄 · 알약) + 오른쪽 답변 알림 · 문의하기.
//    관리(?admin=1): 헤어라인 줄 목록 + 흰 시트 답변 모달.

// 문의 유형 — 고르면 아래에 짧은 설명이 붙는다
const TYPE_META = [
  { key: "일반", desc: "이용 방법 · 건의 등" },
  { key: "오류", desc: "사이트 · 봇이 이상할 때" },
  { key: "신고", desc: "규칙 위반 · 분쟁" },
  { key: "환불 및 교환", desc: "구매한 상품 관련" },
];
const SUB_TYPES = ["일반", "이용", "건의/제안", "기타"];
const REPORT_TYPES = ["운영정책 위반", "테러", "분쟁", "기타"];
const ORDER_TYPE_LABEL: Record<string, string> = { role: "역할", perk: "권한", physical: "기프트카드" };

// 관리자가 자주 쓰는 답변 서식
const ANSWER_TEMPLATES = [
  { l: "접수 완료", t: "안녕하세요, 고급 이글루 운영진입니다.\n문의하신 내용이 정상적으로 접수되었습니다. 확인 후 순차적으로 처리해 드리겠습니다.\n감사합니다." },
  { l: "버그 확인", t: "안녕하세요, 고급 이글루 운영진입니다.\n제보해 주신 오류를 확인하였으며, 현재 수정 작업을 진행하고 있습니다. 빠른 시일 내에 해결하겠습니다.\n소중한 제보 감사드립니다." },
  { l: "환불 안내", t: "안녕하세요, 고급 이글루 운영진입니다.\n환불 및 교환은 기프트 상품을 제외한 모든 상품에 한해 구매 후 30분 이내 신청 시 처리가 가능합니다.\n요청하신 건은 확인 후 처리 결과를 안내드리겠습니다." },
  { l: "처리 완료", t: "안녕하세요, 고급 이글루 운영진입니다.\n문의하신 사항이 정상적으로 처리 완료되었습니다. 이용에 불편을 드려 죄송하며, 추가 문의 사항이 있으시면 언제든지 1:1 문의를 이용해 주세요.\n감사합니다." },
];

const pad = (n: number) => String(n).padStart(2, "0");
// 올해 건은 MM.DD, 지난해 건은 YYYY.MM.DD
const fmtDate = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const md = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}.${md}`;
};
const isPending = (s?: string) => s !== "답변 완료";

// 알약 — 고른 것만 검정 테두리 · 검정 글자 (잉크 채움 없음). 미선택 테두리는 조작 요소 기준 #a3a3a3
const Pill = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={`h-8 px-3.5 rounded-full border text-[12.5px] font-extrabold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 ${
      on ? "border-[#131313] text-[#131313]" : "border-[#a3a3a3] text-[#5a5a5a] hover:border-[#131313] hover:text-[#131313]"
    }`}
  >
    {label}
  </button>
);
// 구매 상품 고르기 점 — 고른 것만 검정
const PickDot = ({ on }: { on: boolean }) => (
  <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${on ? "border-[#131313]" : "border-[#a3a3a3]"}`}>
    {on && <span className="w-2 h-2 rounded-full bg-[#131313]" />}
  </span>
);

// 라벨 좌측 행 — 모바일에서는 라벨이 입력 위로 올라간다
const FormRow = ({
  label,
  required,
  align = "center",
  children,
}: {
  label: string;
  required?: boolean;
  align?: "center" | "start";
  children: React.ReactNode;
}) => (
  <div className={`flex flex-col sm:flex-row sm:gap-6 py-4 border-b border-[#ededed] ${align === "start" ? "sm:items-start" : "sm:items-center"}`}>
    <p className={`text-[13px] font-extrabold text-[#131313] mb-2 sm:mb-0 sm:w-28 shrink-0 ${align === "start" ? "sm:pt-2.5" : ""}`}>
      {label}
      {required && <span className="text-[#e91e3f] ml-0.5">*</span>}
    </p>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

// 칸 — 테두리 #a3a3a3 · 각짐. 모바일은 16px(iOS 확대 방지)
const boxClass = "w-full h-11 bg-white border border-[#a3a3a3] px-3.5 text-[16px] sm:text-[14px] text-[#131313] outline-none focus:border-[#131313] transition-colors placeholder:text-[#8a8a8a]";
const taClass =
  "w-full border border-[#ededed] px-3.5 py-3 text-[16px] sm:text-[14px] text-[#131313] leading-relaxed outline-none focus:border-[#131313] transition-colors resize-none";

export default function SupportPage() {
  const { data: session, status } = useSession();
  const isAdmin = !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [viewMode, setViewMode] = useState<"user" | "admin">("user");
  const [mainType, setMainType] = useState(""); // 고르기 전에는 아래 항목을 감춰둔다
  const [subType, setSubType] = useState("");
  const [errorDesc, setErrorDesc] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [reportType, setReportType] = useState("");
  const [productName, setProductName] = useState("");
  const [refundType, setRefundType] = useState("환불");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [notifyDiscord, setNotifyDiscord] = useState(true); // 답변 시 디스코드 DM 수신 동의

  const [orders, setOrders] = useState<any[]>([]); // ARCTIC 구매 내역 (환불·교환 문의에서 고른다)
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [allInquiries, setAllInquiries] = useState<any[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [selectedAdminInquiry, setSelectedAdminInquiry] = useState<any>(null);
  const [answerText, setAnswerText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [popupConfig, setPopupConfig] = useState({ isOpen: false, message: "", isError: false });

  const fetchAllInquiries = async () => {
    setIsLoadingAdmin(true);
    try {
      const res = await fetch("/api/inquiry", { cache: "no-store" });
      if (res.ok) setAllInquiries((await res.json()).data);
    } catch (e) { console.error(e); } finally { setIsLoadingAdmin(false); }
  };

  useEffect(() => {
    if (viewMode === "admin" && isAdmin) fetchAllInquiries();
  }, [viewMode, isAdmin]);

  useEffect(() => {
    if (isAdmin && new URLSearchParams(window.location.search).get("admin") === "1") {
      setViewMode("admin");
    }
  }, [isAdmin]);

  // 환불·교환 문의에서 고를 수 있도록 내 ARCTIC 구매 내역을 읽어둔다
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/shop/purchase", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setOrders(Array.isArray(d?.data) ? d.data.filter((o: any) => o.status !== "cancelled") : []))
      .catch(() => {});
  }, [status]);

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/inquiry?id=${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        setAllInquiries((prev) => prev.filter((inq) => inq._id !== deleteConfirmId));
        setSelectedAdminInquiry(null);
        setPopupConfig({ isOpen: true, message: "문의가 삭제되었습니다.", isError: false });
      } else { setPopupConfig({ isOpen: true, message: "삭제 중 오류가 발생했습니다.", isError: true }); }
    } catch (e) { setPopupConfig({ isOpen: true, message: "서버와 통신하는 중 문제가 발생했습니다.", isError: true }); }
    finally { setDeleteConfirmId(null); }
  };

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/inquiry`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedAdminInquiry._id, answer: answerText })
      });
      if (res.ok) {
        setSelectedAdminInquiry(null);
        fetchAllInquiries();
        setPopupConfig({ isOpen: true, message: "답변이 저장되었습니다.", isError: false });
      } else { setPopupConfig({ isOpen: true, message: "답변 저장에 실패했습니다.", isError: true }); }
    } catch (e) { setPopupConfig({ isOpen: true, message: "서버와 통신하는 중 문제가 발생했습니다.", isError: true }); }
  };

  const handleSubmit = async () => {
    // 필수 필드 검증
    if (!mainType) {
      setPopupConfig({ isOpen: true, message: "문의 유형을 선택해주세요.", isError: true });
      return;
    }
    if (mainType === "일반" && !subType) {
      setPopupConfig({ isOpen: true, message: "문의 분류를 선택해주세요.", isError: true });
      return;
    }
    if (mainType === "오류" && !errorDesc.trim()) {
      setPopupConfig({ isOpen: true, message: "발생 오류를 입력해주세요.", isError: true });
      return;
    }
    if (mainType === "신고" && (!reportDate.trim() || !reportType)) {
      setPopupConfig({ isOpen: true, message: "발생 일시와 신고 유형을 입력해주세요.", isError: true });
      return;
    }
    if (mainType === "환불 및 교환" && (!productName.trim() || !refundType)) {
      setPopupConfig({ isOpen: true, message: "상품명과 유형을 선택해주세요.", isError: true });
      return;
    }
    if (!title.trim()) {
      setPopupConfig({ isOpen: true, message: "제목을 입력해주세요.", isError: true });
      return;
    }
    if (!content.trim()) {
      setPopupConfig({ isOpen: true, message: "상세 내용을 입력해주세요.", isError: true });
      return;
    }

    const inquiryData = { user: session?.user?.name, userId: (session?.user as any)?.id || "", mainType, subType, errorDesc, reportDate, reportType, productName, refundType, title, content, notifyDiscord, email: "미제공" };
    try {
      const res = await fetch("/api/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inquiryData) });
      if (res.ok) setIsSubmitted(true);
      else setPopupConfig({ isOpen: true, message: "문의 접수에 실패했습니다.", isError: true });
    } catch { setPopupConfig({ isOpen: true, message: "서버와 통신하는 중 문제가 발생했습니다.", isError: true }); }
  };

  // 완료 · 오류 알림 (유저 화면 · 관리 화면 공용) — 흰 시트, 확인 하나
  const popupSheet = popupConfig.isOpen ? (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-7 text-center border border-[#ededed] shadow-2xl">
        <h2 className={`text-base font-black mb-2 ${popupConfig.isError ? "text-[#e91e3f]" : "text-[#131313]"}`}>
          {popupConfig.isError ? "오류" : "완료"}
        </h2>
        <p className="text-[13px] text-[#5a5a5a] mb-6 leading-relaxed whitespace-pre-line break-keep">{popupConfig.message}</p>
        <button
          onClick={() => setPopupConfig({ ...popupConfig, isOpen: false })}
          className="w-full py-3 rounded-xl bg-[#131313] hover:bg-black text-white text-[13px] font-bold transition-colors"
        >
          확인
        </button>
      </div>
    </div>
  ) : null;

  if (status === "loading") {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-[#8a8a8a]">불러오는 중...</div>;
  }

  if (status === "unauthenticated" || !session) {
    return (
      <main className="w-full flex-1 flex flex-col text-[#131313]">
        <section className="w-full max-w-sm mx-auto px-5 py-24 md:py-28 pb-24 md:pb-16 flex-1 flex flex-col justify-center text-center">
          <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none mb-3">1:1 문의</h1>
          <p className="text-[13px] text-[#8a8a8a] mb-8">로그인이 필요합니다.</p>
          <button
            onClick={() => signIn("discord")}
            className="w-full h-12 rounded-full bg-[#131313] hover:bg-black text-white text-[13px] font-extrabold transition-colors outline-none"
          >
            Discord 로그인
          </button>
        </section>
      </main>
    );
  }

  /* ═══════════ 관리 (?admin=1) ═══════════ */
  if (viewMode === "admin" && isAdmin) {
    const pendingCount = allInquiries.filter((inq) => isPending(inq.status)).length;

    return (
      <main key={viewMode} className="w-full flex-1 flex flex-col text-[#131313]">
        <section className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-8 md:pt-10 pb-24 md:pb-16 flex-1">
          {/* 돌아가는 길 — 같은 페이지 안의 화면 전환이라 링크가 아닌 버튼 */}
          <button
            type="button"
            onClick={() => setViewMode("user")}
            className="inline-flex items-center gap-1.5 mb-5 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            1:1 문의
          </button>

          <div className="flex items-end justify-between gap-4 mb-5">
            <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none">문의 관리</h1>
            <p className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">
              전체 {allInquiries.length} · 미답변 <span className="text-[#e91e3f] font-black">{pendingCount}</span>
            </p>
          </div>

          {isLoadingAdmin ? (
            <div className="border-t border-[#131313]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="py-4 border-b border-[#ededed]">
                  <div className="h-3 w-1/2 rounded bg-[#f2f2f2]" />
                  <div className="h-2.5 w-1/4 rounded bg-[#f2f2f2] mt-2" />
                </div>
              ))}
            </div>
          ) : allInquiries.length === 0 ? (
            <div className="border-t border-[#131313]">
              <p className="py-20 text-center text-sm text-[#8a8a8a]">등록된 문의 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="border-t border-[#131313]">
              {allInquiries.map((inq) => (
                <div
                  key={inq._id}
                  onClick={() => { setSelectedAdminInquiry(inq); setAnswerText(inq.answer || ""); }}
                  className="group flex items-center gap-3 md:gap-4 py-4 border-b border-[#ededed] cursor-pointer"
                >
                  <span className={`w-[52px] md:w-[60px] shrink-0 text-[11px] font-black whitespace-nowrap ${isPending(inq.status) ? "text-[#e91e3f]" : "text-[#8a8a8a]"}`}>
                    {inq.status}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] md:text-[15px] font-extrabold truncate group-hover:text-[#e91e3f] transition-colors">{inq.title}</span>
                    <span className="block mt-1 text-[11.5px] text-[#8a8a8a] truncate">
                      {inq.user}
                      {inq.mainType ? ` · ${inq.mainType}` : ""}
                      {inq.subType ? ` › ${inq.subType}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] text-[#8a8a8a] tabular-nums">{fmtDate(inq.createdAt)}</span>
                  <span className="shrink-0 text-[#a3a3a3] font-black">›</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 답변 — 흰 시트 */}
        {selectedAdminInquiry && (
          <div
            className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm md:p-4"
            onClick={() => setSelectedAdminInquiry(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-4xl rounded-t-3xl md:rounded-3xl border border-[#ededed] shadow-2xl max-h-[92dvh] md:max-h-[86vh] flex flex-col overflow-hidden"
            >
              <div className="flex items-center gap-3 px-5 md:px-6 h-14 shrink-0 border-b border-[#131313]">
                <span className={`shrink-0 text-[11px] font-black whitespace-nowrap ${isPending(selectedAdminInquiry.status) ? "text-[#e91e3f]" : "text-[#8a8a8a]"}`}>
                  {selectedAdminInquiry.status}
                </span>
                <h2 className="flex-1 min-w-0 text-[14px] md:text-[15px] font-black truncate">{selectedAdminInquiry.title}</h2>
                <button
                  onClick={() => setSelectedAdminInquiry(null)}
                  className="shrink-0 -mr-1 p-1.5 text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none"
                  aria-label="닫기"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} />
                  </svg>
                </button>
              </div>

              {/* 모바일: 세로 스택 / 데스크톱: 좌 문의 · 우 답변 */}
              <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:grid md:grid-cols-2">
                {/* 문의 */}
                <div className="p-5 md:p-6 border-b md:border-b-0 md:border-r border-[#ededed] md:overflow-y-auto">
                  <p className="text-[11px] font-black text-[#131313] tracking-wide mb-3">문의</p>
                  <div className="pb-3 border-b border-[#ededed] space-y-2">
                    <div className="flex gap-3 text-[12.5px]">
                      <span className="w-14 shrink-0 font-bold text-[#8a8a8a]">작성자</span>
                      <span className="min-w-0 flex-1 font-bold text-[#131313] truncate">{selectedAdminInquiry.user}</span>
                    </div>
                    {selectedAdminInquiry.email && selectedAdminInquiry.email !== "미제공" && (
                      <div className="flex gap-3 text-[12.5px]">
                        <span className="w-14 shrink-0 font-bold text-[#8a8a8a]">이메일</span>
                        <span className="min-w-0 flex-1 font-bold text-[#131313] truncate">{selectedAdminInquiry.email}</span>
                      </div>
                    )}
                    <div className="flex gap-3 text-[12.5px]">
                      <span className="w-14 shrink-0 font-bold text-[#8a8a8a]">분류</span>
                      <span className="min-w-0 flex-1 font-bold text-[#131313] break-keep">
                        {selectedAdminInquiry.mainType}
                        {selectedAdminInquiry.subType ? ` › ${selectedAdminInquiry.subType}` : ""}
                      </span>
                    </div>
                    <div className="flex gap-3 text-[12.5px]">
                      <span className="w-14 shrink-0 font-bold text-[#8a8a8a]">접수</span>
                      <span className="min-w-0 flex-1 font-bold text-[#131313] tabular-nums">
                        {new Date(selectedAdminInquiry.createdAt).toLocaleString("ko-KR")}
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 text-[14px] leading-[1.8] text-[#5a5a5a] whitespace-pre-wrap break-keep">{selectedAdminInquiry.content}</p>
                </div>

                {/* 답변 */}
                <div className="p-5 md:p-6 md:overflow-y-auto">
                  <p className="text-[11px] font-black text-[#e91e3f] tracking-wide mb-3">답변</p>
                  <form onSubmit={handleAnswerSubmit}>
                    <div className="flex items-center gap-3.5 mb-3 overflow-x-auto">
                      <span className="shrink-0 text-[11.5px] font-bold text-[#8a8a8a]">서식</span>
                      {ANSWER_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.l}
                          type="button"
                          onClick={() => setAnswerText(tpl.t)}
                          className="shrink-0 text-[12px] font-extrabold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none"
                        >
                          {tpl.l}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="답변을 작성해 주세요."
                      className={`${taClass} h-48 md:h-56`}
                    />
                    <div className="flex items-center gap-4 mt-4">
                      <button type="submit" className="flex-1 h-12 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[13px] font-extrabold transition-colors outline-none">
                        답변 저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(selectedAdminInquiry._id)}
                        className="shrink-0 text-[13px] font-extrabold text-[#e91e3f] hover:text-[#d01634] transition-colors outline-none"
                      >
                        삭제
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDeleteConfirmId(null)}>
            <div className="bg-white rounded-3xl w-full max-w-sm p-7 text-center border border-[#ededed] shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-black text-[#131313] mb-2">이 문의를 삭제할까요?</h2>
              <p className="text-[12px] text-[#8a8a8a] mb-6">되돌릴 수 없습니다.</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 rounded-xl bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-[13px] font-bold transition-colors">취소</button>
                <button onClick={executeDelete} className="flex-1 py-3 rounded-xl bg-[#e91e3f] hover:bg-[#d01634] text-white text-[13px] font-bold transition-colors">삭제</button>
              </div>
            </div>
          </div>
        )}

        {popupSheet}
      </main>
    );
  }

  /* ═══════════ 접수 완료 ═══════════ */
  if (isSubmitted) {
    return (
      <main className="w-full flex-1 flex flex-col text-[#131313]">
        <section className="w-full max-w-md mx-auto px-5 py-24 md:py-28 pb-24 md:pb-16 flex-1 flex flex-col justify-center text-center">
          <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none mb-3">문의 접수 완료</h1>
          <p className="text-[13px] text-[#8a8a8a] mb-8 break-keep">
            {notifyDiscord ? "답변이 등록되면 디스코드 DM으로 알려드립니다." : "답변은 내 문의 내역에서 확인할 수 있습니다."}
          </p>
          <button
            onClick={() => { setIsSubmitted(false); setMainType(""); setSubType(""); setErrorDesc(""); setReportDate(""); setReportType(""); setProductName(""); setRefundType("환불"); setTitle(""); setContent(""); }}
            className="w-full h-12 rounded-full bg-[#131313] hover:bg-black text-white text-[13px] font-extrabold transition-colors outline-none"
          >
            새 문의 작성하기
          </button>
          <Link href="/profile/inquiry" className="mt-4 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">
            내 문의 내역 ›
          </Link>
        </section>
      </main>
    );
  }

  /* ═══════════ 유저 · 문의 서식 ═══════════ */
  //    예전(다크) 서식의 흐름 그대로 — 왼쪽 "문의 입력"(라벨 좌측 줄 · 알약 · 칸), 오른쪽 "답변 알림"(DM 동의 · 문의하기 · 내역 · 관리).
  //    색 · 선 · 모서리만 화이트 & 블랙 기준으로 바꿨다. PC 는 오른쪽 칸이 따라 내려온다.
  const typeDesc = TYPE_META.find((t) => t.key === mainType)?.desc;
  return (
    <main key={viewMode} className="w-full flex-1 flex flex-col text-[#131313]">
      <style>{`.supportGrid{display:grid;grid-template-columns:minmax(0,1fr);gap:40px;align-items:start}@media (min-width:1024px){.supportGrid{grid-template-columns:minmax(0,1fr) 300px;gap:56px}}`}</style>
      <section className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-12 md:pt-16 pb-24 md:pb-16 flex-1">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="supportGrid">
          {/* ═══ 왼쪽 · 문의 입력 ═══ */}
          <div className="min-w-0">
            <div className="flex items-baseline justify-between border-b-2 border-[#131313] pb-3">
              <h1 className="text-[22px] md:text-[26px] font-black tracking-tight">문의 입력</h1>
              <span className="text-[11px] font-bold text-[#d01634]">* 필수 입력</span>
            </div>

            <FormRow label="작성자">
              <p className="text-[14px] font-bold text-[#131313] py-2">{session.user?.name}</p>
            </FormRow>

            <FormRow label="문의 유형" required>
              <div className="flex flex-wrap items-center gap-2">
                {TYPE_META.map((t) => (
                  <Pill
                    key={t.key}
                    label={t.key}
                    on={mainType === t.key}
                    onClick={() => { setMainType(t.key); setSubType(""); setReportType(""); setProductName(""); setRefundType("환불"); }}
                  />
                ))}
              </div>
              {typeDesc && <p className="mt-1.5 text-[12px] text-[#5a5a5a]">{typeDesc}</p>}
            </FormRow>

            {/* 유형을 고르면 아래 줄이 높이째 열린다 */}
            <div
              className="grid"
              style={{
                gridTemplateRows: mainType ? "1fr" : "0fr",
                opacity: mainType ? 1 : 0,
                transition: "grid-template-rows .45s ease, opacity .3s ease",
              }}
            >
              <div className="overflow-hidden min-h-0">
                {mainType === "일반" && (
                  <FormRow label="문의 분류" required>
                    <div className="flex flex-wrap items-center gap-2">
                      {SUB_TYPES.map((t) => <Pill key={t} label={t} on={subType === t} onClick={() => setSubType(t)} />)}
                    </div>
                  </FormRow>
                )}

                {mainType === "오류" && (
                  <FormRow label="발생 오류" required>
                    <input type="text" placeholder="예: 봇 명령어가 작동하지 않습니다." value={errorDesc} onChange={(e) => setErrorDesc(e.target.value)} className={boxClass} />
                  </FormRow>
                )}

                {mainType === "신고" && (
                  <>
                    <FormRow label="발생 일시" required>
                      <input type="text" placeholder="예: 2026-08-12 오전 경" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={boxClass} />
                    </FormRow>
                    <FormRow label="신고 유형" required>
                      <div className="flex flex-wrap items-center gap-2">
                        {REPORT_TYPES.map((t) => <Pill key={t} label={t} on={reportType === t} onClick={() => setReportType(t)} />)}
                      </div>
                    </FormRow>
                  </>
                )}

                {mainType === "환불 및 교환" && (
                  <>
                    <FormRow label="구매한 상품" required align={orders.length > 0 ? "start" : "center"}>
                      {orders.length > 0 ? (
                        <>
                          <div className="border border-[#a3a3a3] max-h-52 overflow-y-auto">
                            {orders.map((o) => {
                              const label = `${o.itemName} (${new Date(o.createdAt).toLocaleDateString("ko-KR")})`;
                              const picked = productName === label;
                              return (
                                <button
                                  key={o._id}
                                  type="button"
                                  onClick={() => setProductName(label)}
                                  className={`w-full text-left px-3.5 py-3 flex items-center gap-3 border-b border-[#ededed] last:border-b-0 transition-colors outline-none focus-visible:bg-[#f2f2f2] ${picked ? "bg-[#f2f2f2]" : "hover:bg-[#f2f2f2]"}`}
                                >
                                  <PickDot on={picked} />
                                  <span className="min-w-0 flex-1">
                                    <span className={`block text-[13px] font-extrabold truncate ${picked ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{o.itemName}</span>
                                    <span className="block text-[11px] text-[#8a8a8a] tabular-nums">
                                      {ORDER_TYPE_LABEL[o.itemType] || "상품"} · {new Date(o.createdAt).toLocaleDateString("ko-KR")} · {(o.price || 0).toLocaleString()} XP
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[12px] text-[#5a5a5a] break-keep">
                            목록에 없다면 <button type="button" onClick={() => setOrders([])} className="font-bold text-[#d01634] hover:underline outline-none">직접 입력</button>할 수 있습니다.
                          </p>
                        </>
                      ) : (
                        <input type="text" placeholder="예: 쿠폰, 아이템, 역할 등" value={productName} onChange={(e) => setProductName(e.target.value)} className={boxClass} />
                      )}
                    </FormRow>
                    <FormRow label="처리 유형" required>
                      <div className="flex flex-wrap items-center gap-2">
                        {["환불", "교환"].map((t) => <Pill key={t} label={t} on={refundType === t} onClick={() => setRefundType(t)} />)}
                      </div>
                    </FormRow>
                  </>
                )}

                <FormRow label="제목" required>
                  <input type="text" maxLength={100} placeholder="제목을 입력해 주세요. (최대 100자)" value={title} onChange={(e) => setTitle(e.target.value)} className={boxClass} />
                </FormRow>

                <FormRow label="문의 내용" required align="start">
                  <div className="relative">
                    <textarea
                      rows={10}
                      placeholder="언제, 어디서, 무슨 일이 있었는지 적어주세요."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className={`${boxClass} h-auto py-3 pb-8 leading-relaxed resize-none`}
                    />
                    <span className="absolute right-3.5 bottom-3 text-[11px] font-bold text-[#8a8a8a] tabular-nums">{content.length.toLocaleString()}자</span>
                  </div>
                </FormRow>
              </div>
            </div>
          </div>

          {/* ═══ 오른쪽 · 답변 알림 · 접수 ═══ */}
          <aside className="min-w-0 lg:sticky lg:top-24">
            <div className="border-b-2 border-[#131313] pb-3 mb-4">
              <h2 className="text-[22px] md:text-[26px] font-black tracking-tight">답변 알림</h2>
            </div>

            <button type="button" role="checkbox" aria-checked={notifyDiscord} onClick={() => setNotifyDiscord(!notifyDiscord)}
              className="w-full flex items-center gap-3 py-3 text-left outline-none group focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
              <span className={`w-[18px] h-[18px] rounded border flex items-center justify-center shrink-0 transition-colors ${notifyDiscord ? "bg-[#131313] border-[#131313] text-white" : "border-[#a3a3a3] text-transparent group-hover:border-[#131313]"}`}>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-extrabold text-[#131313]">디스코드 알림</span>
                <span className="block text-[12px] text-[#5a5a5a] break-keep">답변이 등록되면 봇이 DM으로 알려드립니다.</span>
              </span>
            </button>
            <p className="text-[12px] text-[#5a5a5a] break-keep leading-relaxed mb-8">
              DM을 받지 않도록 설정한 경우에는 전달되지 않습니다. 답변은 언제든 내 정보 › 1:1 문의 내역에서 확인할 수 있습니다.
            </p>

            <button type="submit"
              className="w-full h-12 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[14px] font-extrabold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 focus-visible:ring-offset-2">
              문의하기
            </button>
            <Link href="/profile/inquiry" className="mt-3 w-full block text-center py-2.5 text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors">
              내 문의 내역 보기
            </Link>

            {isAdmin && (
              <button type="button" onClick={() => setViewMode("admin")}
                className="mt-6 w-full h-10 rounded-full border border-[#131313] text-[#131313] text-[12px] font-extrabold hover:bg-[#131313] hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
                관리자 대시보드 열기
              </button>
            )}
          </aside>
        </form>
      </section>

      {popupSheet}
    </main>
  );
}
