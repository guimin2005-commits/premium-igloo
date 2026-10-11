"use client";
// 📌 글쓰기 본문 편집기 (2026-10-11 운영자 "* 하면 점이 너무 얇고 · 굵게 하는 것도 불편 · 글쓰는 창은 아래가 많이 남는데 왜 이리 작은지 · 글자 크기도 내 맘대로 못 하고 · 편의 기능 팍팍")
//  · 도구 줄 — 글자 크기(본문 · 큰 제목 · 중간 제목 · 작은 제목 · 작은 글씨) · 굵게 · 밑줄 · 취소선 · 강조 · 목록 · 번호 · 인용 · 구분선 · 링크 · 복사 칸 · 표 · 이미지 · 기호 · 되돌리기 · 다시 하기.
//    스크롤해도 화면 위(사이트 머리 바로 아래)에 붙어 있다. 커서 자리에 켜진 서식은 눌린 모양. 폰은 옆으로 밀어 본다
//  · 단축키 — Ctrl/⌘ + B 굵게 · U 밑줄 · Shift+X 취소선 · Shift+H 강조 · K 링크 · Alt+1~3 제목 · Alt+0 본문 · Shift+8 목록 · Shift+7 번호.
//    Enter 는 목록 · 번호 · 인용을 이어 쓰고(빈 항목이면 끝), Tab · Shift+Tab 은 목록을 들이고 내어쓴다. 한글 조합 중 Enter 는 건드리지 않는다
//  · 고른 글 위에 주소를 붙여 넣으면 링크가 된다
//  · 입력칸은 글 길이만큼 커진다(안쪽 스크롤 없음) — 처음부터 화면 아래까지 차지
//  · 바꾸기는 모두 execCommand("insertText") — 브라우저 되돌리기(Ctrl+Z)가 도구 단추로 바꾼 것까지 그대로 되돌린다
//    편집 규칙은 ./mdEdit.ts(순수 함수), 그리는 규칙은 ../components/mdRender.ts
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type KeyboardEvent, type ClipboardEvent } from "react";
import {
  type Edit, type WrapMark, type BlockKind,
  activeAt, toggleWrap, setBlock, insertHr, insertAt, linkEdit, enterEdit, indentEdit, isUrl, applyToValue,
} from "./mdEdit";

// 값 바꾸기 — 되돌리기 기록에 남게. execCommand 가 안 먹는 브라우저는 값을 직접 넣고 input 이벤트(React onChange)
export function applyEdit(ta: HTMLTextAreaElement, ed: Edit) {
  const want = applyToValue(ta.value, ed);
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(ed.start, ed.end);
  let ok = false;
  try { ok = document.execCommand("insertText", false, ed.text); } catch { ok = false; }
  if (!ok || ta.value !== want) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(ta, want);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  ta.setSelectionRange(ed.selStart, ed.selEnd);
}

const SIZES: { k: BlockKind | null; l: string; cls: string }[] = [
  { k: null, l: "본문", cls: "text-[14px] font-medium" },
  { k: "h1", l: "큰 제목", cls: "text-[20px] font-black" },
  { k: "h2", l: "중간 제목", cls: "text-[17px] font-black" },
  { k: "h3", l: "작은 제목", cls: "text-[15px] font-bold" },
  { k: "small", l: "작은 글씨", cls: "text-[12px] text-[#8a8a8a]" },
];
const SYMBOLS = "※ · • → ← ↑ ↓ ↔ ⇒ ★ ☆ ♥ ♡ ✓ ✔ ✕ ✖ ● ○ ◆ ◇ ■ □ ▶ ◀ ▲ ▼ 「 」 『 』 【 】 〈 〉 《 》 ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ … ~ ℃ ㎝ ㎏ ％".split(" ");
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

// 도구 단추 모양(작은 원 · 눌리면 잉크)
const toolCls = (on: boolean) =>
  `shrink-0 h-8 min-w-8 px-1.5 inline-flex items-center justify-center rounded-lg text-[13px] transition-colors disabled:opacity-25 disabled:pointer-events-none ${
    on ? "bg-[#131313] text-white" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f2f2f2]"
  }`;
