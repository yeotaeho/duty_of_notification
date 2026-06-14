// 3종 PDF → 결정론적 고지의무 정리표. 전부 파싱된 사실로만.
// 실행: PDF_DIR="<폴더>" PATIENT="<성함>" npx tsx scripts/report.ts
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
import { COLUMNS } from '../src/parser/columns';
import { buildRawRows } from '../src/parser/pipeline';
import { normalizeBase, normalizeDetail, normalizeRx } from '../src/parser/normalize';
import { aggregate } from '../src/aggregate/index';
import { formatReport } from '../src/aggregate/format';
import { findPdf } from './_lib';
import type { BaseRow, DetailRow, PageFragments, RxRow } from '../src/parser/types';

const REF_DATE = process.env.REF_DATE ?? new Date().toISOString().slice(0, 10);
const PATIENT = process.env.PATIENT ?? '환자';

async function extract(file: string): Promise<PageFragments[]> {
  const data = new Uint8Array(await readFile(file));
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: PageFragments[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const c = await page.getTextContent();
    pages.push({
      pageNumber: p, width: vp.width, height: vp.height,
      fragments: c.items.filter((i: any) => 'str' in i && i.str.trim()).map((i: any) => ({
        str: i.str, x: i.transform[4], y: i.transform[5],
        width: i.width ?? 0, height: i.height ?? 0,
        rotated: Math.abs(i.transform[1]) > 0.01 || Math.abs(i.transform[2]) > 0.01,
      })),
    });
  }
  await pdf.destroy();
  return pages;
}

const base = (buildRawRows(await extract(findPdf('base')), COLUMNS.base, 'base')).map(normalizeBase) as BaseRow[];
const rx = (buildRawRows(await extract(findPdf('rx')), COLUMNS.rx, 'rx')).map(normalizeRx) as RxRow[];
const detail = (buildRawRows(await extract(findPdf('detail')), COLUMNS.detail, 'detail')).map(normalizeDetail) as DetailRow[];

console.log(`파싱: base ${base.length} / rx ${rx.length} / detail ${detail.length}\n`);
const result = aggregate(base, rx, detail, REF_DATE);
console.log(formatReport(result, PATIENT));
