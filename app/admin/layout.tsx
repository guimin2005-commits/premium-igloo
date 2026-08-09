import { Suspense } from "react";
import AdminNav from "./AdminNav";

// 📌 관리자 영역 공용 레이아웃 — 좌측 패널(데스크톱) / 상단 칩 바(모바일) + 콘텐츠
//    AdminNav가 useSearchParams를 사용하므로 Suspense로 감쌈
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row">
      <Suspense fallback={null}>
        <AdminNav />
      </Suspense>
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
