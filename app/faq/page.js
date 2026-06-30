"use client";

import React, { useState } from "react";
import Link from "next/link"; // 만약 Link 관련 에러가 난다면 이 줄이 필요합니다.

export default function FaqPage() {
  // 📌 <string | null> 같은 타입스크립트 문법을 모두 제거했습니다.
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [activeCategory, setActiveCategory] = useState("전체");

  const faqData = [
    {
      category: "XP & LEVEL 시스템",
      items: [
        { q: "레벨업에 필요한 XP 양은 모든 구간이 같나요?", t: "단계별 요구 XP 산정 방식", a: "상위 레벨로 진입할수록 다음 단계 달성에 필요한 XP 요구량이 점진적으로 증가합니다. 단, 레벨 상승에 맞춰 XP 획득 효율 또한 유동적으로 조정되어 안정적인 성장이 가능하도록 설계되었습니다." },
        { q: "채팅을 빠르고 많이 치면 XP를 빨리 획득할 수 있나요?", t: "비정상 획득 방지 여부", a: "획득할 수 있는 쿨타임이 존재합니다. 정상적인 채팅 활동을 통해 안정적으로 XP를 쌓아주세요." },
        { q: "음성 채널에 혼자 있어도 XP 획득이 가능한가요?", t: "활동에 따른 XP 획득 여부", a: "네, 가능합니다. 단, 마이크 및 헤드셋 음소거 시 XP 획득량이 90% 감소되며, 잠수 채널로 이동 시 XP 획득이 불가합니다." },
        { q: "레벨이 오르면 어떤 구체적인 혜택이 있나요?", t: "단계별 전용 혜택 여부", a: "특정 레벨마다 전용 레벨 역할 및 색상 혜택이 적용됩니다. 레벨이 상승할수록 XP SHOP 내 이용 가능한 상품 라인업이 점진적으로 확대됩니다.\nXP SHOP에는 서버 이용 편의를 돕는 권한 상품이 포함되어 있으니, 구매를 통해 최적화된 서버 환경을 경험해 보시기 바랍니다." },
        { q: "서버 퇴장 시 XP 및 LEVEL이 유지 되나요?", t: "서버 데이터 유지 여부", a: "유지되지 않습니다. 2026-04-11(토) 이후 운영 정책이 변경됨에 따라 서버 퇴장 시 즉시 XP 및 LEVEL이 모두 초기화 됩니다." }
      ]
    },
    {
      category: "XP SHOP 및 아이템 상품",
      items: [
        { q: "레벨에 따라 구매할 수 있는 상품이 다른가요?", t: "등급별 상품 접근 권한", a: "네, 그렇습니다. 레벨이 높아질수록 구매할 수 있는 상품의 폭이 커지게 됩니다.\n지속적인 활동을 통해 XP를 획득하여, 프리미엄 상품들을 이용하시길 바랍니다." },
        { q: "상품 구매 후 환불 및 교환이 가능한가요?", t: "환불 및 교환 규정 안내", a: "네, 가능합니다. 단, 기프트 상품을 제외한 모든 상품은 구매 후 30분 이내로 '1:1 문의'를 통해 환불 및 교환 신청 시에만 처리 가능합니다.\n기프트 상품의 경우에는 환불 및 교환이 절대 불가하오니 구매 시 유의해 주시기 바랍니다." },
        { q: "실물 상품 수령을 위해 꼭 개인정보를 입력해야 하나요?", t: "개인정보 수집 및 파기", a: "네, 이벤트 경품이나 기프트 상품을 전송해 드리기 위해 최소한의 정보(이메일 주소 등)가 필요합니다. 수집된 정보는 발송 완료 후 7일 이내에 영구 파기되므로 안심하고 입력해 주세요.\n\n* 주의: 고급 이글루 운영진은 어떠한 경우에도 비밀번호나 결제 정보를 요구하지 않습니다. 사칭에 주의해 주세요." },
        { q: "제가 수령해야 하는 상품과 다른 상품을 선택하면 어떻게 되나요?", t: "수령 정보 불일치 처리", a: "원활한 운영을 위해 상점 구매 내역과 설문 응답 내역이 일치해야만 상품이 전송됩니다. 다른 상품을 선택하실 경우 수령이 불가하거나 지급 대상에서 제외될 수 있으니 신중히 선택해 주세요." },
        { q: "기한 내에 수령 정보를 입력하지 못하면 어떻게 되나요?", t: "수령 기한 초과 규정", a: "정해진 기한 내에 수령 정보를 입력하지 않으실 경우, 상품 수령 권한이 소멸되며 사용된 경험치(XP)는 복구되지 않습니다. 기한을 반드시 엄수해 주시기 바랍니다." }
      ]
    },
    {
      category: "MUSIC BOT",
      items: [
        { q: "MUSIC BOT이 무엇인지, 어떻게 사용하는지 궁금해요.", t: "이용 방법 및 채널 안내", a: "음성 채널에서 사용자가 원하는 음악을 재생할 수 있는 봇입니다.\n\n[사용 방법]\n음성 채널에 접속 후, 사용을 원하는 MUSIC BOT(MUSIC 1~4)을 선택합니다. 이후 재생하고자 하는 음악의 제목 또는 링크를 텍스트로 입력하면 봇이 음성 채널에 접속하여 음악을 재생합니다.\n\n* MUSIC-4 봇은 레벨 시스템의 경험치샵에서 전용 이용권 구매 후 사용이 가능합니다." },
        { q: "재생이 끊기거나 소리가 들리지 않아요.", t: "네트워크 및 서버 점검", a: "[재생이 끊기는 현상]\n사용자의 네트워크 상태 또는 MUSIC BOT 서버가 불안정할 때 발생합니다. 본인의 네트워크를 먼저 확인해 주시고, 이상이 없다면 다른 번호의 MUSIC BOT을 이용해 주세요.\n\n[소리가 들리지 않는 현상]\n해당 봇의 개별 볼륨 및 서버 마이크 상태를 확인해 주세요. 정상적이라면 봇 서버의 불안정이 원인일 수 있으므로 다른 봇을 이용해 주시기 바랍니다." },
        { q: "MUSIC BOT이 재생되지 않거나, 음성 채널에 접속하지 않아요.", t: "오류 및 오프라인 상태", a: "MUSIC BOT의 내부적인 시스템 문제이거나 봇 자체가 오프라인 상태일 가능성이 높습니다. 시스템이 복구될 때까지 다른 번호의 MUSIC BOT을 이용해 주시기 바랍니다." }
      ]
    },
    {
      category: "TTS BOT",
      items: [
        { q: "TTS BOT이 무엇인지, 어떻게 사용하는지 궁금해요.", t: "명령어 및 사용법", a: "음성 채널에서 사용자가 입력한 채팅을 기계음으로 대신 읽어주는 봇입니다.\n\n[사용 방법]\n음성 채널 접속 후 지정된 'TTS 전용 텍스트 채널'에 메시지를 입력하면 봇이 음성 채널에 접속하여 내용을 읽어줍니다.\n\n[명령어]\n/나가 - 음성 채널 연결 해제\n/스킵 - 현재 읽고 있는 메시지 건너뛰기\n/유저_설정 - 목소리, 음정, 속도 등 개인 맞춤 설정" },
        { q: "재생이 끊기거나 소리가 들리지 않아요.", t: "서버 연결 및 볼륨 점검", a: "네트워크 상태나 TTS BOT 서버가 불안정할 때 발생할 수 있습니다. 본인의 네트워크 환경과 봇의 개인 볼륨 상태를 점검해 주시고, 해결되지 않는다면 1:1 문의를 통해 오류를 접수해 주시기 바랍니다." },
        { q: "TTS BOT이 아예 작동하지 않아요.", t: "오류 원인 및 대처법", a: "1. 다른 음성 채널에 이미 연결되어 있는 경우\n봇이 이미 다른 채널에서 사용 중이라면 작동하지 않습니다. 봇이 있는 채널에 들어가 '/나가' 명령어를 사용한 후, 본인의 채널로 다시 불러와 주세요. (단, 타인이 정상 이용 중인 봇을 무단으로 뺏는 행위는 서버 제재 대상입니다.)\n\n2. 봇 서버 내부 오류인 경우\n서버 오류나 오프라인 상태일 경우 복구 시까지 이용이 불가합니다. 안정화 전까지 텍스트 채팅을 이용해 주시고, 1:1 문의를 통해 제보해 주시면 신속히 확인하겠습니다." }
      ]
    },
    {
      category: "VOICE ROOM",
      items: [
        { q: "생성형 VOICE ROOM 시스템이 무엇이고 어떻게 쓰나요?", t: "채널 자동 생성 시스템", a: "사용자가 접속하는 즉시 나만의 전용 음성 채널이 자동으로 생성되는 시스템입니다.\n\n[사용 방법]\n'CREATING' 채널에 접속하면 새로운 음성 채널이 생성되며, 해당 채널로 자동 이동됩니다. 생성된 채널에서 모든 인원이 퇴장하여 0명이 되면 채널은 깔끔하게 자동 삭제됩니다." },
        { q: "CREATING 채널에 들어갔는데 음성 채널이 생성이 안 돼요.", t: "API 지연 및 장애 대처", a: "디스코드 자체 서버 지연이거나 VOICE ROOM 생성 BOT의 API 통신 문제가 발생했을 확률이 높습니다. 이 현상이 지속될 경우 신속한 조치를 위해 1:1 문의 게시판을 통해 오류를 접수해 주시기 바랍니다." }
      ]
    }
  ];

  // 📌 '(index: string)' 에서 타입 지정을 제거했습니다.
  const toggleFaq = (index) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };
  
  const filteredData = activeCategory === "전체" 
    ? faqData 
    : faqData.filter(section => section.category === activeCategory);

  return (
    <main className="w-full max-w-5xl mx-auto px-6 py-16 flex-1 flex flex-col relative animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="mb-10 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-black text-white mb-3 tracking-tight">FAQ</h1>
        <p className="text-gray-400 text-sm">고급 이글루 이용과 관련한 자주 묻는 질문들입니다.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-12">
        <button
          onClick={() => { setActiveCategory("전체"); setOpenFaqIndex(null); }}
          className={`px-5 py-2.5 rounded-full text-sm font-bold transition-colors outline-none focus:outline-none ${activeCategory === "전체" ? "bg-[#e91e3f] text-white shadow-lg shadow-[#e91e3f]/20" : "bg-[#1a1a1a] text-gray-400 border border-white/5 hover:border-white/20"}`}
        >
          전체
        </button>
        {faqData.map((section, idx) => (
          <button
            key={idx}
            onClick={() => { setActiveCategory(section.category); setOpenFaqIndex(null); }}
            className={`px-5 py-2.5 rounded-full text-sm font-bold transition-colors outline-none focus:outline-none ${activeCategory === section.category ? "bg-[#e91e3f] text-white shadow-lg shadow-[#e91e3f]/20" : "bg-[#1a1a1a] text-gray-400 border border-white/5 hover:border-white/20"}`}
          >
            {section.category}
          </button>
        ))}
      </div>

      <div className="w-full mx-auto flex flex-col gap-16">
        {filteredData.map((section, sectionIdx) => (
          <section key={sectionIdx}>
            {activeCategory === "전체" && (
              <h2 className="text-2xl font-black text-white mb-8 flex items-center gap-4">
                <span className="w-2 h-8 bg-[#e91e3f] rounded-full"></span>
                {section.category}
              </h2>
            )}
            
            <div className="flex flex-col gap-4">
              {section.items.map((faq, itemIdx) => {
                const uniqueIndex = `${sectionIdx}-${itemIdx}`;
                const isOpen = openFaqIndex === uniqueIndex;
                
                return (
                  <div 
                    key={uniqueIndex} 
                    className={`rounded-2xl transition-all duration-500 overflow-hidden ${
                      isOpen 
                        ? 'bg-[#181818] shadow-lg shadow-black/50 border border-white/10' 
                        : 'bg-transparent border border-white/5 hover:border-white/10'
                    }`}
                  >
                    <button 
                      onClick={() => toggleFaq(uniqueIndex)} 
                      className="w-full px-6 py-6 md:px-8 flex items-center justify-between text-left outline-none focus:outline-none group"
                    >
                      <div className="flex items-start md:items-center gap-4 md:gap-6 pr-4">
                        <span className={`font-black text-xl md:text-2xl transition-colors duration-300 ${isOpen ? 'text-[#e91e3f]' : 'text-gray-600 group-hover:text-gray-400'}`}>
                          Q.
                        </span>
                        <span className={`text-[15px] md:text-base font-bold transition-colors duration-300 leading-snug ${isOpen ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                          {faq.q}
                        </span>
                      </div>
                      
                      <div className={`relative flex items-center justify-center w-8 h-8 shrink-0 rounded-full transition-all duration-500 ${isOpen ? 'bg-[#e91e3f] rotate-180' : 'bg-white/5 group-hover:bg-white/10'}`}>
                        <span className={`absolute w-3 h-[2px] rounded-full transition-colors ${isOpen ? 'bg-white' : 'bg-gray-400'}`}></span>
                        <span className={`absolute w-[2px] h-3 rounded-full transition-all duration-500 ${isOpen ? 'bg-transparent rotate-90' : 'bg-gray-400'}`}></span>
                      </div>
                    </button>
                    
                    <div className={`transition-all duration-500 ease-in-out ${isOpen ? 'max-h-[800px] opacity-100 pb-8 px-6 md:px-8' : 'max-h-0 opacity-0 px-6 md:px-8 pb-0'}`}>
                      <div className="pl-0 md:pl-[3.25rem] border-t border-white/5 pt-6 mt-2">
                        <div className="inline-block px-3 py-1 mb-4 rounded-md bg-[#e91e3f]/10 border border-[#e91e3f]/20 text-[#e91e3f] text-xs font-bold">
                          {faq.t}
                        </div>
                        <p className="text-gray-400 text-[14px] md:text-sm leading-relaxed whitespace-pre-wrap">
                          {faq.a}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}