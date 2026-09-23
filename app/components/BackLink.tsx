"use client";

import Link from "next/link";

// 📌 돌아가는 길 — 모든 하위 페이지의 왼쪽 위 한 줄. 문구는 "돌아가기"가 아니라 상위 화면 이름만.
//    라이트 화면(내 정보·상점·서포터즈)은 tone "light", 잉크·대회 화면은 "dark".
//    행 안에 끼워 넣을 때는 inline 로 아래 여백을 뺀다.
export default function BackLink({
  href,
  label,
  tone = "light",
  inline = false,
  className = "",
}: {
  href: string;
  label: string;
  tone?: "light" | "dark";
  inline?: boolean;
  className?: string;
}) {
  const color = tone === "dark" ? "text-gray-400 hover:text-white" : "text-[#8a8a8a] hover:text-[#131313]";
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-[12px] font-bold transition-colors outline-none focus:outline-none ${color} ${inline ? "" : "mb-6"} ${className}`}
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      {label}
    </Link>
  );
}
