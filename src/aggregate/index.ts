// 결정론적 집계 모듈 (§5). 파싱된 3종 행 배열 → 고지의무 분석 결과.
// LLM/추측 없음. 모든 수치는 입력 행에서만 도출된다.
import type { BaseRow, DetailRow, RxRow } from '../parser/types';
import {
  isChronicDrug, isCriticalDiseaseCode, isProcedure, isSurgeryCategory,
  isTreatmentProcedure, procedureLabel,
} from './dictionaries';
import { kcdName } from './kcd';

export interface ProcedureItem {
  date: string;
  category: string;
  codeName: string;
}

export interface DiseaseSummary {
  group: string; // 코드 앞4자리
  repCode: string; // 대표 코드(최다 빈도, 동률시 최근)
  codes: string[]; // 그룹에 포함된 실제 코드들
  dxType: '양방' | '한방' | null;
  dxName: string; // 대표 상병명(KCD 표준명, 없으면 PDF 원문)
  visitDates: string[]; // 병의원 distinct 방문일(약국 제외)
  visitCount: number;
  firstDate: string;
  lastDate: string;
  over7: boolean; // rule#1: 5년내 7회 이상
  inpatient: boolean; // rule#3: 입원 기록
  procedures: ProcedureItem[]; // rule#2: 시술(영상 포함, 표시용)
  drugDays: number; // rule#4: 5년내 누적 투약일수
  over30days: boolean;
  ongoing: boolean; // 3개월내 진료/투약 → 현재 치료중 가능성
  reportable: boolean; // 고지대상(7회+/입원/30일+/치료성시술 중 하나)
}

/** 간편(유병자) 3·2·5 심사 분석 결과. */
export interface SimplifiedResult {
  recent3mo: string[]; // 3개월내 입원/수술
  needsManualCheck: string; // 3개월내 '추가검사 소견'은 청구데이터로 판정 불가
  surgery2yr: string[]; // 2년내 입원/수술
  critical5yr: string[]; // 5년내 암·뇌·심장 등 중대질병
  note: string;
}

export interface RxEpisode {
  date: string;
  facility: string;
  dxCode: string | null;
  dxType: '양방' | '한방' | null;
  dxName: string;
  drugs: { name: string; days: number }[];
  recentChange: boolean; // rule#5: 3개월내 만성질환약 변경/추가
}

export interface AggregateResult {
  refDate: string;
  windowStart: string; // 5년 전
  recentStart: string; // 3개월 전
  diseases: DiseaseSummary[];
  rxEpisodes: RxEpisode[];
  chronicChange: ChronicChange;
  simplified: SimplifiedResult; // 간편(유병자) 3·2·5
}

export interface ChronicChange {
  found: boolean;
  added: string[]; // 3개월내 신규 추가된 만성질환약
  doseChanged: { drug: string; from: string; to: string }[]; // 용량 변경
  note: string;
}

const isPharmacy = (f: string) => /약국/.test(f);
const groupKey = (code: string) => code.slice(0, 4);

