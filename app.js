/* =========================
   악취 시민제보 PWA (프론트)
   - 제보 제출 시 위치 자동 수집
   - Apps Script CORS 문제 우회: no-cors + text/plain 전송
   ========================= */

// 1) 반드시 본인 Apps Script Web App URL(/exec)로 교체
const API_URL = "https://script.google.com/macros/s/AKfycbz0GD9UVW-qlT88LaZ7Ad5J6RWH2PkgVOcexQQq2BXNDgTc7J5fVfKWuyy-z49VJffdrQ/exec";

// 2) 선택지(필요하면 문구만 수정)
const ODOR_TYPES = [
  { v: "", t: "선택" },
  { v: "sewage", t: "하수·오수" },
  { v: "manure", t: "분뇨·축산" },
  { v: "waste", t: "쓰레기·폐기물" },
  { v: "solvent", t: "페인트·용제" },
  { v: "smoke", t: "연기·소각" },
  { v: "chemical", t: "화학" },
  { v: "other", t: "기타" }
];

const DURATION_CODES = [
  { v: "", t: "선택" },
  { v: "lt5", t: "5분 미만" },
  { v: "5to30", t: "5~30분" },
  { v: "30to120", t: "30분~2시간" },
  { v: "gt120", t: "2시간 이상" }
];

const CONTEXT_CODES = [
  { v: "", t: "선택" },
  { v: "indoor_closed", t: "실내(창문 닫힘)" },
  { v: "indoor_open", t: "실내(창문 열림)" },
  { v: "outdoor_balcony", t: "실외(베란다/창가)" },
  { v: "outdoor_street", t: "실외(도로/골목)" },
  { v: "near_facility", t: "시설/사업장 인근" },
  { v: "unknown", t: "모름" }
];

const CERTAINTY_CODES = [
  { v: "", t: "선택" },
  { v: "low", t: "낮음" },
  { v: "mid", t: "보통" },
  { v: "high", t: "확실" }
];

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

const els = {
  btnLocate: null,
  locStatus: null,
  lat: null,
  lon: null,
  acc: null,
  serverTime: null,

  odorType: null,
  odorIntensity: null,
  odorIntensityVal: null,
  durationCode: null,
  contextCode: null,
  buildingFloor: null,
  certaintyCode: null,
  memoShort: null,

  btnSubmit: null,
  submitStatus: null
};

// ---------- Utils ----------
function setStatus(el, msg, kind = "") {
  el.textContent = msg || "";
  el.dataset.kind = kind;
}

function fillSelect(selectEl, items) {
  selectEl.innerHTML = "";
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it.v;
    opt.textContent = it.t;
    selectEl.appendChild(opt);
  }
}

function safeTrim(s) {
  return (s ?? "").toString().trim();
}

function nowIso() {
  return new Date().toISOString();
}

// ---------- Geolocation ----------
function getLocationOnce({ timeoutMs = 8000, highAccuracy = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("NO_GEOLOCATION"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = pos.coords || {};
        resolve({
          lat: typeof c.latitude === "number" ? c.latitude : null,
          lon: typeof c.longitude === "number" ? c.longitude : null,
          acc: typeof c.accuracy === "number" ? c.accuracy : null
        });
      },
      (err) => {
        reject(err || new Error("GEO_ERROR"));
      },
      {
        enableHighAccuracy: !!highAccuracy,
        timeout: timeoutMs,
        maximumAge: 0
      }
    );
  });
}

function applyLocationToUI(loc) {
  els.lat.value = loc?.lat != null ? loc.lat.toFixed(6) : "";
  els.lon.value = loc?.lon != null ? loc.lon.toFixed(6) : "";
  els.acc.value = loc?.acc != null ? Math.round(loc.acc).toString() : "";
}

// ---------- Submit ----------
async function sendToServer(payload) {
  // 1차 시도: 일반 CORS fetch (환경에 따라 성공 가능)
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Apps Script가 CORS를 막으면 여기까지 오기 전에 예외가 나거나,
    // 혹은 응답을 읽는 과정에서 막힐 수 있습니다.
    const text = await r.text();
    return { ok: r.ok, text };
  } catch (e1) {
    // 2차 시도: no-cors + text/plain (가장 안정적)
    // - no-cors에서는 응답을 읽을 수 없고 status=0(opaque)일 수 있습니다.
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    return { ok: true, text: "" }; // 응답 확인 불가 → 전송 성공으로 처리
  }
}

