// 문서 타입별 컬럼 x경계. 지시서 §3 "컬럼 경계 x값을 상수로 박아도 된다".
//
// 이 PDF는 글자를 한 자(glyph)씩 별도 조각으로 내보내므로 헤더 토큰 매칭이
// 불가능하다. 대신 실측 좌표로 컬럼 좌/우 경계를 고정한다. (페이지폭 595pt)
// 각 글자는 left<=x<right 인 컬럼에 배정된다.
import type { DocType } from './types';

export interface ColumnDef {
  key: string;
  label: string;
  left: number; // 포함
  right: number; // 미포함
}

export const COLUMNS: Record<DocType, ColumnDef[]> = {
  // 1-B 처방조제정보 — 실 PDF(처방제조_*.pdf)로 검증된 좌표.
  rx: [
    { key: 'seq', label: '순번', left: 0, right: 60 },
    { key: 'date', label: '진료시작일', left: 60, right: 134 },
    { key: 'facility', label: '병·의원&약국', left: 134, right: 245 },
    { key: 'rxType', label: '처방/조제', left: 245, right: 285 },
    { key: 'drugName', label: '약품명', left: 285, right: 385 },
    { key: 'ingredient', label: '성분명', left: 385, right: 460 },
    { key: 'doseOnce', label: '1회투약량', left: 460, right: 495 },
    { key: 'dosePerDay', label: '1일투여횟수', left: 495, right: 530 },
    { key: 'daysTotal', label: '총투약일수', left: 530, right: 999 },
  ],

  // 1-A 기본진료정보 — 실 PDF(진료세부내역_*.pdf)로 검증된 좌표.
  // 입원/외래·주상병코드는 x가 미세하게 붙어 normalizeBase에서 패턴으로 분리.
  base: [
    { key: 'seq', label: '순번', left: 0, right: 50 },
    { key: 'date', label: '진료시작일', left: 50, right: 112 },
    { key: 'facility', label: '병·의원&약국', left: 112, right: 178 },
    { key: 'dept', label: '진단과', left: 178, right: 212 },
    { key: 'visitType', label: '입원/외래', left: 212, right: 238 },
    { key: 'dxCode', label: '주상병코드', left: 238, right: 280 },
    { key: 'dxName', label: '주상병명', left: 280, right: 332 },
    { key: 'visitDays', label: '내원일수', left: 332, right: 365 },
    { key: 'feeTotal', label: '총진료비', left: 365, right: 432 },
    { key: 'benefit', label: '건강보험등혜택', left: 432, right: 500 },
    { key: 'paid', label: '내가낸의료비', left: 500, right: 999 },
  ],

  // 1-C 세부진료정보 — 실 PDF(조제정보_*.pdf)로 검증된 좌표.
  detail: [
    { key: 'seq', label: '순번', left: 0, right: 55 },
    { key: 'date', label: '진료시작일', left: 55, right: 125 },
    { key: 'facility', label: '병·의원&약국', left: 125, right: 228 },
    { key: 'category', label: '진료내역', left: 228, right: 330 },
    { key: 'codeName', label: '코드명', left: 330, right: 448 },
    { key: 'doseOnce', label: '1회투약량', left: 448, right: 485 },
    { key: 'dosePerDay', label: '1일투여횟수', left: 485, right: 525 },
    { key: 'daysTotal', label: '총투약일수', left: 525, right: 999 },
  ],
};
