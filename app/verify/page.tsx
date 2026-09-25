"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

/* 📌 멤버 인증 — 1단계 서버 이용 동의(필수) → 2단계 내전 채널 인증(선택)
   약관 요약은 /policy 의 운영정책·개인정보처리방침 조항을 그대로 따른다. 전문이 바뀌면 여기도 맞춘다. */

type AgreementKey = "rules" | "privacy" | "caution" | "level" | "arctic";

type Agreement = {
  key: AgreementKey;
  title: string;
  summary: string;
  policyTab: string;
  sections: { heading: string; items: { term?: string; desc: string }[]; note?: string }[];
};

const AGREEMENTS: Agreement[] = [
  {
    key: "rules",
    title: "커뮤니티 이용 규칙",
    summary: "운영정책 제2조 · 제3조 — 서버 입장 즉시 효력이 발생하며, 아래 행위를 금지합니다.",
    policyTab: "terms",
    sections: [
      {
        heading: "효력",
        items: [
          { desc: "운영정책은 서버에 입장하는 즉시 효력이 발생하며, 입장 시 동의한 것으로 봅니다." },
          { desc: "정책 변경 시 최소 7일 전 서버·사이트 공지로 알리며, 변경 이후의 이용은 개정된 정책에 동의한 것으로 봅니다." },
        ],
      },
      {
        heading: "금지 행위",
        items: [
          { term: "소란 행위 및 도배", desc: "동일·유사한 메시지·이미지·이모지를 연속 게시해 대화를 방해하는 행위 (소음 테러, 멘션 테러 포함)" },
          { term: "불법 및 유해 정보 유포", desc: "성인물·음란물·잔혹 매체, 저작권 침해 자료(불법 프로그램·크랙), 불법 도박 링크 공유" },
          { term: "개인정보 침해", desc: "동의 없이 타인의 실명·사진·연락처·주소·SNS 계정 등 사생활 정보를 유포하거나 추적하는 행위" },
          { term: "홍보 및 상업적 활동", desc: "운영진 사전 승인 없는 타 서버·제품·서비스 홍보, 금전 거래 유도" },
          { term: "계정 도용 및 사칭", desc: "타 멤버·유명인·운영진의 닉네임·프로필·역할을 사칭하여 활동하는 행위" },
          { term: "친목질 및 파벌 조성", desc: "과도한 사적 친목으로 신규 멤버를 소외시키거나, 여론을 조장해 분란을 일으키는 행위" },
          { term: "음성 채널 방해", desc: "타인의 발언을 지속적으로 끊는 행위, 소음이 심한 상태로 마이크를 상시 열어두는 행위" },
          { term: "분쟁 유발 주제", desc: "정치·종교·인종 등 민감한 주제를 다루거나 이를 근거로 타인을 비하하는 행위" },
        ],
      },
    ],
  },
  {
    key: "privacy",
    title: "개인정보 수집 및 이용",
    summary: "개인정보처리방침 제1조 ~ 제4조 — 디스코드 계정 정보와 서버 활동 기록을 수집합니다.",
    policyTab: "privacy",
    sections: [
      {
        heading: "수집 항목 및 방법",
        items: [
          { term: "수집 항목", desc: "디스코드 고유 ID(Snowflake), 닉네임 및 사용자명, 프로필 이미지, 서버 내 텍스트·음성 활동 로그, 입·퇴장 일시, 보유 역할 정보" },
          { term: "수집 방법", desc: "디스코드 API 및 서버 관리용 봇을 통한 자동 수집" },
        ],
        note: "주민등록번호·금융정보 등 민감 정보는 직접 수집하지 않습니다.",
      },
      {
        heading: "이용 목적",
        items: [
          { desc: "서버 내 멤버 식별 및 본인 확인" },
          { desc: "악성 유저 방지, 운영정책 위반 행위 조사 및 제재" },
          { desc: "서버 내 이벤트 진행 및 보상 지급" },
          { desc: "멤버 현황 통계 분석 및 서비스 개선" },
        ],
      },
      {
        heading: "보유 및 파기",
        items: [
          { desc: "서버를 탈퇴하거나 추방된 경우 서버 내 프로필 정보는 즉시 파기됩니다. 다만 디스코드 특성상 기존에 작성한 메시지는 남을 수 있습니다." },
          { desc: "영구 차단된 유저의 디스코드 고유 ID와 차단 사유는 재입장 방지를 위해 서버가 존속하는 한 보관됩니다." },
        ],
      },
      {
        heading: "이용자의 권리",
        items: [
          { desc: "언제든지 서버를 탈퇴함으로써 개인정보 제공 동의를 철회할 수 있습니다." },
          { desc: "본인이 작성한 메시지는 직접 삭제해야 하며, 탈퇴 후에는 계정 식별이 불가능해 운영진이 대신 삭제할 수 없습니다." },
        ],
      },
    ],
  },
  {
    key: "caution",
    title: "규정 위반 시 제재 사항",
    summary: "운영정책 제4조 · 제5조 — 위반 경중에 따라 단계적으로 제재하며, 중대한 위반은 즉시 차단합니다.",
    policyTab: "terms",
    sections: [
      {
        heading: "제재 단계",
        items: [
          { term: "주의 및 경고", desc: "경미한 위반 시 구두 주의 또는 시스템 경고 부여" },
          { term: "타임 아웃", desc: "일정 시간 동안 채팅 메시지 전송 및 음성 채널 입장 권한 박탈" },
          { term: "추방", desc: "서버에서 강제 퇴장 처리 (재입장 가능)" },
          { term: "차단", desc: "영구 강제 퇴장 및 재입장 차단" },
        ],
        note: "범죄 행위, 서버 테러 등 중대한 위반은 경고 절차 없이 즉시 영구 차단될 수 있습니다.",
      },
      {
        heading: "면책",
        items: [
          { desc: "멤버 간의 대화·거래·분쟁으로 발생하는 정신적·물질적 손해에 대해 운영진은 책임지지 않습니다." },
          { desc: "디스코드 플랫폼 장애, 해킹, 서버 점검으로 인한 서비스 중단에 대해 운영진은 책임지지 않습니다." },
          { desc: "본인의 디스코드 계정 관리 소홀로 발생하는 피해는 본인에게 책임이 있습니다." },
        ],
      },
    ],
  },
  {
    key: "level",
    title: "SYSTEM : LEVEL 운영 규정",
    summary: "레벨 운영 규정 제1조 ~ 제6조 — 활동 보상(XP)의 성격과 획득 기준, 부정 획득 제재, 시즌 운영.",
    policyTab: "level",
    sections: [
      {
        heading: "XP의 성격",
        items: [
          { desc: "XP는 서버 내 활동 실적을 나타내는 수치이며, 현금 등 법정 통화로 환전되지 않습니다." },
          { desc: "XP와 레벨은 이용자에게 귀속되는 재산권이 아니며, 서버 운영 종료 또는 시즌 종료 시 소멸·초기화될 수 있습니다." },
          { desc: "XP는 타 이용자에게 양도·증여·판매할 수 없습니다." },
        ],
      },
      {
        heading: "획득 기준과 제한",
        items: [
          { term: "채팅", desc: "메시지 전송 시 200 XP · 쿨타임 1분" },
          { term: "음성", desc: "5분 이상 접속 유지 시 3,000 XP · 쿨타임 5분 (내전 음성 채널은 3,500 XP)" },
          { term: "출석 체크", desc: "1일 1회 7,000 XP" },
          { desc: "잠수 전용 음성 채널에서는 XP가 지급되지 않으며, 음소거 상태에서는 획득량이 90% 감소합니다." },
        ],
      },
      {
        heading: "부정 획득 및 제재",
        items: [
          { term: "자동화 도구", desc: "매크로·봇으로 채팅 또는 음성 접속을 자동화하는 행위" },
          { term: "다중 계정", desc: "다수의 계정으로 XP 또는 초대 보상을 중복 수취하는 행위" },
          { term: "보상 체계 악용", desc: "허위 정보로 보상을 수취하거나, 시스템 오류를 신고하지 않고 반복 이용하는 행위" },
        ],
        note: "적발 시 획득 XP 전액 회수, 레벨 조정, 관련 역할 회수, 서버 이용 제한이 이루어질 수 있으며, 부정 XP로 수령한 상품도 회수됩니다.",
      },
      {
        heading: "시즌 운영",
        items: [
          { desc: "레벨 시스템은 시즌제로 운영되며, 시즌 종료 시 최종 상위 3인은 RANKER로 선정됩니다." },
          { desc: "시즌 전환 시 XP·레벨의 초기화 여부와 범위는 시즌 종료 전 공지로 안내합니다." },
        ],
      },
    ],
  },
  {
    key: "arctic",
    title: "ARCTIC 이용약관",
    summary: "ARCTIC 이용약관 제1조 ~ 제6조 — XP 상점의 이용 조건, 구매·지급, 취소·환불, 쿠폰.",
    policyTab: "arctic",
    sections: [
      {
        heading: "이용 조건",
        items: [
          { desc: "ARCTIC은 보유 XP로 역할·권한·쿠폰 등을 교환하는 공식 상점이며, 현금 결제는 지원하지 않습니다." },
          { desc: "서버 인증 완료 회원만 이용할 수 있고, 일부 상품은 특정 역할 보유자만 구매할 수 있습니다." },
        ],
      },
      {
        heading: "구매 및 지급",
        items: [
          { desc: "구매 시 보유 XP가 즉시 차감되며, 그로 인해 레벨이 하락하고 레벨 연동 역할이 회수될 수 있습니다." },
          { desc: "역할 상품은 봇이 자동 지급하며 통상 30초 이내 반영됩니다. 수동 처리가 필요한 상품은 지연될 수 있습니다." },
        ],
        note: "구매 확정 후에는 직접 취소할 수 없습니다. 상품과 수량을 확인한 뒤 결제해 주세요.",
      },
      {
        heading: "취소 및 환불",
        items: [
          { desc: "XP는 법정 통화가 아니므로 현금 환불 대상이 아닙니다." },
          { term: "XP 원복 가능 사유", desc: "지급 누락 · 중복 결제 · 상품 정보 오류 — 발생일로부터 7일 이내 문의 창구로 접수" },
          { desc: "단순 변심과 구매 실수는 취소·환불 대상이 아닙니다." },
        ],
      },
      {
        heading: "쿠폰 및 면책",
        items: [
          { desc: "쿠폰은 발급 조건 범위에서만 사용할 수 있고, 양도할 수 없으며, 기한이 지나면 소멸합니다." },
          { desc: "상품 구성·가격·판매 여부는 변경될 수 있으며, 완료된 구매에는 소급되지 않습니다." },
          { desc: "운영정책 위반으로 차단된 이용자의 미사용 XP와 보유 상품은 복구되지 않습니다." },
        ],
      },
    ],
  },
];

