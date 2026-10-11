"use client";

import React from "react";
import { renderMarkdownHtml } from "./mdRender";

// 📌 마크다운 서식 렌더러 (공지/이벤트/대회 페이지와 동일한 규칙) — 규칙은 ./mdRender.ts 한 곳
//  · **굵게** __밑줄__ ~~취소선~~ ==강조== [링크](url) {복사코드} + 표
//  · 줄 앞: # 큰 제목 · ## 중간 제목 · ### 작은 제목 · -# 작은 글씨 · * / - 목록 · 1. 번호 · > 인용 · --- 구분선
//  · dark — 어두운 바탕(대회 글): 제목 글자를 흰색으로
export const RenderFormattedText = ({ text, onCopy, dark = false }: { text: string; onCopy?: () => void; dark?: boolean }) => {
  if (!text) return null;
  const formatted = renderMarkdownHtml(text, { dark });

  return (
    <div
      className="whitespace-pre-wrap break-keep leading-relaxed"
      dangerouslySetInnerHTML={{ __html: formatted }}
      onClick={(e: React.MouseEvent) => {
        let target = e.target as HTMLElement;
        while (target && !target.classList.contains("copy-btn")) {
          target = target.parentElement as HTMLElement;
        }
        if (target?.classList.contains("copy-btn")) {
          const code = target.getAttribute("data-copy");
          if (code) {
            navigator.clipboard.writeText(code);
            onCopy?.();
          }
        }
      }}
    />
  );
};

export default RenderFormattedText;
