"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { COMMON_VARS, MESSAGE_DEFS, SITE_URL, renderTemplate, dropVar } from "@/lib/botMessages";
import { NOTICE_KEY, LITERAL_VARS, BUTTON_LABEL_MAX, buttonLabelOf, mentionText } from "@/lib/noticeDiscord";
import { Panel, Btn, Switch, Segmented } from "../admin/ui";
import {
  type Tpl,
  type Draft,
  type VarDef,
  type Rendered,
  type EmbedText,
  TEXT_KEYS,
  LIM,
  toDraft,
  fromDraft,
  sigOf,
  changedParts,
  problemsOf,
  firstProblem,
  withText,
  DiscordPreview,
  TextBox,
  Blk,
  count,
  sfxOk,
  sfxErr,
  useClock,
  useVarInsert,
  VarChips,
  EmbedPanel,
} from "../admin/messages/BotMessageEditor";

// 📌 글쓰기 › 디스코드 공지 편집 — 그 자리 팝업. 봇 메시지 › 공지(noticePost) 디자인에 이 글의 제목 · 요약 · 배너를 글자로 풀어 채운 편집기.
//    편집 부품 · 미리보기는 관리 › 봇 메시지와 같다(../admin/messages/BotMessageEditor.tsx). 주소 · 멘션은 {url} {mention} 그대로 — 봇이 채운다.
//    적용할 때 미리 채운 모양 그대로면 template=null(글을 고치면 디스코드 글도 따라간다), 고쳤으면 그 모양을 글마다 저장한다.
export type NoticeButton = { on: boolean; label: string };
export type NoticeDiscordValue = { template: Tpl | null; button: NoticeButton };

const DEF_VARS = ((MESSAGE_DEFS as unknown as Record<string, { vars: VarDef[] }>)[NOTICE_KEY]?.vars || []) as VarDef[];
// 공지에는 받는 사람이 없다 — 서버 이름 · 사이트 주소만
const CHIP_VARS: VarDef[] = [...DEF_VARS, ...(COMMON_VARS as VarDef[]).filter((v) => v.name === "server" || v.name === "site")];
const LIT_RE = new RegExp(`\\{(${LITERAL_VARS.join("|")})\\}`, "g");

// 디자인의 {title} {summary} … 를 이 글의 글자로 — 주소 · 멘션 · 공통 변수는 그대로
export function prefillTemplate(t: Tpl, vars: Record<string, string>): Tpl {
  const sub = (s: string) => s.replace(LIT_RE, (_m, n: string) => vars[n] ?? "");
  const embed = { ...t.embed };
  for (const k of TEXT_KEYS) if (k !== "color") embed[k] = sub(embed[k]);
  embed.fields = t.embed.fields.map((f) => ({ ...f, name: sub(f.name), value: sub(f.value) }));
  return { ...t, content: sub(t.content), embed };
}

// 미리보기 값 — 봇이 보낼 때와 같게(받는 사람 변수는 비운다)
export function noticePreviewVars(vars: Record<string, string>, mention: string) {
  return { user: "", name: "", username: "", avatar: "", server: "고급 이글루", site: SITE_URL, ...vars, mention: mentionText(mention) };
}

