// 집계 판정 사전 — 규칙이 "예시"만 주는 부분을 결정론적으로 만들기 위한 명시적 목록.
// 의료 판단이 들어가는 유일한 지점이므로 한 곳에 모아 검토·수정 가능하게 둔다.
// 추측이 아니라 "정의": 여기 목록에 있으면 그렇게 센다(투명).

// ── rule #2 수술/시술 판정 (broad 모드: 처치·수술 + 물리치료 + 한방시술 + 영상진단) ──
/** 진료내역 대분류('/' 앞)가 이걸로 시작하면 시술로 본다. */
export const PROCEDURE_CATEGORY_PREFIXES = [
  '처치 및 수술', '이학요법', '영상진단', '특수장비', '마취',
  '침구', '침술', '구술', '부항', '추나', '약침',
];
/** 코드명에 이 키워드가 있으면 시술로 본다(대분류가 애매할 때 보강). */
export const PROCEDURE_CODE_KEYWORDS = [
  '치석제거', '발치', '절제', '절개', '봉합', '정복', '신경차단', '전기신경자극', 'tens',
  '표층열', '심층열', '도수치료', '체외충격파', '화상처치', '드레싱', '석고', '부목',
  'ct', '전산화단층', 'cone beam', 'conebeam', '파노라마', 'mri', '초음파', '내시경',
  '추나', '경혈', '부항', '구술', '뜸',
];
/** 대분류가 이걸로 시작하면 시술이 아니다(진찰·검사·조제·처방·주사). */
export const NON_PROCEDURE_CATEGORY_PREFIXES = [
  '진찰료', '조제료', '처방료', '투약', '검사료', '진단검사', '기본진료', '주사료',
];

export function isProcedure(category: string, codeName: string): boolean {
  const major = (category.split('/')[0] || '').replace(/\(.*?\)/g, '').trim();
  const code = codeName.toLowerCase();
  // 영상 저장·전송(PACS)은 시술이 아니라 행정 청구코드 → 제외(노이즈).
  if (/영상저장|fullpacs|pacs/i.test(codeName)) return false;
  if (PROCEDURE_CATEGORY_PREFIXES.some((p) => major.startsWith(p))) return true;
  if (PROCEDURE_CODE_KEYWORDS.some((k) => code.includes(k))) return true;
  if (NON_PROCEDURE_CATEGORY_PREFIXES.some((p) => major.startsWith(p))) return false;
  return false;
}

/** 시술을 사람이 읽는 한 줄로(중복 제거용 키 겸용). */
export function procedureLabel(category: string, codeName: string): string {
  const major = (category.split('/')[0] || '').trim();
  return `${major} - ${codeName}`;
}

/** 영상진단/특수장비(CT)는 '검사'이지 치료행위가 아님 → 고지대상 판정에서 분리. */
export function isImaging(category: string): boolean {
  const major = (category.split('/')[0] || '').replace(/\(.*?\)/g, '').trim();
  return major.startsWith('영상진단') || major.startsWith('특수장비');
}

/** 치료성 시술(처치·수술/물리치료/한방시술). 영상·검사 제외. 고지대상 판정에 사용. */
export function isTreatmentProcedure(category: string, codeName: string): boolean {
  return isProcedure(category, codeName) && !isImaging(category);
}

/** 약관상 '수술'에 가까운 처치 및 수술 카테고리(간편심사 수술 판정용). */
export function isSurgeryCategory(category: string): boolean {
  const major = (category.split('/')[0] || '').replace(/\(.*?\)/g, '').trim();
  return major.startsWith('처치 및 수술');
}

// ── 간편(유병자) 심사용 중대질병 코드(5년) ──
// 암(C, 제자리암 D0/D45~47), 허혈성 심장질환(I20~25)·심부전(I50), 뇌혈관(I60~69), 간경화(K74).
export const CRITICAL_DISEASE_PREFIXES = [
  'C', 'D0', 'D45', 'D46', 'D47',
  'I20', 'I21', 'I22', 'I23', 'I24', 'I25', 'I50',
  'I60', 'I61', 'I62', 'I63', 'I64', 'I65', 'I66', 'I67', 'I68', 'I69',
  'K74',
];
export function isCriticalDiseaseCode(dxCode: string): boolean {
  const core = dxCode.replace(/^[AB]/, '');
  return CRITICAL_DISEASE_PREFIXES.some((p) => core.startsWith(p));
}

// ── rule #5 만성질환 약 변경 판정 ──
/** 고혈압(I10~), 당뇨(E10~E14), 고지혈증(E78). 청구코드 'A'/'B' 접두 포함 매칭. */
export const CHRONIC_DISEASE_CODE_PREFIXES = [
  'I10', 'I11', 'I12', 'I13', 'I15', // 고혈압
  'E10', 'E11', 'E12', 'E13', 'E14', // 당뇨
  'E78', // 고지혈증
];
export function isChronicDiseaseCode(dxCode: string): boolean {
  const core = dxCode.replace(/^[AB]/, ''); // 청구접두 제거(AI10 → I10)
  return CHRONIC_DISEASE_CODE_PREFIXES.some((p) => core.startsWith(p));
}

/** 만성질환 약 성분 키워드(성분명 기준, 소문자 비교). 약품명 변형에 강하도록 성분으로 매칭. */
export const CHRONIC_DRUG_INGREDIENTS = [
  // 고혈압
  'amlodipine', 'losartan', 'valsartan', 'telmisartan', 'olmesartan', 'candesartan',
  'irbesartan', 'fimasartan', 'carvedilol', 'bisoprolol', 'nebivolol', 'atenolol',
  'hydrochlorothiazide', 'lacidipine', 'lercanidipine', 'nifedipine', 'doxazosin',
  // 당뇨
  'metformin', 'glimepiride', 'gliclazide', 'sitagliptin', 'vildagliptin', 'linagliptin',
  'gemigliptin', 'teneligliptin', 'dapagliflozin', 'empagliflozin', 'pioglitazone',
  'glibenclamide', 'gl_buride', 'insulin',
  // 고지혈증
  'atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin', 'pitavastatin',
  'fluvastatin', 'lovastatin', 'ezetimibe', 'fenofibrate', 'gemfibrozil',
];

/** 성분명 문자열이 만성질환약을 포함하는지(rule#5). 한글 성분명도 일부 커버. */
const CHRONIC_DRUG_KO = ['암로디핀', '로사르탄', '발사르탄', '텔미사르탄', '올메사르탄', '메트포르민', '메트포민', '글리메피리드', '시타글립틴', '아토르바스타틴', '로수바스타틴', '심바스타틴', '에제티미브', '페노피브레이트'];

export function isChronicDrug(ingredient: string, drugName: string): boolean {
  const ing = ingredient.toLowerCase();
  if (CHRONIC_DRUG_INGREDIENTS.some((k) => ing.includes(k))) return true;
  return CHRONIC_DRUG_KO.some((k) => drugName.includes(k) || ingredient.includes(k));
}
