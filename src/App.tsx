// 메인 화면: 진료내역 3종 PDF 업로드 → 결정론적 고지의무 정리표.
// 파싱·집계·출력 전부 브라우저 안에서. 어떤 데이터도 외부로 전송하지 않는다.
import { useState } from 'react';
import { parsePdf, validate } from './parser';
import type { BaseRow, DetailRow, DocType, RxRow, ValidationResult } from './parser';
import { aggregate } from './aggregate';
import type { AggregateResult } from './aggregate';
import { Report } from './Report';

const DOC_LABELS: Record<DocType, string> = {
  base: '기본진료정보',
  rx: '처방조제정보',
  detail: '세부진료정보',
};
const DOC_HINT: Record<DocType, string> = {
  base: '진료세부내역_*.pdf',
  rx: '처방제조_*.pdf',
  detail: '조제정보_*.pdf',
};

/** 파일명으로 문서 종류 추정(공단 파일명 규칙). */
function detectDocType(name: string): DocType | null {
  if (/처방/.test(name)) return 'rx';
  if (/진료세부내역|기본진료/.test(name)) return 'base';
  if (/조제정보|세부진료/.test(name)) return 'detail';
  return null;
}

interface DocState {
  file: File;
  rows: BaseRow[] | RxRow[] | DetailRow[];
  report: ValidationResult;
}

function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function App() {
  const [docs, setDocs] = useState<Partial<Record<DocType, DocState>>>({});
  const [refDate, setRefDate] = useState(todayISO());
  const [patient, setPatient] = useState('환자');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<AggregateResult | null>(null);

  async function ingest(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const next: Partial<Record<DocType, DocState>> = { ...docs };
      const unknown: string[] = [];
      for (const file of files) {
        const dt = detectDocType(file.name);
        if (!dt) { unknown.push(file.name); continue; }
        const rows = await parsePdf(file, dt as 'base');
        next[dt] = { file, rows, report: validate(rows) };
      }
      setDocs(next);
      if (unknown.length) setError(`문서 종류 인식 불가: ${unknown.join(', ')} (파일명에 처방/진료세부내역/조제정보 포함 필요)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    ingest(Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf')));
  }

  const allReady = docs.base && docs.rx && docs.detail;

  function runReport() {
    if (!allReady) return;
    setResult(aggregate(docs.base!.rows as BaseRow[], docs.rx!.rows as RxRow[], docs.detail!.rows as DetailRow[], refDate));
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⛨</span>
          <div>
            <h1>고지의무 분석</h1>
            <p>진료내역 PDF → 알릴의무 정리표</p>
          </div>
        </div>
        <span className="privacy">🔒 로컬 전용 · 외부 전송 없음</span>
      </header>

      <main>
        <section
          className={`dropzone ${dragging ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="dz-inner">
            <div className="dz-icon">⬆</div>
            <p className="dz-title">PDF 3종을 끌어다 놓거나</p>
            <label className="btn primary">
              파일 선택
              <input type="file" accept="application/pdf" multiple hidden
                onChange={(e) => { ingest(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            </label>
          </div>
        </section>

        <div className="docgrid">
          {(['base', 'rx', 'detail'] as DocType[]).map((dt) => {
            const d = docs[dt];
            const ok = d && d.report.continuous && !d.report.watermarkLeak;
            return (
              <div key={dt} className={`doccard ${d ? (ok ? 'ok' : 'warn') : 'empty'}`}>
                <div className="doc-state">{d ? (ok ? '✓' : '!') : '○'}</div>
                <div className="doc-body">
                  <strong>{DOC_LABELS[dt]}</strong>
                  {d ? (
                    <span className="muted">{d.report.total}행 · 순번 {d.report.firstSeq}~{d.report.lastSeq} · {d.report.continuous ? '연속' : `누락 ${d.report.missing.length}`}</span>
                  ) : (
                    <span className="muted">{DOC_HINT[dt]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="error">⚠ {error}</p>}

        <div className="controls">
          <label className="field">성함<input value={patient} onChange={(e) => setPatient(e.target.value)} /></label>
          <label className="field">기준일<input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} /></label>
          <button className="btn primary lg" disabled={!allReady || busy} onClick={runReport}>
            {busy ? <span className="spinner" /> : null}
            {busy ? '분석 중…' : '정리표 생성'}
          </button>
          {!allReady && !busy && <span className="muted">3종을 모두 올리면 활성화됩니다</span>}
        </div>

        {result && <Report result={result} patient={patient} />}
      </main>
    </div>
  );
}