// 📌 내전 규정 — /policy?tab=scrim 의 제1조 ~ 제4조 (2026. 04. 16. 시행)
const SCRIM_RULES = [
  { no: "제1조", title: "참여 규정", desc: "모든 인원은 내전을 자유롭게 주최 및 참여할 수 있습니다. 참가 확정 인원은 지정된 시간을 엄수해야 하며, 무단 불참이나 상습적인 지각 시에는 참여 권한이 제한될 수 있습니다." },
  { no: "제2조", title: "상호 존중 및 매너 준수", desc: "모든 내전은 상호 존중을 바탕으로 진행하며, 상대방에게 불쾌감을 주는 행위(비하 발언, 티배깅 등)를 엄격히 금지합니다." },
  { no: "제3조", title: "분쟁 규정", desc: "분쟁 발생 시 직접 대응을 금하며, 반드시 웹사이트의 문의 채널을 통해 접수해야 합니다. 모든 사안은 관리자 판단 하에 검토되며, 규정 위반 시 즉각 제재됩니다." },
  { no: "제4조", title: "채널 이용", desc: "내전은 반드시 지정된 내전 전용 음성 채널에서만 진행해야 하며, 내전 목적 외 해당 채널의 사적 이용은 제한됩니다." },
];

const CheckIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
);

