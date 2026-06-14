// Step 0~1 일부: PDF.js로 페이지별 텍스트 조각을 좌표와 함께 수집한다.
// 범용 텍스트 추출(pdf-parse 등)을 쓰지 않는 이유는 지시서 §3-2 참고.
import * as pdfjsLib from 'pdfjs-dist';
// Vite가 워커를 별도 자산으로 번들링하도록 ?url 임포트. (서버 없이 브라우저에서 동작)
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageFragments, TextFragment } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPages(file: File): Promise<PageFragments[]> {
  const data = await file.arrayBuffer();
  // 의료 데이터: 로컬 ArrayBuffer만 사용. 어떤 네트워크 호출도 하지 않는다.
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;

  const pages: PageFragments[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const fragments: TextFragment[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str || !item.str.trim()) continue;
      const t = item.transform as number[]; // [a, b, c, d, e, f]
      fragments.push({
        str: item.str,
        x: t[4],
        y: t[5],
        width: (item as { width?: number }).width ?? 0,
        height: (item as { height?: number }).height ?? Math.hypot(t[1], t[3]),
        // 회전 성분(b 또는 c)이 있으면 대각선 워터마크 후보.
        rotated: Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01,
      });
    }
    pages.push({ pageNumber: p, width: viewport.width, height: viewport.height, fragments });
    page.cleanup();
  }
  await pdf.destroy();
  return pages;
}