function buildPayload(loc) {
  const odor_type = els.odorType.value;
  const odor_intensity = Number(els.odorIntensity.value);
  const duration_code = els.durationCode.value;
  const context_code = els.contextCode.value;
  const certainty_code = els.certaintyCode.value;

  const floorRaw = safeTrim(els.buildingFloor.value);
  const building_floor = floorRaw === "" ? "" : Number(floorRaw);

  const memo_short = safeTrim(els.memoShort.value).slice(0, 80);

  // 최소 유효성(필수값)
  if (!odor_type) throw new Error("MISSING_ODOR_TYPE");
  if (!duration_code) throw new Error("MISSING_DURATION");
  if (!context_code) throw new Error("MISSING_CONTEXT");
  if (!certainty_code) throw new Error("MISSING_CERTAINTY");

  if (loc?.lat == null || loc?.lon == null) throw new Error("MISSING_LOCATION");

  return {
    // report_id는 서버에서 만들어도 되고, 클라이언트에서 만들어도 됨
    // 여기서는 클라이언트 임시 ID를 부여(중복 방지용)
    report_id: "r_" + Math.random().toString(36).slice(2) + "_" + Date.now(),

    client_time: nowIso(),

    lat: loc.lat,
    lon: loc.lon,
    gps_accuracy_m: loc.acc != null ? Math.round(loc.acc) : "",

    odor_type,
    odor_intensity,
    duration_code,
    context_code,

    building_floor: (Number.isFinite(building_floor) ? building_floor : ""),

    certainty_code,
    memo_short
  };
}

async function onLocateClicked() {
  setStatus(els.locStatus, "위치 확인 중…", "busy");
  try {
    const loc = await getLocationOnce({ timeoutMs: 8000, highAccuracy: true });
    applyLocationToUI(loc);
    setStatus(els.locStatus, "위치 확인 완료", "ok");
  } catch (e) {
    console.error(e);
    setStatus(els.locStatus, "위치 확인 실패: 권한/환경을 확인", "err");
  }
}

async function onSubmitClicked() {
  els.btnSubmit.disabled = true;
  setStatus(els.submitStatus, "제출 준비 중…", "busy");

  try {
    // 1) 제보 시점에 위치 자동 수집(핵심)
    setStatus(els.locStatus, "제출을 위한 위치 확인 중…", "busy");
    const loc = await getLocationOnce({ timeoutMs: 9000, highAccuracy: true });
    applyLocationToUI(loc);
    setStatus(els.locStatus, "위치 확인 완료", "ok");

    // 2) 페이로드 구성
    const payload = buildPayload(loc);

    // 3) 서버 전송
    setStatus(els.submitStatus, "서버로 전송 중…", "busy");
    const res = await sendToServer(payload);

    // no-cors 모드에서는 응답 확인 불가 → 성공 안내만
    setStatus(els.submitStatus, "제보가 접수되었다(응답 확인 불가 환경).", "ok");

    // 폼 일부 리셋(원하시면 유지하도록 바꿀 수 있음)
    els.memoShort.value = "";
    els.serverTime.value = ""; // 서버 시간은 응답을 읽을 수 있을 때만 표시 가능

    // 디버깅용: 콘솔에 payload 남김
    console.log("submitted payload:", payload, "server response:", res);
  } catch (e) {
    console.error(e);

    let msg = "제출 실패: 네트워크/서버 설정 확인";
    if (e?.message === "MISSING_LOCATION") msg = "제출 실패: 위치 권한이 필요하다(설정에서 허용).";
    if (e?.message === "MISSING_ODOR_TYPE") msg = "제출 실패: 냄새 종류를 선택해야 한다.";
    if (e?.message === "MISSING_DURATION") msg = "제출 실패: 지속시간을 선택해야 한다.";
    if (e?.message === "MISSING_CONTEXT") msg = "제출 실패: 발생 상황을 선택해야 한다.";
    if (e?.message === "MISSING_CERTAINTY") msg = "제출 실패: 확신도를 선택해야 한다.";

    setStatus(els.submitStatus, msg, "err");
  } finally {
    els.btnSubmit.disabled = false;
  }
}

// ---------- Init ----------
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW register failed", e));
  }
}

function init() {
  // bind
  els.btnLocate = $("btnLocate");
  els.locStatus = $("locStatus");
  els.lat = $("lat");
  els.lon = $("lon");
  els.acc = $("acc");
  els.serverTime = $("serverTime");

  els.odorType = $("odorType");
  els.odorIntensity = $("odorIntensity");
  els.odorIntensityVal = $("odorIntensityVal");
  els.durationCode = $("durationCode");
  els.contextCode = $("contextCode");
  els.buildingFloor = $("buildingFloor");
  els.certaintyCode = $("certaintyCode");
  els.memoShort = $("memoShort");

  els.btnSubmit = $("btnSubmit");
  els.submitStatus = $("submitStatus");

  // fill selects
  fillSelect(els.odorType, ODOR_TYPES);
  fillSelect(els.durationCode, DURATION_CODES);
  fillSelect(els.contextCode, CONTEXT_CODES);
  fillSelect(els.certaintyCode, CERTAINTY_CODES);

  // range
  els.odorIntensityVal.textContent = els.odorIntensity.value;
  els.odorIntensity.addEventListener("input", () => {
    els.odorIntensityVal.textContent = els.odorIntensity.value;
  });

  // handlers
  els.btnLocate.addEventListener("click", onLocateClicked);
  els.btnSubmit.addEventListener("click", onSubmitClicked);

  registerSW();
}

document.addEventListener("DOMContentLoaded", init);
