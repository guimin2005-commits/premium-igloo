// 📌 빙옥 환율 — 1 빙옥 = 1,000 XP (2026-09 변경. 그 전엔 1:1).
//    XP 가 수백만 단위라 1:1 이면 빙옥도 7~8자리가 되고, 승급 보상(수백~수천)은 상품값의 0.5% 도 안 돼 쓸모가 없었다.
//    가격은 여전히 XP 하나만 저장한다. 빙옥으로 낼 때는 xpToPoint(가격) 만큼 뺀다 — 올림이라 두 화폐를 오가며 남기는 구멍이 없다.
//    ⚠️ 서버(결제 · 강화 · 시즌 패스 해금 · 환불)와 화면이 모두 이 파일만 본다. 여기 숫자를 바꾸면 전부 따라 바뀐다.
//    DB · 서버 의존이 없어 클라이언트 화면에서도 import 할 수 있다(lib/points.js 는 모델을 불러 서버 전용).
export const POINT_RATE = 1000;

// XP 가격 → 빙옥으로 낼 때의 값 (올림)
export const xpToPoint = (xp) => Math.ceil(Math.max(0, Number(xp) || 0) / POINT_RATE);

// 빙옥 → XP 로 치면 얼마 (표시용)
export const pointToXp = (point) => Math.max(0, Number(point) || 0) * POINT_RATE;
