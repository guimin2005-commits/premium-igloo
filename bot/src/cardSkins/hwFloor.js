// 📌 할로윈 카드 스킨 공용 — 사이트 카드 바닥 띠 그림이 글자를 덮지 않게 하는 도구(hw_*.js 가 같이 쓴다. 봇 사본 bot/src/cardSkins 에도 같은 파일)
//    시안(.claude/mockups/src/halloween)은 상점 미리보기 카드(ProfileCardPreview 360 × 556)에 맞춰 그렸다 — 마지막 줄이 스탯 두 칸이라
//    큰 그림(잭오랜턴 · 큰 유령 · 솥 · 사탕 상자 · 묘비 언덕 · 고양이)이 스탯 글자 옆 빈자리에 선다.
//    레벨 페이지 프로필 카드는 폭이 좁아(PC 315px) 같은 자리에 두면 오른쪽 스탯 값(누적 음성 시간)을 덮는다 → 카드 아래를 floorRoom 만큼 비워 스탯 글자 밑에 세운다.
//    그래도 글자 아래(limit)보다 위로 솟는 그림은 아래 테 뒤로 내려앉혀 빼꼼 내다보게 한다(빼꼼 유령 · 빼꼼 고양이와 같은 말).
//    상점 미리보기 카드는 시안 그대로(limit = null). 봇 카드는 카드 종류마다 큰 구석 그림을 뺀다(아래 botTopOpen · botFloorOpen).

// 바닥 띠 그림이 올라갈 수 있는 가장 위 y(px) — 없으면 null(제한 없음)
//   ctx: SkinFrame 이 잰 자리 — lineY(스탯 위 가로선) · barBottom(레벨 막대 아래)
//   📌 2026-10-11 레벨 페이지 '1회 획득' 줄을 빼고 '오늘 획득' 옆 [효과] 알약으로(운영자 D안) — 두 카드 모두 스탯 두 줄로 끝난다.
//      스탯 두 줄 = 위 여백 8 + 줄 66.5 × 2 = 141(아래 여백 12 빼면 글자 끝 129) → 그림은 글자 끝 + 3 = lineY + 132 아래로.
//      스탯 아래 남는 자리가 안쪽 여백뿐(170px 남짓)이면 시안대로 제한 없음 — 카드를 늘리지 않는다(운영자 "카드 끼웠다고 늘리지 마")
export function floorLimit(h, site, ctx) {
  if (!site || !ctx) return null;
  const { lineY, barBottom } = ctx;
  if (Number.isFinite(lineY)) return h - lineY > 172 ? Math.round(lineY + 132) : null;
  // 스탯을 접은 화면(폰 · XP 테이블) — 인벤토리 · 시즌 패스 · 강화 줄이 마지막(막대 아래 글 · 여백 · 아이콘 · 이름 = 112.5)
  if (Number.isFinite(barBottom)) return Math.round(barBottom + 115);
  return null;
}

// 📌 레벨 페이지 카드가 맨 아래(스탯 다음)에 더 비워 줄 높이(px) — 이만큼 비우면 바닥 띠 그림이 내려앉지 않고 시안 그대로 선다.
//    meta.floor(바닥 띠 그림 높이) − 카드 안쪽 여백(pad: 폰 20 · md 이상 28) − 9(스탯 아래 여백 12 − 틈 3). 바닥 띠 그림이 없는 스킨은 0
export const floorRoom = (meta, pad) => Math.max(0, Math.ceil((Number(meta?.floor) || 0) - pad - 9));

// 📌 테 바깥 여백(px, P 배수) — 폰 레벨 페이지 카드는 안쪽 여백이 20px(md 부터 28)이라 두꺼운 테(10 ~ 12px)를 12px 에서 시작하면
//    왼쪽 글자 · 사진 링 위에 2 ~ 4px 겹친다 → 테 안쪽 가장자리가 글자 시작(ctx.lineX0)을 넘지 않게 바깥으로 조금 민다(6px 까지). 그 밖은 o0 그대로
export function frameOut(site, ctx, band, P, o0 = 12) {
  const x0 = ctx?.lineX0;
  if (!site || !Number.isFinite(x0)) return o0;
  return Math.max(6, Math.min(o0, Math.floor((x0 - band) / P) * P));
}

// 📌 봇 이미지 카드 — 큰 구석 그림은 그 구석이 비는 카드에만(등급 카드 스킨 깃발과 같은 규칙 — botCards RANK_FLAG_KINDS). ctx.kind 가 없으면(미리보기 등) 다 단다
//    /레벨 · /랭크 · /출석체크 · /퀘스트 · /인벤토리 · /시즌패스 카드는 오른쪽 위 · 아래 구석까지 글 · 칸이 차서 큰 그림이 숫자 · 칸을 덮었다
//    → 테 · 모서리 판 · 문장 · 낮은 바닥만.
//    botTopOpen  — 오른쪽 위(달 · 빼꼼): 가운데 정렬인 레벨업 · 역할 지급
//    botFloorOpen — 바닥 띠 큰 무리(솥 · 큰 유령 · 책 · 촛불): 역할 지급만(레벨업은 아래에 레벨 막대가 거의 끝에서 끝까지 있어 막대 양 끝을 덮었다)
export const botTopOpen = (ctx) => !ctx?.kind || ["levelUp", "roleGrant"].includes(ctx.kind);
export const botFloorOpen = (ctx) => !ctx?.kind || ctx.kind === "roleGrant";
//    botCornerOk — 위 테에 붙은 작은 오른쪽 위 그림(호박 밭 달 · 박쥐, 검은 고양이 빼꼼 머리): 맨 윗줄 오른쪽에 칩 · 글이 있는 카드만 뺀다
//                  (/출석체크 '출석 완료' 칩 · /퀘스트 '받을 보상'). /레벨 카드(상점 상세 '디스코드' 미리보기)에는 그대로 보인다
export const botCornerOk = (ctx) => !["cmdAttend", "autoAttend", "cmdQuest"].includes(ctx?.kind);

// 위 끝 top(px)인 그림을 limit 아래로 내릴 거리(q 칸 배수)
export const sinkBy = (limit, top, q) => (limit == null || top >= limit ? 0 : Math.ceil((limit - top) / q) * q);

// 내려앉힌 그림 겹 — 테 안쪽 아래 가장자리(edge)에서 잘라 테 뒤에 있는 것처럼. 카드 크기마다 자리가 달라 id 에 크기를 넣는다
export function behind(key, w, h, edge, body) {
  if (!body) return { defs: "", svg: "" };
  const id = `${key}-sink-${w}x${h}`;
  return { defs: `<clipPath id="${id}"><rect width="${w}" height="${edge}"/></clipPath>`, svg: `<g clip-path="url(#${id})">${body}</g>` };
}
