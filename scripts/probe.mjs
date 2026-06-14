// 특정 x/y 구간의 글자 좌표를 그대로 출력. 컬럼 경계 정밀 확인용.
// 실행: node scripts/probe.mjs "<pdf>" <page> <xmin> <xmax> <ymin> <ymax>
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
const [, , path, pg, xmin, xmax, ymin, ymax] = process.argv;
const data = new Uint8Array(await readFile(path));
const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
const page = await pdf.getPage(Number(pg || 1));
const content = await page.getTextContent();
const gs = content.items
  .filter((i) => 'str' in i && i.str.trim())
  .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))
  .filter((g) => g.x >= +xmin && g.x < +xmax && g.y >= +ymin && g.y < +ymax)
  .sort((a, b) => b.y - a.y || a.x - b.x);
for (const g of gs) console.log(`y${g.y.toFixed(0).padStart(4)} x${g.x.toFixed(1).padStart(6)}  ${g.s}`);
await pdf.destroy();