export default function VerifyPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [agreements, setAgreements] = useState<Record<AgreementKey, boolean>>({ rules: false, privacy: false, caution: false, level: false, arctic: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [openTab, setOpenTab] = useState<AgreementKey | null>(null);
  const [savedScrimChoice, setSavedScrimChoice] = useState(false);

  const checkedCount = AGREEMENTS.filter((a) => agreements[a.key]).length;
  const isAllChecked = checkedCount === AGREEMENTS.length;

  const isRevisiting = (session?.user as any)?.isVerified === true;

  useEffect(() => {
    if (status === "authenticated") {
      const isVerified = (session?.user as any)?.isVerified;
      const hasScrimRole = (session?.user as any)?.hasScrimRole;

      if (isVerified && hasScrimRole && !isSuccessModalOpen) {
        router.replace("/");
      } else if (isVerified && !hasScrimRole && step === 1) {
        setStep(2);
      }
    }
  }, [status, session, isSuccessModalOpen, router, step]);

  const handleAllCheck = () => {
    const next = !isAllChecked;
    setAgreements({ rules: next, privacy: next, caution: next, level: next, arctic: next });
  };

  const handleCheck = (key: AgreementKey) => {
    setAgreements((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTab = (tab: AgreementKey) => {
    setOpenTab(openTab === tab ? null : tab);
  };

  const handleNextStep = () => {
    if (!isAllChecked) return;
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFinalSubmit = async (acceptScrim: boolean) => {
    const userId = (session?.user as any)?.id;
    if (!userId) {
      setErrorMessage("사용자 정보를 찾을 수 없습니다.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, acceptScrim }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSavedScrimChoice(acceptScrim);
        setIsSuccessModalOpen(true);
      } else {
        setErrorMessage(`오류 발생: ${data.error}`);
        setStep(1);
      }
    } catch {
      setErrorMessage("서버 요청 중 오류가 발생했습니다.");
      setStep(1);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") return <div className="min-h-screen bg-[#090909] text-white flex justify-center items-center">로딩 중...</div>;
  if (status === "unauthenticated") {
    router.push("/");
    return null;
  }

  // 📌 디스코드 서버에 입장하지 않은 유저 — 입장 안내 화면
  if ((session?.user as any)?.isGuildMember === false) {
    return (
      <div className="w-full flex-1 bg-[#090909] text-white flex flex-col items-center justify-center py-24 px-6 relative min-h-[70vh]">
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[500px] h-[280px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="relative z-10 text-center max-w-md">
          <p className="text-5xl mb-8">🧊</p>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-4">아직 서버에 입장하지 않았습니다.</h1>
          <p className="text-sm text-gray-400 leading-relaxed mb-10">
            사이트의 모든 기능을 이용하시려면<br />
            먼저 <span className="text-white font-bold">고급 이글루 디스코드 서버</span>에 입장해야 합니다.<br />
            입장 후 아래 버튼으로 다시 확인해주세요.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href="https://discord.gg/V2uW2nUczU"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#5865F2]/20"
            >
              디스코드 서버 입장하기
            </a>
            <button
              onClick={() => signIn("discord", { callbackUrl: "/verify" })}
              className="w-full py-4 bg-white/[0.04] border border-white/10 text-white font-bold rounded-2xl hover:bg-white/[0.08] hover:border-white/25 transition-all"
            >
              입장 완료 — 다시 확인하기
            </button>
          </div>
          <p className="text-[11px] text-gray-600 mt-6">서버 입장 후 &lsquo;다시 확인하기&rsquo;를 누르면 인증 절차가 시작됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 bg-[#090909] text-white flex flex-col items-center py-10 md:py-14 px-4 relative">
      <div className="w-full max-w-2xl px-2">

        {/* 진행 막대 — 1단계 절반, 2단계 전체 */}
        <div className="w-full h-0.5 bg-white/10 rounded-full mb-8 md:mb-10">
          <div className={`h-full bg-[#e91e3f] transition-all duration-500 rounded-full ${step === 1 ? "w-1/2" : "w-full"}`}></div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm text-center font-bold">
            {errorMessage}
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-white">서버 이용 동의</h1>
            </div>

            {/* 전체 동의 */}
            <button type="button" onClick={handleAllCheck} className="flex items-center gap-3 py-4 mb-3 group w-fit text-left">
              <span className={`shrink-0 grid place-items-center transition-colors ${isAllChecked ? "text-[#e91e3f]" : "text-gray-600 group-hover:text-gray-400"}`}>
                <CheckIcon className="w-6 h-6" />
              </span>
              <span className={`font-black text-lg md:text-xl tracking-tight transition-colors ${isAllChecked ? "text-white" : "text-gray-300 group-hover:text-white"}`}>모든 필수 약관에 동의합니다</span>
              <span className="text-xs text-gray-600 font-bold tabular-nums">{checkedCount}/{AGREEMENTS.length}</span>
            </button>

            {/* 약관 — 펼치는 목록. 체크박스는 동의, 제목 줄은 펼치기 */}
            <div className="border-t border-white/10 mb-8">
              {AGREEMENTS.map((a) => {
                const checked = agreements[a.key];
                const open = openTab === a.key;
                return (
                  <div key={a.key} className="border-b border-white/10">
                    <div className="flex items-center gap-3 py-3.5 px-1">
                      <button
                        type="button"
                        onClick={() => handleCheck(a.key)}
                        aria-pressed={checked}
                        aria-label={`${a.title} 동의`}
                        className={`shrink-0 grid place-items-center transition-colors ${checked ? "text-[#e91e3f]" : "text-gray-700 hover:text-gray-400"}`}
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => toggleTab(a.key)} aria-expanded={open} className="flex-1 min-w-0 text-left flex items-center gap-2 group">
                        <span className="font-medium text-gray-300 group-hover:text-white text-sm transition-colors">{a.title}<span className="text-[#e91e3f] ml-1" aria-hidden="true">*</span></span>
                      </button>
                      <button type="button" onClick={() => toggleTab(a.key)} aria-label={open ? "접기" : "펼치기"} className="shrink-0 w-7 h-7 grid place-items-center text-gray-500 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>

                    {open && (
                      <div className="pb-5 pl-9 pr-2 space-y-4">
                        <p className="text-[11px] text-gray-500 leading-relaxed break-keep">{a.summary}</p>
                        {a.sections.map((sec) => (
                          <div key={sec.heading}>
                            <p className="text-[10px] font-black tracking-[0.18em] text-gray-400 uppercase mb-2">{sec.heading}</p>
                            <ul className="space-y-1.5">
                              {sec.items.map((it, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed break-keep">
                                  <span className="mt-[8px] w-1 h-1 rounded-full bg-gray-600 shrink-0"></span>
                                  <span className="text-gray-400">
                                    {it.term && <span className="text-gray-200 font-bold">{it.term} — </span>}
                                    {it.desc}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {sec.note && (
                              <p className="mt-2.5 text-[11px] text-gray-400 leading-relaxed break-keep">
                                <span className="text-gray-300 font-bold mr-1.5">※</span>{sec.note}
                              </p>
                            )}
                          </div>
                        ))}
                        <a href={`/policy?tab=${a.policyTab}`} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-bold text-gray-400 hover:text-white underline underline-offset-4 transition-colors">
                          전문 보기 ↗
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleNextStep}
              disabled={!isAllChecked}
              className={`w-full py-3.5 rounded-xl font-bold text-base transition-all outline-none focus:outline-none ${isAllChecked ? "bg-[#e91e3f] hover:bg-[#d01634] text-white shadow-lg shadow-[#e91e3f]/20" : "bg-white/5 text-gray-600 cursor-not-allowed"}`}
            >
              다음
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-black mb-2 tracking-tighter text-white flex items-baseline gap-2">
                내전 채널 이용 인증
                <span className="text-gray-400 text-xs font-bold bg-white/[0.06] px-2 py-0.5 rounded">선택</span>
              </h1>
              <p className="text-gray-500 text-[13px]">동의하지 않아도 기본 권한은 받을 수 있으며, 내 정보에서 나중에 동의할 수 있습니다.</p>
            </div>

            {/* 내전 규정 — /policy?tab=scrim 의 조항 그대로 */}
            <div className="border-t border-white/10 mb-5">
              {SCRIM_RULES.map((r) => (
                <div key={r.no} className="border-b border-white/10 py-4 px-1">
                  <p className="text-sm font-semibold text-gray-200 mb-1.5"><span className="text-gray-500 mr-2">{r.no}</span>{r.title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed break-keep">{r.desc}</p>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed break-keep mb-2">
              <span className="text-gray-300 font-bold mr-1.5">※</span>위 규정 미확인으로 인해 발생하는 불이익이나 제재에 대한 책임은 이용자 본인에게 있습니다.
            </p>
            <a href="/policy?tab=scrim" target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-bold text-gray-400 hover:text-white underline underline-offset-4 transition-colors mb-8">
              전문 보기 ↗
            </a>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleFinalSubmit(true)}
                disabled={isSubmitting}
                className="w-full py-3.5 bg-[#e91e3f] text-white font-bold text-base rounded-xl hover:bg-[#d01634] transition-all shadow-lg shadow-[#e91e3f]/20 outline-none focus:outline-none flex items-center justify-center"
              >
                {isSubmitting ? "처리 중..." : "내전 규정에 동의"}
              </button>

              {isRevisiting ? (
                <button
                  onClick={() => router.push("/profile")}
                  disabled={isSubmitting}
                  className="w-full py-3 text-gray-500 hover:text-white text-sm font-medium transition-colors outline-none focus:outline-none"
                >
                  취소(내 정보 돌아가기)
                </button>
              ) : (
                <button
                  onClick={() => handleFinalSubmit(false)}
                  disabled={isSubmitting}
                  className="w-full py-3 text-gray-500 hover:text-white text-sm font-medium transition-colors outline-none focus:outline-none"
                >
                  동의하지 않고 기본 권한만 받기
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {isSuccessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overlay-in">
          <div className="bg-[#1e1e1e] border border-[#e91e3f]/40 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl transform transition-all scale-100 animate-in zoom-in-95 duration-300">
            <div className="mx-auto w-20 h-20 bg-[#e91e3f]/10 border border-[#e91e3f]/20 rounded-full flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#e91e3f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-white mb-2">
              {isRevisiting ? "권한 획득 완료!" : "인증 완료"}
            </h2>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              {isRevisiting ? (
                <>내전 채널 이용 권한이 부여되었습니다.<br/>이제 내전에 참가하실 수 있습니다.</>
              ) : (
                <>환영합니다!<br/>고급 이글루 서버를 이용하실 수 있습니다.</>
              )}
            </p>
            <button
              onClick={async () => {
                await update({ isVerified: true, hasScrimRole: savedScrimChoice });
                setIsSuccessModalOpen(false);
                router.replace(isRevisiting ? "/profile" : "/");
              }}
              className="w-full py-3.5 bg-[#e91e3f] text-white font-bold rounded-xl hover:bg-[#d01634] transition-all shadow-lg shadow-[#e91e3f]/20 outline-none focus:outline-none"
            >
              {isRevisiting ? "내 정보로 돌아가기" : "메인으로 이동"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
