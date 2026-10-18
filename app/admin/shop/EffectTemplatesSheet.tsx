"use client";

// 📌 종류별 효과 문구 창(2026-10-18 운영자 "매크로마다 자동으로 나오게 되는데 그걸 설정할 수 있게") — 상점 관리 › 설정 › 효과 문구 · 기능 검색 「효과 문구」(?open=fxtext)
//    효과 종류(꾸미기 빼고)마다 자동 문구의 틀 한 줄. 칸({크기} · {분} …)은 아이템마다 값으로 바뀐다 — 규칙은 lib/itemEffects 「종류별 효과 문구」.
//    차례: 아이템에서 직접 쓴 문구 > 이 틀 > 기본. 저장은 app/api/admin/effect-templates PUT(초안 모드는 초안 → 「반영」). 바꾸는 것은 표시뿐(지급 규칙 그대로)
//    📌 2026-10-18 개편(운영자 "칸 좀 더 늘려 · 정신도 없고 뭐 보이지도 않고 찾기도 힘들고") — 목록 + 편집 두 칸 창.
//       위: 찾기(종류 이름 · 문구) + 묶음(전체 · 발동 · 상시 · 소모 — 수는 늘 전체 수라 폭이 안 흔들린다).
//       왼쪽 목록: 종류 이름 + 지금 문구가 보일 모양(미리 보기 값) · 저장 안 한 줄 빨간 점 · 기본과 다른 줄 「직접」.
//       오른쪽 편집: 큰 칸(세 줄 · 줄 바꿈 없음) · 글자 수 · 칸 넣기(누른 자리에 — 칸마다 미리 보기 값) · 큰 미리 보기 · 기본 문구 · 「기본으로」(늘 같은 자리).
//       폰(md 미만): 목록 → 누르면 편집(「목록」으로 돌아감). focus — 열 때 고를 종류(아이템 편집기에서 열면 그 아이템 효과)
//    useEffectTemplates — 페이지가 처음 한 번 읽어 이 화면의 지금 틀(setEffectTemplates)에 넣는다(아이템 편집기의 자동 문구 미리 보기가 같은 틀을 쓰게)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TRIGGER_OF, EFFECT_KINDS, TEMPLATE_KINDS, DEFAULT_EFFECT_TEMPLATES, EFFECT_TEMPLATE_MAX,
  templateVarsOf, normalizeEffectTemplate, previewEffectTemplate, setEffectTemplates,
} from "@/lib/itemEffects";
import { FormSheet, Btn, Segmented, SearchInput, inputClass, sfxTick } from "../ui";

type Tpl = Record<string, string>;

// 저장된 틀 읽기 — 성공하면 이 화면의 지금 틀도 바꾼다. 실패면 null
async function fetchTemplates(): Promise<Tpl | null> {
  const d = await fetch("/api/admin/effect-templates", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  if (!d?.success) return null;
  const t: Tpl = d.data?.templates && typeof d.data.templates === "object" ? d.data.templates : {};
  setEffectTemplates(t);
  return t;
}

// 페이지 — 처음 한 번 읽어 둔다(관리자일 때). ver: 저장 · 다시 읽기마다 늘어 미리 보기가 다시 그려지게.
//    reload — 초안 반영 · 버리기 · 되돌리기 뒤(페이지 reloadCatalog) 다시 읽는다
export function useEffectTemplates(isAdmin: boolean) {
  const [saved, setSaved] = useState<Tpl | null>(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetchTemplates().then((t) => { if (alive && t) { setSaved(t); setVer((v) => v + 1); } });
    return () => { alive = false; };
  }, [isAdmin]);
  const remember = useCallback((t: Tpl) => { setEffectTemplates(t); setSaved(t); setVer((v) => v + 1); }, []);
  const reload = useCallback(() => {
    if (!isAdmin) return;
    void fetchTemplates().then((t) => { if (t) { setSaved(t); setVer((v) => v + 1); } });
  }, [isAdmin]);
  return { saved, ver, remember, reload };
}

