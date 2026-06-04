const state = {
  files: [],
  docs: [],
  allText: "",
  assignedVehicles: [],
  foundVehicles: [],
  docRows: [],
  vehicleRows: [],
  requestText: "",
  checked: false,
  vehicleSource: "없음",
};

const REQUIRED_DOCS = [
  { key: "assignment", group: "기준자료", name: "차량 및 운전기사 배정 현황", keywords: ["차량 및 운전기사", "배정", "배차", "차량운행계획", "차량보유", "운행차량", "호차", "운전기사"] },
  { key: "businessLicense", group: "계약 전", name: "여객자동차 운송사업등록증", keywords: ["여객자동차", "운송사업등록증", "전세버스", "운송사업", "등록번호", "대표자"] },
  { key: "insurance", group: "계약 전", name: "자동차 종합보험 가입증명서", keywords: ["자동차보험", "종합보험", "대인배상", "대물배상", "보험기간", "피보험자", "가입증명"] },
  { key: "pledge", group: "계약 전", name: "직영차량 운행각서", keywords: ["직영차량", "운행각서", "지입차량", "당사 소유", "직접 운행", "각서"] },
  { key: "registration", group: "계약 전", name: "자동차 등록원부/등록증", keywords: ["자동차등록원부", "자동차등록증", "검사유효기간", "소유자", "사용본거지", "차명"] },
  { key: "safetyReport", group: "계약 전", name: "전세버스 교통안전정보 조회결과 통보서", keywords: ["전세버스 교통안전정보", "조회결과 통보서", "교통안전공단", "한국교통안전공단", "종합의견", "발급번호"] },
  { key: "departureChecklist", group: "출발 전", name: "출발 전 교육 및 차량안전점검표", keywords: ["출발 당일 차량 안전점검표", "차량안전점검표", "출발 전 교육", "운전자 음주여부", "재생타이어", "비상탈출용 망치", "대열운행"] },
  { key: "etc", group: "기타", name: "기타 안전관리 등 학교 요청 서류", keywords: ["안전관리", "학교 요청", "기타"] },
];

const CHECKLIST_ITEMS = [
  "출발 전 교육 및 차량안전점검표 제출",
  "운전자격요건 확인",
  "운전자 음주여부 확인",
  "실제 배차 차량번호와 배정차량 리스트 일치 확인",
  "실제 운전자와 배정 운전자 일치 확인",
  "소화기 2개 이상 비치 확인",
  "비상탈출용 망치 4개 이상 확인",
  "앞바퀴 재생타이어 사용 여부 확인",
  "안전벨트 착용 안내방송 확인",
  "급출발·급제동 및 대열운행 금지 교육",
  "차량 간 최소 1분 이상 간격 출발 안내",
  "교통안전정보 통보서 진위확인",
];

const PROVINCE = new Set(["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"]);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

window.addEventListener("DOMContentLoaded", () => {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  bindEvents();
  renderChecklist();
  updateFileList();
  updateStepProgress();
});

function bindEvents() {
  $$("[data-scroll-target]").forEach((btn) => {
    btn.addEventListener("click", () => scrollToTarget(btn.dataset.scrollTarget));
  });

  const dropZone = $("#dropZone");
  const fileInput = $("#fileInput");
  fileInput.addEventListener("change", (e) => addFiles(e.target.files));

  ["dragenter", "dragover"].forEach((type) => {
    dropZone.addEventListener(type, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach((type) => {
    dropZone.addEventListener(type, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); });
  });
  dropZone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  // 파일 더 추가하기 버튼
  $("#addMoreBtn").addEventListener("click", () => fileInput.click());

  $("#runCheckBtn").addEventListener("click", runCheck);
  $("#clearBtn").addEventListener("click", resetAll);

  $("#addVehicleBtn").addEventListener("click", () => {
    state.assignedVehicles.push({ hocha: `${state.assignedVehicles.length + 1}호차`, vehicleNo: "", driver: "", phone: "", note: "직접추가" });
    state.vehicleSource = "직접입력";
    updateVehicleTable();
  });

  $("#tempVehicleBtn").addEventListener("click", async () => {
    if (state.foundVehicles.length === 0 && state.allText) {
      state.foundVehicles = extractVehicleNumbers(state.allText);
    }
    if (state.foundVehicles.length === 0 && state.files.length > 0 && !state.allText.trim()) {
      showToast("서류를 읽고 있어요...");
      const docs = await extractTextFromFiles(state.files);
      state.docs = docs;
      state.allText = docs.map((d) => d.text).join("\n\n");
      state.foundVehicles = extractVehicleNumbers(state.allText);
    }
    if (state.foundVehicles.length === 0) {
      showToast("자동으로 읽을 수 있는 차량번호를 찾지 못했어요. 직접 입력으로 보정해 주세요.");
      return;
    }
    state.assignedVehicles = state.foundVehicles.map((vehicleNo, i) => ({
      hocha: `${i + 1}호차`, vehicleNo, driver: "", phone: "", note: "후보 차량"
    }));
    state.vehicleSource = "후보";
    updateVehicleTable("기준자료없음");
    showToast(`차량번호 후보 ${state.foundVehicles.length}개로 표를 만들었어요.`);
  });

  $("#copyDocTableBtn").addEventListener("click", () =>
    copyText(tableRowsToText(state.docRows, ["구분", "서류명", "결과", "콕검 확인 내용", "조치"]), "서류별 결과표를 복사했어요."));
  $("#copyVehicleTableBtn").addEventListener("click", () =>
    copyText(vehicleRowsToText(), "차량별 확인표를 복사했어요."));
  $("#copyRequestBtn").addEventListener("click", () =>
    copyText($("#requestText").value, "보완요청 문구를 복사했어요."));
  $("#exportCsvBtn").addEventListener("click", exportToCSV);

  $("#floatTopBtn").addEventListener("click", () => scrollToTarget("top"));

  ["#estimatedPrice", "#contractType"].forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener("input", updatePriceHint);
    if (el) el.addEventListener("change", updatePriceHint);
  });

  // 출발일 변경 → 스텝 진행상태 업데이트
  $("#startDate").addEventListener("change", updateStepProgress);

  updatePriceHint();
  window.addEventListener("scroll", toggleFloatTop);
}

