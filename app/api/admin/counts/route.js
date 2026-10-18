export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import Inquiry from "@/app/models/Inquiry";
import Apply from "@/app/models/Apply";
import Purchase from "@/models/Purchase";
import SupporterReport from "@/models/SupporterReport";

// 📌 관리자 좌측 메뉴(app/admin/AdminNav.tsx) · 기능 검색의 「확인할 일」 빨간 숫자 — 읽기만 한다(쓰기 없음). 관리자 전용.
//    GET → { success, inquiry, apply, orders, supportReports }
//      · inquiry        — 답변 안 한 1:1 문의(status "접수 중", /support?admin=1 과 같은 기준)
//      · apply          — 심사 중 구인 지원(status 가 비어 있는 옛 문서도 심사 중 — /recruit?admin=1 과 같은 기준)
//      · orders         — 상점 관리 › 구매 내역 「대기」 줄 수. 화면은 한 결제(orderId)의 같은 상품(세트는 구성 아이템까지) 건을
//                         한 줄로 묶어 센다(app/admin/shop groupOrderRows · lib/orderGroups.js) — 탭 숫자와 같게 DB 에서 같은 열쇠로 묶는다
//      · supportReports — 서포터즈 › 신고·피드백 미처리(status "open")
//    예전엔 메뉴가 페이지를 옮길 때마다 문의 · 지원서 전체 목록을 받아 화면에서 셌다 — 개수만 센다.
//    한 칸이 실패해도 나머지는 내보낸다(그 칸만 0)

const toCount = (v) => Math.max(0, Math.floor(Number(v) || 0));
const safe = (label, p) =>
  Promise.resolve(p)
    .then(toCount)
    .catch((e) => {
      console.error(`관리자 숫자(${label}) 조회 오류:`, e?.message || e);
      return 0;
    });

// 문자열 칸이 비었는지 — 옛 문서는 칸이 없을 수 있다
const filled = (field) => ({ $gt: [{ $strLenCP: { $ifNull: [field, ""] } }, 0] });

async function pendingOrderRows() {
  const [row] = await Purchase.aggregate([
    { $match: { status: "pending" } },
    {
      $group: {
        _id: {
          $cond: [
            filled("$orderId"),
            // 세트 구성 건은 구성 아이템(itemRef)마다 한 줄 — 화면 groupOrderRows 와 같은 열쇠
            { o: "$orderId", i: "$itemId", r: { $cond: [filled("$bundleName"), { $ifNull: ["$itemRef", ""] }, ""] } },
            "$_id",
          ],
        },
      },
    },
    { $count: "n" },
  ]);
  return row?.n || 0;
}

export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();

    const [inquiry, apply, orders, supportReports] = await Promise.all([
      safe("inquiry", Inquiry.countDocuments({ status: "접수 중" })),
      // $in 의 null 은 칸이 없는 문서까지 잡는다
      safe("apply", Apply.countDocuments({ status: { $in: ["심사 중", "", null] } })),
      safe("orders", pendingOrderRows()),
      safe("supportReports", SupporterReport.countDocuments({ status: "open" })),
    ]);

    return NextResponse.json(
      { success: true, inquiry, apply, orders, supportReports },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("관리자 숫자 조회 오류:", e);
    return NextResponse.json({ success: false, message: "조회에 실패했습니다.", error: "조회에 실패했습니다." }, { status: 500 });
  }
}
