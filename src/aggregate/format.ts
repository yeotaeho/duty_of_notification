// 집계 결과 → 사용자 지정 "알릴의무 정리표" 텍스트.
// 병원명 미출력(규칙 #1). 사실만, 추측 없음. 고지대상만 추려서 표시.
import type { AggregateResult, DiseaseSummary } from './index';

/** 시술 요약(중복 제거한 코드명). */
function procSummary(d: DiseaseSummary): string {
  return [...new Set(d.procedures.map((p) => p.codeName))].join(', ');
}

/** 고지 신호 우선순위(입원>7회>30일>시술) — 정렬용. */
function priority(d: DiseaseSummary): number {
  return (d.inpatient ? 8 : 0) + (d.over7 ? 4 : 0) + (d.over30days ? 2 : 0) + (d.procedures.length ? 1 : 0);
}

export function formatReport(r: AggregateResult, name: string): string {
  const L: string[] = [];
  L.push(`[알릴의무 정리표 - ${name}]`);
  L.push(`(기준일 ${r.refDate} · 조회기간 ${r.windowStart} ~ ${r.refDate} · 표준체 기준)`);

  const reportable = r.diseases.filter((d) => d.reportable)
    .sort((a, b) => priority(b) - priority(a) || b.lastDate.localeCompare(a.lastDate));
  L.push(`(전체 ${r.diseases.length}개 상병 중 고지대상 ${reportable.length}개)`);
  L.push('');

  for (const d of reportable) {
    const type = d.dxType ? `(${d.dxType})` : '';
    const range = d.firstDate === d.lastDate ? d.firstDate : `${d.firstDate} ~ ${d.lastDate}`;
    L.push(`[${d.repCode}] ${type} ${d.dxName} ${range}`);

    const flags = [`ㄴ${d.visitCount}회 통원`];
    if (d.over7) flags.push('★5년내 7회 이상');
    if (d.inpatient) flags.push('★입원력');
    L.push(`${flags.join(' / ')} / ${d.ongoing ? '현재 치료 가능성(3개월내 진료)' : '현재이상없음'}`);

    if (d.over30days) L.push(`ㄴ★5년내 누적 투약 ${d.drugDays}일 (30일 이상)`);
    if (d.procedures.length) L.push(`ㄴ[추가 정보: ${procSummary(d)} 시행]`);
    if (d.codes.length > 1) L.push(`ㄴ[상병코드 ${d.codes.join(', ')} 포함하여 총 ${d.visitCount}회 내원 확인]`);
    L.push('');
  }

  // ── 간편(유병자) 3·2·5 ──
  L.push('-'.repeat(72));
  L.push(`[간편심사(유병자) 3·2·5] ${r.simplified.note}`);
  L.push(`ㆍ3개월내 입원/수술: ${r.simplified.recent3mo.length ? r.simplified.recent3mo.join(' / ') : '없음'}`);
  L.push(`ㆍ2년내 입원/수술: ${r.simplified.surgery2yr.length ? r.simplified.surgery2yr.join(' / ') : '없음'}`);
  L.push(`ㆍ5년내 중대질병(암·뇌·심장 등): ${r.simplified.critical5yr.length ? r.simplified.critical5yr.join(' / ') : '없음'}`);
  L.push(`ㆍ(수기확인) ${r.simplified.needsManualCheck}`);

  // ── 만성질환 약 변경 ──
  const cc = r.chronicChange;
  L.push('');
  L.push(`[만성질환 약 변경(3개월)] ${cc.note}`);
  if (cc.added.length) L.push(`ㄴ신규 추가: ${cc.added.join(', ')}`);
  for (const ds of cc.doseChanged) L.push(`ㄴ용량 변경: ${ds.drug} ${ds.from} → ${ds.to}`);

  // ── 처방조제 내역 정리 ──
  L.push('');
  L.push('-'.repeat(72));
  L.push('[처방조제 내역 정리]');
  for (const ep of r.rxEpisodes) {
    const type = ep.dxType ? `(${ep.dxType})` : '';
    const code = ep.dxCode ? `[${ep.dxCode}] ${type} ${ep.dxName}` : '[상병코드 없음]';
    const maxDays = Math.max(0, ...ep.drugs.map((x) => x.days));
    L.push(`${ep.date} ${code}`);
    L.push(`ㄴ${[...new Set(ep.drugs.map((x) => x.name))].join(', ')}  (총 ${maxDays}일분)`);
  }
  return L.join('\n');
}
