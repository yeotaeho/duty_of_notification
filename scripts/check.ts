// 실 PDF를 파서(pipeline+normalize)에 통과시켜 검증한다.
// 실행: npx tsx scripts/check.ts "<pdf>" <base|rx|detail>
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
import { COLUMNS } from '../src/parser/columns';
import { buildRawRows } from '../src/parser/pipeline';
import { fitCalibration } from '../src/parser/calibrate';
import { normalizeBase, normalizeDetail, normalizeRx } from '../src/parser/normalize';
import { validate } from '../src/parser/validate';
import type { DocType, PageFragments } from '../src/parser/types';

const path = process.argv[2];
const docType = (process.argv[3] || 'rx') as DocType;

async function extract(file: string): Promise<PageFragments[]> {
  const data = new Uint8Array(await readFile(file));
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: PageFragments[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const fragments = content.items
      .filter((i: any) => 'str' in i && i.str.trim())
      .map((i: any) => ({
        str: i.str,
        x: i.transform[4],
        y: i.transform[5],
        width: i.width ?? 0,
        height: i.height ?? Math.hypot(i.transform[1], i.transform[3]),
        rotated: Math.abs(i.transform[1]) > 0.01 || Math.abs(i.transform[2]) > 0.01,
      }));
    pages.push({ pageNumber: p, width: vp.width, height: vp.height, fragments });
  }
  await pdf.destroy();
  return pages;
}

const pages = await extract(path);
const cal = fitCalibration(pages[0], docType);
console.log(`[보정] scale=${cal.scale.toFixed(4)} offset=${cal.offset.toFixed(2)} (앵커 ${cal.matched}개 감지)`);
const raw = buildRawRows(pages, COLUMNS[docType], docType);
const norm = { base: normalizeBase, rx: normalizeRx, detail: normalizeDetail }[docType];
const rows = raw.map(norm as any);

const v = validate(rows as any);
console.log('=== 검증 ===');
console.log(v);
console.log('\n=== 상위 14행 ===');
for (const r of rows.slice(0, 14)) console.log(JSON.stringify(r, null, 0));
console.log('\n=== 마지막 3행 ===');
for (const r of rows.slice(-3)) console.log(JSON.stringify(r, null, 0));