// ─── 진행 단계 업데이트 ───────────────────────────────────────
function updateStepProgress() {
  const dateVal = $("#startDate").value;
  const fileCount = state.files.length;
  const checked = state.checked;

  // Step 1
  const s1 = $("#stepState1"), b1 = $("#stepBtn1");
  if (dateVal) {
    s1.textContent = dateVal;
    b1.classList.add("done");
  } else {
    s1.textContent = "입력 필요";
    b1.classList.remove("done");
  }

  // Step 2
  const s2 = $("#stepState2"), b2 = $("#stepBtn2");
  if (fileCount > 0) {
    s2.textContent = `${fileCount}개 완료`;
    b2.classList.add("done");
  } else {
    s2.textContent = "대기";
    b2.classList.remove("done");
  }

  // Step 3
  const s3 = $("#stepState3"), b3 = $("#stepBtn3");
  if (checked) {
    s3.textContent = "완료";
    b3.classList.add("done");
  } else if (dateVal && fileCount > 0) {
    s3.textContent = "시작 가능";
    b3.classList.remove("done");
  } else {
    s3.textContent = "대기";
    b3.classList.remove("done");
  }

  updateRunBtn();
}

function updateRunBtn() {
  const btn = $("#runCheckBtn");
  const chip = $("#actionStateChip");
  const dateVal = $("#startDate").value;
  const fileCount = state.files.length;

  if (!dateVal) {
    btn.textContent = "출발일을 먼저 입력해주세요";
    btn.disabled = true;
    btn.classList.remove("ready");
    if (chip) { chip.textContent = "출발일 입력 필요"; chip.className = "help-chip gray"; }
  } else if (fileCount === 0) {
    btn.textContent = "서류를 업로드하면 콕검할 수 있어요";
    btn.disabled = true;
    btn.classList.remove("ready");
    if (chip) { chip.textContent = "서류 업로드 필요"; chip.className = "help-chip gray"; }
  } else {
    btn.textContent = "버스 서류 콕검 시작하기";
    btn.disabled = false;
    btn.classList.add("ready");
    if (chip) { chip.textContent = "준비 완료"; chip.className = "help-chip blue"; }
  }
}

// ─── 파일 목록 ────────────────────────────────────────────────
function addFiles(fileList) {
  Array.from(fileList).forEach((file) => {
    if (!state.files.some((f) => f.name === file.name && f.size === file.size)) {
      state.files.push(file);
    }
  });
  updateFileList();
}

function updateFileList() {
  const fileCount = state.files.length;
  const emptyEl = $("#emptyUpload");
  const uploadedEl = $("#uploadedArea");

  if (fileCount === 0) {
    emptyEl.classList.remove("hidden");
    uploadedEl.classList.add("hidden");
  } else {
    emptyEl.classList.add("hidden");
    uploadedEl.classList.remove("hidden");

    // 제목 업데이트
    const titleEl = $("#fileStatusTitle");
    if (titleEl) titleEl.textContent = `서류 ${fileCount}개 업로드 완료`;

    // 파일 목록 렌더링
    const list = $("#fileList");
    list.innerHTML = "";
    state.files.forEach((file, index) => {
      const li = document.createElement("li");
      li.className = "file-item";
      const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name);
      li.innerHTML = `<span>${isImage ? "🖼️" : "📄"} ${escapeHtml(file.name)} <small>(${formatBytes(file.size)})</small>${isImage ? ' <span class="img-badge">이미지</span>' : ""}</span><button type="button" aria-label="파일 삭제">삭제</button>`;
      li.querySelector("button").addEventListener("click", () => {
        state.files.splice(index, 1);
        updateFileList();
      });
      list.appendChild(li);
    });

    // 이미지 경고
    const hasImage = state.files.some((f) => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f.name));
    const warnEl = $("#imageWarning");
    if (warnEl) warnEl.classList.toggle("hidden", !hasImage);
  }

  // 스텝 진행 상태 업데이트
  updateStepProgress();
}