export default function NoticeDiscordDialog({
  base,
  vars,
  mention,
  value,
  onApply,
  onClose,
}: {
  base: Tpl; // 봇 메시지 › 공지 디자인(글자로 풀기 전)
  vars: Record<string, string>; // 이 글에서 만든 변수(lib/noticeDiscord.js noticeVars)
  mention: string;
  value: NoticeDiscordValue;
  onApply: (v: NoticeDiscordValue) => void;
  onClose: () => void;
}) {
  const filled = useMemo(() => prefillTemplate(base, vars), [base, vars]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(value.template || filled));
  const [button, setButton] = useState<NoticeButton>(value.button);
  const [view, setView] = useState("edit"); // 모바일 — 편집 · 미리보기 한 칸씩
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const clock = useClock();
  const { onCaret, resetCaret, insertVar } = useVarInsert(editorRef);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);
  const showToast = (msg: string, error = false) => {
    setToast({ msg, error });
    if (error) sfxErr();
    else sfxOk();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  // Esc — 취소와 같다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d));
  const setText = (path: string, v: string) => patch((d) => withText(d, path, v));
  const cur = useMemo(() => fromDraft(draft), [draft]);
  const chg = useMemo(() => new Set(changedParts(filled, cur)), [filled, cur]);
  const custom = sigOf(cur) !== sigOf(filled);
  const problems = useMemo<Partial<Record<EmbedText, string>>>(() => problemsOf(draft, NOTICE_KEY), [draft]);
  const pv = useMemo(() => noticePreviewVars(vars, mention), [vars, mention]);
  // 멘션 없음 — 봇과 같이 {mention} 만 지우고 그린다
  const rendered = useMemo(() => renderTemplate(mention === "everyone" || mention === "here" ? cur : dropVar(cur, "mention"), pv) as unknown as Rendered, [cur, pv, mention]);
  const buttons = button.on ? [buttonLabelOf(button)] : undefined;
  const buttonDefault = button.on && !button.label.trim();

  const reset = () => {
    resetCaret();
    setDraft(toDraft(filled));
    setButton({ on: true, label: "" });
    showToast("기본 모양으로 되돌렸습니다.");
  };
  const apply = () => {
    const p = firstProblem(problems);
    if (p) {
      setView("edit");
      return showToast(p, true);
    }
    onApply({ template: custom ? cur : null, button: { on: button.on, label: button.label.trim() } });
  };

  const editor = (
    <div ref={editorRef} className="p-4 md:p-5">
      <Panel flush className="mb-4">
        <Blk label="링크 버튼" changed={!buttonDefault}>
          <div className="flex items-center">
            <Switch on={button.on} onChange={(on) => setButton((b) => ({ ...b, on }))} label="링크 버튼" />
            <input
              type="text"
              aria-label="버튼 글자"
              value={button.label}
              maxLength={BUTTON_LABEL_MAX}
              disabled={!button.on}
              placeholder={buttonLabelOf(null)}
              onChange={(e) => setButton((b) => ({ ...b, label: e.target.value }))}
              className="ml-3 min-w-0 flex-1 min-h-10 px-3 py-2 rounded-lg border border-[#a3a3a3] bg-white text-[14px] max-md:text-[16px] text-[#131313] outline-none placeholder:text-[#a3a3a3] focus:border-[#131313] focus:ring-2 focus:ring-[#131313]/10 disabled:bg-[#f2f2f2] disabled:text-[#8a8a8a] disabled:border-[#e0e0e0]"
            />
          </div>
        </Blk>
      </Panel>

      <div className="mb-4">
        <VarChips vars={CHIP_VARS} keyVarCount={DEF_VARS.length} onInsert={(n) => insertVar(draft, n, setText, (m) => showToast(m, true))} />
      </div>

      <Panel flush className="mb-4">
        <Blk label="본문" changed={chg.has("본문")} right={count(draft.content.length, LIM.content)}>
          <TextBox path="content" value={draft.content} onChange={(v) => setText("content", v)} onCaret={onCaret} max={LIM.content} rows={2} label="본문" />
        </Blk>
      </Panel>

      <EmbedPanel draft={draft} patch={patch} onCaret={onCaret} problems={problems} chg={chg} tierChip={false} onLimit={(m) => showToast(m, true)} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="디스코드 공지"
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#ededed] w-full max-w-6xl rounded-t-2xl sm:rounded-2xl h-[92dvh] sm:h-[88dvh] flex flex-col overflow-hidden shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]"
      >
        <div className="shrink-0 flex items-center px-4 md:px-5 py-3 border-b border-[#ededed]">
          <h2 className="min-w-0 truncate text-[16px] font-black tracking-tight">디스코드 공지</h2>
          <Segmented className="lg:hidden ml-auto" options={[{ v: "edit", l: "편집" }, { v: "preview", l: "미리보기" }]} value={view} onChange={setView} />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 ml-2 lg:ml-auto w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30"
          >
            <svg aria-hidden className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className={`min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[#f7f7f7] ${view === "edit" ? "" : "hidden lg:block"}`}>{editor}</div>
          <div className={`min-w-0 flex-1 lg:flex-none lg:w-[440px] lg:border-l border-[#ededed] overflow-y-auto overscroll-contain bg-[#313338] ${view === "preview" ? "" : "hidden lg:block"}`}>
            <DiscordPreview r={rendered} clock={clock} off={false} card={null} buttons={buttons} />
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 px-4 md:px-5 py-3 border-t border-[#ededed]">
          <Btn variant="ghost" onClick={reset} disabled={!custom && buttonDefault}>기본으로</Btn>
          <Btn variant="ghost" className="ml-auto" onClick={onClose}>취소</Btn>
          <Btn onClick={apply}>적용</Btn>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 z-[130] w-max max-w-[calc(100vw-2rem)] px-5 py-3 rounded-full border text-[13px] font-bold break-keep shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] ${toast.error ? "bg-white border-[#e91e3f] text-[#d01634]" : "bg-[#131313] border-[#131313] text-white"}`}
        >
          {toast.error ? "⚠ " : "✓ "}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
