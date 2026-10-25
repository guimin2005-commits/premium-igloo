"use client";

import { useLayoutEffect, useRef } from "react";

// 📌 이벤트 창(EventHub) — 카드 아래 「이벤트」 단추(앞으로 이벤트 창 단추 — 2026-10-24 운영자 "그게 앞으로 이벤트 창 버튼인걸로")로 여는 창 하나.
//    이벤트마다 따로 뜨던 창(EventPassModal · GoedamModal)을 이 틀 안에 embedded 로 넣는다 — 어둠 · 크기 · 열림 움직임 · 이벤트 탭은 이 틀 몫이고,
//    이벤트 창은 칸을 꽉 채운다. 그래서 탭을 옮겨도 틀 크기 · 자리 · 탭 줄이 그대로이고 안쪽만 바뀐다
//    (운영자 "이벤트마다 크기가 달라서 ui 가 이동하면 어쩌자는 거야" — 예전엔 창마다 크기가 달라 탭 줄이 튀었다).
//    · 크기 — 인벤토리 · 시즌 패스 · 강화 창과 같은 틀(2026-10-24 운영자 "하나로 통일"): 폰(~639) 아래 시트 86dvh · 그 위 min(1100, 100%) × min(800, 92vh). 탭 줄이 옆에 붙으면(1200~) 폭만 줄(280 + 사이 8)만큼 넓다. 탭 폭은 PC 세로 줄 280 · 그 사이 · 폰 가로 줄 244(글자 탭 — 아래)
//    · 이벤트 탭 — 탭 = 글자 탭(캐릭터 칸 · 이름 · 마감 · 빨간 숫자 — 아래 📌 틀). 빨간 숫자는 이벤트마다 숫자.
//      넓은 화면(1200~) 창 왼쪽 세로 줄, 그보다 좁으면 창 위 가로 줄(넘치면 넘김). 이벤트가 하나뿐이면 탭 없음.
//      1200 미만에서 옆에 붙이면 괴담회 무대가 좁아져 커튼이 표를 가린다 — 그래서 위 줄로 바꾼다
//    · 📌 틀(탭 줄)은 시즌을 타지 않는 먹 판 — 2026-10-25 운영자 "이 부분 도트 말고 다른 걸로 바꿔" → 인벤토리 · 시즌 패스 · 강화 창(PopShell)과 같은 #131313 · 둥근 16px(테 · 빛선 없음).
//      판만 바꾸니 "기존 배너 이미지랑 너무 동떨어져 보여" → 탭도 배너 띠 대신 글자 탭(.claude/mockups/event-hub/탭줄-글자탭-시안.png — "좀 낫네" · "ㄱ"):
//      배너에서 캐릭터 칸만 56px(배경 그림 왼쪽 끝) · 이벤트 이름 · 마감(~ M. D. — end 는 끝 시각이라 1ms 앞 날짜) · 빨간 숫자. 고른 탭은 밝은 칸(#26262b + 옅은 테).
//      (예전: 먹 도트 판(바깥 3px 테 · 각진 모서리 · 빛선) + 배너 띠 탭 · 흰 테. 그 전 할로윈 보라 → "왜 보라색인지", 반투명 흰 판 → "포토샵 도형 그리기 하면 바로 나오는 거" 로 반려. 안쪽 이벤트 창 색은 그 이벤트 몫)
//    · 틀은 닫혀 있어도 그려 둔다(display none) — 안의 이벤트 창이 같은 자리에 있어야 다시 열 때 받아 둔 상태를 그대로 쓴다
//    목록 · 순서 · 숫자는 부르는 쪽(app/level/page.js evItems)이 정한다 — 이 파일은 그리기만.
//    tabs = { items: [{ key, src, n, label }], active, onPick(key), locked }  (locked — 뽑기 연출 중처럼 옮기면 안 될 때 다른 탭을 잠근다)