// ─── 콕검 실행 ────────────────────────────────────────────────
async function runCheck() {
  const startDate = $("#startDate").value;
  if (!startDate) {
    showToast("출발일을 먼저 입력해 주세요.");
    scrollToTarget("basicInfo");
    return;
  }
  if (state.files.length === 0) {
    showToast("서류를 먼저 업로드해 주세요.");
    scrollToTarget("uploadDocs");
    return;
  }

  const btn = $("#runCheckBtn");
  btn.disabled = true;
  btn.textContent = "서류를 읽고 있어요...";
  $("#runMessage").textContent = "차량번호와 유효기간을 확인하는 중입니다. 잠시만 기다려 주세요.";

  try {
    state.docs = await extractTextFromFiles(state.files);
    state.allText = state.docs.map((d) => d.text).join("\n\n");

    const hasReadable = state.docs.some((d) => d.readable);
    if (!hasReadable) {
      showToast("글자를 읽을 수 없는 서류예요. 배정차량을 직접 입력으로 보정해 주세요.");
    }

    classifyDocuments();

    // 배정차량 추출 (수동 입력 상태가 아닐 때만 덮어쓰기)
    if (state.vehicleSource !== "직접입력") {
      const extracted = extractAssignedVehicleList(state.allText);
      if (extracted.length > 0) {
        state.assignedVehicles = extracted;
        state.vehicleSource = extracted[0]?.note || "자동추출";
      } else {
        state.vehicleSource = "없음";
      }
    }

    state.foundVehicles = extractVehicleNumbers(state.allText);
    updateVehicleTable(state.assignedVehicles.length > 0 ? "확인" : "기준자료없음");
    buildResults();
    showResultSections();

    state.checked = true;
    updateStepProgress();
    scrollToTarget("resultSummary");
    showToast("콕검 결과를 만들었어요.");
  } catch (err) {
    console.error(err);
    showToast("일부 서류를 읽지 못했어요. 직접확인으로 표시해 주세요.");
  } finally {
    btn.disabled = false;
    btn.textContent = "버스 서류 콕검 시작하기";
    btn.classList.add("ready");
    $("#runMessage").textContent = "다시 콕검하려면 버튼을 눌러 주세요.";
  }
}

async function extractTextFromFiles(files) {
  const results = [];
  for (const file of files) {
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".pdf")) {
        const text = await extractPdfText(file);
        results.push({ name: file.name, type: "pdf", text, readable: Boolean(text.trim()) });
      } else {
        results.push({ name: file.name, type: "image", text: `이미지 파일: ${file.name}`, readable: false });
      }
    } catch (e) {
      results.push({ name: file.name, type: "error", text: "", readable: false });
    }
  }
  return results;
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) return "";
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    fullText += `\n--- ${file.name} / ${p}쪽 ---\n${pageText}`;
  }
  return normalizeText(fullText);
}

// ─── 결과 표시/숨김 ──────────────────────────────────────────
function showResultSections() {
  $$(".result-panel").forEach((s) => s.classList.remove("hidden"));
  const notice = $("#preCheckNotice");
  if (notice) notice.classList.add("hidden");
}

// ─── 차량 추출: 2단계 알고리즘 ──────────────────────────────
function extractVehicleNumbers(rawText) {
  const found = new Set();

  // Phase 1: 전체 공백 제거 → 완전한 차량번호 추출
  const compact = rawText.replace(/[\s\u00a0]+/g, "");
  const fullPat = /([가-힣]{2})?(\d{2,3})([가-힣])(\d{4})/g;
  let m;
  while ((m = fullPat.exec(compact)) !== null) {
    const [, prefix, digits, han, tail] = m;
    if (prefix && !PROVINCE.has(prefix)) continue;
    found.add((prefix || "") + digits + han + tail);
  }

  // Phase 2: 분리된 head(시도+번호+한글) + tail(4자리) 페어링
  // 예: "서울72바" 와 "7440" 이 다른 셀/줄에 있는 경우
  const matchedTails = new Set([...found].map((v) => v.slice(-4)));
  const orphanHeads = [];
  const orphanTails = [];

  for (const line of rawText.split("\n")) {
    // Head: 행에서 공백 제거 후 시도+숫자+한글 (뒤에 숫자 없는 것)
    const lc = line.replace(/\s+/g, "");
    const headPat = /([가-힣]{2})(\d{2,3})([가-힣])(?!\d)/g;
    let hm;
    while ((hm = headPat.exec(lc)) !== null) {
      const [, pref, dig, han] = hm;
      if (!PROVINCE.has(pref)) continue;
      const headStr = pref + dig + han;
      if ([...found].some((v) => v.startsWith(headStr))) continue;
      orphanHeads.push(headStr);
    }

    // Tail: 원본 행에서 숫자·하이픈에 둘러싸이지 않은 4자리
    // 하이픈 앞뒤로 붙으면 전화번호 구성요소로 보고 제외
    const tailPat = /(?<![-\d])(\d{4})(?![-\d])/g;
    let tm;
    while ((tm = tailPat.exec(line)) !== null) {
      const tail = tm[1];
      const num = parseInt(tail, 10);
      if (num >= 1900 && num <= 2099) continue; // 연도 제외
      if (matchedTails.has(tail)) continue;       // Phase1에서 이미 매칭된 꼬리
      orphanTails.push(tail);
    }
  }

  // 문서 순서대로 페어링
  const pairCount = Math.min(orphanHeads.length, orphanTails.length);
  for (let i = 0; i < pairCount; i++) {
    found.add(orphanHeads[i] + orphanTails[i]);
  }

  return [...found];
}

// ─── 배정차량 리스트 추출 ────────────────────────────────────
function extractAssignedVehicleList(text) {
  const vehicles = extractVehicleNumbers(text);
  if (vehicles.length === 0) return [];

  const isAssignmentDoc = /차량\s*및\s*운전기사|배정|배차|운행차량|차량운행계획|차량보유|호차/.test(text);
  const sourceNote = isAssignmentDoc ? "자동추출" : "후보 차량";

  return vehicles.map((vehicleNo, index) => {
    // 전체 차량번호로 컨텍스트 검색 → 없으면 head로 재검색
    let context = getContextAround(text, vehicleNo, 80);
    if (!context) {
      const headOnly = vehicleNo.match(/^([가-힣]{0,2}\d{2,3}[가-힣])/)?.[1] || "";
      if (headOnly) context = getContextAroundOriginal(text, headOnly, 80);
    }
    const driver = extractDriverFromContext(context);
    const phone = extractPhoneFromContext(context);
    const hocha = extractHochaFromContext(context) || `${index + 1}호차`;
    return { hocha, vehicleNo, driver, phone, note: sourceNote };
  });
}

