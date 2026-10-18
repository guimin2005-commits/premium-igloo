"use client";

// 📌 관리자 「유저 화면으로 보기」 · 「관리 도구」 (2026-10-17 운영자 결정) — ClientLayout 이 사이트 전체를 감싼다.
//    useAdminView(): { realAdmin, admin, userView, setUserView, notify }
//      · realAdmin — 관리자 계정인가(스위치와 상관없음) · admin — 관리자로 보는 중(= realAdmin && !userView)
//      · 유저 화면에 있는 관리 단추 · 링크 · 딱지 · 숨김 데이터(?all=1) · 비공개 우회는 전부 admin 으로 가른다(isAdminName 직접 판정 금지)
//      · setUserView(on) — 쿠키(lib/adminView)를 쓰고 소리 + 토스트 뒤 새로고침(서버 조회 · 화면 fetch 가 모두 같은 값을 따르게)
//    useAdminTools(tools): 지금 화면의 테스트 도구(초기화 등)를 계정 메뉴 「관리 도구」에 올린다 — 화면 안에는 그리지 않는다.
//      화면이 사라지면 저절로 내려간다. 메뉴는 admin 일 때만 보이고, 누를 때마다 한 번 확인(3초) 뒤 실행 + 토스트 · 소리
import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, useId, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { isAdminName } from "@/lib/admins";
import { readUserViewCookie, writeUserViewCookie } from "@/lib/adminView";
import { playTone } from "@/lib/sfx";
import { ICON_PATHS } from "./Icons";

// 서버에서는 layout effect 가 돌지 않으므로 경고 없이 effect 로 대신한다
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// ── 효과음 — 관리 화면(app/admin/ui sfxOk · sfxErr)과 같은 음 ─────────
const sfxOk = () => [660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.1, "sine", 0.035), i * 80));
const sfxErr = () => {
  playTone(300, 0.14, "square", 0.035);
  setTimeout(() => playTone(220, 0.2, "square", 0.035), 130);
};
const sfxOff = () => [880, 660].forEach((f, i) => setTimeout(() => playTone(f, 0.1, "sine", 0.035), i * 80));

// 새로고침 뒤에 이어 띄울 토스트 — 바꾸고 바로 새로고침하므로 한 번 넘겨 준다
const FLASH_KEY = "igloo:view-flash";
// 쿠키 읽기(useSyncExternalStore) — 바꾸면 새로고침하므로 구독은 비워 둔다. 서버 · hydration 은 꺼짐
const subscribeNone = () => () => {};
const serverOff = () => false;

// 📌 관리 도구 한 칸 — run 이 글을 돌려주면 그 글로, 아니면 「<label> 완료」. 실패는 throw(메시지가 토스트)
export type AdminTool = {
  key: string;
  label: string;
  run: () => Promise<string | void> | string | void;
  danger?: boolean;
};

type ViewCtx = {
  realAdmin: boolean;
  admin: boolean;
  userView: boolean;
  setUserView: (on: boolean) => void;
  notify: (msg: string, isError?: boolean, opts?: { sound?: boolean }) => void;
};
type ToolsCtx = {
  tools: AdminTool[];
  set: (id: string, tools: AdminTool[]) => void;
  remove: (id: string) => void;
};

const noop = () => {};
const AdminViewContext = createContext<ViewCtx>({ realAdmin: false, admin: false, userView: false, setUserView: noop, notify: noop });
const AdminToolsContext = createContext<ToolsCtx | null>(null);

