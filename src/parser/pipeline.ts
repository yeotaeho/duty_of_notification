// Step 1~4 핵심 파이프라인 (글자 기반).
// 이 PDF는 글자를 한 자씩 별도 조각으로 내보낸다. 따라서:
//   1) 글자를 줄(y)로 묶고  2) 줄 안에서 고정 x경계로 컬럼에 배정  3) 컬럼별로 글자 병합
//   4) "순번"이 찍힌 줄을 앵커로, 그 위·아래 줄까지 한 행으로 묶는다(멀티라인 셀).
// 문서 타입과 무관하며 컬럼 경계(ColumnDef[])만 갈아끼우면 된다(§6-3).
import { applyCalibration, fitCalibration } from './calibrate';
import type { ColumnDef } from './columns';
import { isNoiseLine, isWatermark } from './noise';
import type { DocType, PageFragments, RawRow, TextFragment } from './types';

interface Line {
  y: number;
  /** 컬럼별로 병합된 셀 문자열. */
  cells: string[];
}

/** 글자 조각을 y로 묶어 줄을 만든다(허용오차 tol). */
function groupLines(frags: TextFragment[], tol = 3): TextFragment[][] {
  const sorted = [...frags].sort((a, b) => b.y - a.y); // 위→아래
  const lines: { y: number; items: TextFragment[] }[] = [];
  for (const f of sorted) {
    let line = lines.find((l) => Math.abs(l.y - f.y) < tol);
    if (!line) {
      line = { y: f.y, items: [] };
      lines.push(line);
    }
    line.items.push(f);
  }
  return lines.map((l) => l.items);
}

function colOf(x: number, cols: ColumnDef[]): number {
  for (let i = 0; i < cols.length; i++) if (x >= cols[i].left && x < cols[i].right) return i;
  return -1;
}

/** 한 줄의 글자들을 고정 x경계로 컬럼에 배정하고 컬럼별로 병합한다. */
function toLine(items: TextFragment[], cols: ColumnDef[]): Line {
  const buckets: TextFragment[][] = cols.map(() => []);
  for (const g of items) {
    const c = colOf(g.x, cols);
    if (c >= 0) buckets[c].push(g);
  }
  const cells = buckets.map((b) =>
    b
      .sort((a, z) => a.x - z.x)
      .map((g) => g.str)
      .join(''),
  );
  return { y: items[0].y, cells };
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 한 페이지를 RawRow[]로. */
function parsePage(page: PageFragments, cols: ColumnDef[]): RawRow[] {
  // 1) 워터마크 제거 후 줄 구성
  const glyphs = page.fragments.filter((f) => !isWatermark(f));
  const lines = groupLines(glyphs)
    .map((items) => toLine(items, cols))
    .filter((l) => !isNoiseLine(l.cells.join(''))); // 제목/안내문구/페이지번호 제거

  // 2) 앵커 = 순번 컬럼(0번)이 순수 정수인 줄
  const anchors = lines
    .filter((l) => /^\d+$/.test(l.cells[0].trim()))
    .sort((a, b) => b.y - a.y); // 위→아래
  if (!anchors.length) return [];

  // 행 band: 앵커가 행의 중앙. 인접 앵커의 중점을 경계로 삼는다(§2 Step2).
  const gaps: number[] = [];
  for (let i = 1; i < anchors.length; i++) gaps.push(anchors[i - 1].y - anchors[i].y);
  const half = (median(gaps) || 40) / 2;

  const rows: RawRow[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const upper = i === 0 ? a.y + half : (anchors[i - 1].y + a.y) / 2;
    const lower = i === anchors.length - 1 ? a.y - half : (a.y + anchors[i + 1].y) / 2;
    const rowLines = lines.filter((l) => l.y > lower && l.y <= upper).sort((p, q) => q.y - p.y);

    const cells: Record<string, string> = {};
    cols.forEach((col, ci) => {
      cells[col.key] = rowLines.map((l) => l.cells[ci]).join('').trim();
    });
    rows.push({ seq: parseInt(a.cells[0], 10), page: page.pageNumber, cells });
  }
  return rows;
}

/**
 * 전체 페이지 → RawRow[] (페이지 순서대로).
 * docType을 주면 첫 페이지 헤더로 컬럼 경계를 자동 보정(좌표 변동에 강해짐).
 */
export function buildRawRows(
  pages: PageFragments[],
  columns: ColumnDef[],
  docType?: DocType,
): RawRow[] {
  let cols = columns;
  if (docType && pages.length) {
    cols = applyCalibration(columns, fitCalibration(pages[0], docType));
  }
  return pages.flatMap((p) => parsePage(p, cols));
}
