"use client";

import React, { useState } from "react";
import { POINT_RATE, xpToPoint } from "@/lib/pointRate";

// 📌 자주 묻는 질문 — 화이트 & 블랙. 제목 한 줄 · 왼쪽 세로 분류(모바일은 가로 밑줄 탭) · 헤어라인 아코디언.
//    한 번에 하나만 열리고, 분류를 바꾸면 열린 항목은 닫힌다.
// 📌 문구 규칙 — 질문은 "~나요? / ~인가요?" 존댓말 의문형, 답은 합니다체 두세 문장(첫 문장에 결론), t 는 명사형 한 줄.
//    규칙의 기준은 약관(/policy)과 시스템 안내(app/level/SystemGuide) — 어긋나면 이쪽을 고친다.
//    쿨타임 · 음소거 감소율 · 출석 XP 같은 운영 설정값은 숫자로 박지 않고 시스템 안내로 보낸다.

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
// 빙옥 환율은 lib/pointRate.js 한 곳에서 — 서버 기본 로캘과 브라우저가 달라도 같은 글자가 나오게 ko-KR 로 찍는다
const RATE = POINT_RATE.toLocaleString("ko-KR");
const RATE_EX_XP = POINT_RATE * 2.5;

export default function FaqPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [activeCategory, setActiveCategory] = useState("전체");

  const faqData = [
    {
      category: "XP & LEVEL 시스템",
      items: [
        { q: "레벨업에 필요한 XP는 구간마다 같나요?", t: "레벨별 요구 XP", a: "아니요, 레벨이 오를수록 다음 레벨까지 필요한 XP가 늘어납니다. 대신 등급이 오를 때마다 음성 XP 보너스가 커지며, 레벨별 필요 XP는 SYSTEM : LEVEL 대시보드의 XP 테이블에서 확인할 수 있습니다." },
        { q: "채팅을 빠르게 많이 보내면 XP를 더 받나요?", t: "채팅 XP 쿨타임", a: "아니요, 채팅 XP에는 쿨타임이 있어 쿨타임 안에 보낸 메시지는 XP가 쌓이지 않습니다. XP를 늘리려는 도배는 운영정책상 금지 행위이며, 지금 쿨타임은 SYSTEM : LEVEL의 시스템 안내에서 확인할 수 있습니다." },
        { q: "음성 채널에 혼자 있어도 XP를 받나요?", t: "음성 XP 조건", a: "네, 혼자 있어도 받을 수 있습니다. 다만 마이크나 헤드셋을 음소거하면 음성 XP가 줄고, 잠수 채널에서는 받을 수 없습니다. 지금 적용 중인 감소율은 SYSTEM : LEVEL의 시스템 안내에서 확인할 수 있습니다." },
        { q: "레벨이 오르면 어떤 혜택이 있나요?", t: "레벨 · 등급 혜택", a: "등급 승급 보상과 레벨 보상 역할을 받습니다. 레벨 구간에 따라 등급이 오를 때마다 빙옥이 지급되고 음성 XP 보너스가 커지며, 정해진 레벨에 도달하면 레벨 보상 역할이 자동으로 지급됩니다. 시즌이 끝날 때 최종 레벨 상위 3인은 RANKER로 선정됩니다." },
        { q: "서버를 나가면 XP와 레벨이 유지되나요?", t: "퇴장 시 초기화", a: "아니요, 유지되지 않습니다. 2026년 4월 11일부터 서버를 나가면 XP · 레벨과 함께 빙옥 · 강화 단계도 바로 삭제되며 복구되지 않습니다." },
        { q: "출석체크는 어떻게 하나요?", t: "출석체크 방법", a: "하루 한 번, 디스코드에서 /출석체크를 입력하거나 음성 채널 접속 시간을 정해진 만큼 채우면 출석 XP를 받습니다. 출석은 매일 자정(한국 시간)에 다시 받을 수 있으며, 지급량과 기준 시간은 SYSTEM : LEVEL의 시스템 안내에서 확인할 수 있습니다." },
        { q: "강화는 무엇인가요?", t: "강화 규칙", a: "채팅 · 음성 1회에 받는 XP를 영구히 올리는 기능으로, SYSTEM : LEVEL 대시보드에서 할 수 있습니다. 실패 없이 한 단계씩 오르고 단계마다 비용이 커지며, XP 또는 빙옥으로 낼 수 있습니다. XP로 내면 레벨이 내려갈 수 있고, 올린 단계는 시즌이 바뀌어도 유지됩니다." },
        { q: "시즌 패스는 어떻게 이용하나요?", t: "시즌 패스 규칙", a: "이번 시즌에 번 XP만큼 티어가 오르고, 도달한 티어의 보상을 SYSTEM : LEVEL 대시보드에서 직접 받습니다. 무료 트랙은 누구나 받을 수 있고, 프리미엄 트랙은 XP 또는 빙옥으로 해금해야 받을 수 있습니다. 시즌이 끝나면 진행도 · 해금 · 받은 기록이 모두 초기화됩니다." }
      ]
    },
    {
      category: "ARCTIC 및 아이템 상품",
      items: [
        { q: "레벨에 따라 구매할 수 있는 상품이 다른가요?", t: "구매 조건", a: "아니요, 레벨에 따른 구매 제한은 없습니다. 가격만큼의 XP 또는 빙옥이 있으면 구매할 수 있고, 모든 상품은 1인 1개까지 구매할 수 있습니다. XP로 결제하면 차감된 만큼 레벨이 내려갈 수 있습니다." },
        { q: "구매한 상품을 취소하거나 환불할 수 있나요?", t: "취소 · 환불 규정", a: "아니요, 구매 확정 후에는 직접 취소할 수 없으며 단순 변심이나 구매 실수는 취소 · 환불 대상이 아닙니다. 지급 누락 · 중복 결제 · 상품 정보 오류는 발생일로부터 7일 이내에 1:1 문의로 접수하면, 확인 후 결제한 XP · 빙옥을 되돌려 드리거나 상품을 다시 지급합니다. XP와 빙옥은 현금으로 환불되지 않습니다." },
        { q: "구매한 상품은 언제 지급되나요?", t: "상품 지급 시점", a: "역할 · 권한 상품은 결제 후 봇이 자동으로 지급하며, 보통 30초 이내에 반영됩니다. 역할이 없는 아이템은 인벤토리에 바로 보관되고, 기프트카드는 운영진이 확인한 뒤 발송합니다. 처리 상태는 구매 내역에서 확인할 수 있습니다." },
        { q: "기프트카드를 받으려면 개인정보를 입력해야 하나요?", t: "기프트카드 수령 정보", a: "네, 기프트카드는 결제할 때 받으실 연락처를 입력해야 발송할 수 있습니다. 입력한 정보는 운영진만 확인하며 발송 목적으로만 사용합니다. 운영진은 어떤 경우에도 비밀번호나 결제 정보를 요구하지 않습니다." },
        { q: "빙옥은 무엇이고 어떻게 얻나요?", t: "빙옥 획득 방법", a: `빙옥은 XP 대신 쓸 수 있는 재화로, 1 빙옥은 ${RATE} XP에 해당합니다. 등급이 오를 때마다 승급 보상으로 받고, 퀘스트 · 시즌 패스 보상으로도 받을 수 있습니다. 빙옥은 레벨과 무관해 써도 레벨이 내려가지 않습니다.` },
        { q: "빙옥은 어디에 쓰나요?", t: "빙옥 사용처", a: `ARCTIC 상품 구매, 강화, 시즌 패스 프리미엄 해금에 XP 대신 쓸 수 있습니다. 가격은 XP로 표시되며, 빙옥으로 내면 ${RATE} XP당 1 빙옥으로 계산하고 나머지는 올림합니다(예: ${RATE_EX_XP.toLocaleString("ko-KR")} XP → ${xpToPoint(RATE_EX_XP)} 빙옥).` },
        { q: "구매하거나 받은 아이템은 어디서 확인하나요?", t: "인벤토리 위치", a: "인벤토리에서 확인할 수 있습니다. 내 정보의 [인벤토리]나 ARCTIC 상점 줄의 가방 버튼을 누르면 팝업으로 열리며, 기간제 상품은 남은 기간이 함께 표시됩니다." }
      ]
    },
    {
      category: "쿠폰 및 코드",
      items: [
        { q: "받은 코드는 어디서 등록하나요?", t: "코드 등록 위치", a: "쿠폰함에서 코드를 입력하고 [등록]을 누르면 됩니다. 쿠폰함은 상단 바의 쿠폰 아이콘이나 모바일 메뉴(≡)의 [쿠폰함]에서 열 수 있으며, 서버 인증을 마친 회원만 이용할 수 있습니다." },
        { q: "코드를 등록하면 어떻게 되나요?", t: "코드 종류", a: "할인 쿠폰은 쿠폰함에 담겨 ARCTIC 결제 때 쓸 수 있고, 보상 코드는 입력하면 잠시 후 XP나 역할이 지급됩니다. 쿠폰은 양도할 수 없으며, 사용 기한이 지나면 자동으로 소멸합니다." },
        { q: "코드를 사용할 수 없다고 나오는 이유는 무엇인가요?", t: "사용 불가 사유", a: "이미 사용했거나, 사용 기한이 지났거나, 사용 한도가 소진된 코드는 쓸 수 없습니다. 특정 역할 보유자 전용 코드는 해당 역할이 있어야 하며, 이에 해당하지 않는데도 오류가 나면 1:1 문의로 접수할 수 있습니다." }
      ]
    },
    {
      category: "계정 및 멤버십",
      items: [
        { q: "사이트 인증은 어떻게 하나요?", t: "멤버 인증 절차", a: "고급 이글루 디스코드 서버에 먼저 입장한 뒤, 사이트에 디스코드로 로그인하면 인증 화면으로 이동합니다. 필수 약관에 모두 동의하면 인증이 완료되며, 인증을 마쳐야 사이트 기능을 이용할 수 있습니다." },
        { q: "내전 채널 권한은 어떻게 받나요?", t: "내전 채널 권한", a: "인증 2단계에서 내전 규정에 동의하면 내전 채널 이용 권한을 받습니다. 처음에 동의하지 않았다면 내 정보의 [내전 채널 권한]에서 [획득]을 눌러 나중에 받을 수 있습니다. 내전은 지정된 내전 전용 음성 채널에서만 진행해야 합니다." },
        { q: "알림을 한 번에 지울 수 있나요?", t: "알림 전체 삭제", a: "네, 상단 바의 종 아이콘 목록이나 알림함에서 [전체 삭제]를 누르면 한 번에 지워집니다. 지운 알림은 다시 볼 수 없으며, 경고 · 제재 기록은 운영 기록으로 남습니다." },
        { q: "서버 부스터는 어떤 혜택을 받나요?", t: "부스터 혜택", a: "전용 역할 · 배지와 함께 권한 제한 채널 · 슬로우 모드 해제 같은 권한을 별도 구매 없이 이용할 수 있습니다. 부스팅 보너스와 상시 · 출석 추가 XP, ARCTIC에서 쓴 XP 일부 환급, 유지 개월 수에 따른 누적 보상도 받습니다. 자세한 내용은 부스터 혜택 페이지에서 확인할 수 있습니다." }
      ]
    },
    {
      category: "MUSIC BOT",
      items: [
        { q: "MUSIC BOT은 무엇이고 어떻게 사용하나요?", t: "MUSIC BOT 사용법", a: "음성 채널에서 원하는 음악을 재생해 주는 봇입니다. 음성 채널에 들어간 뒤 사용할 봇(MUSIC 1~4)을 골라 음악 제목이나 링크를 입력하면 봇이 들어와 재생합니다. MUSIC-4는 ARCTIC에서 전용 이용권을 구매해야 사용할 수 있습니다." },
        { q: "재생이 끊기거나 소리가 들리지 않을 때는 어떻게 하나요?", t: "재생 문제 점검", a: "대부분 네트워크나 MUSIC BOT 서버가 불안정할 때 생깁니다. 본인의 네트워크와 해당 봇의 개별 볼륨을 먼저 확인하고, 이상이 없다면 다른 번호의 MUSIC BOT을 이용하면 됩니다." },
        { q: "MUSIC BOT이 재생하지 않거나 음성 채널에 들어오지 않는 이유는 무엇인가요?", t: "봇 오류 · 오프라인", a: "봇 내부 오류가 생겼거나 봇이 오프라인 상태일 가능성이 높습니다. 복구될 때까지 다른 번호의 MUSIC BOT을 이용하면 됩니다." }
      ]
    },
    {
      category: "TTS BOT",
      items: [
        { q: "TTS BOT은 무엇이고 어떻게 사용하나요?", t: "TTS BOT 사용법", a: "채팅을 음성으로 읽어 주는 봇입니다. 음성 채널에 들어간 뒤 TTS 전용 텍스트 채널에 메시지를 입력하면 봇이 들어와 읽어 줍니다.\n\n/나가 — 음성 채널 연결 해제\n/스킵 — 지금 읽는 메시지 건너뛰기\n/유저_설정 — 목소리 · 음정 · 속도 설정" },
        { q: "재생이 끊기거나 소리가 들리지 않을 때는 어떻게 하나요?", t: "재생 문제 점검", a: "대부분 네트워크나 TTS BOT 서버가 불안정할 때 생깁니다. 본인의 네트워크와 봇의 개별 볼륨을 먼저 확인하고, 해결되지 않으면 1:1 문의로 접수할 수 있습니다." },
        { q: "TTS BOT이 작동하지 않는 이유는 무엇인가요?", t: "작동 오류 대처", a: "봇이 이미 다른 음성 채널에 연결되어 있거나 봇 서버에 오류가 생긴 경우입니다. 아무도 쓰지 않는 채널에 봇이 남아 있다면 그 채널에서 /나가를 입력한 뒤 다시 불러오면 되며, 다른 사람이 쓰고 있는 봇을 가져가는 행위는 제재 대상입니다. 서버 오류는 복구될 때까지 이용할 수 없으니 1:1 문의로 알려 주시면 확인합니다." }
      ]
    },
    {
      category: "VOICE ROOM",
      items: [
        { q: "VOICE ROOM은 무엇이고 어떻게 사용하나요?", t: "채널 자동 생성", a: "들어가는 즉시 나만의 음성 채널을 자동으로 만들어 주는 시스템입니다. CREATING 채널에 들어가면 새 음성 채널이 생기고 그곳으로 자동 이동하며, 모든 인원이 나가 0명이 되면 채널은 자동으로 삭제됩니다." },
        { q: "CREATING 채널에 들어갔는데 음성 채널이 생기지 않으면 어떻게 하나요?", t: "생성 오류 대처", a: "디스코드 서버 지연이나 VOICE ROOM 봇의 통신 문제일 가능성이 높습니다. 같은 현상이 계속되면 1:1 문의로 접수할 수 있습니다." }
      ]
    }
  ];

  const toggleFaq = (index) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const selectCategory = (category) => {
    setActiveCategory(category);
    setOpenFaqIndex(null);
  };

  const filteredData = activeCategory === "전체"
    ? faqData
    : faqData.filter(section => section.category === activeCategory);

  const totalCount = faqData.reduce((sum, section) => sum + section.items.length, 0);
  const categories = [
    { label: "전체", count: totalCount },
    ...faqData.map(section => ({ label: section.category, count: section.items.length })),
  ];

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <section className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-10 md:pt-12 pb-24 md:pb-16 flex-1">
        {/* 제목 줄 */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none">자주 묻는 질문</h1>
          <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">질문 {totalCount}</span>
        </div>

        {/* 모바일 — 가로 스크롤 밑줄 탭 */}
        <div className="md:hidden -mx-5 px-5 border-b border-[#ededed] overflow-x-auto no-bar">
          <div className="flex w-max">
            {categories.map((c) => {
              const on = activeCategory === c.label;
              return (
                <button
                  key={c.label}
                  onClick={() => selectCategory(c.label)}
                  className={`relative py-3 mr-5 whitespace-nowrap text-[13px] font-extrabold transition-colors outline-none focus:outline-none ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}
                >
                  {c.label}
                  <span className="ml-1.5 text-[11px] font-bold text-[#a3a3a3] tabular-nums">{c.count}</span>
                  {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-7 md:mt-8 md:flex md:items-start md:gap-14">
          {/* 데스크톱 — 세로 분류 목록 */}
          <aside className="hidden md:block shrink-0 sticky top-24 border-t border-[#131313] pt-2" style={{ width: 220 }}>
            {categories.map((c) => {
              const on = activeCategory === c.label;
              return (
                <button
                  key={c.label}
                  onClick={() => selectCategory(c.label)}
                  className={`w-full flex items-baseline gap-2 text-left py-[11px] pl-3.5 border-l-2 text-[14px] font-extrabold transition-colors outline-none focus:outline-none ${on ? "text-[#131313] border-[#e91e3f]" : "text-[#8a8a8a] border-transparent hover:text-[#131313]"}`}
                >
                  <span className="min-w-0 truncate">{c.label}</span>
                  <span className="shrink-0 text-[11px] font-medium text-[#a3a3a3] tabular-nums" style={{ fontFamily: MONO }}>{c.count}</span>
                </button>
              );
            })}
          </aside>

          {/* 아코디언 */}
          <div className="flex-1 min-w-0">
            {filteredData.map((section, sectionIdx) => (
              <section key={section.category} className={sectionIdx === 0 ? "" : "mt-8 md:mt-11"}>
                {activeCategory === "전체" && (
                  <div className="flex items-baseline justify-between gap-3 border-t border-[#131313] pt-2.5 pb-2.5">
                    <b className="text-[13px] font-black tracking-[0.02em]">{section.category}</b>
                    <span className="shrink-0 text-[11px] text-[#8a8a8a] tabular-nums" style={{ fontFamily: MONO }}>{section.items.length}</span>
                  </div>
                )}

                {section.items.map((faq, itemIdx) => {
                  const uniqueIndex = `${sectionIdx}-${itemIdx}`;
                  const isOpen = openFaqIndex === uniqueIndex;

                  return (
                    <div key={uniqueIndex} className="border-b border-[#ededed]">
                      <button
                        onClick={() => toggleFaq(uniqueIndex)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center gap-3.5 py-[18px] text-left outline-none focus:outline-none group"
                      >
                        <span
                          className={`w-7 shrink-0 text-[13px] font-bold transition-colors ${isOpen ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}
                          style={{ fontFamily: MONO }}
                        >
                          Q
                        </span>
                        <span className="flex-1 min-w-0 text-[15px] md:text-[16px] font-extrabold leading-[1.4]">{faq.q}</span>
                        <svg
                          className={`w-5 h-5 shrink-0 transition-colors ${isOpen ? "text-[#131313]" : "text-[#8a8a8a] group-hover:text-[#131313]"}`}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden
                        >
                          {!isOpen && <path d="M12 5v14" />}
                          <path d="M5 12h14" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="pb-6 pt-0.5 md:pl-[42px] md:pr-12">
                          {faq.t && <span className="block mb-2.5 text-[11px] font-black text-[#e91e3f]">{faq.t}</span>}
                          <p className="text-[14px] leading-[1.8] text-[#5a5a5a] whitespace-pre-line max-w-[72ch]">{faq.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
