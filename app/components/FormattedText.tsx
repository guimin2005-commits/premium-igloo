"use client";

import React from "react";

// 📌 마크다운 서식 렌더러 (공지/이벤트/대회 페이지와 동일한 규칙)
//  · **굵게** __밑줄__ ~~취소선~~ ==강조== [링크](url) {복사코드} + 표
export const RenderFormattedText = ({ text, onCopy }: { text: string; onCopy?: () => void }) => {
  if (!text) return null;

  // 본문이 그대로 HTML 로 들어가므로 주소는 http(s) 만 허용하고 따옴표·꺾쇠는 막는다
  const safeUrl = (u: string) => (/^https?:\/\/[^"'<>\s]+$/i.test(String(u).trim()) ? String(u).trim() : "");

  const formatInlineMarkdown = (t: string): string => {
    return t
      // 이미지 — 링크보다 먼저 걸러야 한다 (뒤에 두면 링크로 잡히고 ! 만 남는다)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m: string, alt: string, url: string) => {
        const src = safeUrl(url);
        if (!src) return m;
        const cap = String(alt || "").replace(/[<>"']/g, "");
        return `<img src='${src}' alt='${cap}' loading='lazy' class='block w-full h-auto rounded-xl border border-white/10 my-5' />`
          + (cap ? `<span class='block text-center text-[12px] text-gray-500 -mt-3 mb-5'>${cap}</span>` : "");
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href='$2' target='_blank' rel='noopener noreferrer' class='text-[#e91e3f] hover:underline'>$1</a>")
      .replace(/\{([^}]+)\}/g, (match, code) => `<span class='inline-flex items-center gap-1.5 bg-[#2a2a2a] px-2.5 py-1 rounded'><code class='text-[#e91e3f] font-mono text-sm'>${code}</code><button class='copy-btn text-[#e91e3f] hover:text-white transition-colors flex-shrink-0' data-copy='${code}' title='복사'><svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' strokeWidth='2' stroke='currentColor' class='w-3.5 h-3.5'><path strokeLinecap='round' strokeLinejoin='round' d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' /></svg></button></span>`)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.*?)__/g, "<span class='underline'>$1</span>")
      .replace(/~~(.*?)~~/g, "<span class='line-through'>$1</span>")
      .replace(/==(.*?)==/g, "<span class='text-[#e91e3f] font-bold'>$1</span>")
      .replace(/^(\s*)\*[ \t]+/, "$1<span class='text-[#e91e3f]'>·</span> ");
  };

  const parseMarkdownTable = (lines: string[]): string | null => {
    if (lines.length < 2) return null;
    const headerLine = lines[0].trim();
    const separatorLine = lines[1].trim();
    if (!/^\|.*\|$/.test(headerLine) || !/^\|[\s|-]+\|$/.test(separatorLine)) return null;

    const parseRow = (line: string): string[] => line.split("|").slice(1, -1).map((cell) => cell.trim());
    const headerCells = parseRow(headerLine);
    const dataRows = lines.slice(2).map(parseRow);

    let html = "<table class='w-full border-collapse border border-white/10 my-4'>";
    html += "<thead><tr>";
    headerCells.forEach((cell) => {
      html += `<th class='border border-white/10 px-3 py-2 bg-white/5 text-left font-bold'>${formatInlineMarkdown(cell)}</th>`;
    });
    html += "</tr></thead><tbody>";
    dataRows.forEach((cells) => {
      html += "<tr>";
      cells.forEach((cell) => {
        html += `<td class='border border-white/10 px-3 py-2'>${formatInlineMarkdown(cell)}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
  };

  const parseMarkdownWithTable = (input: string): string => {
    const lines = input.split("\n");
    const result: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim().startsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i]);
          i++;
        }
        const table = parseMarkdownTable(tableLines);
        if (table) result.push(table);
        else result.push(...tableLines.map((l) => formatInlineMarkdown(l)));
      } else {
        result.push(formatInlineMarkdown(line));
        i++;
      }
    }
    return result.join("\n");
  };

  const formatted = parseMarkdownWithTable(text);

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