function shiftYears(iso: string, years: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}
function shiftMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function aggregate(
  base: BaseRow[],
  rx: RxRow[],
  detail: DetailRow[],
  refDate: string,
): AggregateResult {
  const windowStart = shiftYears(refDate, -5);
  const recentStart = shiftMonths(refDate, -3);
  const inWindow = (d: string) => d >= windowStart && d <= refDate;

  const baseW = base.filter((r) => r.date && inWindow(r.date));
  const rxW = rx.filter((r) => r.date && inWindow(r.date));
  const detailW = detail.filter((r) => r.date && inWindow(r.date));

  // (date+facility) → 상병그룹들. 시술/투약을 상병에 귀속할 때 사용.
  // 날짜별 base 방문 목록도 함께 만들어, 병원명이 한 글자 잘려도 join되게 한다
  // (긴 병원명이 컬럼 경계에서 첫 글자를 잃는 경우 대비 — 부분일치 안전망).
  const baseByDate = new Map<string, { fac: string; groups: Set<string> }[]>();
  for (const r of baseW) {
    if (!r.dxCode) continue;
    const list = baseByDate.get(r.date) ?? baseByDate.set(r.date, []).get(r.date)!;
    let e = list.find((x) => x.fac === r.facility);
    if (!e) list.push((e = { fac: r.facility, groups: new Set() }));
    e.groups.add(groupKey(r.dxCode));
  }
  /** 같은 날짜에서 병원명 완전일치 → 부분일치(접미/포함) 순으로 상병그룹을 찾는다. */
  const resolveVisit = (date: string, fac: string): Set<string> | undefined => {
    const list = baseByDate.get(date);
    if (!list) return undefined;
    let hit = list.find((e) => e.fac === fac);
    if (!hit) {
      hit = list.find(
        (e) =>
          e.fac.endsWith(fac) || fac.endsWith(e.fac) ||
          (fac.length >= 4 && (e.fac.includes(fac) || fac.includes(e.fac))),
      );
    }
    return hit?.groups;
  };
  const keyOf = (date: string, fac: string) => `${date}|${fac}`;

  // ── 상병 그룹 집계 ──
  interface Acc {
    codes: Set<string>; dxType: BaseRow['dxType']; names: string[];
    codeStat: Map<string, { count: number; last: string }>; // 대표코드 선정용
    visitDates: Set<string>; inpatient: boolean;
    procedures: ProcedureItem[]; procKeys: Set<string>;
    // 처방 에피소드(방문)별 대표 투약일수. 같은 방문의 여러 약은 동시복용이므로
    // 합산하지 않고 max를 취한다(과다계상 방지). 누적=에피소드 max들의 합.
    episodeDays: Map<string, number>;
  }
  const groups = new Map<string, Acc>();
  const ensure = (g: string): Acc => {
    let a = groups.get(g);
    if (!a) groups.set(g, (a = { codes: new Set(), dxType: null, names: [], codeStat: new Map(), visitDates: new Set(), inpatient: false, procedures: [], procKeys: new Set(), episodeDays: new Map() }));
    return a;
  };
  for (const r of baseW) {
    if (!r.dxCode) continue;
    const a = ensure(groupKey(r.dxCode));
    a.codes.add(r.dxCode);
    if (r.dxType) a.dxType = r.dxType;
    if (r.dxName) a.names.push(r.dxName);
    const st = a.codeStat.get(r.dxCode) ?? { count: 0, last: '' };
    st.count++; if (r.date > st.last) st.last = r.date;
    a.codeStat.set(r.dxCode, st);
    if (r.visitType === '입원') a.inpatient = true;
    if (!isPharmacy(r.facility)) a.visitDates.add(r.date); // 통원=병의원 방문일
  }

  // 시술 귀속(rule#2): detail 시술행 → 같은 방문의 상병그룹(들)
  for (const r of detailW) {
    if (!isProcedure(r.category, r.codeName)) continue;
    const gs = resolveVisit(r.date, r.facility);
    if (!gs) continue;
    for (const g of gs) {
      const a = ensure(g);
      const pk = `${r.date}|${procedureLabel(r.category, r.codeName)}`;
      if (a.procKeys.has(pk)) continue;
      a.procKeys.add(pk);
      a.procedures.push({ date: r.date, category: r.category, codeName: r.codeName });
    }
  }

  // 투약일수 귀속(rule#4): 병의원 처방 rx행만(약국 조제행은 중복이라 제외) → 상병그룹.
  // 같은 방문(에피소드)의 여러 약은 max로, 서로 다른 방문은 합산.
  for (const r of rxW) {
    if (isPharmacy(r.facility)) continue;
    const gs = resolveVisit(r.date, r.facility);
    if (!gs) continue;
    const ek = keyOf(r.date, r.facility);
    for (const g of gs) {
      const m = ensure(g).episodeDays;
      m.set(ek, Math.max(m.get(ek) ?? 0, r.daysTotal || 0));
    }
  }

  const diseases: DiseaseSummary[] = [...groups.entries()].map(([group, a]) => {
    const dates = [...a.visitDates].sort();
    const lastDate = dates[dates.length - 1] ?? '';
    const drugDays = [...a.episodeDays.values()].reduce((s, v) => s + v, 0);
    // 대표코드: 최다 빈도, 동률이면 최근.
    const repCode = [...a.codeStat.entries()].sort(
      (x, y) => y[1].count - x[1].count || y[1].last.localeCompare(x[1].last),
    )[0]?.[0] ?? group;
    // 상병명: KCD 표준명(대표코드→그룹) 우선, 없으면 PDF 원문(가장 긴 것).
    const dxName = kcdName(repCode) ?? kcdName(group) ?? a.names.sort((x, y) => y.length - x.length)[0] ?? '';
    const hasTreatment = a.procedures.some((p) => isTreatmentProcedure(p.category, p.codeName));
    const over7 = dates.length >= 7;
    const over30days = drugDays >= 30;
    return {
      group, repCode, codes: [...a.codes].sort(), dxType: a.dxType, dxName,
      visitDates: dates, visitCount: dates.length,
      firstDate: dates[0] ?? '', lastDate,
      over7, inpatient: a.inpatient,
      procedures: a.procedures.sort((x, y) => x.date.localeCompare(y.date)),
      drugDays, over30days,
      ongoing: lastDate >= recentStart,
      reportable: over7 || a.inpatient || over30days || hasTreatment,
    };
  }).sort((x, y) => y.lastDate.localeCompare(x.lastDate));

  // ── 처방조제 내역 정리(병의원 처방 기준, 방문별 묶기) ──
  const epMap = new Map<string, RxEpisode>();
  for (const r of rxW) {
    if (isPharmacy(r.facility)) continue;
    const k = keyOf(r.date, r.facility);
    let ep = epMap.get(k);
    if (!ep) {
      const facMatch = (b: BaseRow) =>
        b.facility === r.facility || b.facility.endsWith(r.facility) || r.facility.endsWith(b.facility);
      const baseRow = baseW.find((b) => b.date === r.date && b.dxCode && facMatch(b));
      const dxName = (baseRow?.dxCode ? kcdName(baseRow.dxCode) : null) ?? baseRow?.dxName ?? '';
      epMap.set(k, (ep = {
        date: r.date, facility: r.facility,
        dxCode: baseRow?.dxCode ?? null, dxType: baseRow?.dxType ?? null,
        dxName, drugs: [], recentChange: false,
      }));
    }
    ep.drugs.push({ name: r.drugName, days: r.daysTotal || 0 });
  }
  const rxEpisodes = [...epMap.values()].sort((x, y) => y.date.localeCompare(x.date));

  // ── rule#5 만성질환 약 변경(3개월내 신규/용량변경) ──
  const chronicChange = analyzeChronicChange(rxW, recentStart);

  // ── 간편(유병자) 3·2·5 ──
  const simplified = analyzeSimplified(base, detail, refDate);

  return { refDate, windowStart, recentStart, diseases, rxEpisodes, chronicChange, simplified };
}