// 원본 텍스트(줄 단위)에서 keyword가 있는 줄 반환
function getContextAroundOriginal(rawText, keyword, radius = 80) {
  const compactKw = keyword.replace(/\s+/g, "");
  for (const line of rawText.split("\n")) {
    if (line.replace(/\s+/g, "").includes(compactKw)) {
      return line;
    }
  }
  return "";
}

// ─── 나머지 함수들 (v0.1.2에서 유지) ────────────────────────
function classifyDocuments() {
  const docsByKey = {};
  for (const doc of REQUIRED_DOCS) {
    const matches = doc.keywords.filter((kw) => state.allText.includes(kw));
    docsByKey[doc.key] = { found: matches.length > 0, matches };
  }
  state.docsByKey = docsByKey;
}

function buildResults() {
  const startDate = $("#startDate").value;
  const endDate = $("#endDate").value || startDate;
  const assignmentMode = state.assignedVehicles.length > 0;

  state.docRows = REQUIRED_DOCS.map((doc) => evaluateDocument(doc, state.docsByKey[doc.key], startDate));
  state.docRows.push(...evaluateContractConditionRows());

  if (!assignmentMode) {
    const row = state.docRows.find((r) => r.key === "assignment");
    if (row) {
      row.status = "기준자료없음";
      row.detail = "배정차량 리스트를 찾지 못했습니다.";
      row.action = "배정차량 리스트 추가 제출 또는 임시확인";
    }
  }

  state.vehicleRows = state.assignedVehicles.map((vehicle) => {
    const vehicleNo = normalizeVehicleNo(vehicle.vehicleNo);
    const insurance = checkVehicleInDoc(vehicleNo, "insurance");
    const registration = checkVehicleInDoc(vehicleNo, "registration");
    const safetyReport = checkVehicleInDoc(vehicleNo, "safetyReport");
    const driverMatch = checkDriverMatch(vehicle.driver, state.allText, safetyReport.status);
    const inspection = checkInspectionValidity(vehicleNo, state.allText, startDate);
    const finalStatus =
      [insurance, registration, safetyReport, driverMatch, inspection].some((x) => ["보완필요", "찾지 못함"].includes(x.status))
        ? "보완필요"
        : [insurance, registration, safetyReport, driverMatch, inspection].some((x) => ["직접확인", "기준자료없음"].includes(x.status))
        ? "직접확인"
        : "확인";
    return { ...vehicle, vehicleNo, insurance, registration, safetyReport, driverMatch, inspection, finalStatus };
  });

  renderSummary(startDate, endDate);
  renderDocumentStatus();
  renderVehicleMatches();
  state.requestText = generateSupplementRequestText();
  $("#requestText").value = state.requestText;
}

function evaluateDocument(doc, detected, startDate) {
  let status = detected?.found ? "확인" : "찾지 못함";
  let detail = detected?.found ? `${detected.matches.slice(0, 3).join(", ")} 문구 확인` : "관련 서류를 찾지 못했습니다.";
  let action = detected?.found ? "완료" : "제출 여부 확인";

  if (doc.key === "assignment" && detected?.found) {
    detail = `배정차량 ${state.assignedVehicles.length || 0}대 추출`;
    action = "기준자료";
  }
  if (doc.key === "insurance" && detected?.found) {
    const period = checkPeriodValidity(state.allText, startDate);
    if (period.status !== "확인") {
      status = period.status;
      detail = `보험 관련 문구 확인, ${period.detail}`;
      action = "보험기간 직접 확인";
    }
  }
  if (doc.key === "pledge" && detected?.found) {
    const hasDirect = /직영차량|당사\s*소유|직접\s*운행/.test(state.allText);
    const hasJip = /지입차량\s*불가|지입/.test(state.allText);
    if (!hasDirect && !hasJip) {
      status = "직접확인";
      detail = "각서 관련 문구는 있으나 직영차량/지입차량 불가 문구 확인이 필요합니다.";
      action = "직영차량 문구 확인";
    } else {
      detail = hasJip ? "직영차량 및 지입차량 관련 문구 확인" : "직영차량 관련 문구 확인";
    }
  }
  if (doc.key === "safetyReport" && detected?.found) {
    detail = state.allText.includes("종합의견") ? "교통안전정보·종합의견 문구 확인" : "교통안전정보 통보서 관련 문구 확인";
    action = "진위확인 필요";
  }
  if (doc.key === "departureChecklist") {
    if (detected?.found) {
      const hasResult = /적합|부적합|실시|여|부|확인/.test(state.allText);
      status = hasResult ? "확인" : "직접확인";
      detail = hasResult ? "출발 전 점검표 및 점검결과 관련 문구 확인" : "점검표 양식은 확인되나 기재 여부 확인 필요";
      action = "출발 전 담당자 확인";
    } else {
      status = "출발전제출";
      detail = "출발 전까지 제출받아야 하는 서류입니다.";
      action = "출발 전 제출 관리";
    }
  }
  if (doc.key === "etc") {
    status = "직접확인";
    detail = "학교 요청 서류는 계약 조건에 따라 담당자 확인이 필요합니다.";
    action = "필요 시 요청";
  }
  return { key: doc.key, group: doc.group, name: doc.name, status, detail, action };
}

