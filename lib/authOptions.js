import DiscordProvider from "next-auth/providers/discord";
import CredentialsProvider from "next-auth/providers/credentials";
import { connectToDatabase } from "@/lib/mongodb";
import BotSetting from "@/models/BotSetting";
import { fetchGuildMember } from "@/lib/discordMember";

// 📌 서포터즈 역할 ID — 환경변수가 있으면 그것, 없으면 관리자가 /admin/bot 역할 탭에서 지정한 값.
//    다른 역할과 달리 관리자가 사이트에서 바꿀 수 있어야 하므로 DB 를 본다.
//    조회에 실패하면 빈 문자열 → 서포터즈 아님으로 떨어진다 (10분 뒤 재확인).
async function resolveSupporterRoleId() {
  if (process.env.DISCORD_SUPPORTER_ROLE_ID) return process.env.DISCORD_SUPPORTER_ROLE_ID;
  try {
    await connectToDatabase();
    const doc = await BotSetting.findOne({ key: "main" }, { supporterRoleId: 1 }).lean();
    return doc?.supporterRoleId || "";
  } catch (e) {
    console.error("서포터즈 역할 ID 조회 실패:", e);
    return "";
  }
}

// 📌 로컬 확인용 로그인 — .env.local의 DEV_LOGIN=1 일 때만 켜진다.
//    .env* 는 커밋되지 않으므로 배포 환경에는 이 제공자가 아예 존재하지 않는다.
//    (디스코드 계정 없이 로그인 상태를 만들어, 로그인이 필요한 화면을 직접 열어보기 위한 용도)
//    환경 변수를 통째로 배포에 붙여넣는 실수에 대비해 주소가 로컬일 때만 켠다 (아무 이름으로나 로그인되므로)
const isLocalAuthUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(process.env.NEXTAUTH_URL || "");
const devLoginProvider =
  process.env.DEV_LOGIN === "1" && isLocalAuthUrl && !process.env.VERCEL
    ? [
        CredentialsProvider({
          id: "devlogin",
          name: "로컬 확인용 로그인",
          credentials: {
            name: { label: "닉네임", type: "text" },
            id: { label: "디스코드 ID", type: "text" },
          },
          async authorize(credentials) {
            return {
              id: credentials?.id || process.env.DEV_LOGIN_ID || "",
              name: credentials?.name || process.env.DEV_LOGIN_NAME || "",
              image: "",
            };
          },
        }),
      ]
    : [];

