// 파서가 다루는 데이터 타입 정의.
// 지시서 §2, §5 기준. 파서는 "깨끗한 행 배열"까지만 책임진다(join/집계 X).

/** PDF.js getTextContent() 한 조각을 좌표와 함께 정규화한 형태. */
export interface TextFragment {
  str: string;
  x: number; // transform[4]
  y: number; // transform[5] — 위로 갈수록 큼(페이지 좌표)
  width: number;
  height: number;
  /** transform 회전 성분이 있으면 워터마크 후보(대각선). */
  rotated: boolean;
}

export interface PageFragments {
  pageNumber: number;
  width: number;
  height: number;
  fragments: TextFragment[];
}

export type DocType = 'base' | 'rx' | 'detail';

/** 기본진료정보 (1-A) */
export interface BaseRow {
  seq: number;
  date: string; // YYYY-MM-DD
  facility: string; // 병·의원&약국
  dept: string; // 진단과
  visitType: '외래' | '입원';
  dxCode: string | null; // 주상병코드, '$'/해당없음이면 null
  dxType: '양방' | '한방' | null;
  dxName: string; // 주상병명 (양/한방 표기 제거)
  feeTotal?: number; // 총진료비(건강보험적용분)
  benefit?: number; // 건강보험 등 혜택받은 금액
  paid?: number; // 내가 낸 의료비(진료비)
}

/** 처방조제정보 (1-B) */
export interface RxRow {
  seq: number;
  date: string;
  facility: string;
  rxType: string; // 처방/조제
  drugName: string;
  ingredient: string;
  daysTotal: number; // 총투약일수
}

/** 세부진료정보 (1-C) */
export interface DetailRow {
  seq: number;
  date: string;
  facility: string;
  category: string; // 진료내역 (대분류)
  codeName: string; // 코드명 (시술/검사/처치명)
}

export type ParsedRow = BaseRow | RxRow | DetailRow;

/** Step3 직전, 컬럼키→병합문자열로 정규화된 중간 행. */
export interface RawRow {
  seq: number;
  page: number;
  cells: Record<string, string>;
}
