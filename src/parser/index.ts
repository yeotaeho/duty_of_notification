// 파서 진입점. 지시서 §5의 모듈 경계: 깨끗한 행 배열까지만 책임.
import { COLUMNS } from './columns';
import { extractPages } from './extract';
import { normalizeBase, normalizeDetail, normalizeRx } from './normalize';
import { buildRawRows } from './pipeline';
import type { BaseRow, DetailRow, DocType, ParsedRow, RxRow } from './types';

export type { BaseRow, RxRow, DetailRow, DocType, ParsedRow } from './types';
export { validate } from './validate';
export type { ValidationResult } from './validate';

export async function parsePdf(file: File, docType: 'base'): Promise<BaseRow[]>;
export async function parsePdf(file: File, docType: 'rx'): Promise<RxRow[]>;
export async function parsePdf(file: File, docType: 'detail'): Promise<DetailRow[]>;
export async function parsePdf(file: File, docType: DocType): Promise<ParsedRow[]> {
  const pages = await extractPages(file);
  const raw = buildRawRows(pages, COLUMNS[docType], docType);
  switch (docType) {
    case 'base':
      return raw.map(normalizeBase);
    case 'rx':
      return raw.map(normalizeRx);
    case 'detail':
      return raw.map(normalizeDetail);
  }
}
