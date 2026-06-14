// 컬럼 경계 자동 보정. 헤더 글자 위치를 감지해 검증된 하드코딩 경계를 PDF마다
// affine(이동+스케일) 변환한다. 좌표 미세변동/스케일 차이에 강해지고, 감지 실패 시
// 하드코딩 그대로 폴백한다(절대 더 나빠지지 않음).
import type { ColumnDef } from './columns';
import type { DocType, PageFragments, TextFragment } from './types';

interface Anchor {
  label: string; // 한 줄로 찍히는 단일라인 헤더(부분문자열 검색)
  x: number; // 검증 PDF에서의 좌측 x (하드코딩 경계와 같은 좌표계)
}

// 각 문서에서 깨끗하게 분리되는 헤더만 앵커로 사용(병·의원&약국의 ·/& 같은 특수문자 회피).
const ANCHORS: Record<DocType, Anchor[]> = {
  base: [
    { label: '순번', x: 30 }, { label: '진료시작일', x: 60 },
    { label: '주상병명', x: 285 }, { label: '총진료비', x: 374 },
  ],
  rx: [
    { label: '순번', x: 35 }, { label: '진료시작일', x: 77 },
    { label: '약품명', x: 322 }, { label: '성분명', x: 409 },
  ],
  detail: [
    { label: '순번', x: 33 }, { label: '진료시작일', x: 69 },
    { label: '진료내역', x: 261 }, { label: '코드명', x: 372 },
  ],
};

function groupLines(frags: TextFragment[], tol = 3): TextFragment[][] {
  const sorted = [...frags].sort((a, b) => b.y - a.y);
  const lines: { y: number; items: TextFragment[] }[] = [];
  for (const f of sorted) {
    let line = lines.find((l) => Math.abs(l.y - f.y) < tol);
    if (!line) lines.push((line = { y: f.y, items: [] }));
    line.items.push(f);
  }
  return lines.map((l) => l.items);
}

/** 헤더 band에서 label의 첫 글자 x를 찾는다(줄 전체를 이어붙여 부분문자열 검색 → 헤더가 붙어 있어도 OK). */
function findHeaderX(band: TextFragment[], label: string): number | null {
  for (const line of groupLines(band)) {
    const sorted = [...line].sort((a, b) => a.x - b.x);
    const str = sorted.map((g) => g.str).join('');
    const idx = str.indexOf(label);
    if (idx >= 0) return sorted[idx].x;
  }
  return null;
}

export interface Calibration {
  scale: number;
  offset: number;
  matched: number; // 감지된 앵커 수
}

/** 헤더 앵커로 affine(actual = scale*expected + offset) 적합. 실패/이상치면 항등(=하드코딩 유지). */
export function fitCalibration(page: PageFragments, docType: DocType): Calibration {
  const band = page.fragments.filter((f) => f.y > page.height * 0.84 && !f.rotated);
  const pairs: { e: number; a: number }[] = [];
  for (const anc of ANCHORS[docType]) {
    const x = findHeaderX(band, anc.label);
    if (x != null) pairs.push({ e: anc.x, a: x });
  }
  if (pairs.length < 2) return { scale: 1, offset: 0, matched: pairs.length };

  const n = pairs.length;
  const me = pairs.reduce((s, p) => s + p.e, 0) / n;
  const ma = pairs.reduce((s, p) => s + p.a, 0) / n;
  let cov = 0, varE = 0;
  for (const p of pairs) { cov += (p.e - me) * (p.a - ma); varE += (p.e - me) ** 2; }
  if (varE === 0) return { scale: 1, offset: 0, matched: n };

  const scale = cov / varE;
  const offset = ma - scale * me;
  // 안전 클램프: 양식이 같으면 scale≈1. 벗어나면 보정을 신뢰하지 않고 항등.
  if (scale < 0.85 || scale > 1.18 || Math.abs(offset) > 60) {
    return { scale: 1, offset: 0, matched: n };
  }
  return { scale, offset, matched: n };
}

export function applyCalibration(columns: ColumnDef[], cal: Calibration): ColumnDef[] {
  if (cal.scale === 1 && cal.offset === 0) return columns;
  const t = (x: number) => (x >= 900 ? x : cal.scale * x + cal.offset); // 마지막 컬럼 sentinel(999)은 유지
  return columns.map((c) => ({ ...c, left: t(c.left), right: t(c.right) }));
}
