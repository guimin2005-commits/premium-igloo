// 📌 아이템 그룹 설정(Setting "itemGroups") 읽기 — 아이템 API(app/api/admin/items)와 상품 API(app/api/shop/items — 상품 묶음은 아이템 그룹을 따른다)가 같이 쓴다.
//    값 모양: 그룹 줄 { name, parent? } 뒤에 상위 줄 { name, kind: "parent" }(차례 = 상위 차례). 초안 모드는 초안을 덧씌운 보기(catalogFindOne)
import Setting from "@/models/Setting";
import { normalizeItemGroup } from "@/lib/items";
import { catalogFindOne } from "@/lib/catalogDraft";

export const GROUPS_KEY = "itemGroups";
// 저장된 그룹 설정 — names(그룹 차례) · parents(상위 차례) · parentOf(그룹 → 상위, 있는 상위만) · value(비교용 정리본)
export const groupMetaOf = (raw) => {
  const names = [];
  const parents = [];
  const parentOf = Object.create(null);
  for (const r of Array.isArray(raw) ? raw : []) {
    const n = normalizeItemGroup(r?.name);
    if (!n) continue;
    if (r?.kind === "parent") { if (!parents.includes(n)) parents.push(n); continue; }
    if (names.includes(n)) continue;
    names.push(n);
    const p = normalizeItemGroup(r?.parent);
    if (p) parentOf[n] = p;
  }
  for (const g of Object.keys(parentOf)) if (!parents.includes(parentOf[g])) delete parentOf[g];
  return { names, parents, parentOf, value: Array.isArray(raw) ? raw : [] };
};
export const loadGroupMeta = async () => groupMetaOf((await catalogFindOne(Setting, { key: GROUPS_KEY }, { select: { value: 1 } }))?.value);