function checkVehicleInDoc(vehicleNo, docKey) {
  const docDetected = state.docsByKey?.[docKey];
  if (!docDetected?.found) return { status: "찾지 못함", detail: "서류를 찾지 못함" };
  if (!vehicleNo) return { status: "직접확인", detail: "차량번호 없음" };
  const compactText = state.allText.replace(/\s+/g, "");
  const compactNo = vehicleNo.replace(/\s+/g, "");
  return compactText.includes(compactNo)
    ? { status: "확인", detail: "차량번호 확인" }
    : { status: "보완필요", detail: "해당 차량번호 미확인" };
}

function checkDriverMatch(driver, text, safetyStatus) {
  if (safetyStatus === "찾지 못함") return { status: "찾지 못함", detail: "통보서를 찾지 못함" };
  if (!driver) return { status: "직접확인", detail: "배정 운전자명 없음" };
  const cleaned = driver.replace(/[\s○*]/g, "");
  if (!cleaned || cleaned.length < 2) return { status: "직접확인", detail: "운전자명 OCR 확인 필요" };
  const safeDriver = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp(safeDriver.split("").join("\\s*"), "i").test(text.replace(/[○*]/g, ""));
  return found ? { status: "확인", detail: "운전자명 확인" } : { status: "직접확인", detail: "운전자 일치 직접확인" };
}

function checkInspectionValidity(vehicleNo, text, startDate) {
  if (!state.docsByKey?.registration?.found) return { status: "찾지 못함", detail: "등록원부/등록증을 찾지 못함" };
  const dates = extractDates(text);
  if (dates.length === 0) return { status: "직접확인", detail: "검사유효기간 확인불가" };
  const target = new Date(startDate);
  const future = dates.filter((d) => d >= target).sort((a, b) => b - a);
  if (future.length > 0) return { status: "확인", detail: formatDate(future[0]) + "까지 유효 추정" };
  return { status: "보완필요", detail: "출발일 이후 유효기간 미확인" };
}

function checkPeriodValidity(text, startDate) {
  const dates = extractDates(text);
  if (dates.length < 1) return { status: "직접확인", detail: "기간 날짜 확인불가" };
  const target = new Date(startDate);
  return dates.some((d) => d >= target)
    ? { status: "확인", detail: "출발일 포함 가능" }
    : { status: "보완필요", detail: "출발일 이후 보험기간 미확인" };
}