export function AdminViewProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const realAdmin = status === "authenticated" && isAdminName(session?.user?.name);

  // 쿠키는 브라우저에서만 읽힌다 — 서버 · 첫 렌더(hydration)는 꺼짐으로 같게 그리고 곧바로 실제 값으로.
  //   세션은 그 뒤에 도착하므로(useSession 은 loading 부터) realAdmin 이 켜지는 순간엔 이미 맞는 값이다. 바꾸면 새로고침이라 구독할 일은 없다
  const userView = useSyncExternalStore(subscribeNone, readUserViewCookie, serverOff);

  // ── 토스트 — 사이트 공통 알약(가운데 아래, 모바일 독 위). 실패는 흰 바탕 + 빨간 테
  const [toast, setToast] = useState<{ msg: string; error: boolean; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const notify = useCallback((msg: string, isError = false, opts?: { sound?: boolean }) => {
    setToast({ msg, error: isError, id: Date.now() });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), isError ? 4000 : 2600);
    if (opts?.sound ?? true) (isError ? sfxErr : sfxOk)();
  }, []);
  // 새로고침 직후 — 바꾸며 남긴 토스트를 한 번 더 띄운다(소리는 바꾼 순간에 이미 울렸다). 지우기는 띄울 때(개발 모드 effect 두 번 돌기에도 남게)
  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(FLASH_KEY); } catch {}
    if (!saved) return;
    const msg = saved;
    const t = setTimeout(() => {
      try { sessionStorage.removeItem(FLASH_KEY); } catch {}
      notify(msg, false, { sound: false });
    }, 0);
    return () => clearTimeout(t);
  }, [notify]);

  // 📌 켜고 끄기 — 쿠키 → 소리 + 토스트 → 새로고침. 서버 조회(숨김 · ?all=1 · 비공개 우회)와 화면이 한 번에 같은 값을 따른다
  // 새로고침 전 두 번 눌러도 한 번만(소리 · 토스트 · 새로고침이 겹치지 않게)
  const switching = useRef(false);
  const setUserView = useCallback((on: boolean) => {
    if (switching.current) return;
    switching.current = true;
    writeUserViewCookie(on);
    const msg = on ? "유저 화면으로 봅니다" : "관리자 화면으로 돌아왔습니다";
    (on ? sfxOk : sfxOff)();
    notify(msg, false, { sound: false });
    try { sessionStorage.setItem(FLASH_KEY, msg); } catch {}
    setTimeout(() => window.location.reload(), 320);
  }, [notify]);

  const view = useMemo<ViewCtx>(() => ({
    realAdmin,
    admin: realAdmin && !userView,
    userView: realAdmin && userView,
    setUserView,
    notify,
  }), [realAdmin, userView, setUserView, notify]);

  // ── 관리 도구 — 올린 화면(컴포넌트)마다 한 묶음. 화면이 사라지면 그 묶음도 내려간다(= 지금 화면의 도구만)
  const [entries, setEntries] = useState<{ id: string; tools: AdminTool[] }[]>([]);
  const set = useCallback((id: string, tools: AdminTool[]) => {
    setEntries((prev) => {
      const i = prev.findIndex((e) => e.id === id);
      if (i < 0) return [...prev, { id, tools }];
      const next = prev.slice();
      next[i] = { id, tools };
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => {
    setEntries((prev) => (prev.some((e) => e.id === id) ? prev.filter((e) => e.id !== id) : prev));
  }, []);
  const tools = useMemo(() => {
    const seen = new Set<string>();
    return entries.flatMap((e) => e.tools).filter((t) => (seen.has(t.key) ? false : (seen.add(t.key), true)));
  }, [entries]);
  const toolsCtx = useMemo<ToolsCtx>(() => ({ tools, set, remove }), [tools, set, remove]);

  return (
    <AdminViewContext.Provider value={view}>
      <AdminToolsContext.Provider value={toolsCtx}>
        {children}
        {toast && (
          <div key={toast.id} role="status" aria-live="polite"
            className={`fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-10 z-[210] w-max max-w-[calc(100vw-2rem)] px-5 py-3 rounded-full border text-[12px] font-bold break-keep shadow-[0_18px_44px_-14px_rgba(0,0,0,0.4)] pointer-events-none ${
              toast.error ? "bg-white border-[#e91e3f] text-[#d01634]" : "bg-[#131313] border-[#131313] text-white"
            }`}>
            {toast.msg}
          </div>
        )}
      </AdminToolsContext.Provider>
    </AdminViewContext.Provider>
  );
}

// 📌 화면에서 관리자 판정 — admin(관리자로 보는 중)으로 관리 UI · 숨김 데이터를 가른다
export const useAdminView = () => useContext(AdminViewContext);

// 📌 지금 화면의 관리 도구를 계정 메뉴에 올린다 — tools 를 빈 배열 · null 로 주면 내린다.
//    run 은 늘 마지막 렌더의 것을 부른다(매 렌더 새 함수여도 다시 올리지 않는다 — key · label · danger 가 바뀔 때만)
export function useAdminTools(tools: AdminTool[] | null | undefined) {
  const ctx = useContext(AdminToolsContext);
  const set = ctx?.set;
  const remove = ctx?.remove;
  const id = useId();
  const ref = useRef(tools);
  useIsoLayoutEffect(() => { ref.current = tools; });
  const sig = (tools || []).map((t) => `${t.key}\u0001${t.label}\u0001${t.danger ? 1 : 0}`).join("\u0002");
  useEffect(() => {
    if (!set || !remove) return;
    const list = ref.current || [];
    if (!list.length) { remove(id); return; }
    set(id, list.map((t) => ({
      key: t.key,
      label: t.label,
      danger: !!t.danger,
      run: () => { const cur = (ref.current || []).find((x) => x.key === t.key); return cur ? cur.run() : undefined; },
    })));
    return () => remove(id);
  }, [set, remove, id, sig]);
}

// 계정 메뉴가 그리는 목록 (ClientLayout 전용)
export const useAdminToolList = () => useContext(AdminToolsContext)?.tools || [];

// 📌 계정 메뉴의 관리 도구 한 줄 — 첫 번째 누름은 「한 번 더 누르면 실행」(3초), 두 번째에 실행 → 토스트 + 소리
//    size: pc(프로필 창 h-10 · 13px) / mobile(서랍 h-11 · 15px)
export function AdminToolRow({ tool, light, size = "pc" }: { tool: AdminTool; light: boolean; size?: "pc" | "mobile" }) {
  const { notify } = useAdminView();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const go = async () => {
    if (busy) return;
    if (!armed) { setArmed(true); playTone(740, 0.06, "sine", 0.03); return; }
    setArmed(false);
    setBusy(true);
    try {
      const msg = await tool.run();
      notify(typeof msg === "string" && msg ? msg : `${tool.label} 완료`);
    } catch (e) {
      notify((e as Error)?.message || `${tool.label} 실패`, true);
    }
    setBusy(false);
  };
  const pc = size === "pc";
  const tone = armed
    ? (light ? "bg-[#131313] text-white" : "bg-white text-[#131313]")
    : tool.danger
      ? (light ? `text-[#d01634] ${pc ? "hover:bg-[#e91e3f]/[0.06]" : "active:bg-[#e91e3f]/[0.06]"}` : `text-[#ff5c77] ${pc ? "hover:bg-[#e91e3f]/10" : "active:bg-[#e91e3f]/10"}`)
      : (light ? `text-[#131313] ${pc ? "hover:bg-[#f2f2f2]" : "active:bg-[#f2f2f2]"}` : `text-gray-200 ${pc ? "hover:bg-white/[0.06]" : "active:bg-white/[0.06]"}`);
  return (
    <button type="button" onClick={go} disabled={busy}
      className={`w-full flex items-center gap-3 rounded-xl text-left font-bold transition-colors outline-none disabled:opacity-50 ${pc ? "h-10 px-3 text-[13px]" : "h-11 px-3 text-[15px]"} ${tone}`}>
      <svg aria-hidden viewBox="0 0 24 24" className={`w-[18px] h-[18px] shrink-0 -translate-y-px ${armed ? "" : tool.danger ? "" : light ? "text-[#5a5a5a]" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.bolt} />
      </svg>
      <span className="min-w-0 truncate">{busy ? "실행 중…" : armed ? "한 번 더 누르면 실행" : tool.label}</span>
    </button>
  );
}

// 📌 계정 메뉴의 「유저 화면으로 보기」 스위치 줄 — realAdmin 일 때만 그린다
export function UserViewSwitchRow({ light, size = "pc" }: { light: boolean; size?: "pc" | "mobile" }) {
  const { realAdmin, userView, setUserView } = useAdminView();
  const [busy, setBusy] = useState(false);
  if (!realAdmin) return null;
  const pc = size === "pc";
  return (
    <button type="button" role="switch" aria-checked={userView} disabled={busy}
      onClick={() => { setBusy(true); setUserView(!userView); }}
      className={`w-full flex items-center gap-3 rounded-xl text-left font-bold transition-colors outline-none disabled:opacity-60 ${pc ? "h-10 px-3 text-[13px]" : "h-11 px-3 text-[15px]"} ${
        light ? `text-[#131313] ${pc ? "hover:bg-[#f2f2f2]" : "active:bg-[#f2f2f2]"}` : `text-gray-200 ${pc ? "hover:bg-white/[0.06]" : "active:bg-white/[0.06]"}`
      }`}>
      <svg aria-hidden viewBox="0 0 24 24" className={`w-[18px] h-[18px] shrink-0 -translate-y-px ${userView ? "text-[#e91e3f]" : light ? "text-[#5a5a5a]" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.eye} />
      </svg>
      <span className="min-w-0 truncate">유저 화면으로 보기</span>
      {/* 켜짐 표시 — 평평한 단색 알약 + 흰 손잡이 */}
      <span aria-hidden className={`ml-auto shrink-0 relative w-8 h-[18px] rounded-full transition-colors ${userView ? "bg-[#e91e3f]" : light ? "bg-[#d4d4d4]" : "bg-white/20"}`}>
        <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${userView ? "translate-x-[14px]" : ""}`} />
      </span>
    </button>
  );
}