/** 간편(유병자) 심사 3·2·5: 3개월 입원/수술, 2년 입원/수술, 5년 중대질병. */
function analyzeSimplified(base: BaseRow[], detail: DetailRow[], refDate: string): SimplifiedResult {
  const m3 = shiftMonths(refDate, -3);
  const y2 = shiftYears(refDate, -2);
  const y5 = shiftYears(refDate, -5);
  const within = (d: string, start: string) => !!d && d >= start && d <= refDate;

  const inpatient = (start: string) =>
    base.filter((r) => r.visitType === '입원' && within(r.date, start)).map((r) => `입원 ${r.date} [${r.dxCode ?? '-'}]`);
  const surgery = (start: string) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of detail) {
      if (!within(r.date, start) || !isSurgeryCategory(r.category)) continue;
      const s = `수술/처치 ${r.date} ${r.codeName}`;
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
    return out;
  };

  const recent3mo = [...inpatient(m3), ...surgery(m3)];
  const surgery2yr = [...inpatient(y2), ...surgery(y2)];

  const critSeen = new Set<string>();
  const critical5yr: string[] = [];
  for (const r of base) {
    if (!within(r.date, y5) || !r.dxCode || !isCriticalDiseaseCode(r.dxCode)) continue;
    const s = `${r.dxCode} ${kcdName(r.dxCode) ?? r.dxName} (${r.date})`;
    if (!critSeen.has(s)) { critSeen.add(s); critical5yr.push(s); }
  }

  const flagged = recent3mo.length + surgery2yr.length + critical5yr.length > 0;
  const note = flagged
    ? '★간편 3·2·5 고지대상 항목 있음(아래 확인)'
    : '간편 3·2·5 자동탐지 해당 없음';
  return {
    recent3mo,
    needsManualCheck: '3개월내 "추가검사(재검사) 필요 소견"은 청구데이터로 판정 불가 → 의무기록/진단서로 수기 확인',
    surgery2yr, critical5yr, note,
  };
}

