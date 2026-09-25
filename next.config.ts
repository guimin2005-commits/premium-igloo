import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      /* 📌 이용수칙(/rlues) 은 없앴다.
         내용이 서버 이용약관 제3·4조와 겹쳐 두 벌로 관리되고 있었고, 규칙이 어긋나면
         제재 근거로 쓸 수 없다. 주소를 눌러 들어오던 사람이 404 를 보지 않게 넘겨준다. */
      { source: "/rlues", destination: "/policy", permanent: true },
      { source: "/rules", destination: "/policy", permanent: true },

      /* 📌 ARCTIC 은 제 주소 /arctic 에 산다(이동 규칙 2, 3차). 한때 SYSTEM:LEVEL 의 탭(/level?tab=arctic)이었고
         그 뒤 잠깐 /shop 이었으므로 둘 다 /arctic 으로 넘긴다 (DB 에 남은 배너 링크·공유 링크).
         permanent:false — 브라우저가 영구 캐시하면 나중에 되돌릴 수 없다. */
      { source: "/level", has: [{ type: "query", key: "tab", value: "arctic" }], destination: "/arctic", permanent: false },
      /* 📌 프로필은 /profile 한 곳뿐이다. /shop/me 는 주문·장바구니·찜만 있는 부분집합이었다. */
      { source: "/shop/me", destination: "/profile?from=arctic", permanent: false },
      { source: "/shop", destination: "/arctic", permanent: false },
      { source: "/shop/:path*", destination: "/arctic/:path*", permanent: false },
      /* 📌 친구 초대 이벤트(/invite)는 내렸다 — 화면의 누적 보상(역할 · 포인트)이 실제 지급과 연동돼 있지 않았다.
         리뉴얼 전까지 들어오던 링크는 이벤트 목록으로 보낸다. 서버 쪽(app/api/referral · models/Referral)은 기록 보존용으로 남겨 둔다. */
      { source: "/invite", destination: "/event", permanent: false },
    ];
  },
};

export default nextConfig;
