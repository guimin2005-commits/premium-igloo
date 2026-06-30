"use client";

import React, { useState, useMemo } from "react";

const getCumulativeXpByLevel = (lvl) => {
  if (lvl <= 0) return 0;
  return Math.floor(((23 * lvl) ** 2 - 525) / 5) + 1;
};

const getLevelByXp = (xp) => {
  if (xp <= 0) return 0;
  for (let l = 1; l <= 1000; l++) {
    let requiredTotalXp = Math.floor(((23 * l) ** 2 - 525) / 5) + 1;
    if (xp < requiredTotalXp) return l - 1;
  }
  return 1000;
};

export default function LevelPage() {
  const [activeMainTab, setActiveMainTab] = useState("intro");

  const [searchLevel, setSearchLevel] = useState("");
  const searchResult = useMemo(() => {
    if (!searchLevel) return { cumXp: null, reqXp: null };
    let inputVal = parseInt(searchLevel);
    if (inputVal < 1) inputVal = 1;
    if (inputVal > 1000) inputVal = 1000;
    const cumXp = getCumulativeXpByLevel(inputVal);
    const reqXp = inputVal === 1 ? 0 : cumXp - getCumulativeXpByLevel(inputVal - 1);
    return { cumXp, reqXp, inputVal };
  }, [searchLevel]);

  const fullTableRows = useMemo(() => {
    let rows = [];
    for (let i = 1; i <= 1000; i++) {
      const cumXp = getCumulativeXpByLevel(i);
      const reqXp = i === 1 ? 0 : cumXp - getCumulativeXpByLevel(i - 1);
      rows.push({ level: i, cumXp, reqXp });
    }
    return rows;
  }, []);

  const handleSearch = () => {
    let val = parseInt(searchLevel);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 1000) val = 1000;
    setSearchLevel(val.toString());

    setTimeout(() => {
      const row = document.getElementById(`row-lvl-${val}`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  const [simLevel, setSimLevel] = useState("");
  const [simChannel, setSimChannel] = useState("chat");
  const [simTime, setSimTime] = useState("");
  const [simBoost1, setSimBoost1] = useState(false);
  const [simBoost2, setSimBoost2] = useState(false);
  const [simEvent, setSimEvent] = useState(false);
  const [penChild, setPenChild] = useState(false);
  const [penYouth, setPenYouth] = useState(false);
  const [penAdult, setPenAdult] = useState(false);
  const [penMother, setPenMother] = useState(false);
  const [simAttend, setSimAttend] = useState("");
  const [simAttendBoost, setSimAttendBoost] = useState(false);
  
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);

  const handleLimitInput = (setter, maxLimit) => (e) => {
    let val = e.target.value;
    if (val === "") {
      setter("");
      return;
    }
    let num = parseInt(val, 10);
    if (num < 0) num = 0;
    if (num > maxLimit) num = maxLimit;
    setter(num.toString());
  };

  const resetSimulator = () => {
    setSimLevel(""); setSimChannel("chat"); setSimTime("");
    setSimBoost1(false); setSimBoost2(false); setSimEvent(false);
    setPenChild(false); setPenYouth(false); setPenAdult(false); setPenMother(false);
    setSimAttend(""); setSimAttendBoost(false);
    setIsChannelDropdownOpen(false);
  };

  const simResult = useMemo(() => {
    const level = Math.max(0, parseInt(simLevel) || 0);
    const time = Math.max(0, parseInt(simTime) || 0);
    const attendanceCount = Math.max(0, parseInt(simAttend) || 0);

    let channelBaseXp = 0;
    let levelBonusXp = 0;
    let checkInterval = 1;

    if (simChannel === "chat") {
      channelBaseXp = 200; levelBonusXp = 0; checkInterval = 1;
    } else {
      checkInterval = 5;
      channelBaseXp = simChannel === "voice" ? 3000 : 3500;
      if (level >= 700) levelBonusXp = 1000;
      else if (level >= 649) levelBonusXp = 1000;
      else if (level >= 600) levelBonusXp = 1000;
      else if (level >= 550) levelBonusXp = 1000;
      else if (level >= 500) levelBonusXp = 1000;
      else if (level >= 450) levelBonusXp = 700;
      else if (level >= 400) levelBonusXp = 600;
      else if (level >= 350) levelBonusXp = 500;
      else if (level >= 300) levelBonusXp = 400;
      else if (level >= 250) levelBonusXp = 350;
      else if (level >= 200) levelBonusXp = 300;
      else if (level >= 150) levelBonusXp = 250;
      else if (level >= 100) levelBonusXp = 200;
      else if (level >= 50) levelBonusXp = 150;
      else levelBonusXp = 0;
    }

    const channelCycles = Math.floor(time / checkInterval);
    const channelTotalXp = (channelBaseXp + levelBonusXp) * channelCycles;

    const b1Add = simBoost1 ? 300 : 0;
    const b2Add = simBoost2 ? 100 : 0;
    const evAdd = simEvent ? 200 : 0;
    let penguinAdd = 0;
    if (penChild) penguinAdd += 250;
    if (penYouth) penguinAdd += 350;
    if (penAdult) penguinAdd += 450;
    if (penMother) penguinAdd += 550;

    const buffTotalXp = (b1Add + b2Add + evAdd + penguinAdd) * channelCycles;
    const attendanceBaseTotal = attendanceCount * 7000;
    const attendanceBoostTotal = simAttendBoost ? attendanceCount * 7000 : 0;

    const finalGrandTotal = channelTotalXp + buffTotalXp + attendanceBaseTotal + attendanceBoostTotal;
    const currentCumulativeXp = getCumulativeXpByLevel(level);
    const projectedTotalXp = currentCumulativeXp + finalGrandTotal;
    const finalLevel = getLevelByXp(projectedTotalXp);

    const cycleText = simChannel === "chat" ? "1분당" : "5분당";
    const cycleBaseText = simChannel === "chat" ? "1분" : "5분";

    return {
      channelBaseXp, levelBonusXp, channelCycles, channelTotalXp,
      b1Add, b2Add, evAdd, penguinAdd, buffTotalXp,
      attendanceBaseTotal, attendanceBoostTotal,
      finalGrandTotal, projectedTotalXp, finalLevel,
      cycleText, cycleBaseText
    };
  }, [simLevel, simChannel, simTime, simBoost1, simBoost2, simEvent, penChild, penYouth, penAdult, penMother, simAttend, simAttendBoost]);

  return (
    <main className="w-full max-w-5xl mx-auto px-6 py-16 flex-1 flex flex-col relative">
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #121212; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #e91e3f; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}} />

      <div className="mb-10 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-black text-white mb-3 tracking-tight">SYSTEM : LEVEL</h1>
        <p className="text-gray-400 text-sm">고급 이글루의 레벨 시스템 및 XP 통합 대시보드</p>
      </div>

      <div className="flex gap-2 mb-10 border-b border-white/5 pb-px overflow-x-auto custom-scrollbar">
        {[
          { id: "intro", name: "시스템 소개" },
          { id: "policy", name: "XP 획득 및 혜택" },
          { id: "table", name: "XP 테이블" },
          { id: "sim", name: "XP 시뮬레이터" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveMainTab(tab.id)}
            className={`px-5 py-3 text-sm font-bold transition-all border-b-2 shrink-0 outline-none focus:outline-none ${
              activeMainTab === tab.id ? "border-[#e91e3f] text-white" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {activeMainTab === "intro" && (
        <div className="animate-[fadeInBlur_0.3s_ease-out] flex flex-col gap-6">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#121212] border border-white/5 rounded-3xl p-8 md:p-12 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#e91e3f]/10 blur-[100px] rounded-full pointer-events-none"></div>
            <div className="relative z-10">
              <h3 className="text-2xl md:text-3xl font-black text-white mb-4 leading-snug">
                활동이 쌓일수록 커지는 혜택,<br />
                <span className="text-[#e91e3f]">고급 이글루 레벨 시스템</span>
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed max-w-lg">
                채팅과 음성 채널 활동으로 XP를 획득하여 레벨을 올리세요.<br className="hidden md:block"/>
                전용 역할과 권한, 특별한 상점 아이템이 여러분을 기다립니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { t: "XP 획득 및 한계 돌파", d: "채팅/음성 활동으로 끊임없이 성장하세요." },
              { t: "전용 역할 부여", d: "특정 레벨 도달 시 프리미엄 권한이 부여됩니다." },
              { t: "XP SHOP 혜택", d: "모은 XP로 시즌 상품과 특별 권한을 구매하세요." },
            ].map((f, i) => (
              <div key={i} className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-6 hover:border-[#e91e3f]/30 transition-all group">
                <div className="w-10 h-10 bg-[#e91e3f]/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <div className="w-3 h-3 bg-[#e91e3f] rounded-sm rotate-45"></div>
                </div>
                <div className="text-white font-bold text-base mb-2">{f.t}</div>
                <div className="text-gray-500 text-sm break-keep">{f.d}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-8">
              <h4 className="text-lg font-bold text-white mb-6 border-b border-white/5 pb-4">기본 명령어</h4>
              <ul className="space-y-4">
                {[
                  { c: "/레벨", d: "다음 레벨 도달까지 필요 XP 확인" },
                  { c: "/랭크", d: "XP, 레벨, 서버 내 순위 확인" },
                  { c: "/출석체크", d: "출석체크를 통한 7,000 XP 지급" },
                  { c: "/경험치샵", d: "XP SHOP 상점으로 이동" },
                ].map((item, i) => (
                  <li key={i} className="flex flex-col md:flex-row md:items-center text-sm gap-2 md:gap-4">
                    <span className="bg-[#121212] text-[#e91e3f] px-3 py-1.5 rounded-lg border border-white/10 font-mono font-bold shrink-0 w-max">{item.c}</span>
                    <span className="text-gray-400">{item.d}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-8">
              <h4 className="text-lg font-bold text-white mb-6 border-b border-white/5 pb-4">이용 시 주의사항</h4>
              <ul className="space-y-4 text-sm text-gray-400">
                <li className="flex items-start bg-[#121212] p-4 rounded-xl border border-white/5">
                  <span className="mr-3 text-xl">⚠️</span>
                  <div><strong className="text-white block mb-1">XP 획득 제한</strong>잠수 음성 채널 이용 시 XP 획득이 전면 제한되며, 마이크/헤드셋 음소거 시 XP 획득량이 90% 감소됩니다.</div>
                </li>
                <li className="flex items-start bg-[#121212] p-4 rounded-xl border border-white/5">
                  <span className="mr-3 text-xl">🛒</span>
                  <div><strong className="text-white block mb-1">상점 이용 주의</strong>XP SHOP 상품은 보유 XP 소모 방식입니다. 구매로 인해 레벨이 하락할 수 있습니다.</div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeMainTab === "policy" && (
        <div className="animate-[fadeInBlur_0.3s_ease-out] flex flex-col gap-16">
          <section>
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-1.5 h-6 bg-[#e91e3f] rounded-full"></span> 기본 XP 획득량
            </h3>
            <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-6 flex flex-col gap-6">
              {[
                { t: "채팅 채널", d: "채팅 입력 시 XP를 획득하며, 오남용 방지를 위해 쿨타임 1분이 적용되어 있습니다.", x: "+ 200 XP", c: "쿨타임 1분" },
                { t: "음성 채널", d: "최소 5분 동안 접속 지속 시 XP 지급이 됩니다.", x: "+ 3,000 XP", c: "쿨타임 5분" },
                { t: "내전 채널", d: "기존 음성 채널과 동일하게 적용되며, 보너스 500 XP가 추가 지급됩니다.", x: "+ 3,500 XP", c: "쿨타임 5분" },
              ].map((item, i) => (
                <div key={i} className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-white/5 last:border-0 last:pb-0 gap-4">
                  <div className="flex-1 pr-4">
                    <div className="text-sm font-bold text-white mb-1.5">{item.t}</div>
                    <div className="text-xs text-gray-400 leading-relaxed">{item.d}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <span className="bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 px-3 py-1 rounded-full text-xs font-bold">{item.x}</span>
                    <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-3 py-1 rounded-full text-xs font-bold">{item.c}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-1.5 h-6 bg-[#e91e3f] rounded-full"></span> 추가 XP & 출석 보상
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* 📌 변경: 아이템 상품 [영구제] (이모지 및 색상 제거) */}
              <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-6">
                <div className="text-sm font-bold text-white mb-6">
                  아이템 상품 [영구제]
                </div>
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-start pb-6 border-b border-white/5">
                    <div className="flex-1 pr-4">
                      <div className="text-sm font-bold text-white mb-1.5">[XP] Boost+</div>
                      <div className="text-xs text-gray-400">조건 충족 시 기본 XP에 추가 획득</div>
                    </div>
                    <span className="bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 px-3 py-1 rounded-full text-xs font-bold shrink-0">+ 300 XP</span>
                  </div>
                  
                  <div className="pt-2">
                    <div className="text-sm font-bold text-white mb-1.5">[역할] 펭귄 패밀리</div>
                    <div className="text-xs text-gray-400 mb-4">보유 시 기본 XP에 추가 획득 [중첩 누적 가능]</div>
                    <div className="border border-white/5 rounded-xl overflow-hidden bg-[#121212] w-full">
                      <table className="w-full text-xs text-center">
                        <thead className="bg-[#181818] text-white">
                          <tr><th className="p-3 font-semibold border-b border-white/5">보유 역할</th><th className="p-3 font-semibold border-b border-white/5">추가 XP</th></tr>
                        </thead>
                        <tbody className="text-gray-400 divide-y divide-white/5">
                          <tr><td className="p-3">어린이 펭귄</td><td className="p-3 text-[#e91e3f] font-bold">+ 250 XP</td></tr>
                          <tr><td className="p-3">청소년 펭귄</td><td className="p-3 text-[#e91e3f] font-bold">+ 350 XP</td></tr>
                          <tr><td className="p-3">어른 펭귄</td><td className="p-3 text-[#e91e3f] font-bold">+ 450 XP</td></tr>
                          <tr><td className="p-3">어미 펭귄</td><td className="p-3 text-[#e91e3f] font-bold">+ 550 XP</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                {/* 📌 변경: 시즌 상품 [기간제] (이모지 및 색상 제거) */}
                <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-6">
                  <div className="text-sm font-bold text-white mb-6">
                    시즌 상품 [기간제]
                  </div>
                  <div className="flex flex-col gap-6">
                    <div className="flex justify-between items-start pb-6 border-b border-white/5">
                      <div className="flex-1 pr-4">
                        <div className="text-sm font-bold text-white mb-1.5">[XP] S1 Boost+</div>
                        <div className="text-xs text-gray-400">조건 충족 시 기본 XP에 추가 획득</div>
                      </div>
                      <span className="bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 px-3 py-1 rounded-full text-xs font-bold shrink-0">+ 100 XP</span>
                    </div>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-4">
                        <div className="text-sm font-bold text-white mb-1.5">[이벤트] 7월 Bonus</div>
                        <div className="text-xs text-gray-400">조건 충족 시 기본 XP에 추가 획득</div>
                      </div>
                      <span className="bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 px-3 py-1 rounded-full text-xs font-bold shrink-0">+ 550 XP</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-6">
                  <div className="text-sm font-bold text-white mb-6">출석 보상 시스템</div>
                  <div className="flex flex-col gap-6">
                    <div className="flex justify-between items-start pb-6 border-b border-white/5">
                      <div className="flex-1 pr-4">
                        <div className="text-sm font-bold text-white mb-1.5">기본 출석 체크</div>
                        <div className="text-xs text-gray-400">출석 체크 시, 1회당 7,000 XP가 지급됩니다.</div>
                      </div>
                      <span className="bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 px-3 py-1 rounded-full text-xs font-bold shrink-0">+ 7,000 XP</span>
                    </div>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-4">
                        <div className="text-sm font-bold text-white mb-1.5">[XP] 출석 Boost</div>
                        <div className="text-xs text-gray-400">상품 보유 시 출석 체크 기본 XP에 추가로 획득합니다.</div>
                      </div>
                      <span className="bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 px-3 py-1 rounded-full text-xs font-bold shrink-0">+ 7,000 XP</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-1.5 h-6 bg-[#e91e3f] rounded-full"></span> 레벨 구간별 추가 기준
            </h3>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 p-3 bg-[#181818] border border-white/5 rounded-xl text-xs font-bold text-white text-center">
                <div>진입 조건 레벨</div><div>구간 추가 XP</div><div>이전 대비 변동량</div>
              </div>
              {[
                { l: "0Lv ~ 49Lv (기본값)", x: "+3,000 XP", d: "-", c: "text-gray-500" },
                { l: "50Lv ~ 99Lv", x: "+3,150 XP", d: "▲ 150", c: "text-[#e91e3f]" },
                { l: "100Lv ~ 149Lv", x: "+3,250 XP", d: "▲ 100", c: "text-[#e91e3f]" },
                { l: "150Lv ~ 199Lv", x: "+3,350 XP", d: "▲ 100", c: "text-[#e91e3f]" },
                { l: "200Lv ~ 249Lv", x: "+3,500 XP", d: "▲ 150", c: "text-[#e91e3f]" },
                { l: "250Lv ~ 299Lv", x: "+3,600 XP", d: "▲ 100", c: "text-[#e91e3f]" },
                { l: "300Lv ~ 349Lv", x: "+3,700 XP", d: "▲ 100", c: "text-[#e91e3f]" },
                { l: "350Lv ~ 399Lv", x: "+3,800 XP", d: "▲ 100", c: "text-[#e91e3f]" },
                { l: "400Lv ~ 449Lv", x: "+4,000 XP", d: "▲ 200", c: "text-[#e91e3f]" },
                { l: "450Lv ~ 499Lv", x: "+4,200 XP", d: "▲ 200", c: "text-[#e91e3f]" },
                { l: "500Lv ~ 549Lv", x: "+4,400 XP", d: "▲ 200", c: "text-[#e91e3f]" },
                { l: "550Lv ~ 599Lv", x: "+4,600 XP", d: "▲ 200", c: "text-[#e91e3f]" },
                { l: "600Lv ~ 649Lv", x: "+4,800 XP", d: "▲ 200", c: "text-[#e91e3f]" },
                { l: "649Lv ~ 699Lv", x: "+5,000 XP", d: "▲ 200", c: "text-[#e91e3f]" },
                { l: "700Lv 이상 최고 구간", x: "+6,000 XP", d: "▲ 1,000", c: "text-[#e91e3f]" },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-3 p-3 bg-[#1a1a1a] border border-white/5 rounded-xl text-xs items-center text-center">
                  <div className="text-gray-300">{row.l}</div>
                  <div className="text-gray-400 font-bold">{row.x}</div>
                  <div className={`font-bold ${row.c}`}>{row.d}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeMainTab === "table" && (
        <div className="animate-[fadeInBlur_0.3s_ease-out]">
          <h3 className="text-sm font-bold text-white mb-3 pl-1">레벨별 필요 및 누적 XP 검색</h3>
          
          <div className="bg-[#1a1a1a] border border-white/5 p-6 rounded-2xl mb-6 flex flex-col lg:flex-row gap-6 items-center shadow-lg">
            <div className="flex flex-col gap-3 shrink-0 w-full lg:w-auto">
              <label className="text-xs font-bold text-gray-400">🔍 레벨을 입력하여 검색하세요 (1~1000)</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={searchLevel}
                  onChange={(e) => setSearchLevel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="0~1000" 
                  className="w-full lg:w-36 px-4 py-3 bg-[#121212] border border-white/10 rounded-xl text-white text-sm outline-none focus:outline-none focus:border-[#e91e3f] text-center transition-colors"
                />
                <button 
                  onClick={handleSearch} 
                  className="px-5 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-xl transition-colors outline-none focus:outline-none shadow-lg shadow-[#e91e3f]/20 shrink-0"
                >
                  검색
                </button>
              </div>
            </div>
            <div className="flex-1 w-full flex justify-around bg-[#121212] border border-white/5 rounded-xl p-5">
              <div className="text-center">
                <span className="block text-xs text-gray-500 mb-1.5">해당 레벨 누적 XP</span>
                <span className="text-sm md:text-base font-bold text-[#e91e3f]">{searchResult.cumXp ? `${searchResult.cumXp.toLocaleString()} XP` : "- XP"}</span>
              </div>
              <div className="w-px bg-white/10 mx-2"></div>
              <div className="text-center">
                <span className="block text-xs text-gray-500 mb-1.5">레벨업 필요 XP (이전 ➡ 현재)</span>
                <span className="text-sm md:text-base font-bold text-white">{searchResult.reqXp !== null ? `${searchResult.reqXp.toLocaleString()} XP` : "- XP"}</span>
              </div>
            </div>
          </div>

          <div className="border border-white/5 rounded-2xl bg-[#1a1a1a] overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar relative">
            <table className="w-full text-center text-xs">
              <thead className="bg-[#181818] text-white sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-4 font-semibold border-b border-white/5">도달 레벨</th>
                  <th className="p-4 font-semibold border-b border-white/5">누적 XP 총량</th>
                  <th className="p-4 font-semibold border-b border-white/5">필요 XP (이전 대비)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-gray-400">
                {fullTableRows.map((row) => (
                  <tr 
                    key={row.level} 
                    id={`row-lvl-${row.level}`}
                    className={`hover:bg-[#181818] transition-all duration-300 ${searchResult.inputVal === row.level ? 'bg-[#e91e3f]/10 border-l-2 border-[#e91e3f]' : ''}`}
                  >
                    <td className="p-3 text-[#e91e3f] font-bold">{row.level} Lv</td>
                    <td className="p-3 text-gray-200">{row.cumXp.toLocaleString()} XP</td>
                    <td className="p-3">{row.reqXp.toLocaleString()} XP</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeMainTab === "sim" && (
        <div className="animate-[fadeInBlur_0.3s_ease-out]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2 bg-[#1a1a1a] border border-white/5 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white mb-2 border-b border-white/5 pb-4">시뮬레이터 조건 설정</h3>
                
                {[
                  { l: "현재 유저 레벨", type: "number", val: simLevel, set: setSimLevel, p: "0~1000", max: 1000 },
                  { l: "총 활동 시간 (분 단위)", type: "number", val: simTime, set: setSimTime, p: "0~999999", max: 999999 },
                  { l: "총 출석 횟수", type: "number", val: simAttend, set: setSimAttend, p: "0~9999", max: 9999 },
                ].map((input, idx) => (
                  <div key={idx} className="flex justify-between items-center py-3 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">{input.l}</label>
                    <input 
                      type="number" 
                      placeholder={input.p} 
                      value={input.val} 
                      onChange={handleLimitInput(input.set, input.max)} 
                      className="w-36 px-3 py-2 bg-[#121212] border border-white/5 rounded-lg text-white text-xs outline-none focus:outline-none focus:border-[#e91e3f] transition-colors" 
                    />
                  </div>
                ))}

                <div className="relative">
                  <div className="flex justify-between items-center py-3 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">이용 활동 채널</label>
                    <div className="w-36">
                      <button
                        type="button"
                        onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
                        className="w-full px-3 py-2 bg-[#121212] border border-white/5 rounded-lg text-white text-xs outline-none focus:outline-none transition-colors hover:border-white/20 flex justify-between items-center"
                      >
                        <span>
                          {simChannel === 'chat' ? '채팅 채널 (1분)' : simChannel === 'voice' ? '음성 채널 (5분)' : '내전 채널 (5분)'}
                        </span>
                        <span className="text-[10px] text-gray-500">▼</span>
                      </button>
                      
                      {isChannelDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsChannelDropdownOpen(false)}></div>
                          <div className="absolute top-[100%] right-0 w-36 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden shadow-2xl z-50 animate-[fadeInBlur_0.2s_ease-out]">
                            {[
                              { val: 'chat', label: '채팅 채널 (1분)' },
                              { val: 'voice', label: '음성 채널 (5분)' },
                              { val: 'scrim', label: '내전 채널 (5분)' }
                            ].map((opt) => (
                              <button
                                key={opt.val}
                                type="button"
                                onClick={() => { setSimChannel(opt.val); setIsChannelDropdownOpen(false); }}
                                className={`w-full text-left px-3 py-2.5 text-xs transition-colors outline-none focus:outline-none relative z-50 ${simChannel === opt.val ? 'bg-[#e91e3f]/20 text-[#e91e3f] font-bold' : 'text-gray-400 hover:bg-[#232329] hover:text-white'}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* 📌 변경: 아이템 상품 [영구제] 카테고리화 및 명칭 통합 */}
                <div className="mt-4 border border-white/10 bg-[#181818] rounded-xl p-4">
                  <div className="text-[11px] font-bold text-white mb-3 uppercase tracking-wider">아이템 상품 [영구제]</div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">[아이템] XP Boost+ 적용</label>
                    <button type="button" onClick={() => setSimBoost1(!simBoost1)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simBoost1 ? 'bg-[#e91e3f] border border-[#e91e3f]' : 'bg-[#121212] border border-white/10'}`}>
                      <div className={`absolute left-1 top-1 w-3.5 h-3.5 rounded-full transition-transform ${simBoost1 ? 'translate-x-5 bg-white' : 'bg-gray-500'}`}></div>
                    </button>
                  </div>
                  
                  {/* 📌 변경: 출석 Boost를 영구제 카테고리 안으로 이동 및 명칭 변경 */}
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">[아이템] 출석 Boost 적용</label>
                    <button type="button" onClick={() => setSimAttendBoost(!simAttendBoost)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simAttendBoost ? 'bg-[#e91e3f] border border-[#e91e3f]' : 'bg-[#121212] border border-white/10'}`}>
                      <div className={`absolute left-1 top-1 w-3.5 h-3.5 rounded-full transition-transform ${simAttendBoost ? 'translate-x-5 bg-white' : 'bg-gray-500'}`}></div>
                    </button>
                  </div>

                  <div className="py-2 flex flex-col gap-3">
                    <label className="text-xs font-medium text-gray-300">[아이템] 보유 펭귄 선택 (중복 가능)</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { l: "어린이 (+250)", val: penChild, set: setPenChild },
                        { l: "청소년 (+350)", val: penYouth, set: setPenYouth },
                        { l: "어른 (+450)", val: penAdult, set: setPenAdult },
                        { l: "어미 (+550)", val: penMother, set: setPenMother },
                      ].map((p, idx) => (
                        <button key={idx} type="button" onClick={() => p.set(!p.val)} className={`px-4 py-2 rounded-xl text-[11px] font-bold outline-none focus:outline-none transition-all border ${p.val ? 'bg-[#e91e3f] border-[#e91e3f] text-white shadow-md shadow-[#e91e3f]/20' : 'bg-[#121212] border-white/5 text-gray-400 hover:border-white/20'}`}>
                          {p.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 📌 변경: 시즌 상품 [기간제] 카테고리화 및 명칭 통합 */}
                <div className="mt-4 border border-white/10 bg-[#181818] rounded-xl p-4">
                  <div className="text-[11px] font-bold text-white mb-3 uppercase tracking-wider">시즌 상품 [기간제]</div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">[아이템] [XP] S1 Boost+ 적용</label>
                    <button type="button" onClick={() => setSimBoost2(!simBoost2)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simBoost2 ? 'bg-white/30 border border-white/50' : 'bg-[#121212] border border-white/10'}`}>
                      <div className={`absolute left-1 top-1 w-3.5 h-3.5 rounded-full transition-transform ${simBoost2 ? 'translate-x-5 bg-white' : 'bg-gray-500'}`}></div>
                    </button>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <label className="text-xs font-medium text-gray-300">[이벤트] 7월 Bonus 적용</label>
                    <button type="button" onClick={() => setSimEvent(!simEvent)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simEvent ? 'bg-white/30 border border-white/50' : 'bg-[#121212] border border-white/10'}`}>
                      <div className={`absolute left-1 top-1 w-3.5 h-3.5 rounded-full transition-transform ${simEvent ? 'translate-x-5 bg-white' : 'bg-gray-500'}`}></div>
                    </button>
                  </div>
                </div>

                <div className="mt-2 text-left">
                  <button onClick={resetSimulator} className="px-5 py-2.5 bg-[#121212] border border-white/5 rounded-xl text-xs font-bold outline-none focus:outline-none text-gray-400 hover:text-white hover:border-white/20 transition-all">
                    전체 초기화
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col relative h-full">
              <div className="bg-gradient-to-br from-[#1e1416] to-[#3a1622] border border-[#e91e3f] rounded-2xl p-6 flex justify-between items-center shadow-[0_10px_25px_rgba(233,30,63,0.2)] relative z-10">
                <span className="text-sm font-bold text-white">예상 최종 누적 XP</span>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="bg-[#e91e3f] text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold">도달 예상: {simResult.finalLevel} Lv</span>
                  <span className="text-3xl font-black text-[#e91e3f] drop-shadow-[0_0_12px_rgba(233,30,63,0.3)]">{simResult.projectedTotalXp.toLocaleString()} XP</span>
                  <span className="text-[11px] text-gray-300">(예상 추가 획득: + {simResult.finalGrandTotal.toLocaleString()} XP)</span>
                </div>
              </div>

              <div className="bg-[#1a1a1a] border border-white/5 rounded-b-2xl p-6 pt-8 relative z-0 mx-auto w-[97%] -mt-4">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-white/5">
                    {/* 📌 테이블 결과 명칭들을 요청사항에 맞게 모두 텍스트로 치환 및 통일 완료 */}
                    {[
                      { l: "선택 채널 기본 XP (1회당)", v: `${simResult.channelBaseXp.toLocaleString()} XP` },
                      { l: "레벨별 구간 추가 XP (1회당)", v: `${simResult.levelBonusXp.toLocaleString()} XP` },
                      { l: "[채널] 1회 지급당 합계 XP", v: `${(simResult.channelBaseXp + simResult.levelBonusXp).toLocaleString()} XP` },
                      { l: "[채널] 예상 활동 인정 횟수", v: `${simResult.channelCycles}회` },
                      { l: "[채널] 활동 XP 획득 총량", v: `${simResult.channelTotalXp.toLocaleString()} XP` },
                      { l: `아이템 상품 [영구제] XP Boost+ 추가합산 (${simResult.cycleText})`, v: `${simResult.b1Add.toLocaleString()} XP` },
                      { l: `아이템 상품 [영구제] 펭귄 패밀리 추가 합산 (${simResult.cycleText})`, v: `${simResult.penguinAdd.toLocaleString()} XP` },
                      { l: `아이템 상품 [영구제] 출석 Boost 추가 합계`, v: `${simResult.attendanceBoostTotal.toLocaleString()} XP` },
                      { l: `시즌 상품 [기간제] S1 Boost+ 추가합산 (${simResult.cycleText})`, v: `${simResult.b2Add.toLocaleString()} XP` },
                      { l: `시즌 상품 [기간제] 7월 Bonus 추가합산 (${simResult.cycleText})`, v: `${simResult.evAdd.toLocaleString()} XP` },
                      { l: `[아이템] 적용 인정 횟수 (${simResult.cycleBaseText} 지속 기준)`, v: `${simResult.channelCycles}회` },
                      { l: "[버프] 아이템/이벤트 획득 총량", v: `${simResult.buffTotalXp.toLocaleString()} XP` },
                      { l: "[출석] 기본 출석 보상 합계", v: `${simResult.attendanceBaseTotal.toLocaleString()} XP` },
                    ].map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 text-gray-400 break-keep">{row.l}</td>
                        <td className="py-2.5 text-right text-white font-bold">{row.v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}
    </main>
  );
}