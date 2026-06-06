'use strict';

// ── DOM 헬퍼 ──────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

function showToast(msg, type = 'info') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── 상수 ──────────────────────────────────────────────────────
const VERSION = 'v0.2.42';
const REGION_PREFIXES = new Set([
  '서울','부산','대구','인천','광주','대전','울산','세종',
  '경기','강원','충북','충남','전북','전남','경북','경남','제주'
]);

const DOC_TYPES = {
  insurance: {
    label: '자동차 종합보험 가입증명서', group: '차량별 필수서류',
    fileHints: ['보험','공제','계약확인','계약 확인'],
    keywords: ['조합원 공제','보험계약 확인서','공제(보험)계약','계약기간','유효기간','담보내용','대인','대물','자손','자차','보험기간']
  },
  registrationLedger: {
    label: '자동차등록원부', group: '차량별 필수서류',
    fileHints: ['자동차등록원부','등록원부','원부'],
    keywords: ['자동차등록원부','자동차 등록원부','등록원부','갑부','을부','등본','초본','자동차등록번호','소유자','사용본거지','압류','저당','최종소유자']
  },
  safetyReport: {
    label: '전세버스 교통안전정보 조회결과 통보서', group: '차량별 필수서류',
    fileHints: ['안전정보','조회결과','통보서','교통안전'],
    keywords: ['전세버스 교통안전정보 조회결과 통보서','교통안전정보','조회결과','통보서','한국교통안전공단','자동차검사 만료일','종합결과','버스운전자격']
  },
  transport: {
    label: '자동차운송사업등록증', group: '업체 확인 서류',
    fileHints: ['운송사업','사업등록증','여객자동차'],
    keywords: ['자동차운송사업등록증','운송사업등록증','여객자동차운송사업','여객자동차운송사업법','여객자동차','전세버스운송사업','전세버스','사업의 종류','등록번호','등록합니다','상호(법인명)','상호','업종','차고지','등록연월일','법인등록번호','대표자','서울특별시']
  },
  pledge: {
    label: '직영차량 운행각서', group: '업체 확인 서류',
    fileHints: ['직영','운행각서','각서'],
    keywords: ['직영차량 운행 각서','직영차량','운행 각서','직영 차량으로만 운행','계약해지','위약금','자동차등록원부','교통안전정보 조회결과서']
  },
  directProd: {
    label: '직접생산확인증명서', group: '계약조건별 서류',
    fileHints: ['직접생산','직생'],
    keywords: ['직접생산확인증명서','직접생산','중소기업','공공구매','전세버스','유효기간','세부품명','세부품목']
  },
  preCheck: {
    label: '출발 전 교육 및 차량안전점검표', group: '차량별 필수서류',
    fileHints: ['안전점검','출발전','출발 전'],
    keywords: ['안전점검표','출발 전 교육','차량안전점검','점검결과','운전자격요건 확인']
  },
  businessRegistration: {
    label: '사업자등록증', group: '업체 확인 서류',
    fileHints: ['사업자등록증','사업자등록'],
    keywords: ['사업자등록증','법인사업자','사업자등록번호','등록번호','법인명','대표자','개업연월일','사업장 소재지','본점 소재지','사업의 종류','업태','종목','전세버스','운수','국세청','세무서장']
  }
};

const DOC_ORDER = ['directProd','transport','businessRegistration','pledge','registrationLedger','insurance','safetyReport','preCheck'];
const ST_OK = '확인완료';
const ST_SUBMIT = '제출됨';
const ST_DIRECT = '담당자 확인필요';
const ST_NEED = '보완 필요';
const ST_MISS = '서류에서 못 찾음';
const ST_OCR = '추천 페이지';
const ST_NA = '해당없음';

// ── 상태 ──────────────────────────────────────────────────────
const state = {
  assignFiles: [],
  docFiles: [],
  docAnalyses: [],
  assignedVehicles: [],
  vehicleSource: 'none',
  vehicleConfirmed: false,
  allText: '',
  docRows: [],
  companyRows: [],
  vehicleRows: [],
  vehicleFilter: 'all',
  requestText: '',
  checked: false,
  ocrNoticeAccepted: false,
  ocrRunning: false,
  ocrAssist: { running: false, done: false, current: 0, total: 0, found: 0, message: '' },
};

// OCR은 화면을 바꾸지 않고, 필요한 경우에만 작게 보완한다.
// 무거운 전체 판독을 피하기 위해 후보 페이지만 제한적으로 처리한다.
const LIGHT_OCR_MAX_PAGES = 3;
const LIGHT_OCR_RENDER_SCALE = 1.55;
const LIGHT_OCR_MIN_TEXT = 80;

// ── 텍스트 정규화 ─────────────────────────────────────────────
function normalizeVehicleNo(v) {
  return String(v || '').replace(/[^0-9가-힣]/g, '').trim();
}

function normalizeRoman(str) {
  return String(str || '')
    .replace(/[ⅠＩ]/g, 'I')
    .replace(/[Ⅱ]/g, 'II')
    .replace(/대인\s*[lㅣ]/gi, '대인I')
    .replace(/대인\s*1/g, '대인I')
    .replace(/대인\s*2/g, '대인II')
    .replace(/대인\s*II/gi, '대인II')
    .replace(/\s+/g, ' ');
}

function compact(str) {
  return normalizeRoman(str).replace(/\s+/g, '').replace(/[\[\]\(\){}·,，:：;；]/g, '');
}

// 서류명 비교 전용 정규화: 화면 문구는 바꾸지 않고, 매칭에만 사용한다.
function normalizeDocText(value) {
  return normalizeRoman(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()\[\]{}<>「」『』"'“”‘’·ㆍ.,:;!?_\-—–~|\/\\]/g, '')
    .replace(/출발전/g, '출발전')
    .replace(/사업자등록증/g, '사업등록증')
    .replace(/자동차운송사업자등록증/g, '자동차운송사업등록증')
    .replace(/여객자동차운송사업자등록증/g, '여객자동차운송사업등록증');
}

const DOC_ALIAS_MAP = {
  transport: ['여객자동차운송사업등록증','여객자동차 운송사업 등록증','여객자동차운송사업자등록증','여객자동차 운송사업자 등록증','자동차운송사업등록증','자동차 운송사업 등록증','자동차운송사업자등록증','운송사업등록증','운송사업자등록증','여객자동차운송사업','전세버스운송사업'],
  pledge: ['직영차량 운행각서','직영차량 운행 각서','직영 차량 운행 각서','직영차량운행각서','차량운행각서','운행각서'],
  preCheck: ['출발 전 교육 및 차량안전점검표','출발전 교육 및 차량안전점검표','출발전교육및차량안전점검표','출발 전 교육','출발전교육','차량안전점검표','차량 안전 점검표','출발전차량안전점검표'],
  registrationLedger: ['자동차등록원부','자동차 등록원부','등록원부','자동차등록원부갑','자동차등록원부 갑','갑부','을부'],
  safetyReport: ['전세버스 교통안전정보 조회결과 통보서','교통안전정보 조회결과 통보서','전세버스','조회결과통보서','자동차검사만료일','종합결과','운전자','운전자명'],
  insurance: ['자동차 종합보험 가입증명서','종합보험가입증명서','보험가입증명서','공제보험계약확인서','공제 계약 확인서','조합원공제','담보내용'],
  businessRegistration: ['사업자등록증','사업자 등록증','사업등록증','사업자등록번호','법인사업자','국세청','세무서장'],
  directProd: ['직접생산확인증명서','직접 생산 확인 증명서','직접생산확인','공공구매','세부품명','세부품목']
};

const DOC_TOKEN_GROUPS = {
  transport: ['여객자동차', '운송사업', '등록증'],
  pledge: ['직영차량', '운행각서'],
  preCheck: ['출발전교육', '차량안전점검표'],
  registrationLedger: ['자동차등록원부'],
  safetyReport: ['교통안전정보', '조회결과'],
  businessRegistration: ['사업자등록', '등록번호'],
  directProd: ['직접생산', '확인증명서'],
  insurance: ['보험', '계약기간']
};

// 서류 위치 추천 안전장치: 많이 추천하기보다 잘못 추천하지 않는 것을 우선한다.
const DOCUMENT_MATCH_RULES = {
  directProd: {
    aliases: ['직접생산확인증명서','직접 생산 확인 증명서','직접생산 확인증명서'],
    strongKeywords: ['직접생산확인증명서','직접생산확인','공공구매종합정보','중소기업유통센터'],
    weakKeywords: ['유효기간','세부품명','제품명','업체명'],
    filenameHints: ['직접생산','직생','생산확인'],
    negativeFilenameHints: ['자동차원부','자동차등록원부','등록원부']
  },
  transport: {
    aliases: ['여객자동차운송사업등록증','여객자동차 운송사업 등록증','여객자동차운송사업자등록증','여객자동차 운송사업자 등록증','자동차운송사업등록증','자동차 운송사업 등록증','자동차운송사업자등록증','운송사업등록증','운송사업자등록증'],
    strongKeywords: ['여객자동차운송사업','운송사업등록증','운송사업자등록증','전세버스운송사업'],
    weakKeywords: ['등록번호','업체명','대표자','주사무소','사업의종류','차고지'],
    filenameHints: ['운송사업','운송사업등록','여객자동차','전세버스'],
    negativeFilenameHints: ['자동차원부','자동차등록원부','등록원부']
  },
  businessRegistration: {
    aliases: ['사업자등록증','사업자 등록증','사업자등록','사업자등록번호'],
    strongKeywords: ['사업자등록증','사업자등록번호','상호','대표자','개업연월일'],
    weakKeywords: ['사업장소재지','업태','종목','사업의종류','국세청','세무서장'],
    filenameHints: ['사업자','사업자등록'],
    negativeFilenameHints: ['자동차원부','자동차등록원부','등록원부']
  },
  pledge: {
    aliases: ['직영차량 운행각서','직영차량 운행 각서','직영 차량 운행 각서','직영차량운행각서','차량운행각서','운행각서'],
    strongKeywords: ['직영차량','운행각서','직영차량운행각서','확약','각서'],
    weakKeywords: ['대표자','직인','업체명','차량번호'],
    filenameHints: ['직영','운행각서','각서'],
    negativeFilenameHints: ['자동차원부','자동차등록원부','등록원부']
  },
  registrationLedger: {
    aliases: ['자동차등록원부','자동차 등록원부','자동차등록원부갑','자동차등록원부 갑','등록원부'],
    strongKeywords: ['자동차등록원부','자동차 등록원부','갑부','소유자','압류','저당'],
    weakKeywords: ['자동차등록번호','차명','차대번호','사용본거지'],
    filenameHints: ['자동차원부','자동차등록원부','등록원부','원부'],
    negativeFilenameHints: []
  },
  safetyReport: {
    aliases: ['전세버스 교통안전정보 조회결과 통보서','교통안전정보 조회결과 통보서','교통안전정보 통보서'],
    strongKeywords: ['전세버스','조회결과통보서','한국교통안전공단','자동차검사만료일','종합결과','운전자명'],
    weakKeywords: ['버스운전자격','검사만료일','자동차번호','운전자','이상없음'],
    filenameHints: ['교통안전','안전정보','조회결과','통보서'],
    negativeFilenameHints: ['자동차원부','자동차등록원부','등록원부']
  },
  preCheck: {
    aliases: ['출발 전 교육 및 차량안전점검표','출발전 교육 및 차량안전점검표','출발전교육및차량안전점검표','차량안전점검표'],
    strongKeywords: ['출발전교육','차량안전점검표','출발전교육및차량안전점검표','점검결과'],
    weakKeywords: ['운전자격요건','음주','적합','실시','서명','직인'],
    filenameHints: ['출발전','안전점검','차량안전점검'],
    negativeFilenameHints: ['자동차원부','자동차등록원부','등록원부']
  },
  insurance: {
    aliases: ['자동차 종합보험 가입증명서','종합보험가입증명서','보험가입증명서','공제보험계약확인서','공제 계약 확인서'],
    strongKeywords: ['보험계약확인서','공제보험계약','조합원공제','담보내용','계약기간','보험기간'],
    weakKeywords: ['대인','대물','자손','자차','유효기간','차량번호'],
    filenameHints: ['보험','공제','계약확인'],
    negativeFilenameHints: ['자동차원부','자동차등록원부','등록원부']
  }
};

function normalizedIncludes(haystack, needle) {
  const h = normalizeDocText(haystack);
  const n = normalizeDocText(needle);
  return !!(h && n && n.length >= 2 && h.includes(n));
}

function countRuleHits(text, list) {
  const nt = normalizeDocText(text);
  return (list || []).map(normalizeDocText).filter(Boolean).filter((kw, idx, arr) => arr.indexOf(kw) === idx && nt.includes(kw)).length;
}

function scoreDocumentMatch(type, fileInfo = {}, extractedText = '') {
  const rule = DOCUMENT_MATCH_RULES[type] || {};
  const filename = String(fileInfo?.name || fileInfo?.filename || '');
  const text = String(extractedText || '');
  const nf = normalizeDocText(filename);
  const nt = normalizeDocText(text);
  let score = 0;
  let textDirect = false;

  const negativeHit = (rule.negativeFilenameHints || []).some(h => nf.includes(normalizeDocText(h)));
  const filenameDirect = [DOC_TYPES[type]?.label, ...(rule.filenameHints || []), ...(rule.aliases || [])]
    .filter(Boolean)
    .some(h => nf.includes(normalizeDocText(h)));

  for (const alias of [DOC_TYPES[type]?.label, ...(rule.aliases || [])].filter(Boolean)) {
    const na = normalizeDocText(alias);
    if (na && na.length >= 4 && nt.includes(na)) { score = Math.max(score, 100); textDirect = true; }
  }

  const strongHits = countRuleHits(text, rule.strongKeywords || []);
  const weakHits = countRuleHits(text, rule.weakKeywords || []);
  if (strongHits >= 2) score = Math.max(score, 75);
  else if (strongHits === 1 && weakHits >= 2) score = Math.max(score, 60);
  else if (strongHits === 1) score = Math.max(score, 35);

  if (filenameDirect) score = Math.max(score, negativeHit && !textDirect ? 40 : 70);
  else if ((rule.filenameHints || []).some(h => nf.includes(normalizeDocText(h)))) score = Math.max(score, 40);

  if (hasAnyVehicleNumber(text) && score < 40) score = Math.max(score, 10);
  if (negativeHit && !textDirect && strongHits < 2) score -= 50;
  if (score < 0) score = 0;
  return score;
}

function matchStatusByScore(score) {
  if (score >= 90) return ST_SUBMIT;
  if (score >= 60) return ST_OCR;
  if (score >= 40) return ST_DIRECT;
  return ST_MISS;
}

function isSafeDocCandidate(type, fileInfo = {}, extractedText = '', minScore = 60) {
  return scoreDocumentMatch(type, fileInfo, extractedText) >= minScore;
}

function docMatchCandidates(type) {
  const def = DOC_TYPES[type];
  if (!def) return [];
  return [def.label, ...(def.fileHints || []), ...(def.keywords || []), ...(DOC_ALIAS_MAP[type] || [])].filter(Boolean);
}

function isDocTypeMatched(type, text) {
  return scoreDocumentMatch(type, {}, text) >= 60;
}

function hasAnyVehicleNumber(text) {
  return extractVehicleNumbers(text).length > 0;
}

function hasAnyCoreKeyword(text) {
  return DOC_ORDER.some(k => isDocTypeMatched(k, text));
}

// ── 차량번호 추출 ─────────────────────────────────────────────
function extractVehicleNumbers(rawText) {
  const noSpace = String(rawText || '').replace(/\s+/g, '');
  const found = new Set();
  const re = /(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}/g;
  let m;
  while ((m = re.exec(noSpace)) !== null) {
    const raw = m[0];
    if (raw.length >= 8 && !REGION_PREFIXES.has(raw.slice(0, 2))) continue;
    const tail = parseInt(raw.slice(-4), 10);
    if (tail >= 1900 && tail <= 2099) continue;
    found.add(raw);
  }
  const arr = [...found];
  return arr.filter(v => v.length >= 8 || !arr.some(other => other.length >= 8 && other.endsWith(v)));
}

// ── PDF 텍스트 추출 ────────────────────────────────────────────
async function extractPdfText(file) {
  if (file.type.startsWith('image/')) return '';
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + '\n';
    }
    return text;
  } catch (e) {
    console.warn('PDF 텍스트 추출 실패:', file.name, e);
    return '';
  }
}


async function extractPdfStructuredText(file) {
  if (file.type.startsWith('image/')) return '';
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = content.items
        .filter(i => String(i.str || '').trim())
        .map(i => ({ str: String(i.str).trim(), x: i.transform?.[4] || 0, y: i.transform?.[5] || 0 }));
      items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
      const rows = [];
      for (const item of items) {
        let row = rows.find(r => Math.abs(r.y - item.y) < 5);
        if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
        row.items.push(item);
      }
      rows.sort((a, b) => b.y - a.y);
      text += rows.map(r => r.items.sort((a, b) => a.x - b.x).map(i => i.str).join(' ')).join('\n') + '\n';
    }
    return text;
  } catch (e) {
    console.warn('PDF 구조 텍스트 추출 실패:', file.name, e);
    return extractPdfText(file);
  }
}

async function renderPdfPageToDataUrl(file, pageNo, scale = 1.7) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(pageNo);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { dataUrl: canvas.toDataURL('image/png'), pageCount: pdf.numPages };
}


