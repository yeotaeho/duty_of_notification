// 정리표 완전성/정확성 감사: 규칙 적용 + join 누락 점검. 병원명 미출력.
// 실행: npx tsx scripts/audit.ts
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
import { COLUMNS } from '../src/parser/columns';
import { buildRawRows } from '../src/parser/pipeline';
import { normalizeBase, normalizeDetail, normalizeRx } from '../src/parser/normalize';
import { isProcedure } from '../src/aggregate/dictionaries';
import { findPdf } from './_lib';
import type { BaseRow, DetailRow, PageFragments, RxRow } from '../src/parser/types';

const REF = process.env.REF_DATE ?? '2026-06-15';
const win5 = new Date(new Date(REF).setFullYear(new Date(REF).getFullYear() - 5)).toISOString().slice(0, 10);

async function extract(file: string): Promise<PageFragments[]> {
  const data = new Uint8Array(await readFile(file));
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: PageFragments[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const c = await page.getTextContent();
    pages.push({ pageNumber: p, width: vp.width, height: vp.height,
      fragments: c.items.filter((i: any) => 'str' in i && i.str.trim()).map((i: any) => ({
        str: i.str, x: i.transform[4], y: i.transform[5], width: i.width ?? 0, height: i.height ?? 0,
        rotated: Math.abs(i.transform[1]) > 0.01 || Math.abs(i.transform[2]) > 0.01,
      })) });
  }
  await pdf.destroy();
  return pages;
}

const base = buildRawRows(await extract(findPdf('base')), COLUMNS.base, 'base').map(normalizeBase) as BaseRow[];
const rx = buildRawRows(await extract(findPdf('rx')), COLUMNS.rx, 'rx').map(normalizeRx) as RxRow[];
const detail = buildRawRows(await extract(findPdf('detail')), COLUMNS.detail, 'detail').map(normalizeDetail) as DetailRow[];

const inWin = (d: string) => d >= win5 && d <= REF;
const pharm = (f: string) => /약국/.test(f);
const key = (d: string, f: string) => `${d}|${f}`;

// 코드있는 방문(date+facility)→코드들
const codedVisit = new Map<string, string[]>();
for (const r of base) if (r.dxCode && inWin(r.date)) {
  const k = key(r.date, r.facility);
  (codedVisit.get(k) ?? codedVisit.set(k, []).get(k)!).push(r.dxCode);
}

console.log('=== 0. 기간/입원 ===');
console.log(`기준일 ${REF}, 5년창 ${win5}~${REF}`);
console.log(`base ${base.length} / rx ${rx.length} / detail ${detail.length}`);
console.log(`5년창 밖(제외)된 행: base ${base.filter(r=>!inWin(r.date)).length}, rx ${rx.filter(r=>!inWin(r.date)).length}, detail ${detail.filter(r=>!inWin(r.date)).length}`);
console.log(`입원 행(rule3): ${base.filter(r=>r.visitType==='입원').length}`);

console.log('\n=== 1. rule2 시술 누락 점검 (detail 시술행이 상병에 귀속 못된 건) ===');
const procRows = detail.filter(r => inWin(r.date) && isProcedure(r.category, r.codeName));
const procUnmatched = procRows.filter(r => !codedVisit.has(key(r.date, r.facility)) && !pharm(r.facility));
console.log(`시술 detail행 ${procRows.length}건 중 상병 귀속 실패: ${procUnmatched.length}건`);
const seen = new Set<string>();
for (const r of procUnmatched) { const s = `${r.date} ${r.category.split('/')[0]} / ${r.codeName}`; if(!seen.has(s)){seen.add(s); console.log(`   ⚠ ${s}`);} }

console.log('\n=== 2. rule4 투약 누락 점검 (병의원 처방 rx가 상병에 귀속 못된 건) ===');
const rxClinic = rx.filter(r => inWin(r.date) && !pharm(r.facility));
const rxUnmatched = rxClinic.filter(r => !codedVisit.has(key(r.date, r.facility)));
const lostDays = new Map<string, number>();
for (const r of rxUnmatched) lostDays.set(key(r.date,r.facility), r.daysTotal);
console.log(`병의원 처방 rx ${rxClinic.length}행 중 상병 귀속 실패 방문: ${lostDays.size}건`);
for (const [k,d] of lostDays) console.log(`   ⚠ ${k.split('|')[0]}  (총 ${d}일분, 상병코드 매칭 안됨)`);

console.log('\n=== 3. rule1 통원횟수: distinct 날짜 vs distinct(날짜+병원) 차이 점검 ===');
const g1 = new Map<string, {d:Set<string>; df:Set<string>}>();
for (const r of base) if (r.dxCode && inWin(r.date) && !pharm(r.facility)) {
  const gk = r.dxCode.slice(0,4); const a = g1.get(gk) ?? g1.set(gk,{d:new Set(),df:new Set()}).get(gk)!;
  a.d.add(r.date); a.df.add(key(r.date,r.facility));
}
let diff=0;
for (const [gk,a] of g1) if (a.d.size!==a.df.size){diff++; console.log(`   ⚠ ${gk}: 날짜기준 ${a.d.size}회 vs 날짜+병원기준 ${a.df.size}회 (같은날 다른병원)`);}
if(!diff) console.log('   차이 없음 — 날짜기준=병원방문기준 (통원횟수 안정적)');

console.log('\n=== 4. rule4 한 방문 다중코드(투약 중복귀속 위험) 점검 ===');
let multi=0;
for (const [k,codes] of codedVisit){ const groups=new Set(codes.map(c=>c.slice(0,4))); if(groups.size>1){const hasRx=rxClinic.some(r=>key(r.date,r.facility)===k); if(hasRx){multi++; console.log(`   ⚠ ${k.split('|')[0]} 코드그룹 ${[...groups].join(',')} + 처방존재 → 투약일수 ${groups.size}중 가산`);}}}
if(!multi) console.log('   다중코드+처방 동시 방문 없음 — 투약 중복가산 위험 없음');
