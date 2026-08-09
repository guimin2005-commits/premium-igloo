# 고급 이글루 레벨링 봇 v2

사이트와 동일한 MongoDB(`UserXp`·`RoleConfig` 컬렉션)를 공유하는 자체 레벨링 봇입니다.
웹 XP SHOP·랭킹·관리자 대시보드(/admin/bot)와 실시간 연동됩니다.

## 기능
- **채팅 XP**: 200 XP / 쿨타임 1분 (원자적 갱신 — 연속 메시지 중복 지급 방지)
- **음성 XP**: 5분마다 3,000 XP (내전 채널 3,500) + 레벨 구간 보너스
  - 마이크+헤드셋 음소거 시 90% 감소, 잠수(AFK) 채널 제외
- **`/출석체크`**: 7,000 XP (1일 1회, KST 기준, 출석 Boost 역할 시 +7,000)
- **`/레벨` `/랭크`**: XP·레벨·서버 순위 조회
- **레벨업**: 지정 채널 알림 + 도달 레벨 보상 역할 자동 지급
- **역할 버프**: 관리자 대시보드(RoleConfig)에서 설정 → 1분 내 자동 반영
  - env 기반 레거시 버프(XP Boost+/S1 Boost+/펭귄 패밀리)도 하위 호환 지원

## 구조
```
bot/
├─ src/
│  ├─ index.js          진입점 (클라이언트·부팅·종료 처리)
│  ├─ config.js         환경변수 검증 + XP 정책 상수
│  ├─ db.js             MongoDB 연결 + UserXp/RoleConfig 모델
│  ├─ leveling.js       레벨 공식·음성 구간 보너스 (사이트와 동일)
│  ├─ xp.js             XP 지급·레벨업 감지·보상 역할·알림
│  ├─ roleConfigs.js    대시보드 역할 설정 캐시 (1분 주기 갱신)
│  ├─ commands.js       /출석체크 /레벨 /랭크
│  └─ features/
│     ├─ chatXp.js      채팅 XP
│     └─ voiceXp.js     음성 XP 루프
├─ .env.example
└─ package.json
```

## 로컬 실행
```bash
cd bot
npm install
cp .env.example .env   # 값 채우기
npm start
```

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
   pm2 start src/index.js --name igloo-bot
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
- 봇 초대 시 권한: 메시지 보기/보내기, 임베드, 역할 관리(보상 역할 지급용)
- 봇 역할이 보상 역할들보다 **위**에 있어야 역할 지급이 동작합니다
