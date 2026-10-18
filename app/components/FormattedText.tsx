"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderMarkdownHtml } from "./mdRender";
import { itemTagIdsOf } from "@/lib/itemTag";
import { ItemTag, useItemTags } from "./ItemTag";

// 📌 마크다운 서식 렌더러 (공지/이벤트/대회 페이지와 동일한 규칙) — 규칙은 ./mdRender.ts 한 곳
//  · **굵게** __밑줄__ ~~취소선~~ ==강조== [링크](url) {복사코드} + 표
//  · 줄 앞: # 큰 제목 · ## 중간 제목 · ### 작은 제목 · -# 작은 글씨 · * / - 목록 · 1. 번호 · > 인용 · --- 구분선
//  · dark — 어두운 바탕(대회 글): 제목 글자를 흰색으로
//  · 📌 아이템 태그 [[item:<id>:<이름>]](2026-10-18 — lib/itemTag) — mdRender 가 그린 자리(span.itag)에 알약 · 카드(./ItemTag)를 끼운다(포털).
//    본문 HTML 은 글이 바뀔 때만 다시 그려지므로(dangerouslySetInnerHTML) 그 사이 자리는 그대로다 — 글이 바뀌면 자리를 다시 찾는다
type Slot = { el: HTMLElement; id: string; name: string; solo: boolean };

export const RenderFormattedText = ({ text, onCopy, dark = false }: { text: string; onCopy?: () => void; dark?: boolean }) => {
  const formatted = useMemo(() => (text ? renderMarkdownHtml(text, { dark }) : ""), [text, dark]);
  const ids = useMemo(() => itemTagIdsOf(text), [text]);
  const tagOf = useItemTags(ids);
  const boxRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  // 📌 태그가 있는 글은 본문을 여기서 한 번 넣는다(글이 바뀔 때만) — dangerouslySetInnerHTML 로 두면 다시 그릴 때마다 본문을 통째로 다시 써서
  //    끼운 알약 · 카드가 지워졌다(실측 — 자리를 채운 뒤 innerHTML 이 두 번 더 들어갔다). 태그 없는 글은 예전 그대로(dangerouslySetInnerHTML)
  const tagged = ids.length > 0;
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !tagged) { setSlots([]); return; }
    box.innerHTML = formatted;
    const found: Slot[] = [];
    box.querySelectorAll<HTMLElement>("span.itag[data-itag]").forEach((el) => {
      // 자리 안의 이름 글자(읽기 전 · JS 없을 때)는 비우고 포털로 채운다
      el.replaceChildren();
      found.push({ el, id: el.dataset.itag || "", name: el.dataset.iname || "", solo: el.dataset.solo === "1" });
    });
    setSlots(found);
  }, [formatted, tagged]);

  if (!text) return null;
  return (
    <>
      <div
        // 태그 있음 ↔ 없음이 바뀌면 상자를 새로(관리 방식이 다르다)
        key={tagged ? "tagged" : "plain"}
        ref={boxRef}
        className="whitespace-pre-wrap break-keep leading-relaxed"
        {...(tagged ? {} : { dangerouslySetInnerHTML: { __html: formatted } })}
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
      {slots.map((s, i) => {
        const { info, loaded } = tagOf(s.id);
        return createPortal(<ItemTag name={s.name} info={info} loaded={loaded} solo={s.solo} dark={dark} />, s.el, `${s.id}:${i}`);
      })}
    </>
  );
};

export default RenderFormattedText;
