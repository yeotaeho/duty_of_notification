# 진료내역 PDF 파서

국민건강보험공단 진료내역 PDF 3종(기본진료정보·처방조제정보·세부진료정보)을
**브라우저 안에서 결정론적 좌표 기반**으로 파싱한다. 서버 없음, LLM 없음, 외부 전송 없음.
설계 근거는 [`PARSING_STRATEGY.md`](./PARSING_STRATEGY.md).

## 실행

```bash
npm install
npm run dev      # 개발 서버 (브라우저에서 PDF 업로드 → 파싱·검증)
npm run build    # dist/ 정적 산출물 (Vercel 배포용)
npm test         # 합성 좌표 데이터로 Step1~5 파이프라인 검증
npm run typecheck
```

## 구조

```
src/parser/
  extract.ts    Step1  PDF.js로 페이지별 텍스트 조각{str,x,y,h,rotated} 수집
  noise.ts      Step1  워터마크(회전)·헤더·상하단 안내문구 판정
  columns.ts           문서타입별 컬럼 정의(헤더 키워드)
  pipeline.ts   Step1~4 노이즈제거→컬럼경계검출→순번앵커 행묶기→멀티라인병합 → RawRow[]
  normalize.ts  Step5  RawRow → BaseRow/RxRow/DetailRow (날짜·상병코드·양한방 패턴앵커)
  validate.ts   §4     순번 연속성 + 워터마크 잔존 검증
  index.ts             parsePdf(file, docType) 진입점  ※ join/집계는 하지 않음(§5)
src/App.tsx            PoC/검증 하니스 UI
test/pipeline.test.ts  합성 데이터 단위 테스트(13 케이스)
```

## 검증 현황 (실 PDF 3종 통과)

실제 환자 샘플 PDF 3종으로 검증 완료(개인정보는 저장소에 포함하지 않음). 모두 지시서 §4 기대치와 정확히 일치:

| 문서 | 파일명 | docType | 결과 |
|---|---|---|---|
| 기본진료정보 | `진료세부내역_*.pdf` | `base` | 92행, 순번 1~92 연속 |
| 처방조제정보 | `처방제조_*.pdf` | `rx` | 347행, 1~347 연속 |
| 세부진료정보 | `조제정보_*.pdf` | `detail` | 338행, 1~338 연속 |

> 파일명과 문서종류 매핑이 직관과 다르니 주의: **진료세부내역=base, 조제정보=detail**.

이 PDF는 글자를 한 자씩 별도 조각으로 내보내므로, 컬럼 경계는 `src/parser/columns.ts`에
실측 x좌표(left/right, 페이지폭 595pt)로 고정돼 있다. 다른 사람의 PDF에서 어긋나면:

```bash
node scripts/reconstruct.mjs "<pdf>" 1        # 글자→줄→셀 재구성으로 컬럼 x 확인
node scripts/probe.mjs "<pdf>" 1 <x0> <x1> <y0> <y1>   # 특정 구간 글자좌표 정밀 확인
npx tsx scripts/check.ts "<pdf>" <base|rx|detail>      # 파서 통과 + 순번연속성 검증
```

자동검증은 UI 상단 배지(총 행수·순번 연속성·워터마크 잔존)로도 확인된다.

## 모듈 경계

`parsePdf`는 **깨끗한 행 배열까지만** 책임진다. `(date + facility)` join,
상병코드 그룹핑, 통원횟수·투약일 합산, 시술명 사전 매핑, 고지의무 정리표 생성은
별도 집계 모듈의 몫(§5).
