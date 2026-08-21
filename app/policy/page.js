"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

/* 📌 이 페이지는 사이트에서 유일하게 '공식 문서' 톤을 따른다.
   법적 효력을 갖는 문서이므로 장식(시머·글로우·등장 애니메이션·크림슨 강조)을 쓰지 않고,
   가독성(본문 대비·행간·측정 폭)과 조문 구조의 명확함만 남긴다. */

const Article = ({ title, children }) => (
  <section className="pt-7 border-t border-white/[0.09] first:border-t-0 first:pt-0">
    <h2 className="text-[15px] md:text-base font-bold text-white mb-4 tracking-tight">{title}</h2>
    <div className="text-gray-300 space-y-3.5 text-[13.5px] md:text-sm leading-[1.85]">{children}</div>
  </section>
);

const NumberedList = ({ items }) => (
  <ol className="space-y-3">
    {items.map((it, i) => (
      <li key={i} className="flex gap-3.5">
        <span className="text-gray-500 font-bold text-xs pt-1 shrink-0 tabular-nums">{i + 1}.</span>
        <span>{it}</span>
      </li>
    ))}
  </ol>
);

const DefList = ({ items }) => (
  <ul className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
    {items.map((it, i) => (
      <li key={i} className="py-4">
        <p className="text-white font-bold text-[13.5px] md:text-sm mb-1.5">{it.term}</p>
        <p className="text-gray-400 text-[13px] md:text-[13.5px] leading-[1.8]">{it.desc}</p>
      </li>
    ))}
  </ul>
);

// 조문 중 특별히 주의를 요하는 항 — 색 대신 좌측 선과 라벨로만 구분
const Notice = ({ label = "주의", children }) => (
  <div className="border-l-2 border-white/25 pl-4 py-0.5">
    <p className="text-[11px] font-bold text-gray-500 tracking-wider mb-1">{label}</p>
    <p className="text-gray-300 text-[13px] md:text-[13.5px] leading-[1.8]">{children}</p>
  </div>
);

const Addendum = ({ date }) => (
  <section className="pt-7 border-t border-white/[0.09]">
    <h2 className="text-[15px] md:text-base font-bold text-white mb-3 tracking-tight">부칙</h2>
    <p className="text-gray-400 text-[13.5px] md:text-sm leading-[1.85]">
      본 문서는 <span className="text-white font-bold">{date}</span>부터 시행됩니다.
    </p>
  </section>
);

// 📌 푸터의 '이용약관' / '개인정보처리방침' 분리 링크가 ?tab= 으로 원하는 탭에 바로 진입한다
const DOCS = [
  { id: "terms", label: "서버 이용약관", short: "이용약관", note: "운영정책", date: "2023. 01. 22." },
  { id: "privacy", label: "개인정보처리방침", short: "개인정보", note: "", date: "2023. 01. 22." },
  { id: "level", label: "SYSTEM : LEVEL 운영 규정", short: "레벨", note: "XP·레벨", date: "2026. 08. 17." },
  { id: "arctic", label: "ARCTIC 이용약관", short: "ARCTIC", note: "XP 상점", date: "2026. 08. 17." },
  { id: "tournament", label: "e스포츠 대회 공식 규정", short: "대회", note: "", date: "2026. 08. 21." },
  { id: "scrim", label: "내전 규정", short: "내전", note: "", date: "2026. 04. 16." },
];
const VALID_TABS = DOCS.map((d) => d.id);

function PolicyContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState(VALID_TABS.includes(initialTab) ? initialTab : "terms");

  const activeDoc = DOCS.find((d) => d.id === tab) || DOCS[0];

  return (
    <main className="w-full flex-1 flex flex-col relative">

      {/* ── 문서 표제 — 장식 없이 활자만 ── */}
      <section className="w-full pt-14 pb-8 md:pt-20 md:pb-10 px-6 border-b border-white/[0.09]">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] font-bold tracking-[0.35em] text-gray-500 uppercase mb-4">Official Document</p>
          <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight leading-tight">약관 및 운영 정책</h1>
        </div>
      </section>

      {/* ── 문서 목차 — 색 채움 없이 밑줄로만 현재 문서를 표시 ── */}
      <div className="w-full px-6 border-b border-white/[0.09]">
        {/* ⚠️ 가로 스크롤로 두면 좁은 화면에서 뒤쪽 탭이 글자 중간에 잘린다.
            줄을 바꿔 전부 보이게 하고, 모바일에서는 짧은 이름을 쓴다
            (전체 이름은 바로 아래 서지 정보에 그대로 나온다). */}
        <div className="max-w-3xl mx-auto flex flex-wrap gap-x-4 sm:gap-x-5 md:gap-x-6">
          {DOCS.map((d) => {
            const active = tab === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setTab(d.id)}
                className={`relative py-3.5 sm:py-4 text-[13px] md:text-sm font-bold shrink-0 whitespace-nowrap outline-none focus:outline-none transition-colors ${
                  active ? "text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <span className="sm:hidden">{d.short || d.label}</span>
                <span className="hidden sm:inline">{d.label}</span>
                {active && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-white/70" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 현재 문서의 서지 정보 ── */}
      <div className="w-full px-6 pt-8">
        <div className="max-w-3xl mx-auto flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
          <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">
            {activeDoc.label}
            {activeDoc.note && <span className="text-gray-500 font-medium text-sm ml-2">({activeDoc.note})</span>}
          </h2>
          <p className="text-[11px] md:text-xs text-gray-500">시행일 {activeDoc.date}</p>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-6 pt-8 pb-16 flex-1 flex flex-col">

      {tab === "terms" ? (
        <div className="space-y-7 text-sm">
          <Article title="제1조 (목적)">
            <p>본 약관(이하 &lsquo;운영정책&rsquo;)은 디스코드 커뮤니티 서버 &lsquo;고급 이글루&rsquo;를 이용함에 있어, 서버 운영진과 이용자(이하 &lsquo;멤버&rsquo;) 간의 권리와 의무, 책임 사항 및 커뮤니티 이용 규칙을 규정함을 목적으로 합니다.</p>
          </Article>

          <Article title="제2조 (효력 및 변경)">
            <NumberedList items={[
              "본 운영정책은 멤버가 서버에 입장하는 즉시 효력이 발생하며, 입장 시 본 정책에 동의한 것으로 간주합니다.",
              "운영진은 합리적인 사유가 발생할 경우 관련 법령을 위배하지 않는 범위 내에서 본 정책을 개정할 수 있습니다.",
              "정책이 변경될 경우 변경 사항은 최소 7일 전 서버 및 사이트 공지사항을 통해 고지되며, 변경 이후의 서버 이용은 개정된 정책에 동의한 것으로 봅니다.",
            ]} />
          </Article>

          <Article title="제3조 (멤버의 의무 및 금지 행위)">
            <p>모든 멤버는 건전한 커뮤니티 조성을 위해 아래 각 호의 행위를 하여서는 안 됩니다.</p>
            <DefList items={[
              { term: "소란 행위 및 도배", desc: "동일하거나 유사한 메시지·이미지·이모지를 연속으로 게시하여 타인의 대화를 방해하는 행위(소음 테러, 멘션 테러 등 포함)" },
              { term: "불법 및 유해 정보 유포", desc: "성인물, 음란물, 잔혹한 매체, 저작권 침해 자료(불법 프로그램, 크랙 등), 불법 도박 관련 링크를 공유하는 행위" },
              { term: "개인정보 침해", desc: "당사자의 동의 없이 타인의 실명, 사진, 연락처, 주소, SNS 계정 등 사생활 정보를 유포하거나 추적하는 행위" },
              { term: "홍보 및 상업적 활동", desc: "운영진의 사전 승인 없이 타 디스코드 서버 링크, 제품 및 서비스를 홍보하거나 금전 거래를 유도하는 행위" },
              { term: "계정 도용 및 사칭", desc: "타 멤버, 유명인, 인플루언서, 일반인 또는 운영진의 닉네임, 프로필, 역할을 사칭하여 활동하는 행위" },
              { term: "친목질 및 파벌 조성", desc: "특정 멤버들 간의 과도한 사적 친목으로 신규 멤버에게 소외감을 주거나, 서버 내 여론을 조장하여 분란을 일으키는 행위" },
              { term: "음성 채널 방해", desc: "타인의 발언을 지속적으로 끊거나 가로막는 행위, 주변 소음이 심한 상태로 상시 마이크를 열어두어 대화를 방해하는 행위" },
              { term: "분쟁 유발 주제", desc: "정치, 종교, 인종 등 사회적으로 민감하여 분쟁을 유발할 수 있는 주제를 다루거나 이를 근거로 타인을 비하하는 행위" },
            ]} />
          </Article>

          <Article title="제4조 (이용 제한 및 제재 절차)">
            <p>운영진은 제3조의 금지 행위를 위반한 멤버를 대상으로 조사를 진행할 수 있으며, 위반 경중에 따라 다음과 같은 제재 조치를 취할 수 있습니다.</p>
            <DefList items={[
              { term: "주의 및 경고", desc: "경미한 위반 시 구두 주의 또는 시스템 경고 부여" },
              { term: "타임 아웃(대화 제한)", desc: "일정 시간 동안 채팅 채널 메시지 전송 및 음성 채널 입장 권한 박탈" },
              { term: "추방", desc: "서버에서 강제 퇴장 처리 (재입장 가능)" },
              { term: "차단", desc: "서버에서 영구적으로 강제 퇴장 및 재입장 차단 처리" },
            ]} />
            <Notice>중대한 위반(범죄 행위, 서버 테러 등)의 경우, 경고 절차 없이 즉시 영구 차단될 수 있습니다.</Notice>
          </Article>

          <Article title="제5조 (면책 조항)">
            <NumberedList items={[
              "운영진은 멤버 간의 대화, 거래, 분쟁으로 인해 발생하는 정신적·물질적 손해에 대해 어떠한 책임도 지지 않습니다.",
              "운영진은 디스코드 플랫폼 자체의 장애, 해킹, 서버 점검 등으로 인해 발생하는 서비스 중단에 대해 책임을 지지 않습니다.",
              "본인의 디스코드 계정 관리 소홀로 인해 발생하는 피해는 본인에게 책임이 있습니다.",
            ]} />
          </Article>

          <Addendum date="2023년 1월 22일" />
        </div>
      ) : tab === "tournament" ? (
        <div className="space-y-7 text-sm">
          <Article title="제1조 (총칙 및 참가 자격)">
            <NumberedList items={[
              "본 규정은 고급 이글루가 주최·주관하는 종합 e스포츠 대회의 공정하고 원활한 경기 운영을 위한 제반 사항을 규정함을 목적으로 합니다.",
              "모든 참가 팀 및 선수는 대회 참가 신청 시 본 규정을 숙지하고 준수하는 데 전적으로 동의한 것으로 간주합니다.",
              <>
                모든 경기는 본인 명의의 순수 본계정으로만 참여할 수 있으며, 다음 각 목에 해당하는 부정행위 적발 시 즉시 실격 및 서버 영구 제재 처분을 받습니다.
                <ul className="mt-2.5 space-y-1.5 list-disc pl-5 marker:text-gray-600 text-gray-400">
                  <li>타인의 계정을 이용한 대리 출전</li>
                  <li>본인의 실제 실력보다 현저히 낮은 티어의 부계정을 이용한 위장 참가(양학)</li>
                  <li>비인가 외부 프로그램(불법 핵, 매크로, 인게임 변조 툴 등)의 사용</li>
                </ul>
              </>,
            ]} />
          </Article>

          <Article title="제2조 (출석, 지각 및 무단 불참)">
            <NumberedList items={[
              <>모든 참가 선수는 경기 개시 <span className="text-white font-bold">15분 전</span>까지 지정된 디스코드 음성 채널에 입장하여야 합니다.</>,
              "사전 고지 없이 공식 경기 시작 시점까지 접속하지 않거나 경기 준비를 완료하지 못한 경우, 해당 팀은 즉시 기권패(몰수패) 처리됩니다.",
              <>
                무단 불참 선수는 고의적인 경기 방해로 간주하여 향후 고급 이글루에서 주최하는 모든 대회 및 커뮤니티 이벤트 참여가 영구 제한됩니다.
                <ul className="mt-2.5 space-y-1.5 list-disc pl-5 marker:text-gray-600 text-gray-400">
                  <li>무단 불참 선수의 팀의 경우, 기권패 처리됩니다.</li>
                </ul>
              </>,
            ]} />
          </Article>

          <Article title="제3조 (불가피한 사유에 따른 결원 및 대체 선수 출전)">
            <NumberedList items={[
              <><span className="text-white font-bold">[불가피한 불참의 면책]</span> 본인 및 직계존비속의 경조사(상례, 결혼 등), 응급 진료, 입원, 갑작스러운 사고 등 객관적으로 소명이 가능한 긴급 사유로 불참하는 경우, 제2조 제3항의 불참 페널티를 면제합니다.</>,
              <><span className="text-white font-bold">[사전 통보 의무]</span> 제1항의 사유가 발생한 경우, 선수는 최소 경기 시작 하루 전까지 운영진에게 유선 또는 메시지로 사유를 전달해야 하며, 운영진의 요청이 있을 시 관련 증빙 자료(진료 확인서, 부고장 등)를 제출해야 합니다.</>,
              <>
                <span className="text-white font-bold">[대체 선수(용병) 투입 규정]</span>
                <ul className="mt-2.5 space-y-1.5 list-disc pl-5 marker:text-gray-600 text-gray-400">
                  <li>긴급 결원 발생 시, 대회 최소 하루 전 운영진의 사전 검증 및 승인을 득한 동급 이하 티어의 대체 선수를 투입할 수 있습니다.</li>
                  <li>운영진의 사전 승인 없이 임의로 외부 인원을 인게임에 투입하여 경기를 진행할 경우, 해당 세트는 즉시 몰수패 처리됩니다.</li>
                </ul>
              </>,
            ]} />
          </Article>

          <Article title="제4조 (스포츠맨십 및 품위 유지)">
            <NumberedList items={[
              "모든 선수는 상호 존중을 바탕으로 정정당당하게 경기에 임해야 합니다.",
              <>
                인게임 전체 채팅, 디스코드, 보이스 채널을 통한 다음 각 목의 비매너 행위를 엄격히 금지합니다.
                <ul className="mt-2.5 space-y-1.5 list-disc pl-5 marker:text-gray-600 text-gray-400">
                  <li>상대방에 대한 비속어, 욕설, 인신공격 및 비하 발언</li>
                  <li>감정표현(이모티콘, 음성 휠) 연타, 티배깅 등 상대에게 불쾌감과 굴욕감을 주는 도발 행위</li>
                  <li>고의적인 경기 지연 및 비신사적인 행위</li>
                </ul>
              </>,
              <>
                비매너 행위 적발 시 사안에 따라 다음과 같이 단계별 제재를 부과합니다.
                <ul className="mt-2.5 space-y-1.5 list-disc pl-5 marker:text-gray-600 text-gray-400">
                  <li>1차 적발: 공식 경고 1회 부여</li>
                  <li>2차 적발(경고 2회 누적): 해당 세트 몰수패</li>
                  <li>중대 위반 시: 운영진 재량으로 즉시 팀 전체 실격 및 상금 수령 자격 박탈</li>
                </ul>
              </>,
            ]} />
          </Article>

          <Article title="제5조 (디스코드 운영 및 부정행위 방지 검증)">
            <NumberedList items={[
              <>모든 선수는 경기 진행 중 지정된 디스코드 팀 음성 채널에 상시 접속하여 실시간 마이크 소통 상태를 유지 및 <span className="text-white font-bold">최소 1인 화면 공유</span>를 진행해야 하며, 외부 음성 프로그램의 사용을 금합니다.</>,
              "방플(중계 화면 시청), 대리 플레이 등 부정행위를 차단하기 위해, 운영진은 경기 중 불시에 [디스코드 화면 공유 / 작업관리자 인증 / 캠 인증]을 요구할 수 있습니다.",
              <>참가 선수가 정당한 사유 없이 운영진의 검증 요청에 <span className="text-white font-bold">3분</span> 이상 불응하거나 거부할 경우, 부정행위 의심으로 간주하여 즉시 실격 처리할 수 있습니다.</>,
            ]} />
          </Article>

          <Article title="제6조 (경기 중단, 재개 및 분쟁 조정)">
            <NumberedList items={[
              <>
                인게임 시스템 오류, 네트워크 튕김(디스콘), 장비 결함 등 불가피한 상황 발생 시 즉시 퍼즈(일시정지)를 요청하고 운영진을 호출해야 합니다.
                <ul className="mt-2.5 space-y-1.5 list-disc pl-5 marker:text-gray-600 text-gray-400">
                  <li>경기 진행 중 문제를 파악했음에도 퍼즈 요청을 하지 않고, 경기가 끝난 후 문제 제기 시 재경기가 이루어지지 않을 수 있습니다.</li>
                </ul>
              </>,
              <>각 팀에 부여되는 퍼즈 시간은 <span className="text-white font-bold">팀당 세트별 최대 10분</span>으로 제한되며, 10분 초과 시 복귀 여부와 관계없이 인원 부족 상태로 속행해야 합니다.</>,
              "퍼즈 해제는 인게임 채팅을 통해 양 팀 리더의 준비 완료를 상호 확인한 후 운영진의 신호에 맞춰 경기를 재개해야 합니다.",
              "경기 중 발생한 모든 판정 및 분쟁의 최종 결정권은 운영진에게 있으며, 참가자는 리더를 통해서만 공식적으로 이의를 제기할 수 있습니다. 운영진의 최종 판정에 불복하여 경기 진행을 고의로 방해하는 경우 즉시 실격 처리됩니다.",
            ]} />
          </Article>

          <Article title="제7조 (상금 지급, 자격 박탈 및 전액 환수, 법적 조치)">
            <NumberedList items={[
              "상금은 참가 신청서에 기재된 계좌로 입금되며, 팀 내부 분배에 관한 제반 책임은 참가 팀에게 있습니다.",
              <>
                대회가 종료된 이후라도 대리 출전, 비인가 프로그램(핵/매크로) 사용, 티어 위장(부캐/양학), 승부조작 등 중대한 부정행위가 사후 적발될 경우 다음 각 목의 조치를 시행합니다.
                <ul className="mt-2.5 space-y-1.5 list-disc pl-5 marker:text-gray-600 text-gray-400">
                  <li>해당 팀의 대회 수상 및 입상 자격 즉시 박탈</li>
                  <li>기지급된 상금 및 상품에 대한 전액 즉각 환수</li>
                  <li>차순위 팀으로의 수상 자격 승계 및 위반자 영구 제재</li>
                </ul>
              </>,
              <>
                <span className="text-white font-bold">[상금 반환 거부 시 법적 조치]</span> 수상 자격이 박탈되었음에도 불구하고 지정된 기한 내에 상금 반환을 거부하거나 고의로 회피할 경우, 주최 측은 참가 신청 시 확보된 신원 및 계좌 정보를 바탕으로 사전 예고 없이 다음 각 목의 민·형사상 법적 절차를 진행합니다.
                <ul className="mt-2.5 space-y-1.5 list-disc pl-5 marker:text-gray-600 text-gray-400">
                  <li>형사 고소: 위계에 의한 주최 업무 방해(형법 제314조) 및 부정 수급에 따른 사기죄(형법 제347조)로 관할 수사기관(경찰서) 정식 형사 고소</li>
                  <li>민사상 강제집행: 민법 제741조(부당이득반환청구)에 따른 법원 지급명령 신청, 은행 계좌 및 재산 가압류 등 법적 강제집행 절차 착수</li>
                  <li>손해배상 청구: 법적 조치 진행에 따라 발생하는 소송 비용, 법률 자문료 및 주최 측의 유무형 손해에 대한 전액 배상 청구</li>
                </ul>
              </>,
              "참가자가 미성년자인 경우, 본 조에 따른 법적 고지 및 상금 반환 청구는 법정대리인(보호자)에게 직접 통보 및 진행됩니다.",
            ]} />
          </Article>

          <Article title="부칙">
            <NumberedList items={[
              <>본 규정은 공지된 날(<span className="text-white font-bold">2026. 08. 21.</span>)로부터 즉시 효력을 발생합니다.</>,
              "본 규정에 명시되지 아니한 돌발 상황 및 예외적인 분쟁은 운영진의 상호 합의와 최종 유권해석에 따라 결정합니다.",
            ]} />
            <p className="pt-2 text-[12px] text-gray-500">최종 수정일 2026. 08. 21.</p>
          </Article>
        </div>
      ) : tab === "privacy" ? (
        <div className="space-y-7 text-sm">
          <Article title="제1조 (개인정보의 수집 항목 및 방법)">
            <p>본 서버는 디스코드 플랫폼 위에서 운영되므로 멤버의 민감한 개인정보(주민등록번호, 금융정보 등)를 직접 수집하지 않습니다. 다만, 서비스 운영을 위해 아래의 정보가 자동으로 기록되거나 수집될 수 있습니다.</p>
            <DefList items={[
              { term: "수집 항목", desc: "디스코드 고유 ID(Snowflake), 디스코드 닉네임 및 사용자명(Username), 프로필 이미지, 서버 내 텍스트/음성 활동 로그, 입장 및 퇴장 일시, 보유 역할(Role) 정보" },
              { term: "수집 방법", desc: "디스코드 API 및 서버 관리용 봇(Bot)을 통한 자동 수집" },
            ]} />
          </Article>

          <Article title="제2조 (개인정보의 이용 목적)">
            <p>수집된 정보는 다음의 목적 이외의 용도로는 사용되지 않으며, 이용 목적이 변경될 시에는 사전에 공지합니다.</p>
            <ul className="space-y-3 list-disc pl-5 marker:text-gray-600">
              <li>서버 내 멤버 식별 및 본인 확인</li>
              <li>악성 유저 방지, 운영정책 위반 행위 조사 및 제재(보안 목적)</li>
              <li>서버 내 이벤트 진행 및 보상 지급</li>
              <li>멤버 현황 통계 분석 및 서비스 개선</li>
            </ul>
          </Article>

          <Article title="제3조 (개인정보의 보유 및 파기 기간)">
            <p>멤버가 서버를 자발적으로 탈퇴하거나 추방당한 경우, 해당 멤버의 서버 내 프로필 정보는 즉시 파기됩니다. 단, 디스코드 플랫폼 특성상 기존에 작성한 텍스트 메시지는 남아있을 수 있습니다.</p>
            <Notice label="예외 조항">운영정책 위반으로 인해 영구 차단된 유저의 디스코드 고유 ID 및 차단 사유는, 재입장 방지 및 서버 보안을 위해 서버가 존속하는 한 영구 보관됩니다.</Notice>
          </Article>

          <Article title="제4조 (이용자의 권리와 의무)">
            <NumberedList items={[
              "멤버는 언제든지 서버를 탈퇴함으로써 개인정보 제공 동의를 철회할 수 있습니다.",
              "본인이 작성한 메시지의 삭제를 원할 경우 직접 삭제해야 하며, 탈퇴 후에는 계정 식별이 불가능하여 운영진이 대신 삭제해 드릴 수 없습니다.",
              "서버 내 대화나 DM(다이렉트 메시지)을 통해 자신의 실명, 연락처 등 민감한 개인정보를 스스로 노출하지 않도록 주의해야 하며, 본인의 부주의로 발생한 정보 유출에 대한 책임은 본인에게 있습니다.",
            ]} />
          </Article>

          <Article title="제5조 (개인정보 보호 책임자 안내)">
            <p>본 서버의 개인정보 관련 문의 및 운영정책 위반 신고는 아래의 창구를 이용해 주시기 바랍니다.</p>
            <p><span className="text-white font-bold">문의:</span> 고급 이글루 공식 사이트의 문의 카테고리 이용</p>
          </Article>

          <p className="text-gray-400 text-[13px] md:text-[13.5px] leading-[1.85]">본 방침은 관련 법령에 의거하여 고급 이글루 서버 내에서 처리되는 이용자의 개인정보 보호 및 권익을 보호하기 위해 수립되었습니다.</p>
          <Addendum date="2023년 1월 22일" />
        </div>
      ) : tab === "level" ? (
        <div className="space-y-7 text-sm">
          <Article title="제1조 (목적 및 XP의 성격)">
            <p>본 규정은 고급 이글루의 활동 보상 체계인 <span className="text-white font-bold">SYSTEM : LEVEL</span>의 운영 기준을 정함을 목적으로 합니다.</p>
            <NumberedList items={[
              "XP는 서버 내 활동 실적을 나타내는 수치이며, 현금 등 법정 통화로 환전되지 않습니다.",
              "XP 및 레벨은 이용자에게 귀속되는 재산권이 아니며, 서버 운영 종료 또는 시즌 종료 시 소멸·초기화될 수 있습니다.",
              "XP는 타 이용자에게 양도·증여·판매할 수 없습니다.",
            ]} />
          </Article>

          <Article title="제2조 (XP 획득 기준)">
            <p>XP는 아래 기준에 따라 자동 지급되며, 운영상 필요에 따라 사전 공지 후 변경될 수 있습니다.</p>
            <DefList items={[
              { term: "채팅 채널", desc: "메시지 전송 시 200 XP · 쿨타임 1분" },
              { term: "음성 채널", desc: "5분 이상 접속 유지 시 3,000 XP · 쿨타임 5분" },
              { term: "내전 음성 채널", desc: "음성 채널 기준에 보너스 500 XP를 더한 3,500 XP · 쿨타임 5분" },
              { term: "출석 체크", desc: "1일 1회 7,000 XP (관련 상품 보유 시 추가 지급)" },
              { term: "레벨 구간 보너스", desc: "음성·내전 채널 이용 시 보유 레벨 구간에 따라 추가 XP가 가산되며, 700 레벨 이상이 최고 구간입니다." },
            ]} />
            <p>레벨 상한은 1,000 레벨이며, 레벨별 필요 XP는 공식 사이트의 XP 테이블에 공개된 산식을 따릅니다.</p>
          </Article>

          <Article title="제3조 (XP 획득 제한)">
            <NumberedList items={[
              "잠수 전용 음성 채널 이용 시 XP가 지급되지 않습니다.",
              "마이크 또는 헤드셋을 음소거한 상태에서는 XP 획득량이 90% 감소합니다.",
              "동일하거나 무의미한 메시지를 반복 전송하는 등 획득량을 늘리기 위한 도배 행위는 운영정책 제3조에 따른 금지 행위에 해당합니다.",
            ]} />
          </Article>

          <Article title="제4조 (부정 획득 및 제재)">
            <p>아래 각 호의 행위는 부정 획득으로 간주하며, 적발 시 획득 XP 전액 회수 및 레벨 조정, 관련 역할 회수, 서버 이용 제한 등의 조치가 이루어질 수 있습니다.</p>
            <DefList items={[
              { term: "자동화 도구 사용", desc: "매크로·봇 등을 이용해 채팅 또는 음성 접속을 자동화하는 행위" },
              { term: "다중 계정 이용", desc: "본인이 다수의 계정을 운영하여 XP 또는 초대 보상을 중복 수취하는 행위" },
              { term: "보상 체계 악용", desc: "허위 정보로 코드·초대 보상 등을 수취하거나, 시스템 오류를 신고하지 않고 반복 이용하는 행위" },
            ]} />
            <Notice>부정 획득으로 취득한 XP로 이미 상품을 수령한 경우, 해당 상품(역할 포함) 또한 회수 대상이 됩니다.</Notice>
          </Article>

          <Article title="제5조 (시즌 운영)">
            <NumberedList items={[
              "레벨 시스템은 시즌제로 운영되며, 각 시즌의 기간은 공식 사이트에 공지됩니다.",
              "시즌 종료 시 최종 레벨 상위 3인은 RANKER로 선정되어 전용 역할, 다음 시즌 특전, 명예의 전당 등재의 혜택을 받습니다.",
              "시즌 한정 상품 및 기간제 아이템의 효력은 해당 시즌 종료와 함께 소멸합니다.",
              "시즌 전환 시 XP 및 레벨의 초기화 여부와 범위는 시즌 종료 전 공지를 통해 안내합니다.",
            ]} />
          </Article>

          <Article title="제6조 (오류 및 조정)">
            <NumberedList items={[
              "시스템 오류로 XP가 과다 또는 과소 지급된 경우, 운영진은 정상 수치로 조정할 수 있습니다.",
              "XP 지급 누락이 확인될 경우 공식 사이트의 문의 창구를 통해 접수해 주시기 바랍니다. 다만 활동 기록이 확인되지 않는 건은 소급 지급이 어려울 수 있습니다.",
              "디스코드 플랫폼 장애 또는 봇 점검으로 인한 지급 지연에 대해서는 책임을 지지 않습니다.",
            ]} />
          </Article>

          <Addendum date="2026년 8월 17일" />
        </div>
      ) : tab === "arctic" ? (
        <div className="space-y-7 text-sm">
          <Article title="제1조 (목적 및 정의)">
            <p>본 약관은 XP 상점 <span className="text-white font-bold">ARCTIC</span>의 이용 조건과 절차를 정함을 목적으로 합니다.</p>
            <DefList items={[
              { term: "ARCTIC", desc: "이용자가 보유 XP를 사용하여 역할·권한·쿠폰 등의 상품을 교환하는 고급 이글루 공식 상점" },
              { term: "결제 수단", desc: "보유 XP에 한합니다. 현금 결제는 지원하지 않습니다." },
              { term: "상품", desc: "역할 상품, 권한 상품, 할인·보상 쿠폰 등 상점에 등록된 교환 대상" },
            ]} />
          </Article>

          <Article title="제2조 (이용 조건)">
            <NumberedList items={[
              "ARCTIC 이용은 디스코드 계정으로 로그인한 서버 인증 완료 회원에 한합니다.",
              "일부 상품은 특정 역할 보유자만 구매할 수 있으며, 구매 시점에 조건을 충족해야 합니다.",
              "운영상 필요에 따라 상점은 비공개로 전환될 수 있으며, 이 경우 구매가 제한됩니다.",
            ]} />
          </Article>

          <Article title="제3조 (구매 및 지급)">
            <NumberedList items={[
              "상품 구매 시 보유 XP에서 해당 금액이 즉시 차감됩니다.",
              "XP 차감으로 인해 보유 레벨이 하락할 수 있으며, 이는 정상 동작입니다. 레벨 하락에 따라 레벨 연동 역할이 회수될 수 있습니다.",
              "역할 상품은 봇에 의해 자동 지급되며, 통상 30초 이내에 반영됩니다.",
              "주문은 처리 대기 → 지급 완료 순으로 진행되며, 상품 성격에 따라 운영진의 수동 처리가 필요한 경우 지급이 지연될 수 있습니다.",
            ]} />
            <Notice>구매 확정 후에는 이용자가 직접 취소할 수 없습니다. 상품과 수량을 반드시 확인한 후 결제해 주시기 바랍니다.</Notice>
          </Article>

          <Article title="제4조 (취소 및 환불)">
            <p>XP는 법정 통화가 아니므로 현금 환불의 대상이 되지 않습니다. 다만 아래의 경우에 한해 XP 원복 또는 재지급을 요청할 수 있습니다.</p>
            <DefList items={[
              { term: "지급 누락", desc: "XP가 차감되었으나 상품(역할 등)이 지급되지 않은 경우" },
              { term: "중복 결제", desc: "동일 상품이 의도와 달리 중복 차감된 경우" },
              { term: "상품 정보 오류", desc: "등록된 상품 설명과 실제 지급 내용이 다른 경우" },
            ]} />
            <p>위 사유는 발생일로부터 <span className="text-white font-bold">7일 이내</span>에 공식 사이트의 문의 창구로 접수해야 하며, 운영진 확인 후 처리됩니다. 단순 변심 및 구매 실수는 취소·환불 대상이 아닙니다.</p>
          </Article>

          <Article title="제5조 (쿠폰)">
            <NumberedList items={[
              "쿠폰은 발급 시 정해진 사용 조건(최소 주문 금액, 할인 한도, 사용 기한, 필요 역할, 사용 횟수)의 범위에서만 사용할 수 있습니다.",
              "쿠폰은 타인에게 양도할 수 없으며, 사용 기한이 지난 쿠폰은 자동으로 소멸합니다.",
              "부정한 방법으로 취득·복제된 쿠폰은 사용이 무효 처리되며, 이미 사용된 경우 해당 상품이 회수됩니다.",
            ]} />
          </Article>

          <Article title="제6조 (상품 변경 및 면책)">
            <NumberedList items={[
              "운영진은 상품의 구성·가격·판매 여부를 변경할 수 있습니다. 이미 완료된 구매에는 소급 적용되지 않습니다.",
              "한정 수량 상품은 재고 소진 시 조기 마감되며, 재입고를 보장하지 않습니다.",
              "디스코드 플랫폼 장애, 봇 점검, 역할 권한 변경 등 외부 요인으로 발생한 지급 지연에 대해서는 책임을 지지 않습니다.",
              "운영정책 위반으로 서버에서 차단된 이용자의 미사용 XP 및 보유 상품은 복구되지 않습니다.",
            ]} />
          </Article>

          <Addendum date="2026년 8월 17일" />
        </div>
      ) : (
        <div className="space-y-7 text-sm">
          <Article title="제1조 (참여 규정)">
            <p>모든 인원은 내전을 자유롭게 주최 및 참여할 수 있습니다. 참가 확정 인원은 지정된 시간을 엄수해야 하며, 무단 불참이나 상습적인 지각 시에는 참여 권한이 제한될 수 있습니다.</p>
          </Article>

          <Article title="제2조 (상호 존중 및 매너 준수)">
            <p>모든 내전은 상호 존중을 바탕으로 진행하며, 상대방에게 불쾌감을 주는 행위(비하 발언, 티배깅 등)를 엄격히 금지합니다.</p>
          </Article>

          <Article title="제3조 (분쟁 규정)">
            <p>분쟁 발생 시 직접 대응을 금하며, 반드시 웹사이트의 <span className="text-white font-semibold">문의</span> 채널을 통해 접수해야 합니다. 모든 사안은 관리자 판단 하에 검토되며, 규정 위반 시 즉각 제재됩니다.</p>
          </Article>

          <Article title="제4조 (채널 이용)">
            <p>내전은 반드시 지정된 <span className="text-white font-semibold">내전 전용 음성 채널</span>에서만 진행해야 하며, 내전 목적 외 해당 채널의 사적 이용은 제한됩니다.</p>
          </Article>

          <Notice>위 운영 정책 미확인으로 인해 발생하는 불이익이나 제재에 대한 책임은 이용자 본인에게 있습니다.</Notice>

          <Addendum date="2026년 4월 16일" />
        </div>
      )}
      </div>
    </main>
  );
}

// useSearchParams는 정적 렌더링에서 Suspense 경계가 필요하다
export default function PolicyPage() {
  return (
    <Suspense fallback={null}>
      <PolicyContent />
    </Suspense>
  );
}
