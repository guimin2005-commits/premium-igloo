"use client";

import { useEffect } from "react";

// 📌 팝업이 떠 있는 동안 뒤 화면이 스크롤되지 않게 잠근다 (사이트 전역)
//    모달을 하나하나 고치는 대신, 화면을 덮는 오버레이가 생겼는지 DOM에서 살펴본다.
//    이 프로젝트의 모달은 모두 `fixed inset-0` 오버레이를 깔기 때문에 이 표시를 기준으로 삼는다.
//    · 모바일(특히 iOS)은 overflow:hidden만으로는 뒤가 밀리므로 body를 고정하고 위치를 기억했다가 되돌린다.
export default function ScrollLock() {
  useEffect(() => {
    const SELECTOR = '[class*="fixed inset-0"]';
    let locked = false;
    let savedY = 0;

    const lock = () => {
      if (locked) return;
      savedY = window.scrollY;
      const body = document.body;
      // 데스크톱에서 스크롤바가 사라지며 내용이 밀리지 않도록 그만큼 여백을 준다
      const gutter = window.innerWidth - document.documentElement.clientWidth;
      body.dataset.scrollLocked = "1";
      body.style.position = "fixed";
      body.style.top = `-${savedY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      if (gutter > 0) body.style.paddingRight = `${gutter}px`;
      locked = true;
    };

    const unlock = () => {
      if (!locked) return;
      const body = document.body;
      delete body.dataset.scrollLocked;
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      body.style.overflow = "";
      body.style.paddingRight = "";
      // 잠글 때 기억해 둔 자리로 조용히 되돌린다
      window.scrollTo(0, savedY);
      locked = false;
    };

    // 화면을 덮고 있고, 실제로 보이며, 클릭을 받는 오버레이만 인정한다.
    // z-40짜리 드롭다운 닫기용 투명막까지 잠그면 답답하므로 모달 층(z-50 이상)만 본다.
    // ⚠️ data-scroll-lock-skip 오버레이는 제외한다 — 여기서 쓰는 body position:fixed 기법은
    //    sticky의 기준(스크롤포트)을 없애버려서, 화면을 완전히 덮지 않는 오버레이(예: 폭 82%인
    //    모바일 슬라이드 메뉴)에서는 옆에 노출된 sticky 헤더가 문서 원위치로 밀려나 사라진다.
    //    그런 오버레이는 자체적으로 html에 스크롤 잠금을 건다(sticky 유지).
    const hasOverlay = () =>
      Array.from(document.querySelectorAll(SELECTOR)).some((el) => {
        if (el.hasAttribute("data-scroll-lock-skip")) return false;
        const cs = getComputedStyle(el);
        const z = parseInt(cs.zIndex || "0", 10);
        return (
          cs.position === "fixed" &&
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          cs.pointerEvents !== "none" &&
          parseFloat(cs.opacity || "1") > 0.01 &&
          Number.isFinite(z) && z >= 50
        );
      });

    // 탭이 화면에 없을 때는 requestAnimationFrame이 멈추므로 타이머로 미룬다
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => (hasOverlay() ? lock() : unlock()), 0);
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    check();

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      unlock();
    };
  }, []);

  return null;
}
