// 글자 조각을 줄(y)→셀(x갭)로 재구성해 실제 표 구조를 본다.
// 실행: node scripts/reconstruct.mjs "<pdf>" <page>
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
const targetPage = Number(process.argv[3] || 1);
const data = new Uint8Array(await readFile(path));
const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
const page = await pdf.getPage(targetPage);
const content = await page.getTextContent();

const glyphs = content.items
  .filter((i) => 'str' in i && i.str.trim())
  .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width ?? 0 }));

// 줄 묶기 (y 허용오차 3)
glyphs.sort((a, b) => b.y - a.y || a.x - b.x);
const lines = [];
for (const g of glyphs) {
  const line = lines.find((l) => Math.abs(l.y - g.y) < 3);
  if (line) line.items.push(g);
  else lines.push({ y: g.y, items: [g] });
}

// 줄 안에서 셀 묶기 (x갭 > 11이면 새 셀)
for (const line of lines) {
  line.items.sort((a, b) => a.x - b.x);
  const cells = [];
  let cur = null;
  for (const g of line.items) {
    if (cur && g.x - cur.endX < 11) {
      cur.text += g.s;
      cur.endX = g.x + (g.w || 6);
    } else {
      cur = { x: Math.round(g.x), text: g.s, endX: g.x + (g.w || 6) };
      cells.push(cur);
    }
  }
  line.cells = cells;
}

for (const line of lines.slice(0, 40)) {
  const cellStr = line.cells.map((c) => `x${String(c.x).padStart(3)}:${c.text}`).join('  |  ');
  console.log(`y${String(Math.round(line.y)).padStart(4)}  ${cellStr}`);
}
await pdf.destroy();
