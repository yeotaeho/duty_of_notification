// 집계 로직 합성 테스트 — 실 PDF에 없던 경로(입원/다중코드/rule#5/투약max) 검증.
// 실행: npx tsx test/aggregate.test.ts
import { aggregate } from '../src/aggregate';
import type { BaseRow, DetailRow, RxRow } from '../src/parser/types';

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✅' : '❌'} ${label}` + (ok ? '' : `\n    got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
}

const REF = '2026-06-15'; // recentStart=2026-03-15, windowStart=2021-06-15
const B = (p: Partial<BaseRow>): BaseRow => ({ seq: 0, date: '2025-01-01', facility: 'A의원', dept: '', visitType: '외래', dxCode: 'AB000', dxType: '양방', dxName: '병명', ...p });
const R = (p: Partial<RxRow>): RxRow => ({ seq: 0, date: '2025-01-01', facility: 'A의원', rxType: '외래', drugName: '약', ingredient: '', daysTotal: 0, ...p });
const D = (p: Partial<DetailRow>): DetailRow => ({ seq: 0, date: '2025-01-01', facility: 'A의원', category: '', codeName: '', ...p });
const grp = (res: ReturnType<typeof aggregate>, g: string) => res.diseases.find((d) => d.group === g);

// ── rule#3 입원력 ──
{
  const base = [B({ date: '2024-03-02', dxCode: 'AS720', visitType: '입원', dxName: '대퇴골골절' })];
  const r = aggregate(base, [], [], REF);
  eq('rule3 입원 감지', grp(r, 'AS72')?.inpatient, true);
}

// ── rule#1 통원 7회+ : 약국행은 제외(코드 있어도) ──
{
  const dates = ['2022-01-01', '2022-02-01', '2022-03-01', '2022-04-01', '2022-05-01', '2022-06-01', '2022-07-01'];
  const base = [
    ...dates.map((date, i) => B({ seq: i + 1, date, dxCode: 'AJ301', facility: '코의원' })),
    B({ seq: 99, date: '2022-08-01', dxCode: 'AJ301', facility: '코약국' }), // 약국, 같은 코드
  ];
  const r = aggregate(base, [], [], REF);
  eq('rule1 통원=7(약국 제외)', grp(r, 'AJ30')?.visitCount, 7);
  eq('rule1 7회+ 플래그', grp(r, 'AJ30')?.over7, true);
}

// ── rule#4 투약일수: 에피소드당 max, 방문별 합산(중복합산 안함) ──
{
  const base = [B({ date: '2025-02-01', dxCode: 'AK210', facility: 'A의원' }), B({ date: '2025-03-01', dxCode: 'AK210', facility: 'A의원' })];
  const mk = (date: string) => [1, 2, 3].map(() => R({ date, facility: 'A의원', daysTotal: 20 }));
  const rx = [...mk('2025-02-01'), ...mk('2025-03-01')]; // 두 방문 각 3약×20일
  const r = aggregate(base, rx, [], REF);
  eq('rule4 투약=40(20+20, 3약 합산 아님)', grp(r, 'AK21')?.drugDays, 40);
  eq('rule4 30일+ 플래그', grp(r, 'AK21')?.over30days, true);
}

// ── rule#4 다중코드 한 방문: 투약/시술이 두 그룹에 귀속 ──
{
  const base = [
    B({ date: '2025-05-02', dxCode: 'AM170', dxName: '무릎관절증', facility: 'B정형' }),
    B({ date: '2025-05-02', dxCode: 'AS836', dxName: '무릎인대', facility: 'B정형' }),
  ];
  const rx = [R({ date: '2025-05-02', facility: 'B정형', daysTotal: 14 })];
  const detail = [D({ date: '2025-05-02', facility: 'B정형', category: '처치 및 수술/처치(양방)', codeName: '관절천자' })];
  const r = aggregate(base, rx, detail, REF);
  eq('다중코드 그룹A 투약', grp(r, 'AM17')?.drugDays, 14);
  eq('다중코드 그룹B 투약', grp(r, 'AS83')?.drugDays, 14);
  eq('다중코드 그룹A 시술', grp(r, 'AM17')?.procedures.length, 1);
}

