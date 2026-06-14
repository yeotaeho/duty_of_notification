// 집계 결과를 원문 텍스트(formatReport)로만 보여준다.
import { useMemo, useState } from 'react';
import type { AggregateResult } from './aggregate';
import { formatReport } from './aggregate/format';

export function Report({ result, patient }: { result: AggregateResult; patient: string }) {
  const [copied, setCopied] = useState(false);
  const rawText = useMemo(() => formatReport(result, patient), [result, patient]);

  function copy() {
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="report">
      <header className="report-head">
        <div>
          <h2>알릴의무 정리표 · {patient}</h2>
          <p className="muted">기준일 {result.refDate} · 조회 {result.windowStart} ~ {result.refDate} · 표준체 기준</p>
        </div>
        <button className="btn ghost" onClick={copy}>{copied ? '복사됨 ✓' : '텍스트 복사'}</button>
      </header>

      <pre className="rawtext">{rawText}</pre>

      <p className="disclaimer">⚠️ 보조 분석 도구입니다. 약관 해석과 최종 고지 판단은 사람이 확인해야 합니다. 모든 처리는 브라우저 내부에서만 이뤄지며 데이터는 외부로 전송·저장되지 않습니다.</p>
    </section>
  );
}