function getEstimatedPriceValue() {
  const raw = $("#estimatedPrice")?.value || "";
  const numeric = Number(String(raw).replace(/[^0-9]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getContractConditionInfo() {
  const price = getEstimatedPriceValue();
  const contractType = $("#contractType")?.value || "";
  const priceEntered = price > 0;
  const overTenMillion = price >= 10000000;
  const isPrivate = contractType === "수의계약";
  const isBidLike = ["입찰", "2인이상 전자견적"].includes(contractType);

  if (!priceEntered) return { priceEntered, overTenMillion, isPrivate, isBidLike, needsDirectProduction: false, summaryValue: "선택", summaryLabel: "추정가격 미입력 · 조건별 서류 판단 보류", hintClass: "neutral", hintText: "추정가격을 입력하면 직접생산확인증명서 확인 필요 여부를 안내합니다." };
  if (isPrivate && overTenMillion) return { priceEntered, overTenMillion, isPrivate, isBidLike, needsDirectProduction: true, summaryValue: "확인 필요", summaryLabel: "1천만원 이상 수의계약 · 직접생산확인증명서", hintClass: "need", hintText: "확인 필요: 추정가격 1천만원 이상 수의계약으로 입력되었습니다. '기타도로여객운송서비스' 직접생산확인증명서 확인이 필요할 수 있습니다." };
  if (overTenMillion && !contractType) return { priceEntered, overTenMillion, isPrivate, isBidLike, needsDirectProduction: true, summaryValue: "방식 확인", summaryLabel: "1천만원 이상 · 계약방식 확인 후 직접생산 판단", hintClass: "check", hintText: "계약방식 확인 필요: 추정가격이 1천만원 이상입니다. 수의계약이면 직접생산확인증명서 확인이 필요할 수 있습니다." };
  if (isBidLike) return { priceEntered, overTenMillion, isPrivate, isBidLike, needsDirectProduction: true, summaryValue: "자격 확인", summaryLabel: "입찰·전자견적 · 중소기업/직접생산 확인 안내", hintClass: "check", hintText: "참고 안내: 입찰 또는 2인이상 전자견적은 중소기업확인서와 직접생산확인증명서 등 참가자격 서류를 별도로 확인하세요." };
  return { priceEntered, overTenMillion, isPrivate, isBidLike, needsDirectProduction: false, summaryValue: "참고", summaryLabel: "추정가격 입력됨 · 학교 계약조건 별도 확인", hintClass: overTenMillion ? "check" : "ok", hintText: overTenMillion ? "참고 안내: 추정가격은 1천만원 이상이지만 수의계약으로 선택되지 않았습니다. 계약방식과 학교 기준에 따라 추가서류를 확인하세요." : "참고 안내: 추정가격 1천만원 미만으로 입력되었습니다. 직접생산확인증명서 대상 여부는 학교 계약조건에 따라 별도 확인하세요." };
}

function updatePriceHint() {
  const hint = $("#priceHint");
  if (!hint) return;
  const info = getContractConditionInfo();
  hint.textContent = info.hintText;
  hint.className = `price-hint ${info.hintClass}`;
}

function evaluateContractConditionRows() {
  const info = getContractConditionInfo();
  const rows = [];
  const allText = state.allText || "";
  const hasSme = /중소기업확인서|소기업|소상공인|중소기업/.test(allText);
  const hasDirect = /직접생산확인증명서|직접생산|기타도로여객운송서비스|7811189904/.test(allText);

  if (!info.priceEntered && !info.isBidLike && !info.isPrivate) return rows;

  rows.push({ key: "smeCertificate", group: "계약조건별", name: "중소기업·소상공인 확인서", status: hasSme ? "확인" : (info.isBidLike ? "확인필요" : "직접확인"), detail: hasSme ? "중소기업/소기업/소상공인 관련 문구 확인" : "계약방식 또는 금액에 따라 확인이 필요할 수 있습니다.", action: hasSme ? "완료" : "계약조건에 따라 제출 여부 확인" });

  if (info.needsDirectProduction) {
    rows.push({ key: "directProduction", group: "계약조건별", name: "직접생산확인증명서", status: hasDirect ? "확인" : "확인필요", detail: hasDirect ? "직접생산확인증명서 또는 기타도로여객운송서비스 문구 확인" : info.summaryLabel, action: hasDirect ? "완료" : "세부품명 '기타도로여객운송서비스' 제출 여부 확인" });
  }
  return rows;
}

function renderSummary(startDate, endDate) {
  const vehicleTotal = state.assignedVehicles.length;
  const baseDocTotal = REQUIRED_DOCS.length;
  const baseDocConfirmed = state.docRows.filter((r) => REQUIRED_DOCS.some((d) => d.key === r.key) && r.status === "확인").length;
  const needs = state.docRows.filter((r) => ["보완필요", "찾지 못함"].includes(r.status)).length + state.vehicleRows.filter((r) => r.finalStatus === "보완필요").length;
  const direct = state.docRows.filter((r) => ["직접확인", "기준자료없음", "확인필요"].includes(r.status)).length + state.vehicleRows.filter((r) => r.finalStatus === "직접확인").length;
  const okVehicles = state.vehicleRows.filter((r) => r.finalStatus === "확인").length;
  const contractInfo = getContractConditionInfo();
  const final = vehicleTotal === 0 ? "기준자료 확인 필요" : needs > 0 ? "보완 필요" : direct > 0 ? "직접 확인 필요" : "검토 완료";

  const badge = $("#finalStatusBadge");
  badge.textContent = final;
  badge.className = "status-badge " + (final === "검토 완료" ? "ok" : final === "보완 필요" ? "warn" : "purple");

  const cards = [
    { value: `${vehicleTotal}대`, label: "배정차량 확인" },
    { value: `${baseDocConfirmed}/${baseDocTotal}`, label: "필수서류 확인" },
    { value: `${okVehicles}/${vehicleTotal || 0}`, label: "차량별 대조 통과" },
    { value: needs ? `${needs}건` : "0건", label: "보완 필요" },
    { value: direct ? `${direct}건` : "0건", label: "직접 확인" },
    { value: `${startDate}${endDate !== startDate ? ` ~ ${endDate}` : ""}`, label: "검토 기준일" },
    { value: contractInfo.summaryValue, label: contractInfo.summaryLabel, type: contractInfo.needsDirectProduction ? "attention" : contractInfo.priceEntered ? "direct" : "" },
  ];
  $("#summaryCards").innerHTML = cards
    .map((c) => `<div class="summary-card ${c.type || ""}"><strong>${escapeHtml(c.value)}</strong><span>${escapeHtml(c.label)}</span></div>`)
    .join("");
}

function renderDocumentStatus() {
  $("#docStatusTbody").innerHTML = state.docRows
    .map((r) => `<tr><td>${escapeHtml(r.group)}</td><td><strong>${escapeHtml(r.name)}</strong></td><td>${statusBadge(r.status)}</td><td>${escapeHtml(r.detail)}</td><td>${escapeHtml(r.action)}</td></tr>`)
    .join("");
}

function renderVehicleMatches() {
  const tbody = $("#vehicleMatchTbody");
  if (state.vehicleRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#607086;padding:20px;">배정차량 리스트가 없어요. 위 배정차량 영역에서 차량을 추가한 뒤 콕검을 다시 시작해 주세요.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.vehicleRows
    .map((r) => `<tr>
      <td>${escapeHtml(r.hocha)}</td>
      <td><strong>${escapeHtml(r.vehicleNo || "미입력")}</strong></td>
      <td>${escapeHtml(r.driver || "—")}</td>
      <td>${statusBadge(r.insurance.status)}</td>
      <td>${statusBadge(r.registration.status)}</td>
      <td>${statusBadge(r.safetyReport.status)}</td>
      <td>${statusBadge(r.driverMatch.status)}</td>
      <td>${statusBadge(r.inspection.status)}</td>
      <td>${statusBadge(r.finalStatus)}</td>
    </tr>`)
    .join("");
}

function updateVehicleTable(mode = "대기") {
  const empty = $("#vehicleEmpty");
  const wrap = $("#vehicleTableWrap");
  const chip = $("#vehicleCountChip");
  const sourceNote = $("#vehicleSourceNote");

  if (state.assignedVehicles.length === 0) {
    empty.classList.remove("hidden");
    wrap.classList.add("hidden");
    if (chip) { chip.textContent = "차량 없음"; chip.className = "help-chip gray"; }
    if (sourceNote) sourceNote.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  wrap.classList.remove("hidden");
  if (chip) {
    chip.textContent = `${state.assignedVehicles.length}대`;
    chip.className = "help-chip blue";
  }

  // 출처 안내
  if (sourceNote) {
    const src = state.vehicleSource;
    if (src === "자동추출") {
      sourceNote.textContent = "배정 현황에서 차량번호를 자동으로 찾았어요. 내용이 맞는지 확인해 주세요.";
      sourceNote.className = "vehicle-source-note ok";
      sourceNote.classList.remove("hidden");
    } else if (src === "후보" || src === "후보 차량") {
      sourceNote.textContent = "배정 키워드는 없지만 본문에서 차량번호 후보를 발견했어요. 내용을 직접 확인해 주세요.";
      sourceNote.className = "vehicle-source-note warn";
      sourceNote.classList.remove("hidden");
    } else if (src === "직접입력") {
      sourceNote.textContent = "직접 입력으로 보정한 배정차량입니다.";
      sourceNote.className = "vehicle-source-note info";
      sourceNote.classList.remove("hidden");
    } else {
      sourceNote.classList.add("hidden");
    }
  }

  const tbody = $("#vehicleTbody");
  tbody.innerHTML = "";
  state.assignedVehicles.forEach((vehicle, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" value="${escapeAttr(vehicle.hocha)}" data-field="hocha" data-index="${index}" /></td>
      <td><input type="text" value="${escapeAttr(vehicle.vehicleNo)}" data-field="vehicleNo" data-index="${index}" placeholder="예: 서울72바5789" /></td>
      <td><input type="text" value="${escapeAttr(vehicle.driver)}" data-field="driver" data-index="${index}" /></td>
      <td><input type="text" value="${escapeAttr(vehicle.phone)}" data-field="phone" data-index="${index}" /></td>
      <td><span class="status-badge gray">${escapeHtml(vehicle.note || "")}</span></td>
      <td><button class="row-delete" type="button" data-index="${index}" aria-label="삭제">삭제</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const { field, index: idx } = e.target.dataset;
      state.assignedVehicles[idx][field] = e.target.value;
      if (state.vehicleSource !== "직접입력") state.vehicleSource = "직접입력";
    });
  });
  tbody.querySelectorAll(".row-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      state.assignedVehicles.splice(Number(e.target.dataset.index), 1);
      updateVehicleTable();
    });
  });
}