/** 약품명에서 함량(용량) 토큰 추출(예: "5밀리그램", "0.1g"). */
function extractDose(drugName: string): string {
  const m = drugName.match(/(\d+(?:\.\d+)?)\s*(밀리그램|밀리그람|mcg|µg|mg|g)/i);
  return m ? `${m[1]}${m[2].toLowerCase().replace('밀리그람', 'mg').replace('밀리그램', 'mg')}` : '';
}

/** 만성질환약을 식별하는 키(매칭된 성분 키워드). 없으면 ''. */
function chronicKey(ingredient: string, drugName: string): string {
  if (!isChronicDrug(ingredient, drugName)) return '';
  const ing = ingredient.toLowerCase();
  const m = ing.match(/[a-z]{4,}/); // 첫 영문 성분 토큰
  return m ? m[0] : ingredient.slice(0, 6);
}

function analyzeChronicChange(rxW: RxRow[], recentStart: string): ChronicChange {
  // (날짜+약키)별 1건으로 정리(병원/약국 중복 제거), 용량 보관.
  const byKey = new Map<string, { date: string; dose: string }[]>();
  for (const r of rxW) {
    const k = chronicKey(r.ingredient, r.drugName);
    if (!k) continue;
    const list = byKey.get(k) ?? byKey.set(k, []).get(k)!;
    if (!list.some((x) => x.date === r.date)) list.push({ date: r.date, dose: extractDose(r.drugName) });
  }
  if (!byKey.size) {
    return { found: false, added: [], doseChanged: [], note: '해당없음 — 5년내 고혈압·당뇨·고지혈증 관련 약제 없음' };
  }

  const added: string[] = [];
  const doseChanged: { drug: string; from: string; to: string }[] = [];
  for (const [drug, occ] of byKey) {
    occ.sort((a, b) => a.date.localeCompare(b.date));
    const recent = occ.filter((o) => o.date >= recentStart);
    const before = occ.filter((o) => o.date < recentStart);
    if (!recent.length) continue;
    if (!before.length) {
      added.push(drug); // 3개월내 처음 등장 = 신규 추가
    } else {
      const lastBefore = before[before.length - 1].dose;
      const latestRecent = recent[recent.length - 1].dose;
      if (lastBefore && latestRecent && lastBefore !== latestRecent) {
        doseChanged.push({ drug, from: lastBefore, to: latestRecent });
      }
    }
  }
  const found = added.length > 0 || doseChanged.length > 0;
  const note = found
    ? '★3개월내 만성질환약 변경/추가 있음'
    : '만성질환약 복용 중이나 3개월내 용량변경·약제추가 없음';
  return { found, added, doseChanged, note };
}
