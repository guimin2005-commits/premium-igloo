# 고급 이글루 레벨링 봇

사이트와 동일한 MongoDB를 공유하는 자체 레벨링 봇입니다.

## 기능 (Stage 1)
- 채팅 XP: 200 XP / 쿨타임 1분
- 음성 XP: 5분마다 3,000 XP (내전 채널 3,500) + 레벨 구간 보너스
  - 마이크+헤드셋 음소거 시 90% 감소, 잠수(AFK) 채널 제외
- `/출석체크`: 7,000 XP (1일 1회, KST 기준, 출석 Boost 역할 시 +7,000)
- `/레벨` `/랭크`: XP·레벨·서버 순위 조회
- 레벨업 시 지정 채널에 알림
- 역할 기반 버프: XP Boost+(+300) / S1 Boost+(+100) / 펭귄 패밀리(+250~550)

## 오라클 클라우드 무료 VM 배포 (평생 무료 24시간)

1. https://cloud.oracle.com 가입 → Compute 인스턴스 생성 (Ubuntu, Always Free 표시된 사양)
2. SSH 접속 후:
   ```bash
   # Node.js 20 설치
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs git

   # 코드 받기
   git clone https://github.com/guimin2005-commits/premium-igloo.git
   cd premium-igloo/bot
   npm install

   # 환경변수 설정
   cp .env.example .env
   nano .env   # 값 채우기

   # PM2로 24시간 구동 + 재부팅 자동 시작
   sudo npm install -g pm2
   pm2 start index.js --name igloo-bot
   pm2 save
   pm2 startup   # 출력되는 명령어 한 줄 복사-실행
   ```
3. 업데이트할 때: `cd premium-igloo && git pull && pm2 restart igloo-bot`

## Railway 배포 (더 간편, $5/월)
1. https://railway.app → New Project → GitHub 레포 연결
2. Root Directory를 `bot`으로 설정
3. Variables에 .env 값 입력 → 자동 배포 완료

## 디스코드 봇 설정 주의
- 개발자 포털 → Bot → **SERVER MEMBERS INTENT / MESSAGE CONTENT INTENT 켜기** 필수
- 봇 초대 시 권한: 메시지 보기/보내기, 임베드