function renderChecklist() {
  const wrap = $("#checklistWrap");
  if (!wrap) return;
  wrap.innerHTML = CHECKLIST_ITEMS.map((item) =>
    `<label class="check-item"><input type="checkbox" /><span>${escapeHtml(item)}</span></label>`
  ).join("");
}

function generateSupplementRequestText() {
  const company = $("#companyName").value.trim();
  const event = $("#eventName").value.trim();
  const startDate = $("#startDate").value;
  const prefix = company ? `${company}에서 ` : "";
  const eventStr = event ? ` (${event})` : "";

  const needsRows = state.docRows.filter((r) => ["보완필요", "찾지 못함", "확인필요"].includes(r.status));
  const needsVehicle = state.vehicleRows.filter((r) => r.finalStatus === "보완필요");
  const directRows = state.docRows.filter((r) => ["직접확인", "기준자료없음"].includes(r.status));

  if (needsRows.length === 0 && needsVehicle.length === 0) {
    return `안녕하세요.\n\n${prefix}제출하신 전세버스 임차 관련 서류${eventStr}를 검토하였습니다.\n현재까지 확인된 서류는 이상 없습니다.\n\n출발일(${startDate}) 전까지 추가 요청 사항이 있을 경우 별도 안내 드리겠습니다.\n\n감사합니다.`;
  }

  let text = `안녕하세요.\n\n${prefix}제출하신 전세버스 임차 관련 서류${eventStr}를 검토한 결과,\n배정차량 리스트 기준으로 아래 사항의 보완이 필요합니다.\n\n`;

  if (needsRows.length > 0) {
    text += "【서류 보완 필요】\n";
    needsRows.forEach((r) => { text += `- ${r.name}: ${r.detail}\n`; });
    text += "\n";
  }

  if (needsVehicle.length > 0) {
    text += "【차량별 보완 필요】\n";
    needsVehicle.forEach((r) => {
      const issues = [r.insurance, r.registration, r.safetyReport, r.driverMatch, r.inspection]
        .filter((x) => ["보완필요", "찾지 못함"].includes(x.status))
        .map((x) => x.detail);
      text += `- ${r.vehicleNo || r.hocha}: ${issues.join(", ")}\n`;
    });
    text += "\n";
  }

  if (directRows.length > 0) {
    text += "【직접 확인 필요】\n";
    directRows.forEach((r) => { text += `- ${r.name}: ${r.detail}\n`; });
    text += "\n";
  }

  text += `출발일(${startDate}) 전까지 보완 서류를 제출해 주시기 바랍니다.\n\n감사합니다.`;
  return text;
}

