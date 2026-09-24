import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      /* 📌 이용수칙(/rlues) 은 없앴다.
         내용이 서버 이용약관 제3·4조와 겹쳐 두 벌로 관리되고 있었고, 규칙이 어긋나면
         제재 근거로 쓸 수 없다. 주소를 눌러 들어오던 사람이 404 를 보지 않게 넘겨준다. */
      { source: "/rlues", destination: "/policy", permanent: true },
      { source: "/rules", destination: "/policy", permanent: true },

      /* 📌 ARCTIC 은 제 주소 /shop 에 산다(이동 규칙 2, 3차). 한때 SYSTEM:LEVEL 의 탭이었으므로
         옛 주소 /level?tab=arctic 로 들어오면 /shop 으로 넘긴다 (DB 에 남은 배너 링크·공유 링크).
         permanent:false — 브라우저가 영구 캐시하면 나중에 되돌릴 수 없다. */
      { source: "/level", has: [{ type: "query", key: "tab", value: "arctic" }], destination: "/shop", permanent: false },

      /* 📌 프로필은 /profile 한 곳뿐이다. /shop/me 는 주문·장바구니·찜만 있는
         부분집합이었고 /profile 이 그 셋에 쿠폰까지 이미 담고 있었다. */
      { source: "/shop/me", destination: "/profile?from=arctic", permanent: false },
    ];
  },
};

export default nextConfig;
