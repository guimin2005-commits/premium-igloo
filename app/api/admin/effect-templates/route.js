export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import Setting from "@/models/Setting";
import { catalogWriteBlocked, liveLockedResponse, catalogFindOne, forWrite } from "@/lib/catalogDraft";
import { EFFECT_TEMPLATES_KEY, normalizeEffectTemplates, normalizeEffectTemplate, TEMPLATE_KINDS, TRIGGER_OF } from "@/lib/itemEffects";
import { loadEffectTemplates, rememberEffectTemplates } from "@/lib/effectTemplatesServer";

// 📌 종류별 효과 문구(2026-10-18 — lib/itemEffects 「종류별 효과 문구」 · Setting "effectTemplates")
//    GET : 관리자 — data.templates = 저장된 틀({ [효과 on]: 틀 } — 기본과 다른 것만. 초안 모드는 초안을 덧씌운 값)
//    PUT : 관리자 — { templates: { [on]: 틀 } } 바꾼 종류만. 저장된 묶음에 합친다(다른 창 · 다른 관리자가 그사이 바꾼 다른 종류는 그대로).
//          빈 칸 · 기본과 같은 틀은 그 종류를 기본으로(묶음에서 뺀다). 못 쓰는 칸 · 60자 넘음은 400(그 종류 · 이유)
//          바뀐 게 없으면 쓰지 않는다(초안 모드에서 빈 초안이 생기지 않게). 저장 뒤 이 서버의 지금 틀을 바로 바꾼다
const savedOf = async () => {
  const doc = await catalogFindOne(Setting, { key: EFFECT_TEMPLATES_KEY }, { select: { value: 1 } });
  return normalizeEffectTemplates(doc?.value || {}).value;
};
const same = (a, b) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    return NextResponse.json({ success: true, data: { templates: await savedOf() } });
  } catch (e) {
    console.error("효과 문구 조회 오류:", e);
    return NextResponse.json({ success: false, message: "효과 문구를 읽지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    await connectToDatabase();
    const body = await request.json().catch(() => ({}));
    const patch = body?.templates;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return NextResponse.json({ success: false, message: "바꿀 효과 문구가 없습니다." }, { status: 400 });
    }
    const errors = [];
    const fixed = {};
    for (const on of TEMPLATE_KINDS) {
      if (!Object.hasOwn(patch, on)) continue;
      const r = normalizeEffectTemplate(on, patch[on]);
      if (r.error) errors.push({ on, message: r.error });
      else fixed[on] = r.value;
    }
    if (errors.length) {
      const e0 = errors[0];
      const message = `${TRIGGER_OF[e0.on]?.l || e0.on} — ${e0.message}`;
      return NextResponse.json({ success: false, message, error: message, errors }, { status: 400 });
    }
    const saved = await savedOf();
    // 저장된 묶음에 합치기 — 값이 있으면 그 틀, "" 이면 기본(뺀다). 차례는 TEMPLATE_KINDS 로 다시 맞춘다
    const merged = { ...saved };
    for (const [on, v] of Object.entries(fixed)) {
      if (v) merged[on] = v;
      else delete merged[on];
    }
    const value = Object.fromEntries(TEMPLATE_KINDS.filter((on) => merged[on]).map((on) => [on, merged[on]]));
    if (!same(saved, value)) {
      const W = await forWrite(Setting, { key: EFFECT_TEMPLATES_KEY });
      await W.updateOne({ key: EFFECT_TEMPLATES_KEY }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
      rememberEffectTemplates(value);
    } else {
      await loadEffectTemplates({ force: true });
    }
    return NextResponse.json({ success: true, data: { templates: value }, changed: !same(saved, value) });
  } catch (e) {
    console.error("효과 문구 저장 오류:", e);
    return NextResponse.json({ success: false, message: "효과 문구를 저장하지 못했습니다." }, { status: 500 });
  }
}