// ─── CSV 내보내기 ─────────────────────────────────────────────
function exportToCSV() {
  if (!state.docRows || state.docRows.length === 0) {
    showToast("먼저 콕검을 시작해 주세요.");
    return;
  }

  const BOM = "\uFEFF";
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const row = (...cells) => cells.map(escape).join(",") + "\n";

  let csv = BOM;
  csv += row("버스콕검 검토 결과", "v0.1.3");
  csv += row("검토일", new Date().toLocaleDateString("ko-KR"));
  csv += row("출발일", $("#startDate").value || "");
  csv += row("업체명", $("#companyName").value || "");
  csv += row("행사명", $("#eventName").value || "");
  csv += "\n";

  csv += row("[서류별 제출현황]");
  csv += row("구분", "서류명", "결과", "확인내용", "조치");
  state.docRows.forEach((r) => { csv += row(r.group, r.name, r.status, r.detail, r.action); });
  csv += "\n";

  csv += row("[배정차량별 확인]");
  csv += row("호차", "차량번호", "운전자", "보험증명서", "등록원부/등록증", "교통안전정보", "운전자일치", "검사유효기간", "결과");
  state.vehicleRows.forEach((r) => {
    csv += row(r.hocha, r.vehicleNo, r.driver, r.insurance.status, r.registration.status, r.safetyReport.status, r.driverMatch.status, r.inspection.status, r.finalStatus);
  });
  csv += "\n";

  csv += row("[출발 전 확인사항]");
  CHECKLIST_ITEMS.forEach((item) => { csv += row(item, ""); });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `버스콕검_${$("#startDate").value || "결과"}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("CSV 파일로 내보냈어요. Excel에서 열 수 있습니다.");
}

// ─── 초기화 ──────────────────────────────────────────────────
function resetAll() {
  state.files = [];
  state.docs = [];
  state.allText = "";
  state.assignedVehicles = [];
  state.foundVehicles = [];
  state.docRows = [];
  state.vehicleRows = [];
  state.requestText = "";
  state.checked = false;
  state.vehicleSource = "없음";

  updateFileList();
  updateVehicleTable();
  $$(".result-panel").forEach((s) => s.classList.add("hidden"));
  const notice = $("#preCheckNotice");
  if (notice) notice.classList.remove("hidden");
  $("#fileInput").value = "";
  $("#requestText").value = "";
  updatePriceHint();
  updateStepProgress();
  showToast("초기화했어요.");
}

// ─── 유틸리티 ────────────────────────────────────────────────
function scrollToTarget(id) {
  const target = id === "top" ? document.body : document.getElementById(id);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleFloatTop() {
  const btn = $("#floatTopBtn");
  if (btn) btn.classList.toggle("show", window.scrollY > 320);
}

function statusBadge(status) {
  const cls = status === "확인" ? "ok" : status === "보완필요" ? "warn" : status === "찾지 못함" ? "notfound" : status === "출발전제출" ? "blue" : ["직접확인", "확인필요"].includes(status) ? "purple" : "gray";
  const label = status === "직접확인" ? "직접 확인" : status === "확인필요" ? "확인 필요" : status === "보완필요" ? "보완 필요" : status === "출발전제출" ? "출발 전 제출" : status === "기준자료없음" ? "기준자료 없음" : status;
  return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
}

function tableRowsToText(rows, headers) {
  return `${headers.join("\t")}\n${rows.map((r) => [r.group, r.name, r.status, r.detail, r.action].join("\t")).join("\n")}`;
}

function vehicleRowsToText() {
  const header = ["호차", "차량번호", "운전자", "보험증명서", "등록원부/등록증", "교통안전정보", "운전자 일치", "검사유효기간", "결과"];
  const body = state.vehicleRows.map((r) => [r.hocha, r.vehicleNo, r.driver, r.insurance.status, r.registration.status, r.safetyReport.status, r.driverMatch.status, r.inspection.status, r.finalStatus].join("\t")).join("\n");
  return `${header.join("\t")}\n${body}`;
}

async function copyText(text, successMessage) {
  if (!text) return showToast("복사할 내용이 없어요.");
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast(successMessage);
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function extractDriverFromContext(context) {
  const labeled = context.match(/(?:운전자|운전기사|기사)\s*[:：]?\s*([가-힣]{2,4})/);
  if (labeled) return labeled[1];
  const excluded = new Set(["서울", "경기", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주", "차량", "운전", "보험", "등록", "전세", "버스", "관광", "고속", "여객", "운송", "삼우", "세일"]);
  const names = context.match(/[가-힣]{2,4}/g) || [];
  return names.find((n) => !excluded.has(n) && n.length >= 2 && n.length <= 4) || "";
}

function extractPhoneFromContext(context) {
  return (context.match(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/) || [""])[0];
}

function extractHochaFromContext(context) {
  return (context.match(/\d+\s*호차/) || [""])[0].replace(/\s/g, "");
}

function extractDates(text) {
  const dates = [];
  const patterns = [/(\d{4})[.\-/년](\d{1,2})[.\-/월](\d{1,2})일?/g, /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g];
  patterns.forEach((pat) => {
    let m;
    while ((m = pat.exec(text)) !== null) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!isNaN(d.getTime())) dates.push(d);
    }
  });
  return dates;
}

function normalizeText(text) {
  return text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeVehicleNo(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function getContextAround(text, keyword, radius = 60) {
  const compactKw = normalizeVehicleNo(keyword);
  const compact = text.replace(/[\s\u00a0]+/g, "");
  const index = compact.indexOf(compactKw);
  if (index === -1) return "";
  return compact.slice(Math.max(0, index - radius), index + compactKw.length + radius);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
