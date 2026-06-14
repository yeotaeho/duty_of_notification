// Step 5: RawRow → 문서타입별 타입 행. 신뢰도 높은 필드는 패턴 앵커로 잡는다(§3).
import type { BaseRow, DetailRow, RawRow, RxRow } from './types';

const DATE_RE = /(\d{4})-(\d{1,2})-(\d{1,2})/;
const DXCODE_RE = /[A-Z]{1,2}\d{2,5}/;
const TYPE_RE = /\((양|한)방\)/;

/** 행 전체 셀에서 날짜 패턴을 찾아 YYYY-MM-DD로. (행의 강한 기준점) */
function pickDate(row: RawRow): string {
  for (const v of Object.values(row.cells)) {
    const m = v.match(DATE_RE);
    if (m) {
      const [, y, mo, d] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return '';
}

function toInt(s: string): number {
  const n = parseInt(s.replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function extractType(...texts: string[]): '양방' | '한방' | null {
  for (const t of texts) {
    const m = t.match(TYPE_RE);
    if (m) return m[1] === '양' ? '양방' : '한방';
  }
  return null;
}

const stripType = (s: string) => s.replace(/\((양|한)방\)/g, '').trim();

export function normalizeBase(row: RawRow): BaseRow {
  const c = row.cells;
  // 입원/외래·주상병코드·진단과는 x가 미세하게 붙으므로 한 덩어리로 모아 패턴으로 분리(§3).
  const mid = `${c.dept ?? ''}${c.visitType ?? ''}${c.dxCode ?? ''}`;
  const codeMatch = mid.match(DXCODE_RE);
  // 약국 조제행은 코드 자리에 '$' 또는 '해당없음' → null (§1-A, §3-5)
  const dxCode = codeMatch && !/해당\s*없음/.test(mid) ? codeMatch[0] : null;

  return {
    seq: row.seq,
    date: pickDate(row),
    facility: stripType(c.facility ?? ''),
    dept: stripType((c.dept ?? '').replace(/입원|외래/g, '')),
    visitType: /입원/.test(mid) ? '입원' : '외래',
    dxCode,
    dxType: extractType(c.dxName ?? '', mid),
    dxName: stripType(c.dxName ?? ''),
    feeTotal: c.feeTotal ? toInt(c.feeTotal) : undefined,
    benefit: c.benefit ? toInt(c.benefit) : undefined,
    paid: c.paid ? toInt(c.paid) : undefined,
  };
}

export function normalizeRx(row: RawRow): RxRow {
  const c = row.cells;
  return {
    seq: row.seq,
    date: pickDate(row),
    facility: c.facility ?? '',
    rxType: c.rxType ?? '',
    drugName: c.drugName ?? '',
    ingredient: c.ingredient ?? '',
    daysTotal: toInt(c.daysTotal ?? ''),
  };
}

export function normalizeDetail(row: RawRow): DetailRow {
  const c = row.cells;
  return {
    seq: row.seq,
    date: pickDate(row),
    facility: c.facility ?? '',
    category: c.category ?? '',
    codeName: c.codeName ?? '',
  };
}
