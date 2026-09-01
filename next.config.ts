import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      /* 📌 이용수칙(/rlues) 은 없앴다.
         내용이 서버 이용약관 제3·4조와 겹쳐 두 벌로 관리되고 있었고, 규칙이 어긋나면
         제재 근거로 쓸 수 없다. 주소를 눌러 들어오던 사람이 404 를 보지 않게 넘겨준다. */
      { source: "/rlues", destination: "/policy", permanent: true },
      { source: "/rules", destination: "/policy", permanent: true },

      /* 📌 ARCTIC 은 SYSTEM:LEVEL 의 탭으로 합쳤다. 입구가 둘이면 프로필에 갔다
         돌아올 때 어디로 돌아갈지가 갈려 동선이 어긋난다. 코드의 링크는 전부
         고쳤지만 ShopBanner.link 처럼 DB 에 저장된 주소는 고칠 수 없으므로
         경로 자체를 넘겨준다. 하위 라우트(/shop/cart 등)는 그대로 살아 있다.
         permanent:false — 브라우저가 영구 캐시하면 나중에 되돌릴 수 없다. */
      { source: "/shop", destination: "/level?tab=arctic", permanent: false },
    ];
  },
};

export default nextConfig;
