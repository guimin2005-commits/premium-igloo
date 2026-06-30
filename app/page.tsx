"use client";
import React from "react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 flex items-center relative">
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        
        {/* 이미지 부분 */}
        <div className="flex justify-center md:justify-end">
          <img 
            src="/logo.png" 
            alt="로고 이미지" 
            className="w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-[2.5rem] shadow-2xl object-cover" 
          />
        </div>
        
        {/* 텍스트 및 버튼 부분 */}
        <div className="flex flex-col justify-center items-center md:items-start text-center md:text-left">
          <h1 className="text-6xl md:text-8xl font-black tracking-tight text-white mb-2">고급 이글루</h1>
          <p className="text-lg md:text-xl font-light tracking-[0.4em] text-gray-500 mb-12 pl-1">PREMIUM IGLOO</p>
          <div className="flex flex-wrap justify-center md:justify-start gap-4">
            
            {/* 📌 수정 완료: 서버 바로가기 */}
            <a 
              href="https://discord.gg/V2uW2nUczU" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-8 py-4 bg-[#e91e3f] text-white rounded-full font-bold text-lg hover:bg-[#d01634] transition-colors shadow-lg shadow-[#e91e3f]/20 flex items-center gap-2 outline-none focus:outline-none"
            >
              서버 바로가기
            </a>
            
            {/* 📌 수정 완료: 이용 가이드 */}
            <Link 
              href="/faq"
              className="px-8 py-4 bg-transparent border border-gray-700 text-white rounded-full font-bold text-lg hover:bg-white/5 transition-colors outline-none focus:outline-none"
            >
              이용 가이드
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}