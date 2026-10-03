"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MESSAGE_GROUPS,
  MESSAGE_DEFS,
  MESSAGE_KEYS,
  renderTemplate,
  sampleVars,
  resolveColor,
  formatUntil,
  isCardKey,
  defaultTemplate,
  sanitizeTemplate,
  progressBar,
} from "@/lib/botMessages";
import { CARD_SIZE, CARD_TIERS, sampleCardData } from "@/lib/botCards";
import { NOTICE_KEY, NOTICE_BUTTON_LABEL } from "@/lib/noticeDiscord";
import { AdminPage, Panel, Btn, Switch, SaveBar, StatusChip, ConfirmDialog, Segmented, useAdminGuard } from "../ui";
import {
  type Embed,
  type Tpl,
  type Draft,
  type VarDef,
  type Rendered,
  type EmbedText,
  type CardView,
  COMMON,
  LIM,
  str,
  normTpl,
  toDEmbed,
  toDraft,
  fromDraft,
  embedSig,
  sigOf,
  changedParts,
  problemsOf,
  firstProblem,
  withText,
  M_OPEN,
  M_CLOSE,
  MENTION_VARS,
  DiscordPreview,
  TextBox,
  Dot,
  Blk,
  count,
  sfxOk,
  sfxErr,
  useClock,
  useVarInsert,
  VarChips,
  EmbedPanel,
} from "./BotMessageEditor";

// 📌 봇 메시지 편집 — 레벨업 · 역할 지급 · DM · 명령어 응답의 임베드 디자인과 문구를 키마다 고친다.
//    왼쪽(모바일은 위) 키 목록 → 편집 → 디스코드처럼 그린 미리보기. 넓은 화면(xl)에서는 세 칸이 나란히.
//    · 초안은 키마다 따로 들고 있어 다른 키로 옮겨도 고치던 것이 남는다(목록에 빨간 점). 저장은 지금 키만.
//    · 미리보기는 lib/botMessages.js 의 renderTemplate(봇과 같은 규칙)에 예시 값(sampleVars)을 넣은 결과를 그린다.
//    · 채널은 레벨 설정에서 고른다 — 여기서는 '보내는 곳' 한 줄만.
//    · 카드 키(CARD_KEYS)는 이미지 카드 켜기/끄기 — 켜지면 미리보기의 큰 이미지 자리에 카드(등급 칩으로 바꿔 보기).
//    API: /api/admin/bot-messages (GET 목록 · PUT 저장 · DELETE 기본값으로 · POST 테스트 발송) · /card?key=&tier= (카드 PNG)
//    편집 부품 · 미리보기는 ./BotMessageEditor.tsx — 글쓰기 › 디스코드 공지 팝업도 같은 부품을 쓴다

const API = "/api/admin/bot-messages";
const CARD_API = "/api/admin/bot-messages/card";
// 등급에 따라 그림이 바뀌는 카드 — 출석(강조색 하나) · RANKER(금은동)는 등급 칩이 없다
const TIER_CARD_KEYS = new Set(["levelUp", "roleGrant", "cmdLevel", "cmdRank"]);
const TIER_OPTIONS = (CARD_TIERS as { name: string }[]).map((t, i) => ({ v: String(i), l: t.name }));
const DEFAULT_CARD_TIER = 1; // 브론즈 — 예시 레벨(128)의 등급
const JSON_HEADERS = { "Content-Type": "application/json" };

type Item = { key: string; custom: boolean; template: Tpl; updatedAt: string | null; updatedBy: string };
type Def = { group: string; label: string; vars: VarDef[]; plainEmbed?: unknown };

const DEFS = MESSAGE_DEFS as unknown as Record<string, Def>;
const KEYS = MESSAGE_KEYS as string[];
const GROUPS = MESSAGE_GROUPS as { key: string; label: string }[];

// 보내는 곳 — 채널은 레벨 설정(/admin/bot)에서 고른다
const DEST: Record<string, string> = {
  levelUp: "레벨업 채널",
  roleGrant: "역할 지급 채널",
  autoAttend: "출석 알림 채널",
  rankerAnnounce: "레벨업 채널",
  cmdAttendAlready: "명령어를 쓴 채널 · 나만 보기",
  levelClosed: "명령어를 쓴 채널 · 나만 보기",
  passUnclaimed: "유저 DM",
  noticePost: "공지 채널",
};
// 📌 DEFS[k] 로만 보면 ?key=constructor 같은 이름도 통과해 빈 화면이 된다 — 자기 키만
const isKey = (k: string | null): k is string => !!k && KEYS.includes(k);
const destOf = (key: string) => {
  if (DEST[key]) return DEST[key];
  const g = DEFS[key]?.group;
  return g === "dm" ? "구매자 DM" : g === "command" ? "명령어를 쓴 채널" : "채널";
};