// 종류 묶음(발동 · 상시 · 소모) — TRIGGERS 차례
const GROUPS = EFFECT_KINDS.filter((k) => k.v !== "cosmetic")
  .map((k) => ({ ...k, ons: TEMPLATE_KINDS.filter((on) => TRIGGER_OF[on]?.kind === k.v) }))
  .filter((g) => g.ons.length);
const GROUP_OF: Record<string, string> = Object.fromEntries(GROUPS.flatMap((g) => g.ons.map((on) => [on, g.l])));
const GROUP_OPTS = [{ v: "all", l: "전체", n: TEMPLATE_KINDS.length }, ...GROUPS.map((g) => ({ v: g.v, l: g.l, n: g.ons.length }))];
const defOf = (on: string) => DEFAULT_EFFECT_TEMPLATES[on as keyof typeof DEFAULT_EFFECT_TEMPLATES];
const effOf = (saved: Tpl | null, on: string) => saved?.[on] || defOf(on);
const labelOf = (on: string) => TRIGGER_OF[on]?.l || on;
// 찾기 — 띄어쓰기 · 대소문자 무시
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export default function EffectTemplatesSheet({ open, onClose, saved, onSaved, toast, fail, focus }: {
  open: boolean;
  onClose: () => void;
  saved: Tpl | null;
  onSaved: (t: Tpl) => void;
  toast: (msg: string, isError?: boolean) => void;
  fail: (msg: string) => void;
  focus?: string[]; // 열 때 고를 종류 후보(앞에서부터 — 틀이 있는 첫 종류)
}) {
  // 열 때마다 저장된 값을 다시 읽어(다른 창 · 다른 관리자가 바꾼 값) 칸을 채운다. 읽는 동안은 칸을 잠근다
  const [base, setBase] = useState<Tpl | null>(null);
  const [edit, setEdit] = useState<Tpl>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState("all");
  const [sel, setSel] = useState<string>(TEMPLATE_KINDS[0]);
  const [mEdit, setMEdit] = useState(false); // 폰 — 편집 칸을 보고 있나
  const area = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null); // 칸 넣기 자리(아직 안 눌렀으면 끝)
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    // 열 때 — 찾기 · 묶음 비우기, 고를 종류(focus 의 첫 틀 종류 · 없으면 그대로), 폰은 목록부터(focus 가 있으면 바로 편집)
    const want = (focus || []).find((on) => TEMPLATE_KINDS.includes(on));
    setQ(""); setGrp("all");
    if (want) setSel(want);
    setMEdit(!!want);
    caret.current = null;
    fetchTemplates().then((t) => {
      if (!alive) return;
      setLoading(false);
      const b = t ?? saved;
      if (!t) toast("효과 문구를 읽지 못했습니다.", true);
      if (!b) return;
      setBase(b);
      fill(b);
      if (t) onSaved(t);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reload]);

  // 줄마다 정리 결과 — value "" = 기본 · error = 못 쓰는 칸 등
  const rows = useMemo(() => Object.fromEntries(TEMPLATE_KINDS.map((on) => [on, normalizeEffectTemplate(on, edit[on] ?? "")])), [edit]);
  const changedOf = (on: string) => !!base && (rows[on]?.value || "") !== (base[on] || "");
  const dirty = !!base && TEMPLATE_KINDS.some(changedOf);
  const bad = TEMPLATE_KINDS.filter((on) => rows[on]?.error);
  const fill = (b: Tpl) => setEdit(Object.fromEntries(TEMPLATE_KINDS.map((on) => [on, effOf(b, on)])));
  const previewOf = (on: string) => previewEffectTemplate(on, rows[on]?.value || defOf(on));

  // 목록 — 묶음 · 찾기(종류 이름 · 묶음 이름 · 지금 문구 · 미리 보기 · 기본 문구)
  const shown = useMemo(() => {
    const s = squash(q);
    return GROUPS.filter((g) => grp === "all" || g.v === grp)
      .map((g) => ({
        ...g,
        ons: g.ons.filter((on) => !s || [labelOf(on), g.l, edit[on] ?? "", previewEffectTemplate(on, (edit[on] ?? "").trim() || defOf(on)), defOf(on)].some((t) => squash(t).includes(s))),
      }))
      .filter((g) => g.ons.length);
  }, [q, grp, edit]);
  const shownOns = shown.flatMap((g) => g.ons);

  const pick = (on: string) => {
    if (on !== sel) caret.current = null;
    setSel(on);
    setMEdit(true);
  };
  // 고른 줄이 목록 안에 보이게(열 때 focus · Enter 로 고른 때)
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-on="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, sel, base, mEdit]);

  // 닫으면(취소 · Esc · 바깥) 저장 안 한 수정은 버린다 — 다시 열 때 버린 수정이 잠깐 보이지 않게
  const close = () => {
    if (saving) return;
    if (base) fill(base);
    onClose();
  };
  // 저장은 바꾼 줄만(서버가 저장된 묶음에 합친다 — 그사이 다른 창 · 다른 관리자가 바꾼 다른 줄은 그대로). "" = 그 줄을 기본으로
  const save = async () => {
    if (saving || loading || !base) return;
    if (!dirty) { toast("바뀐 것이 없습니다."); return; }
    // 못 쓰는 줄이 있으면 그 줄로 — 찾기 · 묶음에 가려 있으면 풀어서 목록에도 보이게
    if (bad.length) {
      if (!shownOns.includes(bad[0])) { setQ(""); setGrp("all"); }
      pick(bad[0]);
      return fail(`${labelOf(bad[0])} — ${rows[bad[0]].error}`);
    }
    const templates = Object.fromEntries(TEMPLATE_KINDS.filter(changedOf).map((on) => [on, rows[on].value]));
    setSaving(true);
    const res = await fetch("/api/admin/effect-templates", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templates }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSaving(false);
    if (res?.ok && d?.success) {
      const t: Tpl = d.data?.templates || {};
      onSaved(t);
      setBase(t);
      fill(t);
      onClose();
      toast("효과 문구를 저장했습니다.");
    } else fail(d?.message || "저장에 실패했습니다.");
  };

  // 칸 넣기 — 마지막으로 누른 자리에(안 눌렀으면 끝), 앞뒤 띄어쓰기 맞춤. 넣은 뒤 그 뒤로 커서
  const putVar = (k: string) => {
    sfxTick();
    const cur = edit[sel] ?? "";
    const at = Math.min(cur.length, caret.current ?? cur.length);
    const before = cur.slice(0, at);
    const after = cur.slice(at);
    const token = `${before && !/\s$/.test(before) ? " " : ""}{${k}}${after && !/^\s/.test(after) ? " " : ""}`;
    const next = before + token + after;
    const pos = before.length + token.length;
    caret.current = pos;
    setEdit((m) => ({ ...m, [sel]: next }));
    requestAnimationFrame(() => { const el = area.current; if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(pos, pos); } });
  };
  const keepCaret = (e: React.SyntheticEvent<HTMLTextAreaElement>) => { caret.current = e.currentTarget.selectionStart; };

  const def = defOf(sel);
  const r = rows[sel] || { value: "", error: "" };
  const v = edit[sel] ?? "";
  const isDef = !r.value && !r.error;
  const len = v.replace(/\s+/g, " ").trim().length;

  return (
    <FormSheet
      open={open}
      onClose={close}
      busy={saving}
      title="효과 문구"
      sub="아이템에서 직접 쓴 문구가 먼저 보입니다"
      width={1000}
      flush
      onSubmit={() => { void save(); }}
      footer={
        <>
          {dirty && <span className="mr-auto text-[12px] font-bold text-[#5a5a5a] tabular-nums">바뀐 줄 {TEMPLATE_KINDS.filter(changedOf).length}개</span>}
          <Btn variant="ghost" onClick={close}>취소</Btn>
          {/* 못 쓰는 줄이 있어도 눌린다 — 누르면 그 줄로 옮겨 이유를 알린다(save) */}
          <Btn type="submit" className="min-w-[96px]" disabled={!dirty || loading}>{saving ? "저장 중…" : "저장"}</Btn>
        </>
      }
    >
      {!base ? (
        <div className="py-12 text-center text-[13px] text-[#5a5a5a]">
          {loading ? "불러오는 중…" : (
            <>
              불러오지 못했습니다.
              <span className="block mt-3">
                <Btn variant="secondary" size="sm" onClick={() => setReload((n) => n + 1)}>다시 읽기</Btn>
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col min-h-0 h-[calc(88dvh-150px)] sm:h-[min(680px,calc(84dvh-150px))]">
          {/* 찾기 줄 — 폰은 목록을 볼 때만 */}
          {/*    찾기 칸 Enter — 창 저장 대신 첫 줄 고르기 */}
          <div className={`${mEdit ? "hidden md:flex" : "flex"} shrink-0 flex-wrap items-center gap-2 px-5 py-3 border-b border-[#ededed]`}
            onKeyDownCapture={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing || !(e.target instanceof HTMLInputElement)) return;
              e.preventDefault();
              if (shownOns[0]) pick(shownOns[0]);
            }}>
            <SearchInput value={q} onChange={setQ} placeholder="효과 이름 · 문구로 찾기" className="sm:!w-auto sm:flex-1 sm:min-w-0 sm:max-w-80" />
            <Segmented options={GROUP_OPTS} value={grp} onChange={setGrp} className="shrink-0" />
          </div>
          <div className="flex-1 min-h-[200px] flex">
            {/* ── 목록 ── */}
            {/*    scrollPaddingTop — 붙어 있는 묶음 머리(36) 밑에 고른 줄이 가리지 않게 */}
            <div ref={listRef} style={{ scrollPaddingTop: 36 }} className={`${mEdit ? "hidden md:block" : "block"} w-full md:w-[340px] md:shrink-0 md:border-r border-[#ededed] overflow-y-auto overscroll-contain`}
              onKeyDown={(e) => {
                // 위아래 화살표로 줄 옮기기 — 포커스가 있는 줄 기준(없으면 고른 줄)
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                const at = (document.activeElement as HTMLElement | null)?.dataset?.on;
                const i = shownOns.indexOf(at && shownOns.includes(at) ? at : sel);
                const n = shownOns[Math.max(0, Math.min(shownOns.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
                if (!n) return;
                e.preventDefault();
                setSel(n); caret.current = null;
                listRef.current?.querySelector<HTMLElement>(`[data-on="${n}"]`)?.focus();
              }}>
              {shown.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-[#8a8a8a]">찾는 효과가 없습니다.</p>
              ) : shown.map((g) => (
                <section key={g.v}>
                  <h3 className="sticky top-0 z-[1] px-5 py-2 text-[12px] font-black text-[#5a5a5a] bg-[#f7f7f7] border-b border-[#ededed]">{g.l}</h3>
                  {g.ons.map((on) => {
                    const on_ = on === sel;
                    const err = rows[on]?.error;
                    const custom = !!rows[on]?.value;
                    return (
                      <button key={on} type="button" data-on={on} onClick={() => pick(on)} aria-current={on_ || undefined}
                        className={`w-full flex items-start gap-3 px-5 py-3 text-left border-b border-[#f2f2f2] outline-none focus-visible:bg-[#f2f2f2] transition-colors ${on_ ? "bg-[#f2f2f2] shadow-[inset_3px_0_0_#131313]" : "hover:bg-[#fafafa]"}`}>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-bold text-[#131313]">{labelOf(on)}</span>
                            {changedOf(on) && <span aria-label="바뀜" className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />}
                          </span>
                          <span className={`mt-1 block truncate text-[13px] ${err ? "font-bold text-[#d01634]" : "text-[#5a5a5a]"}`}>{err || previewOf(on)}</span>
                        </span>
                        {/* 기본과 다른 줄 — 자리는 늘 잡아 둔다(줄마다 글자 폭이 흔들리지 않게) */}
                        <span className={`shrink-0 w-7 text-right text-[11px] font-bold leading-[18px] ${custom ? "text-[#131313]" : "text-transparent"}`} aria-hidden={!custom}>직접</span>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>

            {/* ── 편집 ── */}
            <div className={`${mEdit ? "block" : "hidden md:block"} flex-1 min-w-0 overflow-y-auto overscroll-contain px-5 md:px-7 py-5`}>
              <button type="button" onClick={() => setMEdit(false)}
                className="md:hidden -mt-1 mb-4 inline-flex items-center gap-1 h-8 pr-2 text-[13px] font-bold text-[#5a5a5a] hover:text-[#131313] outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 rounded">
                <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" /></svg>
                목록
              </button>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-[#8a8a8a]">{GROUP_OF[sel]}</p>
                  <h3 className="mt-0.5 text-[19px] font-black tracking-tight text-[#131313] break-keep">{labelOf(sel)}</h3>
                </div>
                {/* 기본으로 — 늘 같은 자리(기본이면 잠금) */}
                <Btn variant="secondary" size="sm" className="shrink-0" disabled={isDef || loading}
                  onClick={() => { sfxTick(); caret.current = null; setEdit((m) => ({ ...m, [sel]: def })); }}>기본으로</Btn>
              </div>

              <label htmlFor="fxtpl-area" className="mt-6 mb-2 block text-[13px] font-bold text-[#131313]">문구</label>
              <textarea id="fxtpl-area" ref={area} rows={3} value={v} disabled={loading} placeholder={def}
                onChange={(e) => {
                  // 줄 바꿈은 띄어쓰기로(한 줄 문구) — 바꿨으면 커서를 그 자리로 되돌린다(붙여 넣기에 끝으로 튀지 않게)
                  const el = e.target;
                  const nv = el.value.replace(/\r?\n/g, " ");
                  const pos = el.selectionStart;
                  caret.current = pos;
                  setEdit((m) => ({ ...m, [sel]: nv }));
                  if (nv !== el.value) requestAnimationFrame(() => { if (area.current) area.current.setSelectionRange(pos, pos); });
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault(); }}
                onSelect={keepCaret} onClick={keepCaret} onKeyUp={keepCaret}
                className={`${inputClass} !px-4 !py-3 !text-[16px] leading-relaxed resize-none ${r.error ? "!border-[#d01634]" : ""}`} />
              <div className="mt-1.5 flex items-start gap-3 text-[12px]">
                <span className="min-w-0 flex-1 font-bold text-[#d01634] break-keep">{r.error}</span>
                <span className={`shrink-0 tabular-nums ${len > EFFECT_TEMPLATE_MAX ? "font-bold text-[#d01634]" : "text-[#8a8a8a]"}`}>{len}/{EFFECT_TEMPLATE_MAX}</span>
              </div>

              <p className="mt-5 mb-2 text-[13px] font-bold text-[#131313]">칸 넣기</p>
              <div className="flex flex-wrap gap-2">
                {templateVarsOf(sel).map((k) => (
                  <button key={k} type="button" disabled={loading}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => putVar(k)}
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[#d9d9d9] bg-white text-[13px] font-bold text-[#131313] hover:border-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40">
                    {`{${k}}`}
                    <span className="text-[12px] font-medium text-[#8a8a8a] tabular-nums">{previewEffectTemplate(sel, `{${k}}`)}</span>
                  </button>
                ))}
              </div>

              <p className="mt-6 mb-2 text-[13px] font-bold text-[#131313]">미리 보기</p>
              <div className="rounded-xl border border-[#ededed] bg-[#f7f7f7] px-4 py-4 text-[16px] font-bold leading-snug text-[#131313] break-keep">
                {previewOf(sel)}
              </div>
              <p className="mt-2 text-[12px] text-[#8a8a8a] break-keep">기본 · {def}</p>
            </div>
          </div>
        </div>
      )}
    </FormSheet>
  );
}
