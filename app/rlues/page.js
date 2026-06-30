"use client";

import React from "react";

export default function RulesPage() {
  const rulesData = [
    {
      title: "기본 에티켓 및 매너",
      desc: "고급 이글루는 서로를 존중하는 커뮤니티를 지향합니다.",
      rules: [
        "타인에게 불쾌감을 줄 수 있는 욕설, 비하, 조롱 및 차별적인 언행은 엄격히 금지됩니다.",
        "상호 존중을 바탕으로 한 올바른 호칭을 사용해 주시기 바랍니다.",
        "정치, 종교, 인종 등 사회적으로 민감한 분쟁 유발 주제는 다루지 않습니다."
      ]
    },
    {
      title: "채팅 및 음성 채널 규칙",
      desc: "원활한 채널 이용을 위해 아래 규칙을 준수해 주세요.",
      rules: [
        "의미 없는 도배성 채팅 및 무분별한 멘션(호출) 행위를 금지합니다.",
        "음성 채널 이용 시 타인의 발언을 지속적으로 끊거나 방해하는 행위를 삼가주세요.",
        "마이크 주변의 소음이 심할 경우, 타인을 배려하여 '눌러서 말하기'를 사용해 주세요."
      ]
    },
    {
      title: "금지 및 제재 행위",
      desc: "아래 항목 적발 시 경고 없이 즉각 제재(강퇴/차단) 처리될 수 있습니다.",
      rules: [
        "타 유저 및 관리진 사칭 행위, 서버 내부의 악의적인 허위 사실 유포",
        "음란물, 불법 프로그램 공유, 기타 법령에 위배되는 자료 업로드",
        "타 서버 홍보 및 금전적 이득을 취하려는 상업적 목적의 활동"
      ]
    }
  ];

  return (
    <main className="w-full max-w-5xl mx-auto px-6 py-16 flex-1 flex flex-col relative">
      <div className="mb-10 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-black text-white mb-3 tracking-tight">이용수칙</h1>
        <p className="text-gray-400 text-sm">고급 이글루 커뮤니티의 건강한 생태계를 위해 반드시 숙지해 주시기 바랍니다.</p>
      </div>

      <div className="flex flex-col gap-10">
        {rulesData.map((section, idx) => (
          <div key={idx} className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-8 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#e91e3f]/10 text-[#e91e3f] flex items-center justify-center font-black text-xl border border-[#e91e3f]/20 shrink-0">
                {idx + 1}
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{section.title}</h2>
            </div>
            <p className="text-gray-400 text-sm mb-6 pl-14">{section.desc}</p>
            
            <ul className="space-y-4 pl-14">
              {section.rules.map((rule, ruleIdx) => (
                <li key={ruleIdx} className="flex items-start text-sm text-gray-300 leading-relaxed">
                  <span className="text-[#e91e3f] mr-3 mt-1 font-bold">✓</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-12 bg-[#e91e3f]/5 border border-[#e91e3f]/20 rounded-2xl p-6 text-center">
        <p className="text-[#e91e3f] text-sm font-bold">
          ※ 본 이용수칙은 커뮤니티의 상황에 따라 사전 안내 후 변경될 수 있습니다.
        </p>
      </div>
    </main>
  );
}   