const normItem = (x: any): Item => ({
  key: String(x?.key || ""),
  custom: !!x?.custom,
  template: normTpl(x?.template),
  updatedAt: x?.updatedAt ? String(x.updatedAt) : null,
  updatedBy: str(x?.updatedBy),
});

// 카드 켜기/끄기 짝 — 카드와 쓰는 짧은 기본 임베드 · 카드를 끈 예전 기본 임베드(lib/botMessages.js 의 plainEmbed)
const cardEmbedOf = (key: string): Embed | null => (isCardKey(key) ? normTpl(defaultTemplate(key)).embed : null);
const plainEmbedOf = (key: string): Embed | null => {
  const p = DEFS[key]?.plainEmbed;
  return isCardKey(key) && p ? normTpl(sanitizeTemplate({ embed: p }, key)).embed : null;
};


// cardTier 를 주면(카드 켜짐 · 등급 카드) 예시 레벨 · XP 를 카드 샘플(lib/botCards.js sampleCardData)과 같게 — 글과 카드 숫자가 어긋나지 않게
function previewVars(key: string, cardTier: number | null = null) {
  const v = { ...(sampleVars(key) as Record<string, unknown>) };
  if (cardTier != null && TIER_CARD_KEYS.has(key)) {
    const d = sampleCardData(key, cardTier, null) as { level: number; prevLevel?: number; xp: number; need: number; progress: number; rank?: number; total?: number; role?: string };
    v.level = d.level;
    // 역할 지급 — 그 등급 역할 · 시작 레벨(카드 샘플과 같다). 다른 등급 카드만 XP · 등급 이름
    if (key === "roleGrant") v.role = d.role;
    else {
      v.xp = d.xp;
      v.tier = (CARD_TIERS as { name: string }[])[cardTier]?.name;
    }
    if (key === "levelUp") Object.assign(v, { prevLevel: d.prevLevel, nextXp: d.need, progressBar: progressBar(d.progress) });
    if (key === "cmdLevel") Object.assign(v, { need: d.need, nextLevel: d.level + 1, progressBar: progressBar(d.progress) });
    if (key === "cmdRank") Object.assign(v, { rank: d.rank, total: d.total });
  }
  for (const n of MENTION_VARS) if (typeof v[n] === "string") v[n] = `${M_OPEN}${String(v[n]).replace(/^@/, "")}${M_CLOSE}`;
  return v;
}

