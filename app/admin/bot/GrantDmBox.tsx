"use client";

// 📌 아이템 지급 창의 DM 칸(2026-10-29 운영자 "그냥 아이템 지급 창에서 가능하게 · 왔다갔다 해야 하잖아") — 「DM 알림」을 켜면 열린다.
//    · 제목 · 본문의 처음 글 = 「운영진 지급」 틀(관리 › 봇 메시지)에 고른 아이템 · 수량 · 사유를 채운 글. 고친 글은 이번 지급에만(틀은 그대로)
//    · 미리보기 = 봇이 보낼 모양 그대로(renderTemplate — 봇과 같은 규칙). 추첨권이면 뽑는 법 그림 · 단추(봇 features/grantDm.js)
//    · 고친 칸만 부모에게 글로 올린다(처음 글과 같으면 null — 틀을 따른다). 서버는 그 칸만 Purchase grantDmTitle · grantDmBody 로 둔다
import { useEffect, useMemo, useState } from "react";
import { renderTemplate, sampleVars, LIMITS } from "@/lib/botMessages";
import { DiscordPreview, GRANT_TICKET_EXTRAS, useClock, type Rendered, type Tpl } from "../messages/BotMessageEditor";
import { inputClass, labelClass } from "../ui";

const KEY = "itemGrantNotice";

type Props = {
  itemName: string;
  ticket: boolean;
  qty: number;
  reason: string;
  title: string | null;
  body: string | null;
  onChange: (p: { title?: string | null; body?: string | null }) => void;
};

export default function GrantDmBox({ itemName, ticket, qty, reason, title, body, onChange }: Props) {
  const clock = useClock();
  const [tpl, setTpl] = useState<Tpl | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/bot-messages", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const row = Array.isArray(d?.data) ? d.data.find((x: { key?: string }) => x?.key === KEY) : null;
        if (!alive) return;
        if (row?.template) setTpl(row.template as Tpl);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // 칸의 처음 글은 이 지급의 값(아이템 · 수량 · 사유)만 채운다 — {user} · {name} 같은 사람마다 다른 칸은 그대로 두어 봇이 받는 사람으로 채운다.
  //   미리보기만 예시 사람(sampleVars)으로 그린다
  const own = useMemo(
    () => ({
      item: itemName || "아이템",
      qty: `${Math.max(1, qty).toLocaleString("ko-KR")}${ticket ? "장" : "개"}`,
      reason: reason.trim() || "관리자 지급",
    }),
    [itemName, qty, ticket, reason]
  );
  const vars = useMemo(() => ({ ...(sampleVars(KEY) as Record<string, unknown>), ...own }), [own]);
  const base = useMemo(() => (tpl ? (renderTemplate(tpl, vars) as unknown as Rendered) : null), [tpl, vars]);
  const edit = useMemo(() => (tpl ? (renderTemplate(tpl, own) as unknown as Rendered) : null), [tpl, own]);
  const defTitle = edit?.embed?.title ?? "";
  const defBody = edit?.embed?.description ?? "";
  const shown = useMemo(() => {
    if (!tpl) return null;
    if (title == null && body == null) return base;
    const mine = renderTemplate(
      { ...tpl, embed: { ...tpl.embed, ...(title != null ? { title } : {}), ...(body != null ? { description: body } : {}) } },
      vars
    ) as unknown as Rendered;
    // 봇도 고친 글로 보낼 게 없으면 틀 그대로 보낸다
    return mine.empty ? base : mine;
  }, [tpl, base, vars, title, body]);
  const edited = title != null || body != null;

  if (failed) return <p className="mb-4 text-[13px] text-[#d01634]">「운영진 지급」 틀을 불러오지 못했습니다.</p>;
  if (!tpl) return <div className="mb-4 h-40 rounded-lg bg-[#f2f2f2] animate-pulse" />;
  return (
    <div className="mb-4">
      <div className={`${labelClass} flex items-center justify-between`}>
        <span>DM 내용</span>
        {edited && (
          <button type="button" onClick={() => onChange({ title: null, body: null })} className="text-[12px] font-bold text-[#e91e3f] hover:text-[#d01634] hover:underline">
            기본 글로
          </button>
        )}
      </div>
      <input
        type="text"
        value={title ?? defTitle}
        maxLength={LIMITS.title}
        onChange={(e) => onChange({ title: e.target.value === defTitle ? null : e.target.value })}
        placeholder="제목"
        className={inputClass}
      />
      <textarea
        value={body ?? defBody}
        rows={3}
        maxLength={LIMITS.description}
        onChange={(e) => onChange({ body: e.target.value === defBody ? null : e.target.value })}
        placeholder="본문"
        className={`${inputClass} mt-2 resize-y`}
      />
      <div className="mt-2 rounded-lg overflow-hidden">
        <DiscordPreview
          r={shown}
          clock={clock}
          off={!tpl.enabled}
          card={null}
          images={ticket ? GRANT_TICKET_EXTRAS.images : undefined}
          buttons={ticket ? GRANT_TICKET_EXTRAS.buttons : undefined}
        />
      </div>
    </div>
  );
}