// 📌 NextAuth 설정을 공유 모듈로 분리
//  - [...nextauth]/route.js 와 서버 사이드 getServerSession(authOptions) 에서 공용으로 사용
export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: "https://discord.com/api/oauth2/authorize?scope=identify+guilds",
    }),
    ...devLoginProvider,
  ],
  callbacks: {
    async jwt({ token, profile, user, trigger, session }) {
      // 로컬 확인용 로그인은 profile이 없으므로 user에서 ID를 받아둔다
      if (user?.id && !token.id) token.id = user.id;

      // 📌 클라이언트에서 인증 업데이트 시 토큰에도 반영
      if (trigger === "update" && session) {
        if (session.isVerified !== undefined) token.isVerified = session.isVerified;
        if (session.hasScrimRole !== undefined) token.hasScrimRole = session.hasScrimRole;
        if (session.isBooster !== undefined) token.isBooster = session.isBooster;
      }

      // 📌 인증/내전/부스터 역할 확인 — 최초 로그인 때, 그리고 10분마다 다시 본다
      //    (로그인 이후에 부스트를 시작해도 다시 로그인하지 않고 뱃지가 붙도록)
      const ROLE_TTL = 10 * 60 * 1000;
      const userId = profile?.id || token.id;
      const stale = !token.rolesCheckedAt || Date.now() - token.rolesCheckedAt > ROLE_TTL;

      // 세션 갱신(update — 인증·내전 권한을 받은 직후)도 곧바로 다시 본다. 클라이언트가 보낸 값은 확인 전 임시값이다
      const refresh = trigger === "update";

      if (userId && (profile || stale || refresh)) {
        token.id = userId;
        token.rolesCheckedAt = Date.now();
        try {
          const GUILD_ID = process.env.DISCORD_GUILD_ID;
          const AUTH_ROLE = process.env.DISCORD_AUTH_ROLE_ID;
          const SCRIM_ROLE = process.env.DISCORD_SCRIM_ROLE_ID;
          const BOOSTER_ROLE = process.env.DISCORD_BOOSTER_ROLE_ID;

          // 📌 멤버 조회는 인벤토리 · 내 XP 와 같은 캐시(lib/discordMember.js)를 쓴다 — API 요청마다 세션 확인이 겹쳐
          //    같은 조회가 한꺼번에 몰리면 디스코드가 429 로 막았다. 실패하면 마지막으로 받은 값(30분 이내)을 쓴다
          //    로그인 · 세션 갱신 때는 캐시를 건너뛴다 — 다른 인스턴스에 남은 지급 전 역할로 덮지 않게
          const r = await fetchGuildMember(userId, { fresh: !!profile || refresh });

          if (r.status === "ok" && !r.stale) {
            const memberData = r.member;
            token.isGuildMember = true; // 서버 입장 상태
            // 📌 프로필 사진도 여기서 함께 갱신한다. 로그인 때 받은 사진 URL 은 아바타 해시가 박혀 있어
            //    유저가 디스코드에서 사진을 바꾸면 404 가 나고 화면에 빈 원만 남는다(재로그인 전까지).
            //    서버 전용 프로필 사진이 있으면 그것을, 없으면 계정 사진을, 그것도 없으면 기본 아바타를 쓴다.
            try {
              const ga = memberData.avatar;
              const ua = memberData.user?.avatar;
              token.picture = ga
                ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${userId}/avatars/${ga}.png?size=128`
                : ua
                ? `https://cdn.discordapp.com/avatars/${userId}/${ua}.png?size=128`
                : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> 22n) % 6n)}.png`;
            } catch {}
            const roles = Array.isArray(memberData.roles) ? memberData.roles : [];
            token.isVerified = roles.includes(AUTH_ROLE);
            // 환경변수에 스크림 역할이 정의되어 있을 때만 검사
            token.hasScrimRole = SCRIM_ROLE ? roles.includes(SCRIM_ROLE) : false;
            // 부스터 확인 — 역할 ID(환경변수)와 디스코드가 직접 알려주는 부스트 시작일 중 하나만 있어도 부스터로 본다
            //   (배포 환경에 DISCORD_BOOSTER_ROLE_ID가 없어도 premium_since로 잡힌다)
            token.isBooster =
              (BOOSTER_ROLE ? roles.includes(BOOSTER_ROLE) : false) || !!memberData.premium_since;
            // 서포터즈 — 역할 ID 가 비어 있으면(미지정) 아무도 서포터즈가 아니다
            const SUPPORTER_ROLE = await resolveSupporterRoleId();
            token.isSupporter = SUPPORTER_ROLE ? roles.includes(SUPPORTER_ROLE) : false;
          } else if (r.status === "absent" && !r.stale) {
            // 📌 404 만이 "정말로 서버에 없는 유저"다
            token.isGuildMember = false;
            token.isVerified = false;
            token.hasScrimRole = false;
            token.isBooster = false;
            token.isSupporter = false;
          } else {
            // 📌 401·403·429(레이트리밋)·5xx 는 디스코드 쪽 사정이다.
            //    멀쩡히 서버에 있는 사람을 '미입장'으로 떨어뜨리면 안 된다 —
            //    이전 상태를 그대로 두고, 다음 요청 때 곧바로 다시 확인한다.
            console.error("길드 멤버 조회 실패 — 이전 상태 유지 후 재시도");
            token.rolesCheckedAt = Date.now() - ROLE_TTL + 60 * 1000; // 1분 뒤 재확인
          }
        } catch (e) {
          console.error("역할 확인 에러:", e);
          // 통신 자체가 실패한 경우 — 기존 상태를 유지하고 곧 다시 확인한다.
          // 최초 로그인이라 기존 상태가 없더라도 '미입장'으로 단정하지 않는다
          // (isGuildMember 를 false 로 박으면 입장 안내 화면이 잘못 뜬다).
          token.rolesCheckedAt = Date.now() - ROLE_TTL + 60 * 1000;
          if (profile) {
            token.isVerified = false;
            token.hasScrimRole = false;
            token.isBooster = false;
            token.isSupporter = false;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.isGuildMember = token.isGuildMember; // 서버 입장 여부
        session.user.isVerified = token.isVerified; // 기본 인증 상태
        session.user.hasScrimRole = token.hasScrimRole; // 내전 권한 상태
        session.user.isBooster = token.isBooster; // 부스터 상태
        if (token.picture) session.user.image = token.picture; // 갱신된 프로필 사진 (위 jwt 콜백 참고)
        session.user.isSupporter = !!token.isSupporter; // 서포터즈 역할 보유
      }
      return session;
    }
  },
};