// ── 페이지 단위 진단: 이미지 중심 서류를 "없음"이 아니라 추천 페이지로 올린다 ──
async function diagnosePdfPages(file) {
  if (file.type.startsWith('image/')) {
    return [{ pageNumber: 1, textLength: 0, hasImage: true, pageType: 'image-heavy', ocrStatus: 'needed', documentTypeCandidates: guessImageDocCandidates('', file.name, 1, 1), reason: '이미지 파일로 업로드됨' }];
  }
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const text = content.items.map(i => i.str || '').join(' ').trim();
      let hasImage = false;
      try {
        const op = await page.getOperatorList();
        const ops = pdfjsLib.OPS || {};
        const imgOps = new Set([ops.paintImageXObject, ops.paintJpegXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject].filter(v => v !== undefined));
        hasImage = op.fnArray.some(fn => imgOps.has(fn));
      } catch (e) {
        hasImage = text.length < 120;
      }
      const core = hasAnyCoreKeyword(text);
      const textShort = text.length < 80;
      const broken = isBrokenExtractedText(text);
      const imageHeavy = hasImage && (textShort || broken || !core);
      const pageType = imageHeavy ? 'image-heavy' : (hasImage ? 'mixed' : 'text');
      const candidates = guessImageDocCandidates(text, file.name, p, pdf.numPages);
      const ocrNeeded = imageHeavy || (hasImage && candidates.length && !core);
      pages.push({
        pageNumber: p,
        textLength: text.length,
        hasImage,
        pageType,
        ocrStatus: ocrNeeded ? 'needed' : 'not-needed',
        documentTypeCandidates: candidates,
        reason: ocrNeeded ? makeOcrReason(candidates, textShort, broken, hasImage) : '텍스트 분석 가능',
        textPreview: text.slice(0, 180)
      });
    }
    return pages;
  } catch (e) {
    console.warn('페이지 진단 실패:', file.name, e);
    return [];
  }
}

function isBrokenExtractedText(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  const oneChar = tokens.filter(x => /^[가-힣A-Za-z0-9]$/.test(x)).length;
  return tokens.length > 12 && oneChar / tokens.length > 0.45;
}

function makeOcrReason(candidates, textShort, broken, hasImage) {
  const names = candidates.map(docTypeLabel).join('·');
  if (names) return `${names} 후보 · ${textShort ? '텍스트 부족' : broken ? '텍스트 깨짐' : hasImage ? '이미지 중심' : '추가확인 필요'}`;
  return `${textShort ? '텍스트 부족' : broken ? '텍스트 깨짐' : '이미지 중심'} · 추천 페이지`;
}

function guessImageDocCandidates(text, filename, pageNumber, pageCount) {
  // 안전장치: 파일명/페이지 텍스트가 점수 기준을 통과한 서류만 후보로 올린다.
  // 텍스트가 거의 없는 이미지 페이지만으로는 특정 서류로 단정하지 않는다.
  return DOC_ORDER.filter(key => scoreDocumentMatch(key, { name: filename }, text) >= 60);
}

function candidateAnalyses(type) {
  return state.docAnalyses.filter(a => (a.pageDiagnostics || []).some(p => {
    const pageText = p.textPreview || '';
    return (p.documentTypeCandidates || []).includes(type) && scoreDocumentMatch(type, a, pageText || analysisText(a)) >= 60;
  }));
}

function candidateLocationText(type) {
  const cands = candidateAnalyses(type);
  if (!cands.length) return '';
  return cands.map(a => {
    const pages = (a.pageDiagnostics || []).filter(p => {
      const pageText = p.textPreview || '';
      return (p.documentTypeCandidates || []).includes(type) && scoreDocumentMatch(type, a, pageText || analysisText(a)) >= 60;
    }).map(p => p.pageNumber);
    return pages.length ? `${a.name} ${formatPageList(pages)}쪽` : '';
  }).filter(Boolean).join(', ');
}

function docsLocationText(docs, type) {
  return (docs || []).map(a => {
    if (type && scoreDocumentMatch(type, a, analysisText(a)) < 60) return '';
    const pages = type ? (a.pageDiagnostics || []).filter(p => scoreDocumentMatch(type, a, p.textPreview || analysisText(a)) >= 60).map(p => p.pageNumber) : (a.pageDiagnostics || []).map(p => p.pageNumber);
    return pages.length ? `${a.name} ${formatPageList(pages)}쪽` : a.name;
  }).filter(Boolean).join(', ');
}


function ocrNeededPages(analysis) {
  const pages = (analysis.pageDiagnostics || []).filter(p => p.ocrStatus === 'needed').map(p => p.pageNumber);
  if (pages.length) return pages;
  return [];
}

// ── 서류 분류 ─────────────────────────────────────────────────
function classifyByFilename(name) {
  let best = { key: 'unknown', score: 0 };
  for (const key of DOC_ORDER) {
    const score = scoreDocumentMatch(key, { name }, '');
    if (score > best.score) best = { key, score };
  }
  return best.score >= 60 ? best.key : 'unknown';
}

function classifyByText(text, fallback = 'unknown') {
  let best = { key: fallback, score: fallback === 'unknown' ? 0 : 60 };
  DOC_ORDER.forEach(key => {
    const score = scoreDocumentMatch(key, {}, text);
    if (score > best.score) best = { key, score };
  });
  return best.score >= 60 ? best.key : 'unknown';
}

function createAnalysis(file) {
  return {
    file,
    name: file.name,
    size: file.size,
    type: classifyByFilename(file.name),
    text: '',
    ocrText: '',
    textStatus: '대기',
    ocrStatus: file.type.startsWith('image/') ? ST_OCR : '대기',
    needsOcr: file.type.startsWith('image/'),
    ocrPages: 0,
    ocrError: '',
    extractedCandidates: null,
    pageDiagnostics: [],
    imagePageCount: file.type.startsWith('image/') ? 1 : 0,
    ocrNeededPageCount: file.type.startsWith('image/') ? 1 : 0,
  };
}

function analysisText(a) {
  return [a.text, a.ocrText].filter(Boolean).join('\n');
}

function analysesByType(type) {
  return state.docAnalyses.filter(a => scoreDocumentMatch(type, a, analysisText(a)) >= 60);
}

function docTypeLabel(type) {
  return DOC_TYPES[type]?.label || '서류종류 후보 없음';
}

// ── 단계 네비 업데이트 ───────────────────────────────────────
function updateStepNav() {
  const s1 = !!($('#startDate')?.value);
  const s2 = state.assignFiles.length > 0;
  const s3 = state.vehicleConfirmed && state.assignedVehicles.length > 0;
  const s4 = state.docFiles.length > 0;
  const s5 = state.checked;
  const done = [s1, s2, s3, s4, s5, s5];

  let activeStep = 1;
  $$('#stepNav .step-item').forEach((el, i) => {
    el.classList.remove('step-done', 'step-active', 'step-pending');
    if (done[i]) el.classList.add('step-done');
    else if (i === 0 || done[i - 1]) { el.classList.add('step-active'); activeStep = i + 1; }
    else el.classList.add('step-pending');
  });
  if (s5) activeStep = 6;

  const mobileLabels = ['출발일 확인','배정차량','차량확인','서류업로드','콕검실행','검토결과'];
  const mobilePct = Math.round((activeStep / 6) * 100);
  const mobileTextEl = $('#mobileStepText');
  const mobilePctEl = $('#mobileStepPercent');
  const mobileFillEl = $('#mobileStepFill');
  if (mobileTextEl) mobileTextEl.textContent = `${activeStep} / 6 ${mobileLabels[activeStep - 1] || '진행 중'}`;
  if (mobilePctEl) mobilePctEl.textContent = `${mobilePct}%`;
  if (mobileFillEl) mobileFillEl.style.width = `${mobilePct}%`;

  $$('#globalStepSidebar .progress-side-link, #resultSidebar .progress-side-link').forEach((el) => {
    const step = Number(el.dataset.stepSide || (el.getAttribute('href') === '#step6' ? 6 : 0));
    el.classList.remove('passed', 'current');
    if (step && step < activeStep) el.classList.add('passed');
    if (step === activeStep) el.classList.add('current');
  });
  updateRunBtn();
}

function updateRunBtn() {
  const btn = $('#runCheckBtn');
  const chip = $('#runStatusChip');
  if (!btn) return;
  const hasDate = !!($('#startDate')?.value);
  const hasVehicles = state.assignedVehicles.length > 0;
  const hasDocs = state.docFiles.length > 0;
  if (!hasDate) {
    btn.textContent = '출발일 설정하러 가기';
    btn.disabled = false;
    btn.className = 'primary-btn run-btn need-date-state';
    if (chip) { chip.textContent = '출발일 필요'; chip.className = 'help-chip gray'; }
  } else if (!hasVehicles) {
    btn.textContent = '배정차량 리스트를 먼저 확인해주세요';
    btn.disabled = true;
    btn.className = 'primary-btn run-btn disabled-state';
    if (chip) { chip.textContent = '차량 확인 필요'; chip.className = 'help-chip gray'; }
  } else if (!state.vehicleConfirmed) {
    btn.textContent = '배차 차량 목록을 먼저 확정해주세요';
    btn.disabled = true;
    btn.className = 'primary-btn run-btn disabled-state';
    if (chip) { chip.textContent = '배차 확정 필요'; chip.className = 'help-chip gray'; }
  } else if (!hasDocs) {
    btn.textContent = '서류를 업로드하면 콕검할 수 있어요';
    btn.disabled = true;
    btn.className = 'primary-btn run-btn disabled-state';
    if (chip) { chip.textContent = '서류 필요'; chip.className = 'help-chip gray'; }
  } else {
    btn.textContent = '콕검 실행하기';
    btn.disabled = false;
    btn.className = 'primary-btn run-btn';
    if (chip) { chip.textContent = '준비 완료'; chip.className = 'help-chip green'; }
  }
  updateAnalysisActionBar();
}

// ── 파일 업로드 ───────────────────────────────────────────────
function isValidUpload(f) {
  return /pdf|image|png|jpe?g/i.test(f.type) || /\.(pdf|png|jpe?g)$/i.test(f.name);
}

function addAssignFiles(fileList) {
  const valid = Array.from(fileList || []).filter(isValidUpload);
  if (!valid.length) { showToast('PDF 또는 이미지 파일만 올릴 수 있어요.', 'warn'); return; }
  state.assignFiles.push(...valid);
  renderAssignFileList();
  updateStepNav();
}

function renderAssignFileList() {
  const wrap = $('#assignFileStatus');
  if (!wrap) return;
  if (!state.assignFiles.length) {
    wrap.className = 'file-status-box empty';
    wrap.innerHTML = '<span class="status-empty-msg">아직 업로드된 파일이 없어요</span>';
    return;
  }
  const hasImg = state.assignFiles.some(f => f.type.startsWith('image/'));
  let html = `<div class="fstatus-header"><span class="fstatus-count">배정차량 파일 <strong>${state.assignFiles.length}개</strong> 업로드 완료</span><button class="btn-sm-ghost" onclick="clearAssignFiles()">전체 삭제</button></div><ul class="fstatus-list">`;
  state.assignFiles.forEach((f, i) => {
    const isImg = f.type.startsWith('image/');
    html += `<li class="fstatus-item${isImg ? ' img-file' : ''}"><span class="fi-icon">${isImg ? '🖼' : '📄'}</span><span class="fi-name">${escapeHtml(f.name)}</span><span class="fi-size">${formatBytes(f.size)}</span><button class="btn-icon-x" onclick="removeAssignFile(${i})" title="삭제">×</button></li>`;
  });
  html += '</ul>';
  if (hasImg) html += `<div class="img-warn-box">⚠ 이미지·스캔본은 배정차량 번호를 자동으로 찾기 어려울 수 있어요. 추출 후 직접 보정해주세요.</div>`;
  wrap.className = 'file-status-box has-files';
  wrap.innerHTML = html;
}
function removeAssignFile(i) { state.assignFiles.splice(i, 1); renderAssignFileList(); updateStepNav(); }
function clearAssignFiles() { state.assignFiles = []; renderAssignFileList(); updateStepNav(); }

function addDocFiles(fileList) {
  const valid = Array.from(fileList || []).filter(isValidUpload);
  if (!valid.length) { showToast('PDF 또는 이미지 파일만 올릴 수 있어요.', 'warn'); return; }
  valid.forEach(f => { state.docFiles.push(f); state.docAnalyses.push(createAnalysis(f)); });
  renderDocFileList();
  updateStepNav();
}

function renderDocFileList() {
  const wrap = $('#docFileStatus');
  if (!wrap) return;
  if (!state.docAnalyses.length) {
    wrap.className = 'file-status-box empty';
    wrap.innerHTML = '<span class="status-empty-msg">아직 업로드된 파일이 없어요</span>';
    return;
  }
  const locationNeeded = state.docAnalyses.filter(a => a.needsOcr || (a.pageDiagnostics || []).some(p => p.ocrStatus === 'needed')).length;
  const locationPagesTotal = state.docAnalyses.reduce((n, a) => n + ((a.pageDiagnostics || []).filter(p => p.ocrStatus === 'needed').length || (a.needsOcr ? 1 : 0)), 0);
  let html = `<div class="fstatus-header"><span class="fstatus-count">서류 <strong>${state.docAnalyses.length}개</strong> 업로드 완료</span><div class="file-actions">`;
  if (locationNeeded) html += `<button class="btn-sm-ocr" onclick="scrollToSourceLocations()">추천 페이지 확인하기${locationPagesTotal ? ` (${locationPagesTotal}쪽)` : ''}</button>`;
  html += `<button class="btn-sm-ghost" onclick="clearDocFiles()">전체 삭제</button></div></div>`;
  html += `<div class="ocr-note">콕검은 텍스트 분석을 먼저 실행합니다. 자동판독이 어려운 이미지 서류는 파일명과 PDF 페이지 추천으로 안내합니다.</div>`;
  html += `<div class="file-analysis-table"><div class="fat-head"><span>파일명</span><span>서류종류 후보</span><span>페이지 진단</span><span>확인 위치</span><span></span></div>`;
  state.docAnalyses.forEach((a, i) => {
    const locText = fileLocationSummary(a);
    const locChip = locText ? `<span class="analysis-pill warn">${escapeHtml(locText)}</span>` : `<span class="ocr-small muted">진단 후 표시</span>`;
    html += `<div class="fat-row">
      <span class="fi-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)} <em>${formatBytes(a.size)}</em></span>
      <span>${escapeHtml(docTypeLabel(a.type))}</span>
      <span class="fat-diag-cell">${pageDiagSummary(a)}${analysisStatusPill(a.textStatus)}</span>
      <span>${locChip}</span>
      <span class="fat-actions"><button class="btn-icon-x" onclick="removeDocFile(${i})" title="삭제">×</button></span>
    </div>`;
  });
  html += '</div>';
  if (locationNeeded) html += `<div class="img-warn-box">📄 자동판독이 어려운 이미지 서류 ${locationPagesTotal || locationNeeded}쪽이 있어요. 없는 서류로 보지 않고 PDF 페이지 추천으로 안내합니다.</div>`;
  html += `<div class="upload-nudge">서류 ${state.docAnalyses.length}개 업로드 완료 — 아래 <strong>콕검 실행하기</strong> 버튼을 먼저 눌러주세요.</div>`;
  wrap.className = 'file-status-box has-files';
  wrap.innerHTML = html;
  updateAnalysisActionBar();
}

function fileLocationSummary(a) {
  const pages = (a.pageDiagnostics || []).filter(p => p.ocrStatus === 'needed' || (p.documentTypeCandidates || []).length);
  if (!pages.length) return '';
  return `PDF ${formatPageList(pages.map(p => p.pageNumber))}쪽`;
}