// ── rule#5 신규 추가(3개월내 처음 등장) ──
{
  const base = [B({ date: '2026-04-01', dxCode: 'AI109', dxName: '고혈압' })];
  const rx = [R({ date: '2026-04-01', drugName: '노바스크정5mg', ingredient: 'amlodipine', daysTotal: 30 })];
  const r = aggregate(base, rx, [], REF);
  eq('rule5 신규추가 found', r.chronicChange.found, true);
  eq('rule5 신규추가 목록', r.chronicChange.added, ['amlodipine']);
}

// ── rule#5 용량 변경(이전 5mg → 최근 10mg) ──
{
  const rx = [
    R({ date: '2025-08-01', drugName: '노바스크정5mg', ingredient: 'amlodipine', daysTotal: 90 }),
    R({ date: '2026-05-01', drugName: '노바스크정10mg', ingredient: 'amlodipine', daysTotal: 90 }),
  ];
  const r = aggregate([], rx, [], REF);
  eq('rule5 용량변경 found', r.chronicChange.found, true);
  eq('rule5 용량변경 내역', r.chronicChange.doseChanged, [{ drug: 'amlodipine', from: '5mg', to: '10mg' }]);
}

// ── rule#5 변경 없음(만성약 복용 중이나 3개월내 변동 없음) ──
{
  const rx = [R({ date: '2025-01-01', drugName: '메트포르민정500mg', ingredient: 'metformin', daysTotal: 90 })];
  const r = aggregate([], rx, [], REF);
  eq('rule5 변동없음 found=false', r.chronicChange.found, false);
  eq('rule5 변동없음 note', /3개월내/.test(r.chronicChange.note), true);
}

// ── rule#5 해당없음(만성약 자체 없음) ──
{
  const rx = [R({ date: '2026-04-01', drugName: '타이레놀정', ingredient: 'acetaminophen', daysTotal: 3 })];
  const r = aggregate([], rx, [], REF);
  eq('rule5 해당없음 found=false', r.chronicChange.found, false);
  eq('rule5 해당없음 note', /해당없음/.test(r.chronicChange.note), true);
}

// ── 고지대상 필터: 영상만=제외, 치료성 시술=포함 ──
{
  const base = [B({ date: '2025-01-01', dxCode: 'AM250', facility: 'A의원' })];
  const detail = [D({ date: '2025-01-01', facility: 'A의원', category: '영상진단 및 방사선치료료/진단(양방)', codeName: '족관절4매' })];
  eq('영상만 → 고지대상 아님', grp(aggregate(base, [], detail, REF), 'AM25')?.reportable, false);
}
{
  const base = [B({ date: '2025-01-01', dxCode: 'AT231', facility: 'A의원' })];
  const detail = [D({ date: '2025-01-01', facility: 'A의원', category: '처치 및 수술/처치(양방)', codeName: '화상처치' })];
  eq('치료성 시술 → 고지대상', grp(aggregate(base, [], detail, REF), 'AT23')?.reportable, true);
}

// ── 간편 3·2·5: 5년 중대질병 / 2년 수술 ──
{
  const r = aggregate([B({ date: '2024-05-01', dxCode: 'AC509', dxName: '유방암' })], [], [], REF);
  eq('간편 5년 중대질병 감지', r.simplified.critical5yr.length, 1);
}
{
  const base = [B({ date: '2025-03-01', dxCode: 'AK800', facility: 'A의원' })];
  const detail = [D({ date: '2025-03-01', facility: 'A의원', category: '처치 및 수술/수술(양방)', codeName: '담낭절제술' })];
  eq('간편 2년 수술 감지', aggregate(base, [], detail, REF).simplified.surgery2yr.length, 1);
}

// ── 대표코드(최다빈도) + KCD 표준명 ──
{
  const base = [B({ date: '2025-01-01', dxCode: 'AJ304' }), B({ date: '2025-02-01', dxCode: 'AJ304' }), B({ date: '2025-03-01', dxCode: 'AJ303' })];
  const g = grp(aggregate(base, [], [], REF), 'AJ30');
  eq('대표코드=최다빈도', g?.repCode, 'AJ304');
  eq('KCD 표준명 적용', g?.dxName, '상세불명의 알레르기비염');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