export default function AdminBotMessagesPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/admin/bot-messages 가 서버에서 한다
  const { isAdmin, gate } = useAdminGuard();

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sel, setSel] = useState<string>(KEYS[0]);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [testing, setTesting] = useState(false);
  // 미리보기의 "오늘 오후 9:41"
  const clock = useClock();
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  // 카드 미리보기 등급 — 키를 옮겨도 그대로 (레벨업 · /레벨 · /랭크 공통)
  const [cardTier, setCardTier] = useState(DEFAULT_CARD_TIER);

  const alive = useRef(true);
  const editorRef = useRef<HTMLDivElement | null>(null);
  // 마지막으로 누른 글 칸과 커서 자리 — 변수 칩이 여기에 넣는다
  const { onCaret, resetCaret, insertVar: insertVarAt } = useVarInsert(editorRef);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    if (error) sfxErr();
    else sfxOk();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // 주소의 ?key= 로 연 키 — 새로고침해도 보던 메시지에 머문다
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key");
    if (isKey(k)) setSel(k);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch(API, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    if (!alive.current) return;
    const list: Item[] = d?.success && Array.isArray(d.data) ? d.data.map(normItem).filter((x: Item) => isKey(x.key)) : [];
    if (!list.length) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    const map: Record<string, Item> = {};
    const dm: Record<string, Draft> = {};
    for (const it of list) {
      map[it.key] = it;
      dm[it.key] = toDraft(it.template);
    }
    setItems(map);
    setDrafts(dm);
    setLoadFailed(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const item = items[sel] || null;
  const draft = drafts[sel] || null;
  const def = DEFS[sel];

  const dirtyKeys = useMemo(() => {
    const s = new Set<string>();
    for (const k of KEYS) if (items[k] && drafts[k] && sigOf(fromDraft(drafts[k])) !== sigOf(items[k].template)) s.add(k);
    return s;
  }, [items, drafts]);
  const dirty = dirtyKeys.has(sel);
  const chg = useMemo(() => new Set(item && draft && dirty ? changedParts(item.template, fromDraft(draft)) : []), [item, draft, dirty]);
  const problems = useMemo<Partial<Record<EmbedText, string>>>(() => (draft ? problemsOf(draft, sel) : {}), [draft, sel]);

  // 저장 안 한 초안이 있으면 창을 닫기 전에 묻는다
  useEffect(() => {
    if (dirtyKeys.size === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirtyKeys]);

  const cardKey = isCardKey(sel);
  const cardOn = !!draft && cardKey && draft.card;
  const tierCard = cardOn && TIER_CARD_KEYS.has(sel);
  const pv = useMemo(() => previewVars(sel, tierCard ? cardTier : null), [sel, tierCard, cardTier]);
  const rendered = useMemo(
    () => (draft ? (renderTemplate(fromDraft(draft), pv) as unknown as Rendered) : null),
    [draft, pv]
  );
  const cardView = useMemo<CardView | null>(() => {
    if (!cardOn) return null;
    const size = (CARD_SIZE as Record<string, { width: number; height: number }>)[sel];
    const q = new URLSearchParams({ key: sel });
    if (tierCard) q.set("tier", String(cardTier));
    return { src: `${CARD_API}?${q}`, ratio: size ? size.width / size.height : 1200 / 630 };
  }, [cardOn, tierCard, sel, cardTier]);
  // 📌 디스코드는 임베드 하나의 글자 합 6,000 을 넘으면 거절한다 — 봇은 뒤 필드부터 빼서 보낸다
  const overTotal = useMemo(() => {
    if (!draft || !draft.embed.on) return false;
    const e = draft.embed;
    const n = e.title.length + e.description.length + e.authorName.length + e.footerText.length + e.fields.reduce((a, f) => a + f.name.length + f.value.length, 0);
    return n > LIM.total;
  }, [draft]);

  // ── 초안 고치기 ──
  const patch = useCallback((fn: (d: Draft) => Draft) => {
    setDrafts((p) => (p[sel] ? { ...p, [sel]: fn(p[sel]) } : p));
  }, [sel]);
  const setTop = (k: "enabled" | "content", v: boolean | string) => patch((d) => ({ ...d, [k]: v }));
  const setText = (path: string, v: string) => patch((d) => withText(d, path, v));
  // 카드 켜기/끄기 — 임베드가 기본 모양 그대로면 짝 모양으로 바꾼다(끄면 예전 임베드, 켜면 카드와 겹치지 않는 짧은 임베드). 고친 임베드는 그대로
  const setCard = (on: boolean) =>
    patch((d) => {
      const from = on ? plainEmbedOf(sel) : cardEmbedOf(sel);
      const to = on ? cardEmbedOf(sel) : plainEmbedOf(sel);
      const swap = !!from && !!to && embedSig(d.embed) === embedSig(from);
      return { ...d, card: on, embed: swap && to ? toDEmbed(to) : d.embed };
    });

  // 변수 칩 — 마지막으로 누른 칸의 커서 자리에 {이름} (BotMessageEditor useVarInsert)
  const insertVar = (name: string) => insertVarAt(draft, name, setText, (m) => showToast(m, true));

  const pick = (k: string) => {
    if (k === sel) return;
    setSel(k);
    resetCaret();
    try {
      window.history.replaceState(null, "", `?key=${encodeURIComponent(k)}`);
    } catch {}
    // 모바일은 목록이 위에 있어 고른 뒤 편집 칸으로 내려 준다
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  // ── 저장 ──
  const save = async () => {
    // 📌 바뀐 게 없으면 보내지 않는다 — Ctrl+S 로 기본 디자인 키를 저장하면 '저장한 디자인'이 되어 옛 문구 반영이 끊긴다
    if (!draft || !item || saving || !dirty) return;
    const key = sel;
    const p = firstProblem(problemsOf(draft, key));
    if (p) return showToast(p, true);
    const tpl = fromDraft(draft);
    const sent = sigOf(tpl);
    setSaving(true);
    const res = await fetch(API, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ key, template: tpl, baseUpdatedAt: item.updatedAt }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!alive.current) return;
    setSaving(false);
    if (res?.ok && d?.success && d.data) {
      const saved = normItem(d.data);
      setItems((m) => ({ ...m, [key]: saved }));
      // 저장하는 사이 더 고쳤으면 그 초안은 그대로 둔다
      setDrafts((m) => (m[key] && sigOf(fromDraft(m[key])) === sent ? { ...m, [key]: toDraft(saved.template, m[key]) } : m));
      showToast("저장했습니다.");
      return;
    }
    // 409 — 다른 관리자가 먼저 바꿨다. 기준만 최신으로 바꾸고 초안은 둔다(한 번 더 저장하면 덮어쓴다)
    if (res?.status === 409 && d?.data) setItems((m) => ({ ...m, [key]: normItem(d.data) }));
    showToast(d?.message || "저장하지 못했습니다.", true);
  };
  // Ctrl/⌘ + S — 저장 줄의 저장과 같다
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 되돌리기 — 불러온(저장된) 값으로
  const revert = () => {
    if (!item) return;
    resetCaret();
    setDrafts((m) => ({ ...m, [sel]: toDraft(item.template) }));
  };

  // ── 기본값으로 ── 저장한 디자인이 있으면 지운다(확인 모달), 없으면 초안만 되돌린다
  const askReset = () => {
    if (!item) return;
    if (!item.custom) {
      revert();
      showToast("기본값으로 되돌렸습니다.");
      return;
    }
    setConfirmReset(true);
  };
  const doReset = async () => {
    const key = sel;
    setResetting(true);
    const res = await fetch(`${API}?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!alive.current) return;
    setResetting(false);
    setConfirmReset(false);
    if (res?.ok && d?.success && d.data) {
      const it = normItem(d.data);
      resetCaret();
      setItems((m) => ({ ...m, [key]: it }));
      setDrafts((m) => ({ ...m, [key]: toDraft(it.template) }));
      showToast("기본값으로 되돌렸습니다.");
    } else {
      showToast(d?.message || "되돌리지 못했습니다.", true);
    }
  };

  // ── 테스트 발송 ── 저장 안 한 초안이면 초안 그대로 보낸다. 봇이 10초마다 대기열을 보므로 결과를 2초마다 확인
  const sendTest = async () => {
    if (!draft || !item || testing) return;
    const key = sel;
    if (dirty) {
      const p = firstProblem(problemsOf(draft, key));
      if (p) return showToast(p, true);
    }
    setTesting(true);
    const res = await fetch(API, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(dirty ? { action: "test", key, template: fromDraft(draft) } : { action: "test", key }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!alive.current) return;
    const id = d?.data?.id;
    if (!res?.ok || !d?.success || !id) {
      setTesting(false);
      return showToast(d?.message || "테스트 요청에 실패했습니다.", true);
    }
    showToast("내 DM 으로 보내는 중입니다.");
    const started = Date.now();
    while (alive.current && Date.now() - started < 60_000) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await fetch(`${API}?test=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
      if (!alive.current) return;
      const st = s?.data?.status;
      if (st === "sent") {
        setTesting(false);
        return showToast("DM 으로 보냈습니다.");
      }
      if (st === "failed") {
        setTesting(false);
        return showToast(s?.data?.error || "보내지 못했습니다.", true);
      }
    }
    if (!alive.current) return;
    setTesting(false);
    showToast("봇이 아직 보내지 않았습니다. 봇이 켜지면 보냅니다.", true);
  };

  if (gate) return gate;

  const vars = [...(def?.vars || []), ...COMMON];
  const keyVarCount = def?.vars?.length || 0;
  const tierColor = resolveColor("tier", pv) as string;
  const meta = item
    ? item.custom
      ? `저장 ${formatUntil(item.updatedAt)}${item.updatedBy ? ` · ${item.updatedBy}` : ""}`
      : "기본 디자인"
    : "";
  const dest = destOf(sel);
  const e = draft?.embed;

  return (
    <>
      <AdminPage
        section="SYSTEM : LEVEL"
        title="봇 메시지"
        footer={<SaveBar dirty={!loading && dirty} changes={[...chg]} onSave={save} onReset={revert} saving={saving} />}
      >
        {loadFailed && !loading && (
          <div role="alert" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-[#e91e3f]/[0.08] text-[#d01634] text-[13px] font-bold">
            <p className="min-w-0 grow basis-60">메시지 설정을 불러오지 못했습니다.</p>
            <Btn size="sm" variant="secondary" onClick={load}>다시 불러오기</Btn>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
        ) : item && draft && e && def ? (
          <div className="flex flex-col lg:flex-row lg:items-start">
            {/* ── 키 목록 — PC 왼쪽 칸 / 모바일 위 두 열 ── */}
            <nav aria-label="메시지 목록" className="mb-5 lg:mb-0 lg:mr-5 lg:w-[196px] lg:shrink-0 lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto no-bar">
              <Panel flush>
                {GROUPS.map((g, gi) => {
                  const keys = KEYS.filter((k) => DEFS[k]?.group === g.key);
                  if (!keys.length) return null;
                  return (
                    <div key={g.key} className={gi > 0 ? "border-t border-[#ededed]" : ""}>
                      <p className="px-4 pt-3 pb-1.5 text-[11px] font-black tracking-[0.04em] text-[#8a8a8a]">{g.label}</p>
                      <div className="grid grid-cols-2 lg:grid-cols-1 pb-2">
                        {keys.map((k) => {
                          const on = k === sel;
                          const off = items[k] && !items[k].template.enabled;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => pick(k)}
                              aria-current={on ? "true" : undefined}
                              title={DEFS[k].label}
                              className={`relative flex items-center h-10 pl-4 pr-3 text-left text-[13px] font-bold outline-none focus-visible:bg-[#f2f2f2] transition-colors ${on ? "bg-[#f2f2f2] text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f7f7f7]"}`}
                            >
                              {on && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[2px] bg-[#e91e3f]" />}
                              <span className={`min-w-0 truncate ${off ? "text-[#a3a3a3]" : ""}`}>{DEFS[k].label}</span>
                              <span className="ml-auto pl-2 flex items-center shrink-0">
                                {off && <span className="text-[11px] text-[#a3a3a3]">꺼짐</span>}
                                {dirtyKeys.has(k) && <Dot />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </Panel>
            </nav>

            <div className="min-w-0 flex-1 flex flex-col xl:flex-row xl:items-start">
              {/* ── 편집 ── */}
              <div ref={editorRef} className="min-w-0 flex-1 mb-5 xl:mb-0 xl:mr-5 scroll-mt-24">
                {/* 머리 — 이름 · 보내는 곳 · 저장 시각은 줄 수를 고정해(말줄임) 아래 단추 줄이 키마다 움직이지 않게 */}
                <Panel flush className="mb-5">
                  <div className="px-5 pt-4 pb-3 border-b border-[#ededed]">
                    <h2 className="text-[17px] font-black tracking-tight truncate">{def.label}</h2>
                    <p className="mt-1 text-[12px] text-[#5a5a5a] truncate">
                      보내는 곳 ·{" "}
                      {def.group === "channel" ? (
                        <Link href="/admin/bot" className="font-bold text-[#131313] hover:underline">{dest}</Link>
                      ) : (
                        <span className="font-bold text-[#131313]">{dest}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#8a8a8a] truncate tabular-nums">{meta}</p>
                  </div>
                  {/* 단추 줄 — 켜짐/꺼짐 글자는 고정 폭, 바뀜 점은 띄워 둬서 375px 에서도 한 줄 그대로 */}
                  <div className="flex items-center px-4 md:px-5 py-3">
                    <span className="relative inline-flex items-center shrink-0">
                      <Switch on={draft.enabled} onChange={(v) => setTop("enabled", v)} label="보내기" />
                      <span className={`ml-2 w-8 text-[13px] font-bold ${draft.enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{draft.enabled ? "켜짐" : "꺼짐"}</span>
                      {chg.has("보내기") && <span className="absolute -top-1 -right-2"><Dot /></span>}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      <Btn variant="ghost" size="sm" onClick={askReset} disabled={(!item.custom && !dirty) || resetting}>기본값으로</Btn>
                      <Btn variant="secondary" size="sm" onClick={sendTest} disabled={testing} aria-busy={testing || undefined}>테스트 발송</Btn>
                    </div>
                  </div>
                </Panel>

                {/* 변수 칩 — PC 는 편집 칸 위에 붙어 따라온다, 모바일은 한 줄 가로 스크롤 */}
                <div className="mb-5 lg:sticky lg:top-[72px] z-10">
                  <VarChips vars={vars} keyVarCount={keyVarCount} onInsert={insertVar} />
                </div>

                <Panel flush className="mb-5">
                  <Blk label="본문" changed={chg.has("본문")} right={count(draft.content.length, LIM.content)}>
                    <TextBox path="content" value={draft.content} onChange={(v) => setText("content", v)} onCaret={onCaret} max={LIM.content} rows={3} label="본문" />
                  </Blk>
                </Panel>

                {/* 카드 이미지 — 카드 키만. 임베드 패널 머리와 같은 한 줄 */}
                {cardKey && (
                  <Panel flush className="mb-5">
                    <div className="flex items-center px-5 py-3.5">
                      <h2 className="inline-flex items-center text-[15px] font-black tracking-tight">
                        카드 이미지{chg.has("카드") && <Dot />}
                      </h2>
                      <span className="ml-auto inline-flex items-center shrink-0">
                        <Switch on={draft.card} onChange={setCard} label="카드 이미지" />
                      </span>
                    </div>
                  </Panel>
                )}

                {/* 공지는 레벨 변수가 없어 등급 색을 고를 수 없다 */}
                <EmbedPanel draft={draft} patch={patch} onCaret={onCaret} problems={problems} chg={chg} cardOn={cardOn} tierColor={tierColor} tierChip={sel !== NOTICE_KEY} onLimit={(m) => showToast(m, true)} />
              </div>

              {/* ── 미리보기 — 예시 값으로 그린다. PC(xl)는 오른쪽에 붙어 따라온다 ── */}
              <div className="min-w-0 xl:w-[380px] 2xl:w-[460px] xl:shrink-0 xl:sticky xl:top-[88px] xl:max-h-[calc(100vh-104px)] xl:overflow-y-auto no-bar">
                <Panel
                  flush
                  className="overflow-hidden"
                  title="미리보기"
                  right={
                    // 📌 칩 자리는 높이 0 — 칩(24px)이 제목 줄(22.5px)보다 커서, '보내기'를 끄고 켤 때마다 미리보기가 1~2px 오르내리던 것.
                    //    칩은 제목 줄 가운데에 겹쳐 뜨고, 칩이 없는 평소 모습(제목 줄 22.5px)은 예전 그대로
                    <span className="flex items-center gap-2 h-0">
                      {overTotal && <StatusChip tone="warn">6,000자 초과</StatusChip>}
                      {!draft.enabled && <StatusChip>꺼짐</StatusChip>}
                    </span>
                  }
                >
                  {/* 등급 칩 — 등급 카드(레벨업 · 역할 지급 · /레벨 · /랭크)에서 카드가 켜져 있을 때만. 한 줄 가로 스크롤 */}
                  {tierCard && (
                    <div className="flex items-center px-4 py-2.5 border-b border-[#ededed]">
                      <span className="shrink-0 mr-3 text-[12px] font-bold text-[#5a5a5a]">등급</span>
                      <div className="min-w-0 flex-1">
                        <Segmented options={TIER_OPTIONS} value={String(cardTier)} onChange={(v) => setCardTier(Number(v))} />
                      </div>
                    </div>
                  )}
                  {/* 공지는 봇이 링크 버튼을 붙인다 — 글자는 글마다(글쓰기 › 디스코드 공지), 여기선 기본 글자로 */}
                  <DiscordPreview r={rendered} clock={clock} off={!draft.enabled} card={cardView} buttons={sel === NOTICE_KEY ? [NOTICE_BUTTON_LABEL] : undefined} />
                </Panel>
              </div>
            </div>
          </div>
        ) : null}
      </AdminPage>

      <ConfirmDialog
        open={confirmReset}
        danger
        title="기본값으로"
        body={`저장한 '${def?.label || ""}' 디자인을 지우고 기본 디자인으로 돌아갑니다.`}
        confirmLabel="되돌리기"
        busy={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={doReset}
      />

      {/* 결과 토스트 — 저장 줄이 떠 있으면 그 위로 */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed ${dirty ? "bottom-[180px] md:bottom-24" : "bottom-[96px] md:bottom-6"} left-1/2 -translate-x-1/2 z-[130] w-max max-w-[calc(100vw-2rem)] px-5 py-3 rounded-full border text-[13px] font-bold break-keep shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] ${toast.error ? "bg-white border-[#e91e3f] text-[#d01634]" : "bg-[#131313] border-[#131313] text-white"}`}
        >
          {toast.error ? "⚠ " : "✓ "}
          {toast.msg}
        </div>
      )}
    </>
  );
}
