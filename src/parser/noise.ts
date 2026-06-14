// Step 1 노이즈 판정. 지시서 §1, §3-1.
import type { TextFragment } from './types';

/** 대각선 워터마크 "본인 외 열람금지". 회전 조각으로 잡거나, 문자열로도 잡는다. */
const WATERMARK = /열람\s*금지|본인\s*외/;

export function isWatermark(f: TextFragment): boolean {
  return f.rotated || WATERMARK.test(f.str);
}

/**
 * 한 줄(여러 글자 합친 문자열)이 본문 데이터가 아닌 노이즈인지 판정.
 * - 문서 제목 / 출력시각 / 상·하단 고정 안내문구 / 페이지번호.
 * 글자가 컬럼별로 흩어져 합쳐지므로, 키워드 포함 여부로 견고하게 판정한다.
 */
export function isNoiseLine(text: string): boolean {
  const s = text.replace(/\s+/g, '');
  if (!s) return true;
  if (/처방조제정보|기본진료정보|세부진료정보|진료세부내역/.test(s)) return true; // 제목
  // 출력시각(예: "2026-6-11 9:52 AM"). 시:분 형태로 좁혀 상병코드 AM7796 등의 'AM' 오탐 방지.
  if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(text) || /(오전|오후)\s*\d{1,2}:\d{2}/.test(text)) return true;
  // 하단 3줄 안내문구 + 페이지번호(문구 사이에 N/M이 끼어 들어옴)
  if (/본\s*자료|참고용|명세서|급여비용|요양기관|증빙자료|선급여|이용에|진료비에는|이에본/.test(s)) return true;
  if (/^\d{1,3}\/\d{1,3}$/.test(s)) return true; // 단독 페이지번호
  return false;
}
