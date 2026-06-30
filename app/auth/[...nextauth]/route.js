import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const handler = NextAuth({
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: "https://discord.com/api/oauth2/authorize?scope=identify+email+guilds",
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account.provider === "discord") {
        try {
          const userId = profile.id;
          
          const GUILD_ID = process.env.DISCORD_GUILD_ID;
          const AUTH_ROLE_ID = process.env.DISCORD_AUTH_ROLE_ID;     
          const UNAUTH_ROLE_ID = process.env.DISCORD_UNAUTH_ROLE_ID; 
          const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

          console.log(`\n========== [디스코드 역할 부여 테스트] ==========`);
          console.log(`- 유저 ID: ${userId} (${profile.username})`);
          console.log(`- 타겟 서버 ID: ${GUILD_ID}`);

          if (!GUILD_ID || !BOT_TOKEN) {
            console.error("❌ 오류: 서버 ID 또는 봇 토큰이 .env 파일에 없습니다.");
            return true; 
          }

          // 1. 인증 완료 역할 지급 (PUT)
          if (AUTH_ROLE_ID) {
            console.log(`👉 [지급 시도] 인증 역할(${AUTH_ROLE_ID}) 지급 중...`);
            const addRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${AUTH_ROLE_ID}`, {
              method: 'PUT',
              headers: {
                "Authorization": `Bot ${BOT_TOKEN}`,
                "Content-Length": "0"
              }
            });
            
            if (!addRes.ok) {
              const err = await addRes.text();
              console.error(`❌ [지급 실패] 상태코드: ${addRes.status} / 원인: ${err}`);
            } else {
              console.log(`✅ [지급 성공] 인증 역할이 부여되었습니다.`);
            }
          }

          // 2. 미인증 역할 제거 (DELETE)
          if (UNAUTH_ROLE_ID) {
            console.log(`👉 [제거 시도] 미인증 역할(${UNAUTH_ROLE_ID}) 회수 중...`);
            const removeRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${UNAUTH_ROLE_ID}`, {
              method: 'DELETE',
              headers: {
                "Authorization": `Bot ${BOT_TOKEN}`
              }
            });
            
            if (!removeRes.ok) {
              const err = await removeRes.text();
              console.error(`❌ [제거 실패] 상태코드: ${removeRes.status} / 원인: ${err}`);
            } else {
              console.log(`✅ [제거 성공] 미인증 역할이 회수되었습니다.`);
            }
          }
          console.log(`=================================================\n`);

        } catch (error) {
          console.error("디스코드 API 통신 에러:", error);
        }
      }
      return true; 
    },
  },
});

export { handler as GET, handler as POST };