import { redirect } from "next/navigation";

// 📌 인벤토리는 화면이 아니라 팝업이다 (app/components/Inventory).
//    옛 주소는 상점으로 보내 그 자리에서 팝업을 연다 — ArcticShopBody 가 ?panel=bag 을 읽는다.
export default function ShopInventoryRedirect() {
  redirect("/arctic?panel=bag");
}
