"use client";

import React, { useState } from "react";
import { POINT_RATE, xpToPoint } from "@/lib/pointRate";

// 📌 자주 묻는 질문 — 화이트 & 블랙. 제목 한 줄 · 왼쪽 세로 분류(모바일은 가로 밑줄 탭) · 헤어라인 아코디언.
//    한 번에 하나만 열리고, 분류를 바꾸면 열린 항목은 닫힌다.
// 📌 문구 규칙 — 원래 문구(2026-09-26 이전 FAQ)가 우선. 사실이 바뀐 곳만 원래 문장 모양 · 말투를 살려 최소로 고친다.
//    질문 끝만 "~나요? / ~인가요?" 의문형으로 통일, 답은 옛 안내형 말투(합니다체 + "~해 주세요 / ~주시기 바랍니다") 그대로, t 는 명사형 한 줄.
//    사실의 기준은 약관(/policy)과 코드 — 운영 설정값(쿨타임 · 감소율 · 출석 XP 등)은 옛 FAQ 에 있던 것만 두고 새로 박지 않는다.

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
        { q: "레벨업에 필요한 XP 양은 모든 구간이 같나요?", t: "단계별 요구 XP 산정 방식", a: "상위 레벨로 진입할수록 다음 단계 달성에 필요한 XP 요구량이 점진적으로 증가합니다. 단, 레벨 상승에 맞춰 XP 획득 효율 또한 유동적으로 조정되어 안정적인 성장이 가능하도록 설계되었습니다." },
        { q: "채팅을 빠르고 많이 치면 XP를 빨리 획득할 수 있나요?", t: "비정상 획득 방지 여부", a: "획득할 수 있는 쿨타임이 존재합니다. 정상적인 채팅 활동을 통해 안정적으로 XP를 쌓아주세요." },
        { q: "음성 채널에 혼자 있어도 XP 획득이 가능한가요?", t: "활동에 따른 XP 획득 여부", a: "네, 가능합니다. 단, 마이크 및 헤드셋 음소거 시 XP 획득량이 90% 감소되며, 잠수 채널로 이동 시 XP 획득이 불가합니다." },
        { q: "레벨이 오르면 어떤 구체적인 혜택이 있나요?", t: "단계별 전용 혜택 여부", a: "특정 레벨마다 전용 레벨 역할 및 색상 혜택이 적용됩니다. 또한 음성 채널 이용 시 레벨 구간별 등급에 따라 추가 XP가 가산됩니다.\nARCTIC에는 서버 이용 편의를 돕는 권한 상품이 포함되어 있으니, 구매를 통해 최적화된 서버 환경을 경험해 보시기 바랍니다." },
        { q: "서버 퇴장 시 XP 및 LEVEL이 유지 되나요?", t: "서버 데이터 유지 여부", a: "유지되지 않습니다. 2026-04-11(토) 이후 운영 정책이 변경됨에 따라 서버 퇴장 시 즉시 XP 및 LEVEL은 물론 빙옥 · 강화 단계 등 SYSTEM : LEVEL 기록이 모두 초기화 됩니다." },
        { q: "출석체크는 어떻게 하나요?", t: "출석 XP 획득 방법", a: "출석체크를 통해 출석 XP를 획득할 수 있습니다.\n\n[출석 방법]\n· 디스코드에서 '/출석체크' 명령어 입력\n· 음성 채널에 정해진 시간 이상 접속 시 자동 출석\n\n출석은 두 방법을 합쳐 하루 한 번만 가능하며, 매일 자정(한국 시간)에 초기화됩니다." },
        { q: "강화는 무엇이고, 어떻게 이용하나요?", t: "강화 시스템 안내", a: "채팅 및 음성 활동 시 1회에 획득하는 XP를 영구적으로 올려주는 시스템입니다.\n\n[이용 방법]\nSYSTEM : LEVEL 대시보드에서 [강화]를 선택한 후, 채팅 · 음성 중 원하는 항목을 강화합니다. 강화는 실패 없이 한 단계씩 오르며, 단계가 오를수록 비용이 증가합니다. 비용은 XP 또는 빙옥으로 지불할 수 있습니다.\n\n* XP로 지불할 경우 차감된 XP만큼 레벨이 하락할 수 있으니 유의해 주시기 바랍니다. 강화 단계는 시즌이 바뀌어도 유지됩니다." },
        { q: "시즌 패스는 어떻게 이용하나요?", t: "시즌 패스 이용 방법", a: "이번 시즌에 획득한 XP만큼 티어가 오르며, 도달한 티어의 보상은 SYSTEM : LEVEL 대시보드의 [시즌 패스]에서 직접 수령할 수 있습니다.\n\n[보상 트랙]\n· 무료 트랙: 누구나 수령 가능\n· 프리미엄 트랙: 빙옥으로 해금 후 수령 가능 (서버 부스터는 자동 해금)\n\n* 시즌이 종료되면 진행도 · 해금 여부 · 수령 기록이 모두 초기화되니, 보상은 시즌 내에 수령해 주시기 바랍니다." }
      ]
    },
    {
      category: "ARCTIC 및 아이템 상품",
      items: [
        { q: "레벨에 따라 구매할 수 있는 상품이 다른가요?", t: "등급별 상품 접근 권한", a: "아니요, 레벨에 따른 구매 제한은 없습니다. 상품 가격만큼의 XP 또는 빙옥을 보유하고 있다면 구매할 수 있습니다.\n지속적인 활동을 통해 XP를 획득하여, 프리미엄 상품들을 이용하시길 바랍니다." },
        { q: "상품 구매 후 환불 및 교환이 가능한가요?", t: "환불 및 교환 규정 안내", a: "아니요, 원칙적으로 불가합니다. 단, 지급 누락 · 중복 결제 · 상품 정보 오류의 경우에 한해 발생일로부터 7일 이내로 '1:1 문의'를 통해 신청 시에만 XP · 빙옥 원복 또는 재지급이 가능합니다.\n단순 변심 및 구매 실수는 환불 및 교환이 절대 불가하며, XP와 빙옥은 현금으로 환불되지 않으니 구매 시 유의해 주시기 바랍니다." },
        { q: "실물 상품 수령을 위해 꼭 개인정보를 입력해야 하나요?", t: "개인정보 수집 및 이용", a: "네, 이벤트 경품이나 기프트카드를 전송해 드리기 위해 최소한의 정보(연락처 등)가 필요합니다. 수집된 정보는 운영진만 확인하며 발송 목적으로만 사용되므로 안심하고 입력해 주세요.\n\n* 주의: 고급 이글루 운영진은 어떠한 경우에도 비밀번호나 결제 정보를 요구하지 않습니다. 사칭에 주의해 주세요." },
        { q: "빙옥은 무엇이고, 어떻게 얻나요?", t: "빙옥 획득 방법", a: `XP 대신 사용할 수 있는 재화로, 1 빙옥은 ${RATE} XP에 해당합니다.\n\n[획득 방법]\n· 퀘스트 보상\n· 시즌 패스 보상\n\n빙옥은 레벨과 무관하므로, 사용하더라도 레벨이 하락하지 않습니다.` },
        { q: "빙옥은 어디에 사용하나요?", t: "빙옥 사용처 안내", a: `ARCTIC 상품 구매와 강화에 XP 대신 사용할 수 있으며, 시즌 패스 프리미엄 트랙 해금과 일부 상품(기프트카드 등)은 빙옥으로만 결제할 수 있습니다.\n가격은 XP로 표시됩니다. 빙옥으로 결제할 경우 ${RATE} XP당 1 빙옥으로 계산되며, 나머지는 올림 처리됩니다. (예: ${RATE_EX_XP.toLocaleString("ko-KR")} XP → ${xpToPoint(RATE_EX_XP)} 빙옥)\n\n* ARCTIC에서는 빙옥과 XP를 함께 사용하여 결제할 수 있습니다.` },
        { q: "구매한 상품은 언제 지급되나요?", t: "상품 지급 시점 안내", a: "역할 · 권한 · 아이템 · 꾸미기 상품은 결제 후 봇에 의해 자동 지급되며, 통상 30초 이내에 반영됩니다. 기프트카드는 운영진 확인 후 순차적으로 발송됩니다.\n처리 상태는 [구매 내역]에서 확인하실 수 있으며, 지급이 지연될 경우 '1:1 문의'를 통해 접수해 주시기 바랍니다." },
        { q: "구매하거나 지급받은 아이템은 어디서 확인하나요?", t: "인벤토리 확인 방법", a: "인벤토리에서 확인할 수 있습니다.\n\n[확인 방법]\n· ARCTIC 상점의 가방 아이콘 클릭\n· SYSTEM : LEVEL 대시보드의 [인벤토리] 클릭\n\n기간제 상품은 인벤토리에서 만료일과 남은 기간을 함께 확인하실 수 있습니다." },
        { q: "기간제 상품의 이용 기간을 연장할 수 있나요?", t: "기간제 상품 연장 방법", a: "네, 가능합니다. 이용 중인 기간제 상품을 다시 구매하시면, 현재 만료일 뒤로 선택한 기간만큼 이어서 연장됩니다.\n\n[연장 방법]\n1. 인벤토리에서 해당 상품 선택 → [기간 연장]\n2. 연장할 기간 선택 후 구매\n\n* 기간제 대신 무제한으로 구매하시면 기간 제한 없이 이용하실 수 있습니다." }
      ]
    },
    {
      category: "코드 등록",
      items: [
        { q: "받은 코드는 어디서 사용하나요?", t: "PC / 모바일 사용 방법", a: "공식 웹사이트 로그인 후 '쿠폰함' 메뉴(우측 상단 쿠폰 아이콘)에서 사용할 수 있습니다.\n\n[PC]\n1. 공식 웹사이트 접속 후 로그인\n2. 우측 상단 프로필 클릭 → [내 정보] → [쿠폰함]\n3. 보유한 코드를 입력 후 등록\n\n[모바일]\n1. 공식 웹사이트 접속 후 로그인\n2. 우측 상단 삼선(≡) 메뉴 클릭 → 하단 [쿠폰함]\n3. 보유한 코드를 입력 후 등록" },
        { q: "코드를 입력했는데 사용할 수 없다고 나오는 이유는 무엇인가요?", t: "사용 불가 사유 안내", a: "다음의 경우 코드 사용이 제한될 수 있습니다.\n\n· 이미 사용한 코드 (1인 1회)\n· 사용 기한이 만료된 코드\n· 사용 한도(선착순 수량)가 소진된 코드\n· 특정 역할 소지자 전용 코드 (해당 역할 미보유 시)\n\n위 사항에 해당하지 않는데도 오류가 발생한다면 1:1 문의로 접수해 주세요." },
      ]
    },
    {
      category: "계정 및 멤버십",
      items: [
        { q: "사이트 인증은 어떻게 하나요?", t: "멤버 인증 절차 안내", a: "고급 이글루 디스코드 서버에 입장한 상태에서 인증을 진행할 수 있습니다.\n\n[인증 방법]\n1. 고급 이글루 디스코드 서버 입장\n2. 공식 웹사이트에서 디스코드 계정으로 로그인\n3. 인증 화면에서 필수 약관에 모두 동의\n\n인증을 완료하셔야 ARCTIC, 쿠폰함 등 사이트 기능을 이용하실 수 있습니다." },
        { q: "내전 채널 권한은 어떻게 받나요?", t: "내전 채널 이용 권한 안내", a: "사이트 인증 2단계에서 내전 규정에 동의하시면 내전 채널 이용 권한이 부여됩니다.\n인증 당시 동의하지 않으셨다면, 내 정보의 [내전 채널 권한]에서 [획득]을 눌러 언제든지 받으실 수 있습니다.\n\n* 내전은 반드시 지정된 내전 전용 음성 채널에서만 진행해 주시기 바랍니다." },
        { q: "알림을 한 번에 삭제할 수 있나요?", t: "알림 전체 삭제 방법", a: "네, 가능합니다. 우측 상단 종 아이콘을 눌러 알림 목록을 연 뒤 [전체 삭제]를 누르면 모든 알림이 한 번에 삭제되며, 알림함에서도 동일하게 삭제할 수 있습니다.\n삭제된 알림은 복구되지 않으니 유의해 주시기 바랍니다. (1:1 문의 답변은 [1:1 문의] 내역에서 계속 확인하실 수 있습니다.)" },
        { q: "서버 부스터는 어떤 혜택을 받을 수 있나요?", t: "서버 부스터 혜택 안내", a: "서버 부스터에게는 전용 역할 · 배지와 함께 권한 제한 채널 이용, 슬로우 모드 해제 등의 권한이 별도 구매 없이 제공됩니다. 또한 부스팅 시작 보너스, 상시 · 일일 출석 추가 XP, ARCTIC 사용 XP 일부 환급, 유지 개월 수에 따른 누적 보상이 지급됩니다.\n자세한 내용은 내 정보의 [서버 부스터] 또는 '부스터 혜택' 페이지에서 확인해 주시기 바랍니다." }
      ]
    },
    {
      category: "MUSIC BOT",
      items: [
        { q: "MUSIC BOT이 무엇이고, 어떻게 사용하나요?", t: "이용 방법 및 채널 안내", a: "음성 채널에서 사용자가 원하는 음악을 재생할 수 있는 봇입니다.\n\n[사용 방법]\n음성 채널에 접속 후, 사용을 원하는 MUSIC BOT(MUSIC 1~4)을 선택합니다. 이후 재생하고자 하는 음악의 제목 또는 링크를 텍스트로 입력하면 봇이 음성 채널에 접속하여 음악을 재생합니다.\n\n* MUSIC-4 봇은 ARCTIC에서 전용 이용권 구매 후 사용이 가능합니다." },
        { q: "재생이 끊기거나 소리가 들리지 않으면 어떻게 하나요?", t: "네트워크 및 서버 점검", a: "[재생이 끊기는 현상]\n사용자의 네트워크 상태 또는 MUSIC BOT 서버가 불안정할 때 발생합니다. 본인의 네트워크를 먼저 확인해 주시고, 이상이 없다면 다른 번호의 MUSIC BOT을 이용해 주세요.\n\n[소리가 들리지 않는 현상]\n해당 봇의 개별 볼륨 및 서버 마이크 상태를 확인해 주세요. 정상적이라면 봇 서버의 불안정이 원인일 수 있으므로 다른 봇을 이용해 주시기 바랍니다." },
        { q: "MUSIC BOT이 재생되지 않거나, 음성 채널에 접속하지 않으면 어떻게 하나요?", t: "오류 및 오프라인 상태", a: "MUSIC BOT의 내부적인 시스템 문제이거나 봇 자체가 오프라인 상태일 가능성이 높습니다. 시스템이 복구될 때까지 다른 번호의 MUSIC BOT을 이용해 주시기 바랍니다." }
      ]
    },
    {
      category: "TTS BOT",
      items: [
        { q: "TTS BOT이 무엇이고, 어떻게 사용하나요?", t: "명령어 및 사용법", a: "음성 채널에서 사용자가 입력한 채팅을 기계음으로 대신 읽어주는 봇입니다.\n\n[사용 방법]\n음성 채널 접속 후 지정된 'TTS 전용 텍스트 채널'에 메시지를 입력하면 봇이 음성 채널에 접속하여 내용을 읽어줍니다.\n\n[명령어]\n/나가 - 음성 채널 연결 해제\n/스킵 - 현재 읽고 있는 메시지 건너뛰기\n/유저_설정 - 목소리, 음정, 속도 등 개인 맞춤 설정" },
        { q: "재생이 끊기거나 소리가 들리지 않으면 어떻게 하나요?", t: "서버 연결 및 볼륨 점검", a: "네트워크 상태나 TTS BOT 서버가 불안정할 때 발생할 수 있습니다. 본인의 네트워크 환경과 봇의 개인 볼륨 상태를 점검해 주시고, 해결되지 않는다면 1:1 문의를 통해 오류를 접수해 주시기 바랍니다." },
        { q: "TTS BOT이 아예 작동하지 않으면 어떻게 하나요?", t: "오류 원인 및 대처법", a: "1. 다른 음성 채널에 이미 연결되어 있는 경우\n봇이 이미 다른 채널에서 사용 중이라면 작동하지 않습니다. 봇이 있는 채널에 들어가 '/나가' 명령어를 사용한 후, 본인의 채널로 다시 불러와 주세요. (단, 타인이 정상 이용 중인 봇을 무단으로 뺏는 행위는 서버 제재 대상입니다.)\n\n2. 봇 서버 내부 오류인 경우\n서버 오류나 오프라인 상태일 경우 복구 시까지 이용이 불가합니다. 안정화 전까지 텍스트 채팅을 이용해 주시고, 1:1 문의를 통해 제보해 주시면 신속히 확인하겠습니다." }
      ]
    },
    {
      category: "VOICE ROOM",
      items: [
        { q: "생성형 VOICE ROOM 시스템이 무엇이고 어떻게 쓰나요?", t: "채널 자동 생성 시스템", a: "사용자가 접속하는 즉시 나만의 전용 음성 채널이 자동으로 생성되는 시스템입니다.\n\n[사용 방법]\n'CREATING' 채널에 접속하면 새로운 음성 채널이 생성되며, 해당 채널로 자동 이동됩니다. 생성된 채널에서 모든 인원이 퇴장하여 0명이 되면 채널은 깔끔하게 자동 삭제됩니다." },
        { q: "CREATING 채널에 들어갔는데 음성 채널이 생성이 안 되면 어떻게 하나요?", t: "API 지연 및 장애 대처", a: "디스코드 자체 서버 지연이거나 VOICE ROOM 생성 BOT의 API 통신 문제가 발생했을 확률이 높습니다. 이 현상이 지속될 경우 신속한 조치를 위해 1:1 문의 게시판을 통해 오류를 접수해 주시기 바랍니다." }
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
