// 지시서 §4 자가검증: 순번 연속성 + 워터마크 잔존 확인.
// PDF 로더(pdfjs)에 의존하지 않는 순수 함수라 별도 모듈로 분리.
import type { ParsedRow } from './types';

export interface ValidationResult {
  total: number;
  firstSeq: number | null;
  lastSeq: number | null;
  continuous: boolean; // 1..N 빠짐/중복 없이 연속인가
  missing: number[];
  duplicates: number[];
  watermarkLeak: boolean; // 워터마크 문자열이 필드에 남았는가
}

const WATERMARK_LEAK = /열람\s*금지|본인\s*외/;

export function validate(rows: ParsedRow[]): ValidationResult {
  const seqs = rows.map((r) => r.seq).sort((a, b) => a - b);
  const seen = new Set<number>();
  const duplicates: number[] = [];
  for (const s of seqs) {
    if (seen.has(s)) duplicates.push(s);
    seen.add(s);
  }
  const first = seqs[0] ?? null;
  const last = seqs[seqs.length - 1] ?? null;
  const missing: number[] = [];
  if (first != null && last != null) {
    for (let i = first; i <= last; i++) if (!seen.has(i)) missing.push(i);
  }
  const watermarkLeak = rows.some((r) =>
    Object.values(r).some((v) => typeof v === 'string' && WATERMARK_LEAK.test(v)),
  );

  return {
    total: rows.length,
    firstSeq: first,
    lastSeq: last,
    continuous: missing.length === 0 && duplicates.length === 0,
    missing,
    duplicates,
    watermarkLeak,
  };
}