function scrollToSourceLocations() {
  document.getElementById('sourceLocations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function analysisStatusPill(status) {
  const cls = status === '텍스트 분석 완료' || status === '쪽수 정리' || status === '필요 없음' ? 'ok' :
    status === ST_OCR || status === '스캔본으로 보임' || status === '텍스트 부족' ? 'warn' :
    status === '자동 판독 어려움' ? 'bad' : 'gray';
  return `<span class="analysis-pill ${cls}">${escapeHtml(status || '대기')}</span>`;
}

function pageDiagSummary(a) {
  const pages = a.pageDiagnostics || [];
  if (!pages.length) return '<span class="ocr-small muted">진단 대기</span>';
  const text = pages.filter(p => p.pageType === 'text').length;
  const mixed = pages.filter(p => p.pageType === 'mixed').length;
  const img = pages.filter(p => p.pageType === 'image-heavy').length;
  const need = pages.filter(p => p.ocrStatus === 'needed').length;
  const cand = [...new Set(pages.flatMap(p => p.documentTypeCandidates || []))].map(docTypeLabel).slice(0, 2).join('·');
  const parts = [];
  if (text) parts.push(`텍스트 ${text}쪽`);
  if (mixed) parts.push(`혼합 ${mixed}쪽`);
  if (img) parts.push(`이미지 ${img}쪽`);
  if (need) parts.push(`추천 ${need}쪽`);
  const title = cand ? `후보: ${cand}` : '';
  return `<span class="page-diag-chip ${need ? 'warn' : 'ok'}" title="${escapeHtml(title)}">${escapeHtml(parts.join(' · ') || '진단 완료')}</span>${cand ? `<div class="mini-detail diag-candidates">후보: ${escapeHtml(cand)}</div>` : ''}`;
}

function removeDocFile(i) {
  state.docFiles.splice(i, 1);
  state.docAnalyses.splice(i, 1);
  renderDocFileList();
  updateStepNav();
}
function clearDocFiles() { state.docFiles = []; state.docAnalyses = []; renderDocFileList(); updateStepNav(); }

// ── 배정차량 추출 ─────────────────────────────────────────────
async function doExtractVehicles() {
  if (!state.assignFiles.length) { showToast('배정차량 파일을 먼저 업로드해주세요.', 'warn'); return; }
  const btn = $('#extractVehicleBtn');
  if (btn) { btn.disabled = true; btn.textContent = '추출 중…'; }
  let allText = '';
  for (const f of state.assignFiles) {
    const structured = await extractPdfStructuredText(f);
    const plain = await extractPdfText(f);
    allText += `\n[${f.name} 구조텍스트]\n${structured}\n[${f.name} 일반텍스트]\n${plain}\n`;
  }
  const parsedRows = extractAssignedVehicleRows(allText);
  if (btn) { btn.disabled = false; btn.textContent = '다시 추출하기'; }

  if (!parsedRows.length) {
    showToast('차량번호를 자동으로 찾지 못했어요. 직접 입력해주세요.', 'warn');
    state.vehicleSource = 'manual';
    state.vehicleConfirmed = false;
    state.assignedVehicles = [{ hocha: '1호차', vehicleNo: '', driver: '', phone: '', note: '직접입력' }];
  } else {
    showToast(`배정표에서 ${parsedRows.length}대를 찾았어요. 미리보기에서 확인해주세요.`, 'success');
    state.vehicleSource = 'auto';
    state.vehicleConfirmed = false;
    state.assignedVehicles = parsedRows.map((r, i) => ({
      hocha: r.hocha || `${i + 1}호차`,
      vehicleNo: r.vehicleNo || '',
      driver: r.driver || '',
      phone: r.phone || '',
      note: r.confident ? '자동추출' : '확인필요'
    }));
  }
  renderVehicleTable();
  updateStepNav();
  setTimeout(() => $('#step3Card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
}

function extractAssignedVehicleRows(text) {
  const lines = String(text || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  const rows = [];
  const seen = new Set();

  // 1) 구조 텍스트의 실제 행에서 우선 추출: 서울72바 7440 전훈열 010-...
  lines.forEach(line => {
    const row = parseVehicleAssignmentLine(line);
    if (!row) return;
    const existingIdx = rows.findIndex(r => r.vehicleNo === row.vehicleNo);
    if (existingIdx >= 0) {
      const prev = rows[existingIdx];
      if (isLikelyCompanyName(prev.driver) && row.driver && !isLikelyCompanyName(row.driver)) {
        rows[existingIdx] = { ...prev, ...row, note: prev.note || row.note };
      } else if (!prev.driver && row.driver) {
        rows[existingIdx] = { ...prev, driver: row.driver, phone: prev.phone || row.phone, confident: row.confident };
      }
      return;
    }
    seen.add(row.vehicleNo);
    rows.push(row);
  });
  if (rows.length >= 2) return rows;

  // 2) 표가 컬럼 단위로 섞인 경우: 접두부+운전자 목록과 뒷번호+전화번호 목록을 재조립
  const prefixDriver = [];
  const pdRe = /([가-힣]{2}\s?\d{2,3}\s?[가-힣])\s+([가-힣]{2,4})(?=\s|$)/g;
  lines.forEach(line => {
    let m;
    while ((m = pdRe.exec(line)) !== null) {
      const driver = cleanDriverName(m[2]);
      if (driver) prefixDriver.push({ prefix: normalizeVehicleNo(m[1]), driver });
    }
  });
  const tailPhone = [];
  const tpRe = /\b(\d{4})\b\s+(0\d{1,2}-?\d{3,4}-?\d{4})/g;
  lines.forEach(line => {
    let m;
    while ((m = tpRe.exec(line)) !== null) tailPhone.push({ tail: m[1], phone: normalizePhone(m[2]) });
  });
  if (prefixDriver.length && tailPhone.length) {
    const n = Math.min(prefixDriver.length, tailPhone.length);
    const rebuilt = [];
    for (let i = 0; i < n; i++) {
      const vehicleNo = normalizeVehicleNo(prefixDriver[i].prefix + tailPhone[i].tail);
      rebuilt.push({ hocha: `${i + 1}호차`, vehicleNo, driver: prefixDriver[i].driver, phone: tailPhone[i].phone, confident: false });
    }
    return rebuilt;
  }

  // 3) 마지막 fallback: 차량번호만이라도 추출
  return extractVehicleNumbers(text).map((v, i) => ({ hocha: `${i + 1}호차`, vehicleNo: v, driver: '', phone: '', confident: false }));
}

function parseVehicleAssignmentLine(line) {
  const raw = String(line || '').replace(/\s+/g, ' ').trim();
  if (!raw || /차량번호\s*운전자|회사명|전화번호/.test(raw)) return null;
  const phoneMatch = raw.match(/0\d{1,2}-?\d{3,4}-?\d{4}/);
  const phone = phoneMatch ? normalizePhone(phoneMatch[0]) : '';

  let vehicleNo = '';
  const full = raw.match(/[가-힣]{2}\s?\d{2,3}\s?[가-힣]\s?\d{4}/);
  if (full) vehicleNo = normalizeVehicleNo(full[0]);
  if (!vehicleNo) {
    const split = raw.match(/([가-힣]{2}\s?\d{2,3}\s?[가-힣])\s+(\d{4})/);
    if (split) vehicleNo = normalizeVehicleNo(split[1] + split[2]);
  }
  if (!vehicleNo) return null;

  let tail = raw;
  if (phone) tail = tail.replace(phoneMatch[0], ' ');
  tail = tail.replace(/[가-힣]{2}\s?\d{2,3}\s?[가-힣]\s?\d{4}/g, ' ')
             .replace(/[가-힣]{2}\s?\d{2,3}\s?[가-힣]\s+\d{4}/g, ' ')
             .replace(/\b\d{4}\b/g, ' ')
             .replace(/삼우고속관광|세일여행|대청|강릉|수련원|연수원|체험학습|관광|여행|고속|운수|주식회사|\(주\)|\(\d+대\)|회사명|차량번호|운전자성명|전화번호/g, ' ')
             .replace(/[()\[\]<>:·,]/g, ' ')
             .trim();
  const names = tail.match(/[가-힣]{2,4}/g) || [];
  const driver = cleanDriverName([...names].reverse().find(n => !isLikelyCompanyName(n)) || '');
  return { hocha: '', vehicleNo, driver, phone, confident: !!(driver || phone) };
}

function isLikelyCompanyName(name) {
  const n = String(name || '').trim();
  // 배차표 OCR에서 학교명/기관명/업체명이 운전자 칸으로 밀려 들어오는 경우가 있어
  // 이런 값은 '실제 운전자명'으로 보지 않고, 뒤에 같은 차량번호의 실제 이름이 나오면 교체한다.
  return !n || /학교|초등|중등|고등|유치원|기관|업체|회사|수련원|연수원|체험학습|차량|번호|전화|운전자|성명|고속|관광|여행|운수|주식|대청|강릉|세일|일대/.test(n);
}

function cleanDriverName(name) {
  const n = String(name || '').trim();
  if (isLikelyCompanyName(n)) return '';
  // 운전자명은 보통 2~4글자 한글 성명이다. '학교'처럼 짧은 기관성 단어가 들어오지 않도록 한 번 더 거른다.
  if (!/^[가-힣]{2,4}$/.test(n)) return '';
  return n;
}
function normalizePhone(p) {
  const digits = String(p || '').replace(/[^0-9]/g, '');
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2,3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return p || '';
}

function renderVehicleTable() {
  const wrap = $('#vehicleTableWrap');
  const empty = $('#vehicleEmpty');
  const chip = $('#vehicleCountChip');
  const note = $('#vehicleSourceNote');
  if (!state.assignedVehicles.length) {
    wrap?.classList.add('hidden'); empty?.classList.remove('hidden');
    if (chip) { chip.textContent = '대기 중'; chip.className = 'help-chip gray'; }
    if (note) note.className = 'source-note hidden';
    return;
  }
  wrap?.classList.remove('hidden'); empty?.classList.add('hidden');
  if (chip) { chip.textContent = state.vehicleConfirmed ? `${state.assignedVehicles.length}대 확정` : `${state.assignedVehicles.length}대 확인 중`; chip.className = state.vehicleConfirmed ? 'help-chip ok' : 'help-chip blue'; }
  if (note) {
    note.classList.remove('hidden');
    if (state.vehicleConfirmed) {
      note.innerHTML = `<div class="source-note-main">배차 확정 완료 · <strong>${state.assignedVehicles.length}대</strong> 기준으로 콕검을 진행합니다.</div>`;
      note.className = 'source-note confirmed';
    } else if (state.vehicleSource === 'auto') {
      const need = state.assignedVehicles.filter(v => v.note === '확인필요' || !v.driver || !v.phone).length;
      note.innerHTML = `<div class="source-note-main">배정표에서 <strong>${state.assignedVehicles.length}대</strong> 차량을 찾았습니다. 아래 내용이 맞으면 <strong>이 차량 목록으로 확정</strong>을 눌러주세요.${need ? ` <span class="note-warn">${need}건 확인 필요</span>` : ''}</div><div class="source-note-actions"><button id="applyExtractedVehiclesBtn" class="btn-sm-ghost" type="button">이대로 적용</button><button id="editExtractedVehiclesBtn" class="btn-sm-ghost" type="button">직접 수정</button></div>`;
      note.className = 'source-note auto preview-note';
      setTimeout(() => {
        $('#applyExtractedVehiclesBtn')?.addEventListener('click', () => showToast('현재 미리보기 내용이 적용되어 있어요. 필요하면 표에서 바로 수정하세요.', 'success'));
        $('#editExtractedVehiclesBtn')?.addEventListener('click', () => $('#vehicleTbody input')?.focus());
      }, 0);
    }
    else { note.textContent = '직접 입력으로 보정한 배정차량입니다. 확인 후 이 차량 목록으로 확정해주세요.'; note.className = 'source-note manual'; }
  }
  const tbody = $('#vehicleTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const locked = state.vehicleConfirmed;
  state.assignedVehicles.forEach((v, i) => {
    const tr = document.createElement('tr');
    tr.className = locked ? 'vehicle-row-locked' : '';
    const disabled = locked ? 'disabled aria-disabled="true"' : '';
    tr.innerHTML = `
      <td><input class="tbl-input" value="${escapeHtml(v.hocha || '')}" oninput="patchVehicle(${i},'hocha',this.value)" ${disabled} /></td>
      <td><input class="tbl-input vno-input" value="${escapeHtml(v.vehicleNo || '')}" oninput="patchVehicle(${i},'vehicleNo',this.value)" placeholder="예: 서울72바5789" ${disabled} /></td>
      <td><input class="tbl-input" value="${escapeHtml(v.driver || '')}" oninput="patchVehicle(${i},'driver',this.value)" placeholder="성명" ${disabled} /></td>
      <td><input class="tbl-input" value="${escapeHtml(v.phone || '')}" oninput="patchVehicle(${i},'phone',this.value)" placeholder="010-0000-0000" ${disabled} /></td>
      <td><span class="badge-src">${escapeHtml(locked ? '확정됨' : (v.note || ''))}</span></td>
      <td><button class="btn-del" onclick="removeVehicleRow(${i})" ${locked ? 'disabled' : ''}>삭제</button></td>`;
    tbody.appendChild(tr);
  });
  const confirmBtn = $('#confirmVehiclesBtn');
  if (confirmBtn) confirmBtn.textContent = locked ? '확정 해제하고 수정' : '이 차량 목록으로 확정';
  const addBtn = $('#addVehicleBtn');
  if (addBtn) {
    addBtn.disabled = locked;
    addBtn.classList.toggle('disabled-state', locked);
  }
}

function patchVehicle(i, field, val) {
  if (!state.assignedVehicles[i]) return;
  state.assignedVehicles[i][field] = val;
  state.assignedVehicles[i].note = '수동보정';
  state.vehicleConfirmed = false;
  const rows = $$('#vehicleTbody tr');
  if (rows[i]) {
    const b = rows[i].querySelector('.badge-src');
    if (b) b.textContent = '수동보정';
  }
}
function removeVehicleRow(i) { if (state.vehicleConfirmed) { showToast('삭제하려면 먼저 확정을 해제해주세요.', 'warn'); return; } state.assignedVehicles.splice(i, 1); state.vehicleConfirmed = false; renderVehicleTable(); updateStepNav(); }
function addVehicleRow() { if (state.vehicleConfirmed) { showToast('차량을 추가하려면 먼저 확정을 해제해주세요.', 'warn'); return; } state.assignedVehicles.push({ hocha: `${state.assignedVehicles.length + 1}호차`, vehicleNo: '', driver: '', phone: '', note: '직접입력' }); state.vehicleSource = 'manual'; state.vehicleConfirmed = false; renderVehicleTable(); updateStepNav(); setTimeout(() => { const inputs = $$('#vehicleTbody tr:last-child input'); inputs[1]?.focus(); }, 0); }
function confirmVehicleList() {
  if (state.vehicleConfirmed) {
    state.vehicleConfirmed = false;
    renderVehicleTable();
    updateStepNav();
    showToast('배차 확정을 해제했습니다. 수정 후 다시 확정해주세요.', 'info');
    return;
  }
  if (!state.assignedVehicles.length) { showToast('확정할 배정차량이 없습니다.', 'warn'); return; }
  const missing = state.assignedVehicles.filter(v => !normalizeVehicleNo(v.vehicleNo)).length;
  if (missing) { showToast(`차량번호가 비어 있는 행 ${missing}건을 먼저 확인해주세요.`, 'warn'); return; }
  state.vehicleConfirmed = true;
  state.vehicleSource = state.vehicleSource === 'none' ? 'manual' : state.vehicleSource;
  renderVehicleTable();
  updateStepNav();
  showToast(`배차 차량 ${state.assignedVehicles.length}대가 확정되었습니다.`, 'success');
}

// ── 빠른 콕검 ─────────────────────────────────────────────────
async function runCheck() {
  const startDate = $('#startDate')?.value;
  if (!startDate) {
    showToast('출발일을 먼저 설정해주세요.', 'warn');
    const card = $('#step1Card');
    const input = $('#startDate');
    card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card?.classList.add('needs-attention');
    setTimeout(() => input?.focus(), 450);
    setTimeout(() => card?.classList.remove('needs-attention'), 2200);
    return;
  }
  if (!state.assignedVehicles.length) { showToast('배정차량 리스트를 먼저 확인해주세요.', 'warn'); return; }
  if (!state.vehicleConfirmed) { showToast('배차 차량 목록을 먼저 확정해주세요.', 'warn'); $('#step3Card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (!state.docAnalyses.length) { showToast('서류를 먼저 업로드해주세요.', 'warn'); return; }
  const btn = $('#runCheckBtn');
  if (btn) { btn.disabled = true; btn.textContent = '분석 중…'; }
  const msg = $('#runMessage');
  if (msg) msg.textContent = '페이지별로 텍스트형/이미지형을 먼저 진단합니다. 필요한 경우 체크리스트에서 자동판독 보완을 선택할 수 있어요.';
  try {
    for (const a of state.docAnalyses) {
      if (!a.pageDiagnostics.length) {
        a.textStatus = '페이지 진단 중'; renderDocFileList();
        a.pageDiagnostics = await diagnosePdfPages(a.file);
        a.imagePageCount = a.pageDiagnostics.filter(p => p.pageType === 'image-heavy').length;
        a.ocrNeededPageCount = a.pageDiagnostics.filter(p => p.ocrStatus === 'needed').length;
      }
      if (!a.text && !a.file.type.startsWith('image/')) {
        a.textStatus = '텍스트 추출 중'; renderDocFileList();
        a.text = await extractPdfText(a.file);
      }
      const text = analysisText(a);
      const filenameType = classifyByFilename(a.name);
      const candidateTypes = [...new Set((a.pageDiagnostics || []).flatMap(p => p.documentTypeCandidates || []))];
      a.type = classifyByText(text, filenameType !== 'unknown' ? filenameType : (candidateTypes[0] || 'unknown'));
      const insufficient = !text.trim() || text.trim().length < LIGHT_OCR_MIN_TEXT || !hasAnyCoreKeyword(text);
      const pageOcrNeeded = (a.pageDiagnostics || []).some(p => p.ocrStatus === 'needed');
      if (a.file.type.startsWith('image/')) { a.textStatus = '스캔본으로 보임'; a.needsOcr = true; a.ocrStatus = a.ocrStatus === '쪽수 정리' ? '쪽수 정리' : ST_OCR; }
      else if (pageOcrNeeded) { a.textStatus = insufficient ? (text.trim() ? '텍스트 부족' : '이미지 중심 서류') : '이미지 서류 포함'; a.needsOcr = true; if (a.ocrStatus !== '쪽수 정리') a.ocrStatus = ST_OCR; }
      else if (insufficient) { a.textStatus = text.trim() ? '텍스트 부족' : '스캔본으로 보임'; a.needsOcr = true; if (a.ocrStatus !== '쪽수 정리') a.ocrStatus = ST_OCR; }
      else { a.textStatus = '텍스트 분석 완료'; if (a.ocrStatus === '대기') a.ocrStatus = '필요 없음'; }
    }
    rebuildAllResults();
    showResultSections();
    state.checked = true;
    updateStepNav();
    renderDocFileList();
    if (btn) { btn.textContent = '콕검 실행하기'; btn.disabled = false; }
    showToast('콕검이 완료됐어요. 체크리스트를 확인해주세요.', 'success');
    setTimeout(() => $('#step6')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  } catch (e) {
    console.error(e);
    if (btn) { btn.textContent = '콕검 실행하기'; btn.disabled = false; }
    showToast('오류가 발생했어요. 다시 시도해주세요.', 'warn');
  }
}

// ── 선택형 OCR ────────────────────────────────────────────────
function getOcrTargets() {
  return state.docAnalyses
    .map((a, i) => ({ a, i }))
    .filter(x => x.a.needsOcr && x.a.ocrStatus !== '쪽수 정리');
}

function resetOcrAssist(partial = {}) {
  state.ocrAssist = {
    running: false,
    done: false,
    current: 0,
    total: 0,
    found: 0,
    message: '',
    ...partial
  };
}

function ensureOcrBusyOverlay() {
  let el = $('#ocrBusyOverlay');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'ocrBusyOverlay';
  el.className = 'ocr-busy-overlay hidden';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="ocr-busy-card" role="status" aria-label="자동판독 보완 진행 중">
      <div class="ocr-busy-spinner" aria-hidden="true"></div>
      <div class="ocr-busy-copy">
        <strong>자동판독 보완 중이에요</strong>
        <p id="ocrBusyMessage">서류 글자를 다시 확인하고 있어요. 진행 중에는 화면을 그대로 두는 것이 좋습니다.</p>
        <div class="ocr-busy-progress" aria-label="자동판독 진행률"><span id="ocrBusyBar" style="width:0%"></span></div>
        <small>예상 30초~1분 · 완료되면 체크리스트와 보완요청 문구가 다시 정리됩니다.</small>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

function updateOcrBusyOverlay(current = 0, total = 0, message = '') {
  const el = ensureOcrBusyOverlay();
  const msg = el.querySelector('#ocrBusyMessage');
  const bar = el.querySelector('#ocrBusyBar');
  const pct = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  if (msg) msg.textContent = message || `서류 글자를 다시 확인하고 있어요. ${current}/${total}개 파일 확인 중입니다.`;
  if (bar) bar.style.width = `${pct}%`;
  el.classList.remove('hidden');
  document.body.classList.add('ocr-busy-lock');
}

function hideOcrBusyOverlay() {
  const el = $('#ocrBusyOverlay');
  if (el) el.classList.add('hidden');
  document.body.classList.remove('ocr-busy-lock');
}

async function confirmOcrNotice() {
  // v0.2.33부터 팝업 확인은 사용하지 않는다.
  // 자동판독 보완은 체크리스트 상단 인라인 버튼을 눌렀을 때만 실행된다.
  state.ocrNoticeAccepted = true;
  return true;
}

async function runOcrForNeeded() {
  const targets = getOcrTargets();
  if (!targets.length) {
    resetOcrAssist({ done: true, message: '자동판독 보완이 필요한 파일이 없어요.' });
    renderOcrAssistPanel();
    renderRequiredChecklist();
    generateAndShowSupplement();
    showToast('자동판독 보완이 필요한 파일이 없어요.', 'info');
    return;
  }
  if (!window.Tesseract) {
    resetOcrAssist({ done: true, message: '글자 판독 도구를 불러오지 못했어요. 네트워크 접속을 확인해 주세요.' });
    renderOcrAssistPanel();
    renderRequiredChecklist();
    generateAndShowSupplement();
    showToast('글자 판독 도구를 불러오지 못했어요. 네트워크 접속을 확인해주세요.', 'warn');
    return;
  }

  const foundBefore = state.docAnalyses.filter(a => a.ocrText && String(a.ocrText).trim()).length;
  resetOcrAssist({ running: true, current: 0, total: targets.length, found: 0, message: `자동판독 보완 중 · 0/${targets.length}개 파일 확인 중` });
  updateOcrBusyOverlay(0, targets.length, '서류 글자를 다시 확인하고 있어요. 진행 중에는 다른 작업을 하지 말고 잠시 기다려 주세요.');
  renderOcrAssistPanel();
  renderRequiredChecklist();

  try {
    for (let idx = 0; idx < targets.length; idx++) {
      state.ocrAssist.current = idx + 1;
      state.ocrAssist.message = `자동판독 보완 중 · ${idx + 1}/${targets.length}개 파일 확인 중`;
      updateOcrBusyOverlay(idx + 1, targets.length, `${idx + 1}/${targets.length}개 파일 확인 중입니다. 완료되면 결과와 보완요청 문구가 자동으로 다시 정리됩니다.`);
      renderOcrAssistPanel();
      renderRequiredChecklist();
      await runOcrForIndex(targets[idx].i, true, { deferRebuild: true, silentToast: true });
    }

    rebuildAllResults();
    const foundAfter = state.docAnalyses.filter(a => a.ocrText && String(a.ocrText).trim()).length;
    const added = Math.max(0, foundAfter - foundBefore);
    resetOcrAssist({
      done: true,
      current: targets.length,
      total: targets.length,
      found: added,
      message: added
        ? `자동판독 보완 완료 · 후보 ${added}건이 체크리스트에 반영됐어요.`
        : '자동판독 보완 완료 · 추가로 찾은 서류는 없어요. 관련 페이지를 직접 확인해 주세요.'
    });
    renderOcrAssistPanel();
    renderRequiredChecklist();
    generateAndShowSupplement();
    renderDocumentStatus();
    renderDocFileList();
    showToast(added ? `자동판독 후보 ${added}건을 반영했어요.` : '자동판독 보완이 완료됐어요.', 'success');
  } finally {
    hideOcrBusyOverlay();
  }
}

window.runOcrForNeeded = runOcrForNeeded;

async function runOcrForIndex(i, alreadyConfirmed = false, options = {}) {
  const a = state.docAnalyses[i];
  if (!a) return;
  if (!alreadyConfirmed && !(await confirmOcrNotice())) return;
  if (!window.Tesseract) { showToast('글자 판독 도구를 불러오지 못했어요. 네트워크 접속을 확인해주세요.', 'warn'); return; }
  state.ocrRunning = true;
  a.ocrStatus = '글자 판독 준비 중';
  renderDocFileList();
  const msg = $('#runMessage');
  try {
    let ocrText = '';
    if (a.file.type.startsWith('image/')) {
      a.ocrStatus = '글자 판독 중'; renderDocFileList();
      if (msg) msg.textContent = `${a.name} 글자 판독 중입니다.`;
      const url = URL.createObjectURL(a.file);
      try {
        const canvasUrl = await imageFileToPreparedDataUrl(url);
        ocrText = await recognizeImage(canvasUrl || url, a);
      }
      finally { URL.revokeObjectURL(url); }
      a.ocrPages = 1;
    } else {
      if (!a.pageDiagnostics.length) a.pageDiagnostics = await diagnosePdfPages(a.file);
      const buf = await a.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let targetPages = ocrNeededPages(a);
      if (!targetPages.length) targetPages = Array.from({ length: Math.min(pdf.numPages, LIGHT_OCR_MAX_PAGES) }, (_, idx) => idx + 1);
      targetPages = targetPages.slice(0, LIGHT_OCR_MAX_PAGES);
      for (let idx = 0; idx < targetPages.length; idx++) {
        const p = targetPages[idx];
        a.ocrStatus = `${idx + 1} / ${targetPages.length}쪽 글자 판독 중`; renderDocFileList();
        if (msg) msg.textContent = `${a.name} · ${p}쪽 글자 판독 중입니다.`;
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: LIGHT_OCR_RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const prepared = preprocessCanvasForLightOcr(canvas);
        ocrText += `
[${a.name} ${p}쪽 자동판독 후보]
` + await recognizeImage(prepared, a);
      }
      a.ocrPages = targetPages.length;
    }
    a.ocrText = enrichOcrTextWithCandidates(ocrText);
    a.extractedCandidates = collectOcrCandidates(a.ocrText);
    a.type = classifyByText(analysisText(a), classifyByFilename(a.name));
    a.ocrStatus = '쪽수 정리';
    a.needsOcr = false;
    (a.pageDiagnostics || []).forEach(p => { if (p.ocrStatus === 'needed') p.ocrStatus = 'done'; });
    if (!a.textStatus || ['대기','텍스트 부족','스캔본으로 보임'].includes(a.textStatus)) a.textStatus = a.text ? a.textStatus : '스캔본으로 보임';
    if (!options.silentToast) showToast(`${a.name} 자동판독 후보를 반영했어요.`, 'success');
  } catch (e) {
    console.error('자동 판독 어려움', e);
    a.ocrError = e.message || String(e);
    a.ocrStatus = '자동 판독 어려움';
    if (!options.silentToast) showToast('자동 판독이 어려워 직접 확인 항목으로 표시합니다.', 'warn');
  } finally {
    state.ocrRunning = false;
    renderDocFileList();
    if (state.checked && !options.deferRebuild) {
      rebuildAllResults();
      showResultSections();
    }
    if (msg && !options.deferRebuild) msg.textContent = '자동판독 후보가 반영되었습니다. 불확실한 항목은 직접 확인 항목으로 표시됩니다.';
  }
}

async function recognizeImage(src, analysis, options = {}) {
  const params = options.whitelist ? { tessedit_char_whitelist: options.whitelist } : undefined;
  const result = await Tesseract.recognize(src, 'kor+eng', {
    ...(params ? { tessedit_char_whitelist: options.whitelist } : {}),
    logger: m => {
      if (m.status && analysis) {
        const pct = m.progress ? ` ${Math.round(m.progress * 100)}%` : '';
        analysis.ocrStatus = `${m.status}${pct}`;
        renderDocFileList();
      }
    }
  });
  return result?.data?.text || '';
}

function preprocessCanvasForLightOcr(sourceCanvas) {
  if (!sourceCanvas) return '';
  const target = document.createElement('canvas');
  const scale = 1.15;
  target.width = Math.max(1, Math.floor(sourceCanvas.width * scale));
  target.height = Math.max(1, Math.floor(sourceCanvas.height * scale));
  const ctx = target.getContext('2d', { willReadFrequently: true });
  ctx.filter = 'grayscale(100%) contrast(155%) brightness(104%)';
  ctx.drawImage(sourceCanvas, 0, 0, target.width, target.height);
  return target.toDataURL('image/png');
}

async function imageFileToPreparedDataUrl(url) {
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
    return preprocessCanvasForLightOcr(canvas);
  } catch (e) {
    console.warn('이미지 전처리 실패, 원본으로 판독합니다.', e);
    return '';
  }
}

function collectOcrCandidates(text) {
  const raw = String(text || '');
  const vehicles = extractVehicleNumbers(raw);
  const bizNums = [...new Set((raw.match(/\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/g) || []).map(v => v.replace(/\s+/g, '').replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3')))].slice(0, 8);
  const ranges = [...new Set((raw.match(/\d{4}[.\-년\s]*\d{1,2}[.\-월\s]*\d{1,2}\s*(?:~|부터|[-–—])\s*\d{4}[.\-년\s]*\d{1,2}[.\-월\s]*\d{1,2}/g) || []).map(v => v.replace(/\s+/g, ' ').trim()))].slice(0, 8);
  const resultWords = [...new Set((raw.match(/이상\s*없음|적합|실시|유효|만료/g) || []).map(v => v.replace(/\s+/g, '')))].slice(0, 8);
  return { vehicles, bizNums, ranges, resultWords };
}

function enrichOcrTextWithCandidates(text) {
  const candidates = collectOcrCandidates(text);
  const lines = [];
  if (candidates.vehicles.length) lines.push(`차량번호 후보: ${candidates.vehicles.join(', ')}`);
  if (candidates.bizNums.length) lines.push(`사업자등록번호 후보: ${candidates.bizNums.join(', ')}`);
  if (candidates.ranges.length) lines.push(`기간 후보: ${candidates.ranges.join(' / ')}`);
  if (candidates.resultWords.length) lines.push(`확인문구 후보: ${candidates.resultWords.join(', ')}`);
  return lines.length ? `${text}\n\n[자동 추출 후보]\n${lines.join('\n')}` : text;
}

// ── 결과 빌드 ─────────────────────────────────────────────────
function rebuildAllResults() {
  const startDate = $('#startDate')?.value;
  const endDate = $('#endDate')?.value || '';
  state.allText = state.docAnalyses.map(analysisText).join('\n\n');
  state.docRows = buildDocumentRows();
  state.companyRows = buildCompanyRows(startDate, endDate);
  state.vehicleRows = state.assignedVehicles.map(v => buildVehicleRow(v, startDate, endDate));
  renderSummary(startDate, endDate);
  renderOcrAssistPanel();
  renderRequiredChecklist();
  refreshResultSidebar();
  renderCompanySummary();
  renderDocumentStatus();
  renderVehicleMatches();
  generateAndShowSupplement();
}

function buildDocumentRows() {
  return DOC_ORDER.map(key => {
    const def = DOC_TYPES[key];
    const docs = analysesByType(key);
    const candidates = candidateAnalyses(key);
    const ocrCandidatePages = candidates.reduce((n, a) => n + (a.pageDiagnostics || []).filter(p => (p.documentTypeCandidates || []).includes(key) && p.ocrStatus === 'needed').length, 0);
    const ocrNeed = docs.some(a => a.needsOcr || a.ocrStatus === ST_OCR) || ocrCandidatePages > 0;
    if (!docs.length && candidates.length) return { key, group: def.group, name: def.label, status: ST_OCR, detail: `${def.label} 후보 위치: ${candidateLocationText(key) || `PDF ${ocrCandidatePages}쪽`}. 해당 관련 페이지에서 직접 확인해주세요.`, action: '관련 페이지 직접 확인' };
    if (!docs.length) return { key, group: def.group, name: def.label, status: ST_MISS, detail: '관련 서류를 찾지 못했어요.', action: '제출 여부 확인' };
    if (ocrNeed && docs.every(a => !analysisText(a).trim())) return { key, group: def.group, name: def.label, status: ST_OCR, detail: `${docsLocationText(docs, key) || `${docs.length}개 파일`}에서 후보 위치를 확인하세요.`, action: '관련 페이지 직접 확인' };
    return { key, group: def.group, name: def.label, status: docs.some(a => a.needsOcr) ? ST_DIRECT : ST_SUBMIT, detail: `${docs.map(a => a.name).join(', ')}에서 서류 후보를 확인했습니다.${ocrCandidatePages ? ` · 이미지 관련 페이지 ${ocrCandidatePages}쪽` : ''}`, action: docs.some(a => a.needsOcr) || ocrCandidatePages ? '담당자가 직접 확인해주세요' : '상세값 확인' };
  });
}

function buildCompanyRows(startDate, endDate) {
  const rows = [];
  const pledgeDocs = analysesByType('pledge');
  if (pledgeDocs.length) {
    const text = pledgeDocs.map(analysisText).join('\n');
    const blankDate = /(\d{4})\s*[.년]\s*[.]?\s*[.]?\s*[월]?\s*[.]?\s*[일]?|년\s*월\s*일/.test(text) && /\d{4}\s*[.]\s*[.]\s*[.]|년\s*월\s*일/.test(text);
    const hasPledge = /직영\s*차량|직영차량|운행\s*각서|운행각서|직영\s*차량으로만\s*운행/.test(text);
    rows.push({
      key: 'pledge', item: '직영차량 운행각서', status: hasPledge ? ST_SUBMIT : ST_DIRECT,
      detail: `${pledgeDocs.map(a => a.name).join(', ')} · 직영차량 운행 확약 문구 ${hasPledge ? '확인' : '담당자가 직접 확인해주세요'}${blankDate ? ' · 날짜 미기재 후보' : ''}`,
      action: blankDate ? '날짜/대표자/직인 및 붙임서류(자동차등록원부·교통안전정보 조회결과서)를 확인해주세요' : '대표자/직인 및 붙임서류(자동차등록원부·교통안전정보 조회결과서)를 확인해주세요'
    });
  } else {
    rows.push({ key: 'pledge', item: '직영차량 운행각서', status: ST_MISS, detail: '업체 확약서 후보를 찾지 못했어요.', action: '제출 여부 확인' });
  }

  const priceVal = parsePrice($('#estimatedPrice')?.value || '0');
  const directDocs = analysesByType('directProd');
  if (priceVal >= 10000000) {
    if (directDocs.length) rows.push({ key: 'directProd', item: '직접생산확인증명서', status: ST_SUBMIT, detail: `${directDocs.map(a => a.name).join(', ')}에서 서류명 또는 핵심 키워드 확인 · 유효기간/세부품명 담당자가 직접 확인해주세요`, action: '업체명·유효기간 확인' });
    else rows.push({ key: 'directProd', item: '직접생산확인증명서', status: ST_NEED, detail: '제출된 파일에서 직접생산확인증명서를 확인하지 못했어요.', action: '해당 서류 제출 여부 확인' });
  } else if (priceVal > 0) {
    rows.push({ key: 'directProd', item: '직접생산확인증명서', status: ST_NA, detail: '추정가격 1천만원 미만으로 일반 확인 진행입니다.', action: '필요 시 계약방식 확인' });
  } else {
    rows.push({ key: 'directProd', item: '직접생산확인증명서', status: ST_DIRECT, detail: '추정가격 미입력 상태입니다. 필요 여부를 판단하려면 금액을 입력하세요.', action: '추정가격 확인' });
  }

  const bizDocs = analysesByType('businessRegistration');
  if (bizDocs.length) {
    const t = bizDocs.map(analysisText).join('\n');
    const hasBizNo = /\d{3}\s*-\s*\d{2}\s*-\s*\d{5}/.test(t) || /사업자등록번호/.test(t);
    const hasBus = /전세버스|운수|여객|관광/.test(t);
    rows.push({ key: 'businessRegistration', item: '사업자등록증', status: hasBizNo ? ST_SUBMIT : ST_DIRECT, detail: `${bizDocs.map(a => a.name).join(', ')} · 사업자등록번호 ${hasBizNo ? '확인' : '담당자가 직접 확인해주세요'}${hasBus ? ' · 전세버스/운수 관련 문구 확인' : ''}`, action: '업체명·대표자·업태/종목 확인' });
  } else {
    rows.push({ key: 'businessRegistration', item: '사업자등록증', status: ST_MISS, detail: '사업자등록증 후보를 찾지 못했어요.', action: '제출 여부 확인' });
  }

  const preDocs = analysesByType('preCheck');
  if (preDocs.length) {
    const found = new Set();
    preDocs.forEach(a => extractVehicleNumbers(analysisText(a)).forEach(v => found.add(normalizeVehicleNo(v))));
    const total = state.assignedVehicles.length;
    const matched = state.assignedVehicles.filter(v => found.has(normalizeVehicleNo(v.vehicleNo))).length;
    rows.push({ key: 'preCheck', item: '출발 전 점검표', status: matched >= total && total ? ST_SUBMIT : ST_DIRECT, detail: `${total || 0}대 중 ${matched}대 차량번호 확인${preDocs.length ? ` · ${preDocs.map(a => a.name).join(', ')}` : ''}`, action: '적합/실시 및 직인 담당자가 직접 확인해주세요' });
  } else {
    rows.push({ key: 'preCheck', item: '출발 전 점검표', status: ST_MISS, detail: '출발전 교육 및 차량안전점검표 후보를 찾지 못했어요.', action: '제출 여부 확인' });
  }

  rows.push({ key: 'period', item: '이용기간', status: endDate ? ST_SUBMIT : ST_DIRECT, detail: endDate ? `${startDate} ~ ${endDate} 기준으로 기간을 확인합니다.` : `${startDate || '출발일'} 기준으로 확인합니다. 1박 2일 이상이면 도착일 입력을 권장합니다.`, action: endDate ? '기간 기준 확인' : '필요 시 도착일 입력' });
  return rows;
}

function buildVehicleRow(vehicle, startDate, endDate) {
  const vno = normalizeVehicleNo(vehicle.vehicleNo);
  const insurance = evalInsurance(vno, startDate, endDate);
  const regLedger = evalRegistration(vno, startDate, endDate, 'registrationLedger');
  const safety = evalSafety(vno, startDate, endDate);
  const preCheck = evalPreCheck(vno);
  const finalStatus = summarizeFinal([insurance, regLedger, safety, preCheck]);
  return { ...vehicle, vno, insurance, regLedger, safety, preCheck, finalStatus };
}

function summarizeFinal(items) {
  if (items.some(x => [ST_NEED, ST_MISS].includes(x.status))) return ST_NEED;
  if (items.some(x => [ST_DIRECT, ST_OCR].includes(x.status))) return ST_DIRECT;
  if (items.some(x => x.status === ST_SUBMIT)) return ST_DIRECT;
  return ST_OK;
}

function findDocsContainingVehicle(type, vno) {
  const nv = normalizeVehicleNo(vno);
  return analysesByType(type).filter(a => compact(analysisText(a)).includes(nv));
}

function evalInsurance(vno, startDate, endDate) {
  const docs = analysesByType('insurance');
  if (!vno) return result(ST_NEED, '차량번호가 없습니다.');
  if (!docs.length) return result(ST_MISS, '보험서류를 찾지 못했어요.');
  const matches = findDocsContainingVehicle('insurance', vno);
  if (!matches.length) {
    if (docs.some(a => a.needsOcr)) return result(ST_OCR, `보험서류 후보 위치: ${docsLocationText(docs, 'insurance') || docs.map(a=>a.name).join(', ')}. 계약기간과 담보내용을 확인해주세요.`, docs);
    return result(ST_MISS, '보험서류에서 이 차량번호를 찾지 못했어요.', docs);
  }
  const text = matches.map(analysisText).join('\n');
  const period = findBestDateRange(text);
  const covered = hasCoverageText(text);
  if (period && periodCovers(period, startDate, endDate) && covered) return result(ST_OK, `계약기간 ${period.raw} · 담보내용 확인`, matches, { period: period.raw, coverage: '대인Ⅰ/Ⅱ·대물·자손/자차 후보 확인' });
  const reason = [period ? `기간 후보 ${period.raw}` : '계약기간/유효기간 확인 필요', covered ? '담보내용 후보 확인' : '담보내용 담당자가 직접 확인해주세요'].join(' · ');
  return result(ST_DIRECT, reason, matches, { period: period?.raw || '', coverage: covered ? '확인 후보' : '담당자가 직접 확인해주세요' });
}

function evalRegistration(vno, startDate, endDate, type) {
  const docs = analysesByType(type);
  const candidates = candidateAnalyses(type);
  if (!vno) return result(ST_NEED, '차량번호가 없습니다.');
  if (!docs.length && candidates.length) {
    const loc = candidateLocationText(type);
    if (loc) return result(ST_OCR, `${DOC_TYPES[type].label} 관련 페이지: ${loc}. 해당 페이지에서 담당자가 직접 확인해주세요.`, candidates);
    return result(ST_MISS, `${DOC_TYPES[type].label}를 찾지 못했어요.`);
  }
  if (!docs.length) return result(ST_MISS, `${DOC_TYPES[type].label}를 찾지 못했어요.`);
  const matches = findDocsContainingVehicle(type, vno);
  if (!matches.length) {
    if (docs.some(a => a.needsOcr)) {
      const loc = docsLocationText(docs, type);
      if (loc) return result(ST_OCR, `${DOC_TYPES[type].label} 관련 페이지: ${loc}. 해당 페이지에서 담당자가 직접 확인해주세요.`, docs);
    }
    return result(ST_MISS, `${DOC_TYPES[type].label}에서 이 차량번호를 찾지 못했어요.`, docs);
  }
  const text = matches.map(analysisText).join('\n');
  const hasBad = /말소|폐쇄/.test(text);
  const stamp = /번호판\s*회수\s*확인\s*통보|등록번호판\s*회수|회수\s*확인/.test(text);
  const period = findInspectionPeriod(text) || findBestDateRange(text);
  if (hasBad) return result(ST_DIRECT, '말소/폐쇄 관련 문구 후보가 있어 담당자가 직접 확인해주세요', matches);
  if (period && periodCovers(period, startDate, endDate)) return result(ST_OK, `검사유효기간 ${period.raw} 확인${stamp ? ' · 번호판 회수 스탬프는 제외 처리' : ''}`, matches, { inspection: period.raw, stamp });
  return result(ST_DIRECT, `${period ? `검사유효기간 후보 ${period.raw}` : '검사유효기간 확인 필요'}${stamp ? ' · 번호판 회수 스탬프 제외 필요' : ''}`, matches, { inspection: period?.raw || '', stamp });
}

function evalSafety(vno, startDate, endDate) {
  const docs = analysesByType('safetyReport');
  if (!vno) return result(ST_NEED, '차량번호가 없습니다.');
  if (!docs.length) return result(ST_MISS, '교통안전정보 통보서를 찾지 못했어요.');
  const matches = findDocsContainingVehicle('safetyReport', vno);
  if (!matches.length) {
    if (docs.some(a => a.needsOcr)) return result(ST_OCR, `교통안전정보 후보 위치: ${docsLocationText(docs, 'safetyReport') || docs.map(a=>a.name).join(', ')}. 차량번호·운전자명·종합의견/종합결과를 확인해 주세요.`, docs);
    return result(ST_MISS, '교통안전정보 통보서에서 이 차량번호를 찾지 못했어요.', docs);
  }
  const block = matches.map(a => getVehicleBlock(analysisText(a), vno)).join('\n') || matches.map(analysisText).join('\n');
  const fullText = matches.map(analysisText).join('\n');
  // 병합셀/2줄 구조 대응: 차량번호가 있는 행 주변 블록에서 검사만료일을 우선 찾고, 없으면 전체 텍스트에서 역추적한다.
  const date = findInspectionExpiry(block) || findInspectionExpiry(fullText) || findLatestDate(block);
  const good = /이상\s*없음|이상없음/.test(block) || /이상\s*없음|이상없음/.test(fullText);
  const driverQual = /버스운전자격[^\n]*(유|있음|적합)/.test(block) ? '버스운전자격 후보 확인' : '운전자 항목 담당자가 직접 확인해주세요';
  if (date && dateEndCovers(date, startDate, endDate) && good) return result(ST_OK, `자동차검사 만료일 ${date.raw} · 종합결과 이상없음`, matches, { expiry: date.raw, result: '이상없음', driver: driverQual });
  return result(ST_DIRECT, `${date ? `자동차검사 만료일 후보 ${date.raw}` : '자동차검사 만료일 확인 필요'} · ${good ? '종합결과 이상없음 후보' : '종합결과 담당자가 직접 확인해주세요'} · ${driverQual}`, matches, { expiry: date?.raw || '', result: good ? '이상없음 후보' : '담당자가 직접 확인해주세요', driver: driverQual });
}


function evalPreCheck(vno) {
  const docs = analysesByType('preCheck');
  const candidates = candidateAnalyses('preCheck');
  if (!vno) return result(ST_NEED, '차량번호가 없습니다.');
  if (!docs.length && candidates.length) {
    const loc = candidateLocationText('preCheck');
    if (loc) return result(ST_OCR, `출발전 점검표 관련 페이지: ${loc}. 적합/실시 표시를 확인해주세요.`, candidates);
    return result(ST_MISS, '출발전 점검표를 찾지 못했어요.');
  }
  if (!docs.length) return result(ST_MISS, '출발전 점검표를 찾지 못했어요.');
  const matches = findDocsContainingVehicle('preCheck', vno);
  if (!matches.length) return result(ST_MISS, '출발전 점검표에서 이 차량번호를 찾지 못했어요.', docs);
  const text = matches.map(analysisText).join('\n');
  const ok = /적합/.test(text) || /실시/.test(text);
  return result(ok ? ST_SUBMIT : ST_DIRECT, ok ? '적합/실시로 보이는 표시 있음 · 서명/직인 직접 확인' : '점검결과 담당자가 직접 확인해주세요', matches, { result: ok ? '적합/실시 표시 후보' : '담당자가 직접 확인해주세요' });
}

function result(status, detail, docs = [], extra = {}) {
  return { status, detail, docs, sources: docs.map(a => a.name), ...extra };
}

function getVehicleBlock(text, vno) {
  const nv = normalizeVehicleNo(vno);
  const lines = String(text || '').split(/\n+/);
  const idx = lines.findIndex(line => compact(line).includes(nv));
  if (idx >= 0) return lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 4)).join('\n');
  const c = compact(text);
  const pos = c.indexOf(nv);
  if (pos < 0) return '';
  return c.slice(Math.max(0, pos - 250), pos + 500);
}

function hasCoverageText(text) {
  const t = normalizeRoman(text);
  const c = compact(t);
  const hasPerson = /대인I/.test(t) || /대인1/.test(t) || c.includes('대인Ⅰ') || c.includes('대인II') || c.includes('대인2') || c.includes('대인Ⅱ');
  const hasDamage = c.includes('대물');
  const hasSelf = c.includes('자손') || c.includes('자차') || c.includes('자기신체');
  return hasPerson && hasDamage && hasSelf;
}

function parseDate(y, m, d, raw) {
  const yy = String(y).padStart(4, '0');
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const date = new Date(`${yy}-${mm}-${dd}T00:00:00`);
  if (isNaN(date)) return null;
  return { date, raw: raw || `${yy}.${mm}.${dd}`, normalized: `${yy}-${mm}-${dd}` };
}

function findDates(text) {
  const dates = [];
  const patterns = [
    /(20\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/g,
    /(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g
  ];
  patterns.forEach(re => {
    let m;
    while ((m = re.exec(text)) !== null) {
      const d = parseDate(m[1], m[2], m[3], m[0]);
      if (d) dates.push(d);
    }
  });
  return dates;
}

function findBestDateRange(text) {
  const re = /(20\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*(?:~|부터|[-–—])\s*(20\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/g;
  let m;
  let best = null;
  while ((m = re.exec(text)) !== null) {
    const s = parseDate(m[1], m[2], m[3]);
    const e = parseDate(m[4], m[5], m[6]);
    if (s && e) best = { start: s.date, end: e.date, raw: m[0], normalizedStart: s.normalized, normalizedEnd: e.normalized };
  }
  if (best) return best;
  const dates = findDates(text);
  if (dates.length >= 2) {
    dates.sort((a, b) => a.date - b.date);
    const s = dates[0], e = dates[dates.length - 1];
    return { start: s.date, end: e.date, raw: `${s.raw} ~ ${e.raw}`, normalizedStart: s.normalized, normalizedEnd: e.normalized };
  }
  return null;
}

function findInspectionPeriod(text) {
  const idx = String(text || '').indexOf('검사유효기간');
  if (idx >= 0) return findBestDateRange(text.slice(idx, idx + 300));
  return null;
}

function findInspectionExpiry(text) {
  const idx = String(text || '').search(/자동차검사\s*만료일|검사\s*만료일/);
  if (idx >= 0) {
    const dates = findDates(text.slice(idx, idx + 250));
    if (dates.length) return dates[0];
  }
  return null;
}

function findLatestDate(text) {
  const dates = findDates(text);
  if (!dates.length) return null;
  dates.sort((a, b) => b.date - a.date);
  return dates[0];
}

function periodCovers(period, startDate, endDate) {
  if (!period || !startDate) return false;
  const s = new Date(`${startDate}T00:00:00`);
  const e = endDate ? new Date(`${endDate}T00:00:00`) : s;
  return period.start <= s && period.end >= e;
}

function dateEndCovers(dateObj, startDate, endDate) {
  if (!dateObj || !startDate) return false;
  const s = new Date(`${startDate}T00:00:00`);
  const e = endDate ? new Date(`${endDate}T00:00:00`) : s;
  return dateObj.date >= s && dateObj.date >= e;
}

// ── 렌더링 ────────────────────────────────────────────────────

function displayStatus(status) {
  const map = {
    [ST_OK]: '제출 확인됨',
    [ST_SUBMIT]: '제출 확인됨',
    [ST_DIRECT]: '담당자 확인필요',
    [ST_NEED]: '보완 필요',
    [ST_MISS]: '못 찾음',
    [ST_OCR]: '자동판독 후보',
    [ST_NA]: '해당없음',
    '기준자료로 사용 중': '기준자료로 사용 중',
    '선택 구비서류': '선택 구비서류',
    '쪽수 정리': '쪽수 정리',
    '자동 판독 어려움': '자동 판독 어려움',
    '추천 페이지': '자동판독 후보',
    '이미지 서류 포함': '자동판독 후보',
    '스캔본으로 보임': '자동판독 후보',
    '텍스트 부족': '자동판독 후보'
  };
  return map[status] || status || '대기';
}
function statusBadge(status) {
  const map = {
    [ST_OK]: 'ok', [ST_SUBMIT]: 'blue', [ST_DIRECT]: 'lavender', [ST_NEED]: 'orange', [ST_MISS]: 'bad', [ST_OCR]: 'grayblue', [ST_NA]: 'gray',
    '확인': 'ok', '확인필요': 'warn', '출발전제출': 'purple', '기준자료없음': 'gray', '차량번호없음': 'bad',
    '기준자료로 사용 중': 'blue', '선택 구비서류': 'gray'
  };
  const help = status === ST_OCR ? '자동판독 후보가 있어요. 해당 페이지에서 담당자가 직접 확인해주세요.' : '';
  return `<span class="status-badge ${map[status] || 'gray'}"${help ? ` title="${escapeHtml(help)}"` : ''}>${escapeHtml(displayStatus(status))}</span>`;
}

function dashboardStatusBadge(status) {
  if (status === ST_DIRECT) {
    return '<span class="status-badge lavender" title="담당자가 원본 또는 제출파일을 직접 확인해야 합니다.">담당자 확인필요</span>';
  }
  return statusBadge(status);
}

function shortStatus(status) {
  if (status === ST_OK || status === ST_SUBMIT) return '제출 확인됨';
  if (status === ST_SUBMIT) return '제출확인';
  if (status === ST_DIRECT) return '담당자확인';
  if (status === ST_OCR) return '자동판독후보';
  if (status === ST_NEED) return '보완';
  if (status === ST_MISS) return '못 찾음';
  return displayStatus(status);
}

function renderSummary(startDate, endDate) {
  const el = $('#summaryContent');
  if (!el) return;
  const vTotal = state.vehicleRows.length;
  const vehOk = state.vehicleRows.filter(r => r.finalStatus === ST_OK).length;
  const vehNeed = state.vehicleRows.filter(r => r.finalStatus === ST_NEED || r.finalStatus === ST_MISS).length;
  const vehDirect = state.vehicleRows.filter(r => r.finalStatus === ST_DIRECT || r.finalStatus === ST_OCR).length;
  const textDone = state.docAnalyses.filter(a => a.textStatus === '텍스트 분석 완료').length;
  const ocrNeedPages = state.docAnalyses.reduce((n, a) => n + ((a.pageDiagnostics || []).filter(p => p.ocrStatus === 'needed').length || (a.needsOcr ? 1 : 0)), 0);
  const agency = $('#companyName')?.value || '';
  const event = $('#eventName')?.value || '';
  const periodText = `${startDate || '-'}${endDate ? ` ~ ${endDate}` : ''}`;
  const action = ocrNeedPages ? `원본 확인 필요 ${ocrNeedPages}쪽` : vehNeed ? `보완 필요 ${vehNeed}대` : vehDirect ? `담당자 확인 ${vehDirect}대` : '주요 서류 정리 완료';
  el.innerHTML = `
    <div class="summary-compact summary-slim">
      <div class="summary-compact-main">
        <strong>${escapeHtml(action)}</strong>
        <span>제출파일 ${state.docAnalyses.length}개 · 배정차량 ${vTotal}대 · 이용기간 ${escapeHtml(periodText)}${agency ? ' · ' + escapeHtml(agency) : ''}${event ? ' · ' + escapeHtml(event) : ''}</span>
      </div>
    </div>`;
}

function isAttentionStatus(status) {
  return [ST_NEED, ST_MISS, ST_DIRECT, ST_OCR].includes(status);
}

function renderPriorityItems() {
  const el = $('#priorityItemsContent');
  if (!el) return;
  const items = [];
  state.companyRows.forEach(r => { if (isAttentionStatus(r.status)) items.push({ title: r.item, status: r.status, detail: r.detail || r.action || '' }); });
  const docIssueCounts = {
    insurance: 0, registration: 0, safety: 0, precheck: 0
  };
  state.vehicleRows.forEach(r => {
    if (isAttentionStatus(r.insurance.status)) docIssueCounts.insurance++;
    if (isAttentionStatus(r.regLedger.status)) docIssueCounts.registration++;
    if (isAttentionStatus(r.safety.status)) docIssueCounts.safety++;
    if (isAttentionStatus(r.preCheck.status)) docIssueCounts.precheck++;
  });
  if (docIssueCounts.insurance) items.unshift({ title: `보험서류 ${docIssueCounts.insurance}건`, status: ST_DIRECT, detail: '차량별 보험기간 또는 담보내용 확인이 필요합니다.' });
  if (docIssueCounts.registration) items.unshift({ title: `차량등록서류 ${docIssueCounts.registration}건`, status: ST_DIRECT, detail: '자동차등록원부 확인이 필요합니다.' });
  if (docIssueCounts.safety) items.unshift({ title: `교통안전정보 조회결과 ${docIssueCounts.safety}건`, status: ST_DIRECT, detail: '검사유효기간 또는 종합결과 확인이 필요합니다.' });
  if (docIssueCounts.precheck) items.unshift({ title: `출발 전 점검표 ${docIssueCounts.precheck}건`, status: ST_DIRECT, detail: '차량별 점검표 제출 여부 확인이 필요합니다.' });
  if (!items.length) {
    el.innerHTML = `<div class="priority-empty">현재 먼저 확인할 보완 필요 항목이 없어요. 그래도 원본 서류는 담당자가 최종 확인하세요.</div>`;
    return;
  }
  el.innerHTML = `<div class="priority-list">${items.slice(0, 8).map(x => `<div class="priority-item"><div>${statusBadge(x.status)}</div><div><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.detail)}</p></div></div>`).join('')}</div>`;
}

function docRowStatus(key) {
  const r = state.docRows.find(x => x.key === key);
  return r ? r.status : ST_MISS;
}
function companyRowStatus(key) {
  const r = state.companyRows.find(x => x.key === key);
  return r ? r.status : ST_MISS;
}
function combinedVehicleStatus(selector) {
  if (!state.vehicleRows.length) return ST_DIRECT;
  const statuses = state.vehicleRows.map(selector);
  if (statuses.some(s => s === ST_NEED || s === ST_MISS)) return ST_NEED;
  if (statuses.some(s => s === ST_OCR)) return ST_OCR;
  if (statuses.some(s => s === ST_DIRECT)) return ST_DIRECT;
  if (statuses.some(s => s === ST_SUBMIT)) return ST_SUBMIT;
  return ST_OK;
}
function formatPageList(pages) {
  const nums = [...new Set((pages || []).map(Number).filter(Boolean))].sort((a, b) => a - b);
  if (!nums.length) return '';
  const ranges = [];
  let start = nums[0], prev = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    const n = nums[i];
    if (n === prev + 1) { prev = n; continue; }
    ranges.push(start === prev ? String(start) : `${start}~${prev}`);
    start = prev = n;
  }
  return ranges.join(', ');
}

function sourceLocationsByType() {
  const grouped = {};
  state.docAnalyses.forEach(a => {
    (a.pageDiagnostics || []).forEach(p => {
      const cand = (p.documentTypeCandidates || []).filter(type => scoreDocumentMatch(type, a, p.textPreview || analysisText(a)) >= 60);
      cand.forEach(type => {
        if (!grouped[type]) grouped[type] = {};
        if (!grouped[type][a.name]) grouped[type][a.name] = [];
        grouped[type][a.name].push(p.pageNumber);
      });
    });
    if (a.type && a.type !== 'unknown' && scoreDocumentMatch(a.type, a, analysisText(a)) >= 60) {
      grouped[a.type] = grouped[a.type] || {};
      if (!grouped[a.type][a.name]) grouped[a.type][a.name] = [];
      const pages = (a.pageDiagnostics || []).map(p => p.pageNumber).slice(0, 3);
      grouped[a.type][a.name] = pages.length ? pages : [];
    }
  });
  return grouped;
}

function renderSourceLocations() {
  const el = $('#sourceLocationContent');
  if (!el) return;
  const grouped = sourceLocationsByType();
  const order = ['registrationLedger','transport','businessRegistration','insurance','safetyReport','preCheck','pledge','directProd'];
  const cards = [];
  order.forEach(type => {
    const files = grouped[type];
    if (!files) return;
    const locations = Object.entries(files).map(([name, pages]) => `${escapeHtml(name)} ${formatPageList(pages) ? `${formatPageList(pages)}쪽` : '파일 전체'}`).join('<br>');
    const status = ['insurance','safetyReport'].includes(type) ? '확인됨 또는 후보' : '후보 · 담당자가 직접 확인해주세요';
    cards.push(`<div class="source-card"><div class="source-card-head"><strong>${escapeHtml(docTypeLabel(type))}</strong>${statusBadge(['insurance','safetyReport'].includes(type) ? ST_SUBMIT : ST_DIRECT)}</div><div class="source-loc">${locations}</div><p class="source-help">해당 위치에서 ${sourceCheckGuide(type)} 확인해주세요.</p></div>`);
  });
  if (!cards.length) {
    el.innerHTML = '<div class="empty-row">페이지 추천가 아직 없습니다. 콕검을 실행하면 표시됩니다.</div>';
    return;
  }
  el.innerHTML = cards.join('');
}

function sourceCheckGuide(type) {
  return {
    registrationLedger: '차량번호·소유자·사용본거지·압류/저당 등 권리관계를',
    transport: '업체명과 전세버스 운송사업 관련 문구를',
    businessRegistration: '업체명·사업자등록번호·업태/종목을',
    insurance: '차량번호·계약기간·담보내용을',
    safetyReport: '차량번호·운전자명·종합의견/종합결과·검사만료일을',
    preCheck: '차량번호와 적합/실시 표시를',
    pledge: '직영차량 운행 확약 문구와 직인을',
    directProd: '업체명·유효기간·세부품명을'
  }[type] || '필요 항목을';
}

function attentionRank(status) {
  return {
    [ST_NEED]: 1,
    [ST_DIRECT]: 2,
    [ST_OCR]: 3,
    [ST_MISS]: 4,
    [ST_SUBMIT]: 5,
    [ST_OK]: 6,
    [ST_NA]: 7
  }[status] || 9;
}

function bestLocationFor(key) {
  const docs = analysesByType(key).filter(a => scoreDocumentMatch(key, a, analysisText(a)) >= 60);
  const fromDocs = docs.length ? docsLocationText(docs, key) : '';
  const fromCandidates = candidateLocationText(key);
  return fromDocs || fromCandidates || '';
}

function requiredItem({ group, name, status, location, check, action }) {
  const safeLocation = status === ST_MISS ? '확인된 위치 없음' : (location || '확인된 위치 없음');
  return { group, name, status, location: cleanLocationText(safeLocation), check, action };
}

function cleanLocationText(text) {
  return String(text || '')
    .replace(/\.pdf\s+PDF\s+/gi, '.pdf ')
    .replace(/\bPDF\s+(\d)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function requiredStatusText(status) {
  return displayStatus(status);
}

function locationShort(location) {
  const t = cleanLocationText(location || '');
  if (!t || t === '확인된 위치 없음' || t === '확인된 위치 없음') return '';
  return t.length > 42 ? t.slice(0, 41) + '…' : t;
}

function makeRequiredRequestPhrase(item) {
  const name = item.name;
  if (item.status === ST_OK || item.status === ST_SUBMIT || item.status === ST_NA) return '보완요청 문구 없음';
  if (item.status === ST_MISS) return `${name}이 제출파일에서 확인되지 않아요. ${item.check} 확인을 위해 해당 서류 제출을 요청드립니다.`;
  if (item.status === ST_OCR) return `${name}은 제출파일 내 추천 페이지가 있으나 원본 확인이 필요해요. ${item.check} 항목이 보이도록 원본 또는 선명한 파일을 확인해주세요.`;
  if (item.status === ST_DIRECT) return `${name}은 담당자 확인이 필요해요. ${item.check} 항목을 확인할 수 있도록 원본 또는 제출파일을 확인해주세요.`;
  return `${name} 관련 보완이 필요해요. ${item.action || item.check} 내용을 확인해주세요.`;
}

function copyRequiredRequest(index) {
  const txt = state.requiredRequests?.[index] || '';
  if (!txt || txt === '보완요청 문구 없음') {
    showToast('복사할 보완요청 문구가 없어요.', 'warn');
    return;
  }
  navigator.clipboard?.writeText(txt).then(() => showToast('보완요청 문구를 복사했어요.', 'success')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('보완요청 문구를 복사했어요.', 'success');
  });
}
window.copyRequiredRequest = copyRequiredRequest;


function missingLocationText(value) {
  const text = String(value || '').trim();
  if (!text || text === '확인된 위치 없음' || text === '출처 없음') {
    return '제출된 파일에서 위치를 찾지 못했어요.';
  }
  return text;
}


function renderOcrAssistBox(rows) {
  const targets = getOcrTargets();
  const needsReview = (rows || []).some(r => [ST_MISS, ST_OCR].includes(r.status));
  const assist = state.ocrAssist || {};
  if (!needsReview && !targets.length && !assist.running && !assist.done) return '';

  const total = assist.total || targets.length;
  const current = assist.current || 0;
  const pct = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const message = assist.message || '못 찾은 서류가 있으면 스캔본을 한 번 더 확인해요.';
  const disabled = assist.running || !targets.length;
  const buttonText = assist.running ? '자동판독 중...' : (targets.length ? '자동판독 보완하기' : '자동판독 보완 없음');
  const resultLine = assist.done
    ? `<p class="ocr-assist-result">${escapeHtml(message)}</p>`
    : `<p class="ocr-assist-desc">못 찾은 서류가 있으면 스캔본을 한 번 더 확인해요. 시간이 조금 걸릴 수 있습니다.</p>`;

  return `<div id="ocrAssistBox" class="ocr-assist-box${assist.running ? ' is-running' : ''}${assist.done ? ' is-done' : ''}">
    <div class="ocr-assist-copy">
      <strong>자동판독 보완</strong>
      ${resultLine}
      <span class="ocr-assist-time">예상 30초~1분</span>
    </div>
    <div class="ocr-assist-side">
      <button class="ghost-btn ocr-assist-btn" type="button" onclick="runOcrForNeeded()" ${disabled ? 'disabled' : ''}>${escapeHtml(buttonText)}</button>
      ${assist.running ? `<div class="ocr-assist-progress" aria-label="자동판독 진행률"><span style="width:${pct}%"></span></div><small>${current}/${total}개 파일 확인 중</small>` : ''}
    </div>
  </div>`;
}

function renderOcrAssistPanel() {
  const el = $('#ocrAssistContent');
  const panel = $('#ocrAssistPanel');
  if (!el || !panel) return;
  const rows = [...(state.docRows || []), ...(state.companyRows || [])];
  const html = renderOcrAssistBox(rows);
  el.innerHTML = html;
  panel.classList.toggle('hidden', !html);
}


function assignedVehicleSourceLocation() {
  const names = (state.assignFiles || []).map(f => f?.name).filter(Boolean);
  if (names.length) return names.join(', ');
  if (state.assignedVehicles?.length) return `사용자 입력 기준자료 · ${state.assignedVehicles.length}대`;
  return '사용자 입력 기준자료';
}

function renderRequiredChecklist() {
  const el = $('#requiredDocsContent');
  if (!el) return;
  const priceVal = parsePrice($('#estimatedPrice')?.value || '0');
  const directProdStatus = priceVal >= 10000000 ? companyRowStatus('directProd') : (priceVal > 0 ? ST_NA : ST_DIRECT);
  const rows = [
    requiredItem({ group:'계약조건별 서류', name:'직접생산확인증명서', status:directProdStatus, location:bestLocationFor('directProd'), check:'업체명 · 유효기간 · 세부품명 · 기타도로여객운송서비스', action:priceVal >= 10000000 ? '추정가격 1천만원 이상 시 제출 여부와 세부품명을 확인해 주세요.' : (priceVal > 0 ? `추정가격 ${formatPrice(priceVal)}원 기준 현재 조건에서는 필수 아님` : '추정가격을 입력한 뒤 필요 여부를 확인해주세요.') }),
    requiredItem({ group:'업체 확인 서류', name:'여객자동차 운송사업등록증', status:docRowStatus('transport'), location:bestLocationFor('transport'), check:'업체명 · 전세버스 운송사업 관련 문구 · 등록번호', action:'운송업체 자격과 계약 업체명이 일치하는지 확인해 주세요.' }),
    requiredItem({ group:'업체 확인 서류', name:'사업자등록증', status:companyRowStatus('businessRegistration'), location:bestLocationFor('businessRegistration'), check:'사업자등록번호 · 상호/법인명 · 대표자 · 업태/종목', action:'계약 업체명과 사업자 정보가 일치하는지 확인해 주세요.' }),
    requiredItem({ group:'업체 확인 서류', name:'직영차량 운행각서', status:companyRowStatus('pledge'), location:bestLocationFor('pledge'), check:'직영차량 운행 확약 문구 · 업체명 · 대표자 · 직인', action:'붙임서류로 자동차등록원부와 교통안전정보 조회결과서가 함께 제출되었는지 확인해 주세요.' }),
    requiredItem({ group:'차량검토 기준자료', name:'차량 및 운전기사 배정 현황표', status:'기준자료로 사용 중', location:assignedVehicleSourceLocation(), check:'차량번호 · 운전자명 · 운행일자 · 배차 정보', action:'차량별 체크의 기준자료로 사용해 주세요.' }),
    requiredItem({ group:'차량검토 기준자료', name:'차량보유 현황표', status:'선택 구비서류', location:'제출된 경우 참고합니다.', check:'업체 보유 차량번호 · 차량 수 · 차량 정보', action:'선택 구비서류이므로 제출된 경우 참고자료로 확인해 주세요.' }),
    requiredItem({ group:'차량별 필수서류', name:'자동차등록원부', status:combinedVehicleStatus(r => r.regLedger.status), location:bestLocationFor('registrationLedger'), check:'차량번호 · 소유자 · 사용본거지 · 압류/저당 등 권리관계', action:'배차표의 차량번호와 원부의 차량번호가 같은지 먼저 확인해 주세요. 소유자와 사용본거지도 함께 보고, 압류·저당 표시가 있으면 원본 서류를 한 번 더 확인해 주세요.' }),
    requiredItem({ group:'차량별 필수서류', name:'자동차 종합보험 가입증명서', status:combinedVehicleStatus(r => r.insurance.status), location:bestLocationFor('insurance'), check:'종합보험 가입 여부 · 보험기간 · 차량번호', action:'보험기간이 버스 이용기간을 포함하는지 확인해 주세요. 출발일과 돌아오는 날이 보험기간 안에 들어가면 됩니다.' }),
    requiredItem({ group:'차량별 필수서류', name:'전세버스 교통안전정보 조회결과 통보서', status:combinedVehicleStatus(r => r.safety.status), location:bestLocationFor('safetyReport'), check:'차량번호 · 운전자명 · 종합의견/종합결과 · 검사만료일', action:'배차표의 차량번호와 운전자명이 통보서 내용과 같은지 확인해 주세요. 종합결과나 종합의견에 이상 문구가 있으면 업체에 먼저 확인해 주세요.' }),
    requiredItem({ group:'차량별 필수서류', name:'출발 전 교육 및 차량안전점검표', status:combinedVehicleStatus(r => r.preCheck.status), location:bestLocationFor('preCheck'), check:'출발 전 교육 여부 · 차량안전점검표 제출 여부 · 점검 항목', action:'출발 전에 교육과 차량안전점검표가 실제로 작성·제출됐는지 확인해 주세요. 누락되어 있으면 업체에 보완을 요청하면 됩니다.' }),
  ];
  state.requiredRequests = rows.map(makeRequiredRequestPhrase);

  const groups = ['계약조건별 서류', '업체 확인 서류', '차량검토 기준자료', '차량별 필수서류'];
  const groupMeta = {
    '계약조건별 서류': { cls:'contract', desc:'추정가격과 계약 조건에 따라 필요한 증빙을 확인합니다.' },
    '업체 확인 서류': { cls:'company', desc:'운송업체 자격, 사업자 정보, 직영차량 운행 확약을 확인합니다.' },
    '차량검토 기준자료': { cls:'foundation', desc:'차량별 검토를 시작하기 위한 기준표와 선택 구비서류입니다.' },
    '차량별 필수서류': { cls:'vehicle', desc:'차량별로 실제 대조해야 하는 필수서류를 확인합니다.' }
  };

  const itemHtml = (r, idx) => {
    const location = missingLocationText(r.location || '');
    return `<details class="checklist-doc-item status-${statusClass(r.status)}">
      <summary class="checklist-doc-summary">
        <label class="check-box-label" onclick="event.stopPropagation();">
          <input type="checkbox" aria-label="${escapeHtml(r.name)} 확인">
          <span class="checkmark-text"><strong>${escapeHtml(r.name)}</strong>${statusBadge(r.status)}</span>
        </label>
        <span class="checklist-doc-actions">
          <span class="detail-link" aria-label="펼치기">▾</span>
        </span>
      </summary>
      <div class="required-doc-tree compact-tree">
        <div class="tree-row"><span class="question-tag">이 서류는 어디에 있나요?</span><p>${escapeHtml(location)}</p></div>
        <div class="tree-row"><span class="question-tag">이 서류에서 뭘 봐야 하나요?</span><p>${escapeHtml(r.check)}</p></div>
        <div class="tree-row"><span class="question-tag">담당자는 뭘 하면 되나요?</span><p>${escapeHtml(r.action)}</p></div>
      </div>
    </details>`;
  };

  const groupedDocs = groups.map((group, groupIdx) => {
    const meta = groupMeta[group];
    const groupRows = rows.map((r, idx) => ({ r, idx })).filter(x => x.r.group === group);
    return `<details class="required-group-block checklist-group group-${meta.cls}" open>
      <summary class="required-group-head checklist-group-head">
        <div>
          <h3><span class="required-group-num">${String(groupIdx + 1).padStart(2, '0')}</span> ${escapeHtml(group)}</h3>
          <p>${escapeHtml(meta.desc)}</p>
        </div>
        <span class="group-count">${groupRows.length}개</span>
      </summary>
      <div class="required-lines checklist-lines">
        ${groupRows.map(x => itemHtml(x.r, x.idx)).join('')}
      </div>
    </details>`;
  }).join('');

  el.innerHTML = `
    <div class="checklist-section-block doc-type-check-block">
      <div class="checklist-block-head">
        <div>
          <h3>서류종류 체크</h3>
          <p>이번 계약에서 필요한 서류 종류를 먼저 확인합니다.</p>
        </div>
      </div>
      <div class="required-groups checklist-required-groups">
        ${groupedDocs}
      </div>
    </div>
    <details class="checklist-section-block vehicle-check-block">
      <summary class="checklist-block-head vehicle-check-summary">
        <div>
          <h3>차량별 체크</h3>
          <p>배정차량별로 차량번호와 운전자까지 확인합니다.</p>
        </div>
        <span class="group-count">${state.vehicleRows.length}대</span>
      </summary>
      <div class="nested-vehicle-checklist">
        ${renderNestedVehicleChecklist()}
      </div>
    </details>`;
}

function renderNestedVehicleChecklist() {
  if (!state.vehicleRows.length) {
    return '<div class="empty-row">배정차량 리스트가 없어 차량별 체크리스트를 만들지 못했습니다.</div>';
  }
  return state.vehicleRows.map((r, i) => {
    const driver = (r.driver || '').trim() || '운전자 미확인';
    return `<details class="vehicle-check-card" ${i === 0 ? 'open' : ''}>
      <summary class="vehicle-check-card-head">
        <div class="vehicle-card-titleline">
          <strong class="vehicle-card-hocha">${escapeHtml(r.hocha || `${i + 1}호차`)}</strong>
          <span class="vehicle-card-vno">${escapeHtml(r.vno || r.vehicleNo || '')}</span>
          <span class="vehicle-card-driver">운전자 ${escapeHtml(driver)}</span>
        </div>
        ${statusBadge(r.finalStatus)}
      </summary>
      <div class="vehicle-check-rows">
        <div class="vehicle-check-title-row" aria-hidden="true">
          <span></span>
          <span>서류</span>
          <span>담당자 확인 기준</span>
          <span>관련 위치</span>
        </div>
        ${vehicleCheckLine('자동차등록원부', r.regLedger, '소유자 · 직영 여부 · 권리관계')}
        ${vehicleCheckLine('종합보험 가입 확인서류', r.insurance, '종합보험 가입 여부 · 보험기간 · 차량번호')}
        ${vehicleCheckLine('교통안전정보 조회결과', r.safety, `차량번호 · 운전자 ${driver} · 종합의견 이상 여부`)}
        ${vehicleCheckLine('출발 전 점검표', r.preCheck, '출발 전 교육 · 차량안전점검표 제출')}
      </div>
    </details>`;
  }).join('');
}

function vehicleCheckLine(title, data, helpText) {
  const location = vehicleLocationText(data);
  const sourceLine = location === missingLocationText('') ? '관련 위치 없음' : location;
  return `<label class="vehicle-check-line">
    <input type="checkbox" aria-label="${escapeHtml(title)}">
    <span class="vehicle-check-title">${escapeHtml(title)} ${statusBadge(data?.status)}</span>
    <span class="vehicle-check-help">${escapeHtml(helpText)}</span>
    <span class="vehicle-check-location">${escapeHtml(sourceLine)}</span>
  </label>`;
}

function statusClass(status) {
  if (status === ST_OK) return 'ok';
  if (status === ST_SUBMIT) return 'submit';
  if (status === ST_DIRECT) return 'direct';
  if (status === ST_NEED) return 'need';
  if (status === ST_MISS) return 'miss';
  if (status === ST_OCR) return 'source';
  return 'na';
}

function formatPrice(n) {
  return Number(n || 0).toLocaleString('ko-KR');
}

function renderDocumentStatus() {
  const tbody = $('#docStatusTbody');
  if (!tbody) return;
  const analyses = state.docAnalyses || [];
  if (!analyses.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-row">업로드한 제출파일이 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = analyses.map(a => {
    const candidateTypes = [...new Set((a.pageDiagnostics || []).flatMap(p => p.documentTypeCandidates || []))];
    const candidateLabels = candidateTypes.length ? candidateTypes.map(docTypeLabel).slice(0, 3) : [docTypeLabel(a.type)];
    const filteredCandidates = candidateLabels.map(v => String(v || '').replace('서류종류 후보 없음', '후보 없음')).filter(Boolean);
    const candidate = filteredCandidates.length ? filteredCandidates : ['후보 없음'];
    return `<tr>
      <td class="doc-name-cell" title="${escapeHtml(a.name)}"><strong>${escapeHtml(a.name)}</strong><div class="mini-detail">${escapeHtml(formatBytes(a.file?.size || 0))}</div></td>
      <td class="doc-candidate-cell">${candidate.map(v => `<span>${escapeHtml(v)}</span>`).join('')}</td>
      <td class="doc-page-cell">${documentPageCellHtml(a)}</td>
    </tr>`;
  }).join('');
}

function documentPageCellHtml(a) {
  const pages = (a.pageDiagnostics || []).filter(p => p.ocrStatus === 'needed' || (p.documentTypeCandidates || []).length);
  if (!pages.length) {
    return '<span class="page-empty-text">관련 페이지 없음</span>';
  }
  const pageNumbers = pages.map(p => p.pageNumber);
  const pdfText = `PDF ${formatPageList(pageNumbers)}쪽`;
  const imagePages = pages.filter(p => p.ocrStatus === 'needed').map(p => p.pageNumber);
  const guideText = imagePages.length ? `추천 페이지 › 이미지 ${formatPageList(imagePages)}쪽` : '관련 페이지 확인됨';
  return `<div class="doc-page-wrap"><span class="doc-page-pill">${escapeHtml(pdfText)}</span><span class="doc-page-guide">${escapeHtml(guideText)}</span></div>`;
}

function renderCompanySummary() {
  const tbody = $('#companySummaryTbody');
  if (!tbody) return;
  tbody.innerHTML = state.companyRows.map(r => `<tr><td class="doc-name-cell">${escapeHtml(r.item)}</td><td>${statusBadge(r.status)}</td><td class="detail-cell">${escapeHtml(r.detail)}</td></tr>`).join('');
}

function renderVehicleMatches() {
  const tbody = $('#vehicleMatchTbody');
  if (!tbody) return;
  if (!state.vehicleRows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">배정차량 리스트가 없어 차량별 확인표를 만들지 못했습니다.</td></tr>`;
    return;
  }
  const rows = state.vehicleRows.map((r, i) => ({ r, i }));
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">선택한 필터에 해당하는 차량이 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(({ r, i }) => {
    const rowClass = r.finalStatus === ST_OK ? 'ok' : 'needs-check';
    return `<tr class="vrow-${rowClass} vehicle-main-row" onclick="toggleVehicleDetail(${i})">
      <td>${escapeHtml(r.hocha || '')}</td>
      <td class="vno-cell"><strong>${escapeHtml(r.vno || r.vehicleNo || '')}</strong></td>
      <td>${statusBadge(r.insurance.status)}<div class="mini-detail">${escapeHtml(shortInsurance(r.insurance))}</div></td>
      <td>${statusBadge(r.regLedger.status)}<div class="mini-detail">${escapeHtml(shortRegistration(r.regLedger, '원부'))}</div></td>
      <td>${statusBadge(r.safety.status)}<div class="mini-detail">${escapeHtml(shortSafety(r.safety))}</div></td>
      <td>${statusBadge(r.preCheck.status)}<div class="mini-detail">${escapeHtml(shortPreCheck(r.preCheck))}</div></td>
      <td>${statusBadge(r.finalStatus)}<div class="mini-detail">상세보기 ▾</div></td>
    </tr><tr id="vehicleDetail-${i}" class="vehicle-detail-row hidden"><td colspan="7">${vehicleDetailHtml(r)}</td></tr>`;
  }).join('');
}

function regCombinedStatus(r) {
  if (r.regLedger.status === ST_OK) return ST_OK;
  if (r.regLedger.status === ST_OCR) return ST_OCR;
  if (r.regLedger.status === ST_DIRECT) return ST_DIRECT;
  return ST_NEED;
}

function shortInsurance(x) { return x.period ? '계약기간 OK' : (x.status === ST_OCR ? '관련 페이지 확인' : (x.status === ST_MISS ? '제출 여부 확인' : '계약기간 확인 필요')); }
function shortRegistration(x, label) { return x.status === ST_OCR ? `${label} 관련 페이지` : (x.status === ST_MISS ? `${label} 못 찾음` : (x.inspection ? `기간/권리관계 후보 ${x.inspection}` : '차량 소유·권리관계 확인')); }
function shortSafety(x) { return x.expiry ? `검사 ${x.expiry}` : (x.status === ST_OCR ? '관련 페이지 확인' : (x.status === ST_MISS ? '제출 여부 확인' : '검사유효기간 확인 필요')); }
function shortPreCheck(x) { return x.status === ST_SUBMIT ? '점검표 제출됨' : (x.status === ST_OCR ? '관련 페이지 확인' : '제출 여부 확인'); }

function vehicleDetailHtml(r) {
  return `<div class="vehicle-checklist-panel">
    <div class="vehicle-checklist-head">
      <strong>차량별 체크리스트</strong>
      <span>상태를 보면서 원본 서류를 직접 체크하세요.</span>
    </div>
    <div class="detail-card-grid checklist-grid">
      ${detailBlock('자동차등록원부', r.regLedger, ['owner','inspection','stamp'])}
      ${detailBlock('종합보험 가입 확인서류', r.insurance, ['period','coverage'])}
      ${detailBlock('교통안전정보 조회결과', r.safety, ['expiry','result','driver'])}
      ${detailBlock('출발 전 점검표', r.preCheck, ['result'])}
    </div>
  </div>`;
}

function detailBlock(title, data, keys) {
  const sources = vehicleLocationText(data);
  const items = vehicleChecklistItems(title, data, keys);
  const sourceLine = sources === missingLocationText('') ? '위치 후보 없음' : sources;
  return `<div class="vehicle-detail-card checklist-card">
    <h4><span>${escapeHtml(title)}</span> ${statusBadge(data.status)}</h4>
    <div class="checklist-location"><span>서류 위치</span><p>${escapeHtml(sourceLine)}</p></div>
    <div class="checklist-items">
      ${items.map(item => `<label class="checkline"><input type="checkbox" aria-label="${escapeHtml(title + ' ' + item)}"><span>${escapeHtml(item)}</span></label>`).join('')}
    </div>
  </div>`;
}

function vehicleChecklistItems(title, data, keys) {
  const items = [];
  const add = v => { if (v && !items.includes(v)) items.push(v); };
  if (!data || data.status === ST_MISS) add(`${title} 제출 여부 확인`);
  if (title === '보험') {
    add('차량번호 일치 확인');
    add('보험기간이 버스 이용기간을 포함하는지 확인');
    add('담보내용 확인');
  } else if (title === '자동차등록원부') {
    add('차량번호 일치 확인');
    add('소유자·사용본거지 확인');
    add('압류·저당 등 권리관계 참고 확인');
  } else if (title === '전세버스' || title.includes('교통안전정보')) {
    add('자동차검사 만료일 확인');
    add('종합결과 확인');
    add('운전자 관련 항목 확인');
  } else if (title === '출발 전 점검표' || title === '출발전 점검표') {
    add('차량번호 확인');
    add('적합/실시 표시 확인');
    add('서명 또는 직인 확인');
  }
  if (data?.status === ST_OCR) add('관련 페이지에서 직접 확인');
  if (data?.status === ST_DIRECT) add('담당자가 원본에서 직접 확인');
  if (data?.status === ST_NEED) add('보완 필요 여부 확인');
  return items;
}

function vehicleLocationText(data) {
  const list = Array.isArray(data?.sources) ? data.sources.filter(Boolean) : [];
  if (!list.length) return missingLocationText('');
  const first = list[0];
  if (data?.status === ST_OCR && list.length > 1) return `${first} 외 ${list.length - 1}건`;
  return list.join(', ');
}

function vehicleTaskText(title, data) {
  if (!data || data.status === ST_MISS) return `${title} 제출 여부를 확인해주세요.`;
  if (data.status === ST_OCR) return `관련 페이지에서 ${title} 내용을 확인해주세요.`;
  if (data.status === ST_DIRECT) return `${title}은 담당자가 직접 확인해주세요.`;
  if (data.status === ST_NEED) return `${title} 관련 보완이 필요한지 확인해주세요.`;
  if (data.status === ST_OK || data.status === ST_SUBMIT) return `제출된 위치에서 ${title} 내용을 최종 확인해주세요.`;
  return `${title} 원본 서류를 확인해주세요.`;
}

function vehicleRequestText(title, data) {
  if (!data || data.status === ST_MISS) return `${title}이 제출파일에서 확인되지 않아요. 해당 서류 제출 여부를 확인해주세요.`;
  if (data.status === ST_NEED) return `${title} 관련 보완이 필요해요. 확인 가능한 서류를 제출해주세요.`;
  if (data.status === ST_OCR) return `${title} 관련 페이지를 확인해주세요.`;
  if (data.status === ST_DIRECT) return `${title}은 담당자 확인이 필요해요. 원본 또는 제출파일을 확인해주세요.`;
  return '보완요청 문구 없음';
}
function labelFor(k, title = '') {
  if (k === 'result' && String(title).includes('점검')) return '점검표 표시';
  return { period:'계약기간', coverage:'담보내용', inspection:'검사유효기간', stamp:'번호판 회수 스탬프 제외', expiry:'자동차검사 만료일', result:'종합결과', driver:'운전자 항목' }[k] || k;
}


function syncRequiredToggleLabel(detailsEl) {
  const btn = detailsEl?.querySelector?.('.required-toggle');
  if (btn) btn.textContent = detailsEl.open ? '▴' : (detailsEl.dataset.toggleLabel || '▾');
}
window.syncRequiredToggleLabel = syncRequiredToggleLabel;

function expandAllRequiredDocs() { $$('#requiredDocsContent .required-doc-item').forEach(d => { d.open = true; syncRequiredToggleLabel(d); }); }
function collapseAllRequiredDocs() { $$('#requiredDocsContent .required-doc-item').forEach(d => { d.open = false; syncRequiredToggleLabel(d); }); }
window.expandAllRequiredDocs = expandAllRequiredDocs;
window.collapseAllRequiredDocs = collapseAllRequiredDocs;

function toggleVehicleDetail(i) { document.getElementById(`vehicleDetail-${i}`)?.classList.toggle('hidden'); }
function expandAllDetails() { $$('.vehicle-detail-row').forEach(r => r.classList.remove('hidden')); }
function collapseAllDetails() { $$('.vehicle-detail-row').forEach(r => r.classList.add('hidden')); }
function setVehicleFilter(filter) {
  state.vehicleFilter = filter;
  $$('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  renderVehicleMatches();
}
function updateAnalysisActionBar() {
  const btn = $('#actionOcrNeededBtn');
  if (!btn) return;
  const count = state.docAnalyses.filter(a => a.needsOcr || (a.pageDiagnostics || []).some(p => p.ocrStatus === 'needed')).length;
  btn.disabled = !count;
  btn.textContent = count ? `자동판독 보완 (${count})` : '자동판독 보완 없음';
}

function showResultSections() {
  $('#step6')?.classList.remove('hidden');
  $('#notCheckedYet')?.classList.add('hidden');
  document.body.classList.add('has-results');
}

function refreshResultSidebar(activeId) {
  const links = $$('.result-side-link');
  if (!links.length) return;
  const ids = ['resultSummary','documentStatus','requiredDocs'];
  const current = activeId || ids.find(id => {
    const el = document.getElementById(id);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top <= 130 && r.bottom > 130;
  }) || 'resultSummary';
  links.forEach(link => {
    const id = link.dataset.target;
    const target = document.getElementById(id);
    const passed = target ? target.getBoundingClientRect().top < 90 : false;
    link.classList.toggle('active', id === current);
    link.classList.toggle('passed', passed && id !== current);
  });
}

function initResultSidebar() {
  $$('.result-side-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id = link.dataset.target;
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      refreshResultSidebar(id);
    });
  });
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { refreshResultSidebar(); ticking = false; });
  });
}

// ── 보완요청 ─────────────────────────────────────────────────
function generateAndShowSupplement() {
  const company = $('#companyName')?.value?.trim() || '';
  const startDate = $('#startDate')?.value || '';
  const endDate = $('#endDate')?.value || '';
  const event = $('#eventName')?.value?.trim() || '';
  const prefix = company ? `${company}에서 ` : '';
  const evStr = event ? ` (${event})` : '';
  const period = endDate ? `${startDate} ~ ${endDate}` : startDate;
  const lines = [
    `제출하신 전세버스 임차${evStr} 관련 서류를 검토한 결과, ${prefix}배정차량 리스트 기준으로 아래 사항의 확인 또는 보완이 필요합니다.`,
    `이용기간: ${period}`,
    '',
  ];
  let count = 1;
  [...state.docRows, ...state.companyRows]
    .filter(r => [ST_NEED, ST_MISS, ST_DIRECT, ST_OCR].includes(r.status))
    .forEach(r => {
      lines.push(`${count}. ${r.name || r.item}`);
      lines.push(`- ${r.detail}`);
      lines.push(`- 조치: ${r.action || '담당자 확인'}`);
      lines.push('');
      count++;
    });
  const vehicleIssues = state.vehicleRows.filter(r => r.finalStatus !== ST_OK);
  if (vehicleIssues.length) {
    lines.push('[차량별 확인 필요]');
    vehicleIssues.forEach(r => {
      const issues = [];
      if (r.insurance.status !== ST_OK) issues.push(`보험(${r.insurance.status})`);
      if (r.regLedger.status !== ST_OK) issues.push(`등록원부(${r.regLedger.status})`);
      if (r.safety.status !== ST_OK) issues.push(`교통안전정보(${r.safety.status})`);
      if (issues.length) lines.push(`- ${r.vno || r.vehicleNo}: ${issues.join(', ')}`);
    });
    lines.push('');
  }
  const ocrNeed = state.docAnalyses.filter(a => a.needsOcr && a.ocrStatus !== '쪽수 정리');
  if (ocrNeed.length) {
    lines.push('[쪽수 확인 가능 파일]');
    ocrNeed.forEach(a => lines.push(`- ${a.name}: 스캔본 또는 텍스트 부족으로 쪽수 확인 가능`));
    lines.push('');
  }
  lines.push('보완 서류는 출발일 전까지 제출해 주시면 감사하겠습니다.');
  lines.push('자동 분석 결과가 불확실한 항목은 담당자가 직접 확인할 예정입니다.');
  state.requestText = lines.join('\n');
  const ta = $('#requestText');
  if (ta) ta.value = state.requestText;
}

// ── 내보내기/복사 ─────────────────────────────────────────────
function exportCSV() {
  if (!state.checked) { showToast('먼저 콕검을 실행해주세요.', 'warn'); return; }

  const rows = [];
  const startDate = $('#startDate')?.value || '';
  const endDate = $('#endDate')?.value || '';
  const contractType = $('#contractType')?.value || '';
  const estimatedPrice = $('#estimatedPrice')?.value || '';
  const companyName = $('#companyName')?.value || '';
  const eventName = $('#eventName')?.value || '';

  const pushSection = (title) => {
    if (rows.length) rows.push([]);
    rows.push([title]);
  };
  const pushHeader = (...cols) => rows.push(cols);
  const companyRow = (key) => state.companyRows.find(r => r.key === key);
  const docRow = (key) => state.docRows.find(r => r.key === key);
  const staticRow = (item, status, detail) => ({ item, status, detail });

  rows.push(['버스콕검 결과']);
  rows.push(['업체명', companyName]);
  rows.push(['행사명', eventName]);
  rows.push(['출발일', startDate]);
  rows.push(['도착일', endDate]);

  pushSection('계약조건별');
  pushHeader('항목','상태','비고');
  const contractRows = [
    staticRow('이용기간', companyRow('period')?.status || (startDate ? '확인기준 설정' : '미입력'), companyRow('period')?.detail || (startDate ? `${startDate}${endDate ? ` ~ ${endDate}` : ''} 기준으로 확인합니다.` : '출발일을 입력해주세요.')),
    staticRow('계약방식', contractType || '미입력', contractType ? '직접생산확인증명서 필요 여부를 함께 확인하세요.' : '계약방식을 입력하면 판단이 쉬워집니다.'),
    staticRow('추정가격', estimatedPrice || '미입력', estimatedPrice ? '1천만원 기준 확인에 활용합니다.' : '추정가격을 입력하면 직접생산확인증명서 필요 여부 안내가 가능합니다.'),
    companyRow('directProd') || staticRow('직접생산확인증명서', '미확인', '관련 정보 없음')
  ];
  contractRows.forEach(r => rows.push([r.item || '', r.status || '', r.detail || '']));

  pushSection('업체확인서류');
  pushHeader('항목','상태','비고');
  [
    docRow('transport') || staticRow('여객자동차 운송사업등록증', '서류에서 못 찾음', '제출 여부를 확인해주세요.'),
    companyRow('businessRegistration') || staticRow('사업자등록증', '서류에서 못 찾음', '제출 여부를 확인해주세요.'),
    companyRow('pledge') || staticRow('직영차량 운행각서', '서류에서 못 찾음', '제출 여부를 확인해주세요.')
  ].forEach(r => rows.push([r.item || r.name || '', r.status || '', r.detail || '']));

  pushSection('차량검토서류');
  pushHeader('항목','상태','비고');
  [
    staticRow('차량 및 운전기사 배정 현황표', '기준자료로 사용 중', '차량번호·운전자명·운행일자를 차량별 검토 기준으로 사용합니다.'),
    staticRow('차량보유 현황표', '선택 구비서류', '제출된 경우 차량 보유 현황을 참고합니다.')
  ].forEach(r => rows.push([r.item, r.status, r.detail]));

  pushSection('차량별필수서류');
  pushHeader('호차','차량번호','운전자','보험','자동차등록원부','교통안전정보 조회결과','출발 전 점검표','최종');
  state.vehicleRows.forEach(r => rows.push([
    r.hocha || '',
    r.vno || r.vehicleNo || '',
    r.driver || '',
    r.insurance?.status || '',
    r.regLedger?.status || '',
    r.safety?.status || '',
    r.preCheck?.status || '',
    r.finalStatus || ''
  ]));

  const csv = '\uFEFF' + rows.map(r => r.map(c => `\"${String(c ?? '').replace(/\"/g,'\"\"')}\"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `버스콕검_${startDate || '결과'}_${VERSION}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function copyText(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.tagName === 'TEXTAREA' ? el.value : el.innerText).then(() => showToast('복사됐어요.', 'success'));
}
function copyResultTable() {
  if (!state.checked) return;
  const lines = [`=== 버스콕검 결과 ===`, `출발일: ${$('#startDate')?.value}`, ''];
  lines.push('[배정차량]');
  state.vehicleRows.forEach(r => lines.push(`${r.hocha} ${r.vno||r.vehicleNo} | 보험:${r.insurance.status} | 등록원부:${r.regLedger.status} | 안전정보:${r.safety.status} | 최종:${r.finalStatus}`));
  navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('결과표가 복사됐어요.', 'success'));
}

// ── 추정가격 ─────────────────────────────────────────────────
function parsePrice(raw) { return Number(String(raw || '').replace(/[^0-9]/g, '')) || 0; }
function formatPriceInput(el) {
  if (!el) return 0;
  const raw = String(el.value || '').replace(/[^0-9]/g, '');
  if (!raw) { el.value = ''; return 0; }
  const num = Number(raw); el.value = num.toLocaleString('ko-KR'); return num;
}
function updatePriceHint() {
  const el = $('#priceHint'); const badge = $('#priceStatusBadge'); const input = $('#estimatedPrice'); const priceVal = formatPriceInput(input); const ctype = $('#contractType')?.value || '';
  if (!el) return;
  if (!priceVal) { el.className = 'price-hint show wait'; el.textContent = '추정가격 입력 시 1천만원 기준 안내가 표시됩니다.'; if (badge) { badge.textContent = '안내 대기'; badge.className = 'mini-note wait-note'; } }
  else if (priceVal >= 10000000) { el.className = 'price-hint show warn'; el.textContent = ctype === '수의계약' ? '1천만원 이상입니다. 수의계약의 경우 직접생산확인증명서 확인이 필요할 수 있습니다.' : !ctype ? '1천만원 이상입니다. 계약방식을 함께 확인한 뒤 직접생산확인증명서 필요 여부를 확인하세요.' : '1천만원 이상입니다. 직접생산확인증명서 확인 필요 여부를 함께 확인하세요.'; if (badge) { badge.textContent = '직접생산확인증명서 확인 필요'; badge.className = 'mini-note warn-note'; } }
  else { el.className = 'price-hint show info'; el.textContent = '1천만원 미만입니다. 일반 서류 확인 흐름으로 진행하세요.'; if (badge) { badge.textContent = '일반 확인 진행'; badge.className = 'mini-note ok-note'; } }
}

function updatePreCheckCount() {
  const total = $$('.pre-check-item input[type=checkbox]').length;
  const checked = $$('.pre-check-item input[type=checkbox]:checked').length;
  const el = $('#preCheckCounter'); if (el) el.textContent = `(${checked}/${total})`;
}

// ── 컨텍스트 헬퍼 ─────────────────────────────────────────────
function getContextAround(text, keyword, radius) {
  const noSpaceKw = normalizeVehicleNo(keyword);
  const noSpaceText = compact(text);
  const idx = noSpaceText.indexOf(noSpaceKw);
  if (idx === -1) return '';
  return noSpaceText.slice(Math.max(0, idx - radius), idx + noSpaceKw.length + radius);
}
function extractDriverFromContext(ctx) { const m = ctx.match(/[가-힣]{2,4}(?=운전|기사|드라이버|010|011|016|017|018|019)/); return m ? m[0] : ''; }
function extractPhoneFromContext(ctx) { const m = ctx.match(/0\d{1,2}-?\d{3,4}-?\d{4}/); return m ? m[0] : ''; }
function extractHochaFromContext(ctx) { const m = ctx.match(/\d+호차/); return m ? m[0] : ''; }

// ── 초기화 ───────────────────────────────────────────────────
function resetAllData() {
  if (!confirm('배정차량, 출발일, 추정가격, 업로드 파일, 확인 결과를 모두 초기화할까요?')) return;
  Object.assign(state, { assignFiles: [], docFiles: [], docAnalyses: [], assignedVehicles: [], vehicleSource: 'none', vehicleConfirmed: false, allText: '', docRows: [], companyRows: [], vehicleRows: [], vehicleFilter: 'all', requestText: '', checked: false, ocrRunning: false, ocrNoticeAccepted: false, ocrAssist: { running: false, done: false, current: 0, total: 0, found: 0, message: '' } });
  ['startDate','companyName','eventName','endDate','contractType','estimatedPrice'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const optionalDetails = $('#optionalDetails'); if (optionalDetails) optionalDetails.open = false;
  const priceHint = $('#priceHint'); if (priceHint) { priceHint.className = 'price-hint show wait'; priceHint.textContent = '추정가격 입력 시 1천만원 기준 안내가 표시됩니다.'; }
  const priceBadge = $('#priceStatusBadge'); if (priceBadge) { priceBadge.textContent = '안내 대기'; priceBadge.className = 'mini-note wait-note'; }
  renderAssignFileList(); renderDocFileList(); renderVehicleTable(); updatePreCheckCount();
  $('#step6')?.classList.add('hidden'); document.getElementById('documentStatusDetails')?.removeAttribute('open'); $('#notCheckedYet')?.classList.remove('hidden'); document.body.classList.remove('has-results');
  const requestText = $('#requestText'); if (requestText) requestText.value = '';
  const extractBtn = $('#extractVehicleBtn'); if (extractBtn) extractBtn.textContent = '배정차량 추출하기';
  updateStepNav(); showToast('전체 입력을 초기화했어요.', 'success'); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function refreshManualCheckedVisual(root = document) {
  root.querySelectorAll('.checklist-doc-item, .vehicle-check-line').forEach(row => {
    const input = row.querySelector('input[type="checkbox"]');
    if (!input) return;
    row.classList.toggle('is-checked', input.checked);
    const badge = row.querySelector('.status-badge');
    if (!badge) return;
    if (!badge.dataset.originalText) {
      badge.dataset.originalText = badge.textContent.trim();
      badge.dataset.originalClass = badge.className;
      badge.dataset.originalTitle = badge.getAttribute('title') || '';
    }
    if (input.checked && /못 찾음|보완 필요|관련 페이지 있음|자동판독 후보|담당자 확인필요/.test(badge.dataset.originalText || '')) {
      badge.className = 'status-badge gray manual-checked';
      badge.textContent = '직접 체크됨';
      badge.title = '사용자가 원본을 직접 확인한 항목입니다.';
    } else if (!input.checked && badge.dataset.originalClass) {
      badge.className = badge.dataset.originalClass;
      badge.textContent = badge.dataset.originalText || badge.textContent;
      if (badge.dataset.originalTitle) badge.title = badge.dataset.originalTitle;
      else badge.removeAttribute('title');
    }
  });
}

// ── 이벤트 바인딩 ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.title = `버스콕검 ${VERSION} — 전세버스 임차 서류 확인 도구`;
  $$('.version-tag').forEach(el => { el.textContent = VERSION; });
  $$('.eyebrow').forEach(el => { el.textContent = `배정차량 리스트 기준 확인 · ${VERSION}`; });
  $$('.safe-chip').forEach(el => { el.textContent = '🛡 파일 내용 외부 전송 없음'; });
  $$('.version-tag').forEach(el => { el.textContent = VERSION; });

  const depEl = $('#startDate'); if (depEl) { depEl.value = ''; depEl.addEventListener('change', updateStepNav); }
  $('#endDate')?.addEventListener('change', () => { if (state.checked) rebuildAllResults(); });
  $('#contractType')?.addEventListener('change', () => { updatePriceHint(); if (state.checked) rebuildAllResults(); });
  $('#estimatedPrice')?.addEventListener('input', () => { updatePriceHint(); if (state.checked) rebuildAllResults(); });

  const aZone = $('#assignDropZone'); const aInput = $('#assignFileInput');
  if (aZone && aInput) {
    aZone.addEventListener('click', () => aInput.click());
    aZone.addEventListener('dragover', e => { e.preventDefault(); aZone.classList.add('dragover'); });
    aZone.addEventListener('dragleave', () => aZone.classList.remove('dragover'));
    aZone.addEventListener('drop', e => { e.preventDefault(); aZone.classList.remove('dragover'); addAssignFiles(e.dataTransfer.files); });
    aInput.addEventListener('change', e => { addAssignFiles(e.target.files); aInput.value = ''; });
  }
  $('#extractVehicleBtn')?.addEventListener('click', doExtractVehicles);
  $('#confirmVehiclesBtn')?.addEventListener('click', confirmVehicleList);
  $('#addVehicleBtn')?.addEventListener('click', addVehicleRow);
  $('#applyExtractedVehiclesBtn')?.addEventListener('click', () => showToast('현재 미리보기 내용이 적용되어 있어요. 필요하면 표에서 바로 수정하세요.', 'success'));
  $('#editExtractedVehiclesBtn')?.addEventListener('click', () => $('#vehicleTbody input')?.focus());

  const dZone = $('#docDropZone'); const dInput = $('#docFileInput');
  if (dZone && dInput) {
    dZone.addEventListener('click', () => dInput.click());
    dZone.addEventListener('dragover', e => { e.preventDefault(); dZone.classList.add('dragover'); });
    dZone.addEventListener('dragleave', () => dZone.classList.remove('dragover'));
    dZone.addEventListener('drop', e => { e.preventDefault(); dZone.classList.remove('dragover'); addDocFiles(e.dataTransfer.files); });
    dInput.addEventListener('change', e => { addDocFiles(e.target.files); dInput.value = ''; });
  }
  $('#addMoreDocTopBtn')?.addEventListener('click', () => dInput?.click());
  $('#runCheckBtn')?.addEventListener('click', runCheck);
  $('#actionOcrNeededBtn')?.addEventListener('click', runOcrForNeeded);
  $('#vehicleExpandAllBtn')?.addEventListener('click', expandAllDetails);
  $('#vehicleCollapseAllBtn')?.addEventListener('click', collapseAllDetails);
  $$('.filter-btn').forEach(b => b.addEventListener('click', () => setVehicleFilter(b.dataset.filter || 'all')));
  $('#exportCsvBtn')?.addEventListener('click', exportCSV);
  $('#copyResultBtn')?.addEventListener('click', copyResultTable);
  $('#copyRequestBtn')?.addEventListener('click', () => copyText('requestText'));
  $('#resetAllBtn')?.addEventListener('click', resetAllData);
  $$('.scroll-top-btn').forEach(b => b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })));
  document.addEventListener('change', e => {
    if (e.target.closest('.pre-check-item')) updatePreCheckCount();
    if (e.target.matches('input[type="checkbox"]') && (e.target.closest('.checklist-doc-item') || e.target.closest('.vehicle-check-line'))) {
      refreshManualCheckedVisual(e.target.closest('.checklist-doc-item, .vehicle-check-line'));
    }
  });
  window.addEventListener('scroll', () => { $('#topbar')?.classList.toggle('scrolled', window.scrollY > 8); });
  initResultSidebar();
  updateStepNav(); renderDocFileList(); updateAnalysisActionBar();
});
