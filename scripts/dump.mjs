// 실제 PDF의 좌표 구조를 덤프해 파서 튜닝 근거를 만든다.
// 실행: node scripts/dump.mjs "<pdf path>" [page]
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
const targetPage = Number(process.argv[3] || 1);
const data = new Uint8Array(await readFile(path));
const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
console.log('numPages:', pdf.numPages);

const page = await pdf.getPage(targetPage);
const vp = page.getViewport({ scale: 1 });
console.log('page', targetPage, 'size:', Math.round(vp.width), 'x', Math.round(vp.height));
const content = await page.getTextContent();

const frags = content.items
  .filter((i) => 'str' in i && i.str.trim())
  .map((i) => ({
    s: i.str,
    x: Math.round(i.transform[4]),
    y: Math.round(i.transform[5]),
    rot: Math.abs(i.transform[1]) > 0.01 || Math.abs(i.transform[2]) > 0.01,
  }))
  .sort((a, b) => b.y - a.y || a.x - b.x);

console.log('총 조각:', frags.length, '/ 회전조각:', frags.filter((f) => f.rot).length);
console.log('--- y desc, x asc (상위 90개) ---');
for (const f of frags.slice(0, 90)) {
  console.log(`y=${String(f.y).padStart(4)} x=${String(f.x).padStart(4)} ${f.rot ? 'R ' : '  '}|${f.s}|`);
}
await pdf.destroy();