const Sep = () => <span aria-hidden className="shrink-0 w-px h-4 mx-1 bg-[#ededed]" />;
function Ico({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
const I = {
  bullet: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  number: "M10 6h10M10 12h10M10 18h10M4 5h1.5v4M3.5 9h3M3.5 13.5c0-.8.7-1.5 1.5-1.5s1.5.6 1.5 1.3c0 1.2-3 2-3 3.7h3",
  quote: "M7.5 8.5c-1.7.6-3 2.2-3 4.2V16h4.5v-4.5h-2.4c.2-.9.9-1.6 1.9-2M16 8.5c-1.7.6-3 2.2-3 4.2V16h4.5v-4.5h-2.4c.2-.9.9-1.6 1.9-2",
  hr: "M3 12h18",
  link: "M13.2 10.8a4 4 0 0 0-5.6 0l-2.8 2.8a4 4 0 0 0 5.6 5.6l1.2-1.2M10.8 13.2a4 4 0 0 0 5.6 0l2.8-2.8a4 4 0 0 0-5.6-5.6l-1.2 1.2",
  code: "M8 4c-1.7 0-2.5.8-2.5 2.5v3c0 1.2-.8 2-2 2.5 1.2.5 2 1.3 2 2.5v3C5.5 19.2 6.3 20 8 20M16 4c1.7 0 2.5.8 2.5 2.5v3c0 1.2.8 2 2 2.5-1.2.5-2 1.3-2 2.5v3c0 1.7-.8 2.5-2.5 2.5",
  table: "M3.5 5.5h17v13h-17zM3.5 10h17M3.5 14.5h17M9.5 5.5v13",
  image: "M3.5 5.5h17v13h-17zM3.5 15.5l4.5-4.5 4 4 2.5-2.5 6 6M15.5 9.5h.01",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  chevron: "m6 9 6 6 6-6",
};

type Pop = "size" | "symbol" | "link" | null;
// 단추를 눌러도 입력칸에서 커서가 빠지지 않게(폰 자판도 안 닫힌다)
const keep = (e: React.MouseEvent) => e.preventDefault();
function Tool({ on = false, title, onClick, disabled, keepFocus = true, children }: { on?: boolean; title: string; onClick: () => void; disabled: boolean; keepFocus?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={on} disabled={disabled}
      onMouseDown={keepFocus ? keep : undefined} onClick={onClick} className={toolCls(on)}>
      {children}
    </button>
  );
}

export default function RichEditor({
  value, onChange, taRef, previewing, overlay, viewToggle, onTable, onImage, placeholder = "내용을 입력하세요...",
}: {
  value: string;
  onChange: (v: string) => void;
  taRef: RefObject<HTMLTextAreaElement | null>;
  previewing: boolean; // 미리보기 중 — 도구는 흐리게(자리 그대로)
  overlay?: ReactNode; // 미리보기 — 입력칸 상자를 그대로 덮는다(absolute inset-0)
  viewToggle?: ReactNode; // [작성 · 미리보기]
  onTable: () => void;
  onImage: () => void;
  placeholder?: string;
}) {
  const [sel, setSel] = useState({ s: 0, e: 0 });
  const [pop, setPop] = useState<Pop>(null);
  const [link, setLink] = useState({ label: "", url: "", s: 0, e: 0 });
  const linkUrlRef = useRef<HTMLInputElement>(null);
  const mod = isMac() ? "⌘" : "Ctrl";

  // 커서 · 선택 따라가기 — 도구 단추의 눌린 모양
  useEffect(() => {
    const onSel = () => {
      const ta = taRef.current;
      if (!ta || document.activeElement !== ta) return;
      setSel((p) => (p.s === ta.selectionStart && p.e === ta.selectionEnd ? p : { s: ta.selectionStart, e: ta.selectionEnd }));
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [taRef]);

  // 📌 글 길이만큼 키우기 — 잠깐 auto 로 줄였다가 잴 때 페이지가 짧아져 스크롤이 튀지 않게 스크롤 자리를 되돌린다
  const grow = () => {
    const ta = taRef.current;
    if (!ta) return;
    const y = window.scrollY;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight + 2}px`;
    if (window.scrollY !== y) window.scrollTo({ top: y });
  };
  useLayoutEffect(grow, [value, taRef]);
  useEffect(() => {
    let w = window.innerWidth;
    const onResize = () => { if (window.innerWidth !== w) { w = window.innerWidth; grow(); } };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ta = () => taRef.current;
  const run = (fn: (v: string, s: number, e: number) => Edit | null) => {
    const t = ta();
    if (!t || previewing) return false;
    const ed = fn(t.value, t.selectionStart, t.selectionEnd);
    if (!ed) return false;
    applyEdit(t, ed);
    setSel({ s: ed.selStart, e: ed.selEnd });
    return true;
  };
  const wrap = (m: WrapMark) => run((v, s, e) => toggleWrap(v, s, e, m));
  const blk = (k: BlockKind | null) => { run((v, s, e) => setBlock(v, s, e, k)); setPop(null); };
  const insert = (text: string) => { run((_v, s, e) => insertAt(s, e, text)); };
  const cmd = (c: "undo" | "redo") => { const t = ta(); if (!t) return; t.focus({ preventScroll: true }); try { document.execCommand(c); } catch { /* 없음 */ } };
  const openLink = () => {
    const t = ta();
    if (!t || previewing) return;
    const s = t.selectionStart, e = t.selectionEnd, picked = t.value.slice(s, e);
    setLink(isUrl(picked) ? { label: "", url: picked.trim(), s, e } : { label: picked.includes("\n") ? "" : picked, url: "", s, e });
    setPop("link");
    setTimeout(() => linkUrlRef.current?.focus(), 0);
  };
  const putLink = () => {
    const t = ta();
    if (!t || !isUrl(link.url)) return;
    applyEdit(t, linkEdit(link.s, link.e, link.label, link.url));
    setPop(null);
  };

  const active = activeAt(value, sel.s);
  const sizeNow = SIZES.find((x) => x.k === (active.block === "h1" || active.block === "h2" || active.block === "h3" || active.block === "small" ? active.block : null)) || SIZES[0];

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 한글 조합 중
    const m = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const hit = (fn: () => unknown) => { e.preventDefault(); fn(); };
    if (m && !e.altKey && !e.shiftKey && key === "b") return hit(() => wrap("**"));
    if (m && !e.altKey && !e.shiftKey && key === "u") return hit(() => wrap("__"));
    if (m && !e.altKey && !e.shiftKey && key === "k") return hit(openLink);
    if (m && e.shiftKey && !e.altKey && e.code === "KeyX") return hit(() => wrap("~~"));
    if (m && e.shiftKey && !e.altKey && e.code === "KeyH") return hit(() => wrap("=="));
    if (m && e.shiftKey && !e.altKey && e.code === "Digit8") return hit(() => blk("bullet"));
    if (m && e.shiftKey && !e.altKey && e.code === "Digit7") return hit(() => blk("number"));
    if (m && e.altKey && !e.shiftKey && ["Digit0", "Digit1", "Digit2", "Digit3"].includes(e.code)) {
      return hit(() => blk(e.code === "Digit0" ? null : (["h1", "h2", "h3"] as const)[Number(e.code.slice(-1)) - 1]));
    }
    if (e.key === "Enter" && !m && !e.shiftKey && !e.altKey) {
      if (run((v, s, en) => enterEdit(v, s, en))) e.preventDefault();
      return;
    }
    if (e.key === "Tab" && !m && !e.altKey) {
      if (run((v, s, en) => indentEdit(v, s, en, e.shiftKey))) e.preventDefault();
    }
  };
  // 고른 글 위에 주소를 붙여 넣으면 링크
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const t = ta();
    const text = e.clipboardData.getData("text/plain");
    if (!t || t.selectionStart === t.selectionEnd || !isUrl(text)) return;
    const picked = t.value.slice(t.selectionStart, t.selectionEnd);
    if (isUrl(picked) || picked.includes("\n")) return;
    e.preventDefault();
    applyEdit(t, linkEdit(t.selectionStart, t.selectionEnd, picked, text));
  };

  const chars = value.length;
  const noSpace = value.replace(/\s/g, "").length;

  return (
    <>
      {/* 📌 도구 줄 — 사이트 머리(접힌 높이 56 · 60px) 바로 아래에 붙는다. 펼침 줄(글자 크기 · 기호 · 링크)도 같이 붙어 내려온다 */}
      {/* 폰 — [작성 · 미리보기] 는 도구 줄 위 따로 한 줄(도구 줄 안에 두면 도구가 두세 개만 보인다). 이 줄은 따라 내려오지 않는다 */}
      {viewToggle && <div className="md:hidden flex justify-end px-3 pt-2.5 pb-1">{viewToggle}</div>}
      <div className="sticky top-14 md:top-[60px] z-20 bg-white border-b border-[#ededed]">
        <div className="flex items-center px-2 py-1.5">
          {/* 폰은 옆으로 민다 — 오른쪽 끝을 흐리게 해서 더 있다는 걸 보인다 */}
          <div className="min-w-0 flex-1 flex items-center overflow-x-auto no-bar max-md:pr-6 max-md:[mask-image:linear-gradient(90deg,#000_86%,transparent)]">
            <button type="button" disabled={previewing} onMouseDown={keep} onClick={() => setPop(pop === "size" ? null : "size")} title={`글자 크기 (${mod}+Alt+0~3)`} aria-expanded={pop === "size"}
              className={`shrink-0 h-8 pl-2.5 pr-1.5 inline-flex items-center gap-1 rounded-lg text-[13px] font-bold transition-colors disabled:opacity-25 ${pop === "size" ? "bg-[#f2f2f2] text-[#131313]" : "text-[#131313] hover:bg-[#f2f2f2]"}`}>
              <span className="w-[4.5em] text-left">{sizeNow.l}</span>
              <Ico d={I.chevron} className="w-3.5 h-3.5 text-[#8a8a8a]" />
            </button>
            <Sep />
            <Tool on={active.marks["**"]} title={`굵게 (${mod}+B)`} disabled={previewing} onClick={() => wrap("**")}><span className="text-[15px] font-black">B</span></Tool>
            <Tool on={active.marks["__"]} title={`밑줄 (${mod}+U)`} disabled={previewing} onClick={() => wrap("__")}><span className="text-[15px] underline underline-offset-2">U</span></Tool>
            <Tool on={active.marks["~~"]} title={`취소선 (${mod}+Shift+X)`} disabled={previewing} onClick={() => wrap("~~")}><span className="text-[15px] line-through">S</span></Tool>
            <Tool on={active.marks["=="]} title={`강조 (${mod}+Shift+H)`} disabled={previewing} onClick={() => wrap("==")}><span className="text-[15px] font-black text-[#e91e3f]">A</span></Tool>
            <Sep />
            <Tool on={active.block === "bullet"} title={`목록 (${mod}+Shift+8)`} disabled={previewing} onClick={() => blk("bullet")}><Ico d={I.bullet} /></Tool>
            <Tool on={active.block === "number"} title={`번호 목록 (${mod}+Shift+7)`} disabled={previewing} onClick={() => blk("number")}><Ico d={I.number} /></Tool>
            <Tool on={active.block === "quote"} title={"인용"} disabled={previewing} onClick={() => blk("quote")}><Ico d={I.quote} /></Tool>
            <Tool on={false} title={"구분선"} disabled={previewing} onClick={() => run((v, s) => insertHr(v, s))}><Ico d={I.hr} /></Tool>
            <Sep />
            <Tool on={pop === "link"} title={`링크 (${mod}+K)`} disabled={previewing} onClick={openLink}><Ico d={I.link} /></Tool>
            <Tool on={false} title={"복사 칸 — 누르면 복사되는 글자"} disabled={previewing} onClick={() => run((v, s, e) => (s === e ? insertAt(s, e, "{}", 1) : insertAt(s, e, `{${v.slice(s, e).replace(/[{}\n]/g, "")}}`)))}><Ico d={I.code} /></Tool>
            <Tool on={false} title={"표"} disabled={previewing} keepFocus={false} onClick={onTable}><Ico d={I.table} /></Tool>
            <Tool on={false} title={"이미지"} disabled={previewing} keepFocus={false} onClick={onImage}><Ico d={I.image} /></Tool>
            <Tool on={pop === "symbol"} title={"기호"} disabled={previewing} onClick={() => setPop(pop === "symbol" ? null : "symbol")}><span className="text-[14px] font-bold">※</span></Tool>
            <Sep />
            <Tool on={false} title={`되돌리기 (${mod}+Z)`} disabled={previewing} onClick={() => cmd("undo")}><Ico d={I.undo} /></Tool>
            <Tool on={false} title={`다시 하기 (${mod}+Shift+Z)`} disabled={previewing} onClick={() => cmd("redo")}><Ico d={I.redo} /></Tool>
          </div>
          {viewToggle && <div className="hidden md:block shrink-0 ml-2">{viewToggle}</div>}
        </div>

        {/* 펼침 줄 — 도구 줄 아래(폰에서 옆으로 미는 도구 줄 안에 두면 잘린다) */}
        {pop === "size" && !previewing && (
          <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
            {SIZES.map((x) => (
              <button key={x.l} type="button" onMouseDown={keep} onClick={() => blk(x.k)}
                className={`h-9 px-3 rounded-lg border transition-colors ${x.cls} ${x.k === sizeNow.k ? "border-[#131313] bg-[#131313] text-white" : "border-[#ededed] text-[#131313] hover:border-[#a3a3a3]"}`}>
                {x.l}
              </button>
            ))}
          </div>
        )}
        {pop === "symbol" && !previewing && (
          <div className="flex flex-wrap gap-0.5 px-3 pb-2">
            {SYMBOLS.map((c) => (
              <button key={c} type="button" onMouseDown={keep} onClick={() => insert(c)}
                className="w-8 h-8 rounded-lg text-[15px] text-[#131313] hover:bg-[#f2f2f2] transition-colors">{c}</button>
            ))}
          </div>
        )}
        {pop === "link" && !previewing && (
          <form className="flex flex-wrap items-center gap-2 px-3 pb-2" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); putLink(); }}>
            <input ref={linkUrlRef} type="url" inputMode="url" placeholder="https://" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setPop(null); ta()?.focus(); } if (e.key === "Enter") { e.preventDefault(); putLink(); } }}
              className="min-w-0 flex-[2_1_220px] h-9 px-3 rounded-lg border border-[#ededed] text-[13px] outline-none focus:border-[#131313]" />
            <input type="text" placeholder="보일 글자" value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setPop(null); ta()?.focus(); } if (e.key === "Enter") { e.preventDefault(); putLink(); } }}
              className="min-w-0 flex-[1_1_140px] h-9 px-3 rounded-lg border border-[#ededed] text-[13px] outline-none focus:border-[#131313]" />
            <button type="button" onClick={putLink} disabled={!isUrl(link.url)}
              className="shrink-0 h-9 px-4 rounded-lg bg-[#131313] text-white text-[13px] font-bold disabled:opacity-30">넣기</button>
          </form>
        )}
      </div>

      {/* 📌 입력칸 — 글 길이만큼 커지고(안쪽 스크롤 없음) 처음부터 화면 아래까지. 미리보기는 이 상자를 그대로 덮는다 */}
      <div className="relative">
        <textarea ref={taRef} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste}
          onFocus={() => setPop((p) => (p === "link" ? null : p))}
          aria-hidden={previewing || undefined}
          className={`block w-full min-h-[max(420px,calc(100dvh-320px))] px-5 py-4 bg-transparent border-0 text-[15px] text-[#131313] outline-none resize-none overflow-hidden leading-[1.9] placeholder:text-[#a3a3a3] ${previewing ? "invisible" : ""}`} />
        {previewing && overlay}
      </div>
      <div className="flex items-center justify-end gap-3 px-5 py-2 border-t border-[#ededed] text-[11px] font-bold text-[#a3a3a3] tabular-nums">
        <span>{chars.toLocaleString()}자</span>
        <span>공백 제외 {noSpace.toLocaleString()}자</span>
      </div>
    </>
  );
}
