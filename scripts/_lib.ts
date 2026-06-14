// 진단/검증 스크립트 공용 헬퍼. 개인정보(환자명·로컬경로) 하드코딩 금지.
// PDF 폴더는 PDF_DIR 환경변수로 지정(없으면 ./pdfs). 파일은 문서종류 키워드로 매칭.
import { readdirSync } from 'node:fs';

export const PDF_DIR = process.env.PDF_DIR ?? './pdfs';

const KEY = {
  base: /진료세부내역|기본진료/,
  rx: /처방/,
  detail: /조제정보|세부진료/,
} as const;

export function findPdf(type: 'base' | 'rx' | 'detail'): string {
  let files: string[];
  try {
    files = readdirSync(PDF_DIR);
  } catch {
    throw new Error(`PDF 폴더를 찾을 수 없습니다: ${PDF_DIR} (PDF_DIR 환경변수로 지정)`);
  }
  const f = files.find((n) => n.toLowerCase().endsWith('.pdf') && KEY[type].test(n));
  if (!f) throw new Error(`${type} PDF를 ${PDF_DIR}에서 찾지 못했습니다.`);
  return `${PDF_DIR}/${f}`;
}
