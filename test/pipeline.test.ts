// 합성 글자 데이터로 글자기반 파이프라인(Step1~5)을 검증한다(실 PDF 없이).
// 실 PDF 회귀검증은 scripts/check.ts 참고.
// 실행: npx tsx test/pipeline.test.ts
import { COLUMNS } from '../src/parser/columns';
import { buildRawRows } from '../src/parser/pipeline';
import { normalizeRx } from '../src/parser/normalize';
import { validate } from '../src/parser/validate';
import type { PageFragments, TextFragment } from '../src/parser/types';

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✅' : '❌'} ${label}` + (ok ? '' : `\n    got=${JSON.stringify(got)}\n    want=${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
}

const f = (str: string, x: number, y: number, opts: Partial<TextFragment> = {}): TextFragment => ({
  str, x, y, width: str.length * 6, height: 9, rotated: false, ...opts,
});

// 처방조제정보 실측 x좌표. 한 행은 윗줄(약품명한글)+가운뎃줄(순번/날짜/병원/용량)+아랫줄(성분명)로 구성.
const X = { seq: 41, date: 72, fac: 158, rx: 261, drug: 292, ing: 399, d1: 476, d2: 511, dT: 546 };

const row1: TextFragment[] = [
  f('에피나정(에피나스틴', X.drug, 105), f('epinastine', X.ing, 105), // 윗줄
  f('1', X.seq, 100), f('2025-12-04', X.date, 100), f('송이비인후과의원', X.fac, 100),
  f('외래', X.rx, 100), f('1', X.d1, 100), f('2', X.d2, 100), f('4', X.dT, 100), // 가운뎃줄(앵커)
  f('염산염)_(10mg/1정)', X.drug, 95), f('hydrochloride', X.ing, 95), // 아랫줄
];
const row2: TextFragment[] = [
  f('아클펜정(아세클로페낙)_', X.drug, 48), f('aceclofenac', X.ing, 48),
  f('2', X.seq, 43), f('2025-09-22', X.date, 43), f('호매실퍼스트정형외과의원', X.fac - 8, 43),
  f('외래', X.rx, 43), f('1', X.d1, 43), f('3', X.d2, 43), f('5', X.dT, 43),
  f('(0.1g/1정)', X.drug, 38),
];

const noise: TextFragment[] = [
  f('처방조제정보', 255, 150), // 제목
  f('본 자료는 참고용입니다', 60, 20), f('1/3', 545, 12), // 하단 안내문구+페이지번호
  f('열람금지', 300, 70, { rotated: true }), // 워터마크(회전)
];

const page: PageFragments = {
  pageNumber: 1, width: 595, height: 842,
  fragments: [...row1, ...row2, ...noise],
};

const raw = buildRawRows([page], COLUMNS.rx);
eq('행 개수=2 (노이즈 제외)', raw.length, 2);
eq('seq 추출', raw.map((r) => r.seq), [1, 2]);

const rows = raw.map(normalizeRx);
eq('r1.date', rows[0].date, '2025-12-04');
eq('r1.facility', rows[0].facility, '송이비인후과의원');
eq('r1.rxType', rows[0].rxType, '외래');
eq('r1.drugName 멀티라인 병합', rows[0].drugName, '에피나정(에피나스틴염산염)_(10mg/1정)');
eq('r1.ingredient 병합', rows[0].ingredient, 'epinastinehydrochloride');
eq('r1.daysTotal', rows[0].daysTotal, 4);
eq('r2.facility 앞글자 보존', rows[1].facility, '호매실퍼스트정형외과의원');
eq('r2.drugName', rows[1].drugName, '아클펜정(아세클로페낙)_(0.1g/1정)');
eq('r2.daysTotal', rows[1].daysTotal, 5);

const v = validate(rows);
eq('순번 연속성', v.continuous, true);
eq('워터마크 잔존 없음', v.watermarkLeak, false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
