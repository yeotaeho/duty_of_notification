// 5개 분석기준 중 "지금 데이터로 결정론적으로 확인 가능한 것"을 실증한다.
// (rule1 동일상병 통원횟수 / rule3 입원력) — 가설 검증용, 최종 정리표 아님.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
import { COLUMNS } from '../src/parser/columns';
import { buildRawRows } from '../src/parser/pipeline';
import { normalizeBase } from '../src/parser/normalize';
import { findPdf } from './_lib';
import type { BaseRow, PageFragments } from '../src/parser/types';

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

const isPharmacy = (f: string) => /약국/.test(f);

// --- rule3: 입원력 ---
const inpatient = base.filter((r) => r.visitType === '입원');
console.log(`[rule3 입원력] 입원 행 수: ${inpatient.length}`);
inpatient.slice(0, 5).forEach((r) => console.log(`   ${r.date} ${r.facility} ${r.dxCode}`));

// --- 약국인데 상병코드를 가진 행이 있나? (가설 검증) ---
const pharmaWithCode = base.filter((r) => isPharmacy(r.facility) && r.dxCode);
console.log(`\n[검증] 약국행인데 상병코드 보유: ${pharmaWithCode.length}건`);
pharmaWithCode.slice(0, 4).forEach((r) => console.log(`   ${r.date} ${r.facility} ${r.dxCode}`));

// --- rule1: 동일상병(코드 앞4자리) 통원횟수 = 병의원 진찰행의 distinct 방문일 ---
type G = { codes: Set<string>; name: string; dates: Set<string>; phDates: Set<string> };
const groups = new Map<string, G>();
for (const r of base) {
  if (!r.dxCode) continue;
  const key = r.dxCode.slice(0, 4);
  let g = groups.get(key);
  if (!g) groups.set(key, (g = { codes: new Set(), name: r.dxName, dates: new Set(), phDates: new Set() }));
  g.codes.add(r.dxCode);
  if (isPharmacy(r.facility)) g.phDates.add(r.date);
  else g.dates.add(r.date); // 병의원 진찰행만 통원 카운트
}

console.log(`\n[rule1 통원횟수] 그룹=코드앞4자리, 통원=병의원 distinct 방문일 (약국 제외)`);
const rows = [...groups.entries()].map(([k, g]) => ({
  group: k, visits: g.dates.size, codes: [...g.codes].join(','),
  name: g.name, span: `${[...g.dates].sort().at(0) ?? '-'}~${[...g.dates].sort().at(-1) ?? '-'}`,
  pharmaOnly: g.phDates.size, // 약국 조제일(참고)
})).sort((a, b) => b.visits - a.visits);
for (const r of rows) {
  const flag = r.visits >= 7 ? ' ★7회+' : '';
  console.log(`   ${r.group}  통원 ${r.visits}회  [${r.codes}] ${r.name} (${r.span})${flag}`);
}
