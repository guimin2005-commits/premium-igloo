// 📌 보유 판정 — 서버(api/shop/purchase · checkout)의 1인 1개 검사와 같은 기준.
//    대기 · 완료이면서 기간이 남은 구매만 보유로 본다(만료 · 환불 · 취소, 기간이 지났는데 아직 완료인 건은 제외).
//    상품 id 가 같거나, 상품에 연결된 아이템(itemId)을 수동 지급 · 시즌 패스로 받은 건(itemRef)도 보유다.
export const isLiveOwn = (o: any) =>
  ["pending", "completed"].includes(o?.status) && (!o.expiresAt || new Date(o.expiresAt).getTime() > Date.now());

// 상품 하나를 보유했는가 — 상세 화면용
export const ownsItem = (orders: any[], item: any) =>
  !!item && orders.some((o) => isLiveOwn(o) && (o.itemId === item._id || (!!item.itemId && o.itemRef === item.itemId)));

// 보유한 상품 id 모음 — 목록 화면(찜 · 홈 추천)용
export const ownedIdsOf = (orders: any[], items: any[]) => {
  const live = orders.filter(isLiveOwn);
  const ids = new Set<string>(live.map((o) => String(o.itemId)));
  const refs = new Set<string>(live.map((o) => o.itemRef).filter(Boolean));
  for (const it of items) if (it?.itemId && refs.has(it.itemId)) ids.add(String(it._id));
  return ids;
};