// 마감 — end 는 끝 시각(그 시각부터 끝남)이라 1ms 앞 KST 날짜("~ 11. 5.")
const endDay = (end) => {
  const k = new Date(Number(end) - 1 + 9 * 60 * 60 * 1000);
  return `${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
};

const EVH_CSS = `
@keyframes evhIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.evh-ov { position: fixed; inset: 0; z-index: 120; display: flex; align-items: flex-end; justify-content: center; background: rgba(10,10,10,.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.evh-ov.off { display: none; }
.evh { position: relative; display: flex; flex-direction: column; width: 100%; height: 86vh; height: 86dvh; animation: evhIn .32s cubic-bezier(0.16,1,0.3,1); }
.evh-slot { position: relative; flex: 1 1 0%; min-width: 0; min-height: 0; display: flex; }
.evh-slot > [role] { flex: 1 1 auto; min-width: 0; }
/* 먹 판 — 다른 창(PopShell)과 같은 #131313 · 둥근 16px. 폰 시트는 위 모서리만 둥글다(아래는 이벤트 창에 붙는다) */
.evh-top { flex: 0 0 auto; position: relative; z-index: 2; background: #131313; border-radius: 16px 16px 0 0; }
.evh-in { height: 100%; }
.evh-top .evh-in { padding: 17px 9px 5px; }
.evh-grab { position: absolute; z-index: 45; left: 50%; top: 12px; width: 36px; height: 5px; margin-left: -18px; border-radius: 999px; background: #3a3a40; }
.evh-sc { position: relative; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 8px 4px 6px; }
.evh-rail { display: none; }
.evh-rail .evh-in::-webkit-scrollbar, .evh-sc::-webkit-scrollbar { display: none; }
/* 글자 탭 — 캐릭터 칸 · 이름 · 마감 · 숫자 */
.evt-t { position: relative; flex: 0 0 auto; display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px 10px 10px; border: 0; border-radius: 12px; background: transparent; color: #fff; text-align: left; cursor: pointer; outline: none; transition: background-color .15s; }
.evh-sc .evt-t { width: 244px; } /* 폭 고정 — 숫자가 사라져도 탭 줄이 안 움직이게. 「방구석 심야 괴담회」 + 숫자가 안 잘리는 폭 */
.evt-t:not(.on):not(:disabled):hover { background: #1d1d21; }
.evt-t.on { background: #26262b; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14); cursor: default; }
.evt-t:focus-visible { box-shadow: inset 0 0 0 2px #e91e3f; }
.evt-t:disabled { cursor: default; }
.evt-th { flex: none; width: 56px; height: 56px; border-radius: 8px; background-repeat: no-repeat; background-size: auto 100%; background-position: -6px 0; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
.evt-tx { flex: 1 1 auto; min-width: 0; }
.evt-tx b { display: block; font-size: 14px; font-weight: 900; letter-spacing: -0.01em; color: rgba(255,255,255,0.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evt-t.on .evt-tx b { color: #fff; }
.evt-tx i { display: block; margin-top: 4px; font-style: normal; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.45); font-variant-numeric: tabular-nums; }
.evt-n { flex: none; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; background: #e91e3f; color: #fff; font-size: 11px; font-weight: 900; line-height: 20px; text-align: center; font-variant-numeric: tabular-nums; }
@media (min-width: 640px) {
  .evh-ov { align-items: center; padding: 24px; }
  .evh { width: min(1100px, 100%); height: min(800px, 92vh); }
  .evh-top { margin-bottom: 8px; border-radius: 16px; }
  .evh-top .evh-in { padding: 4px 6px; }
  .evh-grab { display: none; }
  .evh-sc .evt-t { width: 244px; }
}
@media (min-width: 1200px) {
  .evh.tabs { flex-direction: row; gap: 8px; width: min(1388px, 100%); }
  .evh.tabs .evh-top { display: none; }
  .evh.tabs .evh-rail { display: block; flex: 0 0 280px; background: #131313; border-radius: 16px; }
  .evh.tabs .evh-rail .evh-in { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 10px; overflow-y: auto; scrollbar-width: none; }
}
@media (prefers-reduced-motion: reduce) { .evh { animation: none !important; } }
`;

const hasTabs = (tabs) => !!tabs && Array.isArray(tabs.items) && tabs.items.length > 1;

// 고른 탭이 줄 밖(세로 줄 아래 · 가로 줄 끝)에 걸리면 보이게 줄만 넘긴다 — scrollIntoView 는 창 · 화면까지 움직여서 쓰지 않는다
function keepInView(sc, vertical) {
  const on = sc?.querySelector(".evt-t.on");
  if (!sc || !on || sc.offsetParent === null) return;
  const pad = 8;
  if (vertical) {
    if (on.offsetTop - pad < sc.scrollTop) sc.scrollTop = on.offsetTop - pad;
    else if (on.offsetTop + on.offsetHeight + pad > sc.scrollTop + sc.clientHeight) sc.scrollTop = on.offsetTop + on.offsetHeight + pad - sc.clientHeight;
  } else if (on.offsetLeft - pad < sc.scrollLeft) sc.scrollLeft = on.offsetLeft - pad;
  else if (on.offsetLeft + on.offsetWidth + pad > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = on.offsetLeft + on.offsetWidth + pad - sc.clientWidth;
}

/** @param {{ open: boolean; tabs?: any; onClose: () => void; children?: any }} props */
export default function EventHub({ open, tabs = null, onClose, children }) {
  const railRef = useRef(null);
  const rowRef = useRef(null);
  const show = hasTabs(tabs);
  const active = show ? tabs.active : null;
  useLayoutEffect(() => {
    if (!open) return;
    keepInView(railRef.current, true);
    keepInView(rowRef.current, false);
  }, [open, active]);

  const list = show
    ? tabs.items.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={t.n > 0 ? `${t.label} · ${t.n}` : t.label}
            disabled={!on && !!tabs.locked}
            onClick={() => { if (!on && !tabs.locked) tabs.onPick?.(t.key); }}
            className={`evt-t${on ? " on" : ""}`}
          >
            {/* 캐릭터 칸 — 띠 배너(992 × 240)의 왼쪽 끝을 56px 높이로 */}
            <span aria-hidden className="evt-th" style={{ backgroundImage: `url(${t.src})` }}></span>
            <span className="evt-tx">
              <b>{t.label}</b>
              {t.end > 0 && <i>~ {endDay(t.end)}</i>}
            </span>
            {t.n > 0 && <span aria-hidden className="evt-n">{t.n > 99 ? "99+" : t.n}</span>}
          </button>
        );
      })
    : null;

  return (
    // 📌 "fixed inset-0" 글자는 전역 ScrollLock 표시(그 글자가 든 z-50 이상 오버레이가 보이면 뒤 화면을 잠근다) — 자리 · 층은 .evh-ov 가 정하지만
    //    글자가 없으면 이벤트 창이 떠 있어도 뒤 화면이 휠 · 터치로 움직였다(2026-10-24 운영자 "이벤트 탭에서 뒤에 스크롤 움직이는 거 수정"). 닫히면 display none 이라 풀린다
    <div className={`evh-ov fixed inset-0${open ? "" : " off"}`} onClick={onClose}>
      <style>{EVH_CSS}</style>
      <div role="dialog" aria-modal="true" aria-label="이벤트" className={`evh${show ? " tabs" : ""}`} onClick={(e) => e.stopPropagation()}>
        {show && <div className="evh-rail"><div ref={railRef} role="tablist" aria-label="이벤트" aria-orientation="vertical" className="evh-in">{list}</div></div>}
        {show && (
          <div className="evh-top">
            <div className="evh-in">
              <span aria-hidden className="evh-grab"></span>
              <div ref={rowRef} role="tablist" aria-label="이벤트" className="evh-sc">{list}</div>
            </div>
          </div>
        )}
        <div className="evh-slot">
          {!show && <span aria-hidden className="evh-grab"></span>}
          {children}
        </div>
      </div>
    </div>
  );
}
