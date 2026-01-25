/* 악취 시민제보 PWA - 프론트엔드 */

const API_URL = "https://script.google.com/macros/s/AKfycbzQKahFNu1DMRiYVoSbpCw2iJJhTw9DPrkrZPYKf3RLvVy6GQB0xpE88jAIL3XXF5cLxw/exec";

/* 2. 옵션 정의 */
const ODOR_TYPES = [
  { v: "", t: "선택" },
  { v: "sewage", t: "하수·오수" },
  { v: "manure", t: "분뇨·축산" },
  { v: "waste", t: "쓰레기·폐기물" },
  { v: "chemical", t: "화학" },
  { v: "smoke", t: "연기·소각" },
  { v: "other", t: "기타" },
  { v: "unknown", t: "모름" }
];

const DURATION_CODES = [
  { v: "", t: "선택" },
  { v: "undetermined", t: "판단 어려움(제보 시점)" },
  { v: "lt5", t: "5분 미만" },
  { v: "5to30", t: "5~30분" },
  { v: "30to120", t: "30분~2시간" },
  { v: "gt120", t: "2시간 이상" }
];

const CONTEXT_CODES = [
  { v: "", t: "선택" },
  { v: "outdoor_balcony", t: "실외(창가/베란다)" },
  { v: "outdoor_street", t: "실외(도로/골목)" },
  { v: "indoor_open", t: "실내(창문 열림)" },
  { v: "indoor_closed", t: "실내(창문 닫힘)" },
  { v: "near_facility", t: "시설/사업장 인근" },
  { v: "unknown", t: "모름" }
];

const EXPOSURE_HEIGHTS = [
  { v: "", t: "선택" },
  { v: "ground_1f", t: "지상(1층)" },
  { v: "2to5f", t: "2~5층" },
  { v: "6to10f", t: "6~10층" },
  { v: "11f_plus", t: "11층 이상" }
];

const PERCEPTION_LEVELS = [
  { v: "", t: "선택" },
  { v: "faint", t: "희미하게 느껴짐" },
  { v: "clear", t: "분명하게 느껴짐" },
  { v: "very_clear", t: "매우 선명하게 느껴짐" }
];

/* 3. 공통 유틸 */
const $ = (id) => document.getElementById(id);

function fillSelect(el, items) {
  el.innerHTML = "";
  items.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.v;
    opt.textContent = it.t;
    el.appendChild(opt);
  });
}

function setStatus(el, msg, kind = "") {
  el.textContent = msg;
  if (el) el.dataset.kind = kind;
}

function nowISO() {
  return new Date().toISOString();
}

/* 4. 위치 확인 */
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("GEO_NOT_SUPPORTED");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy
        });
      },
      () => reject("GEO_FAILED"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

/* 5. 서버 전송 */
async function sendToServer(payload) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // no-cors fallback
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });
  }
}

/* 6. 초기화 */
document.addEventListener("DOMContentLoaded", () => {
  // 요소 바인딩
  const btnLocate = $("btnLocate");
  const btnSubmit = $("btnSubmit");
  const locStatus = $("locStatus");
  const submitStatus = $("submitStatus");

  const latEl = $("lat");
  const lonEl = $("lon");
  const accEl = $("acc");

  const odorType = $("odorType");
  const odorIntensity = $("odorIntensity");
  const odorIntensityVal = $("odorIntensityVal");
  const durationCode = $("durationCode");
  const contextCode = $("contextCode");
  const exposureHeight = $("exposureHeight");
  const perceptionLevel = $("perceptionLevel");
  const memoShort = $("memoShort");

  // 옵션 채우기
  fillSelect(odorType, ODOR_TYPES);
  fillSelect(durationCode, DURATION_CODES);
  fillSelect(contextCode, CONTEXT_CODES);
  fillSelect(exposureHeight, EXPOSURE_HEIGHTS);
  fillSelect(perceptionLevel, PERCEPTION_LEVELS);

  // 강도 슬라이더 표시
  odorIntensityVal.textContent = odorIntensity.value;
  odorIntensity.addEventListener("input", () => {
    odorIntensityVal.textContent = odorIntensity.value;
  });

  // 위치 확인 버튼
  btnLocate.addEventListener("click", async () => {
    setStatus(locStatus, "위치 확인 중…", "busy");
    try {
      const loc = await getLocation();
      latEl.value = loc.lat.toFixed(6);
      lonEl.value = loc.lon.toFixed(6);
      accEl.value = Math.round(loc.acc);
      setStatus(locStatus, "위치 확인 완료", "ok");
    } catch {
      setStatus(locStatus, "위치 확인 실패", "err");
    }
  });

  // 제보 제출 버튼
  btnSubmit.addEventListener("click", async () => {
    setStatus(submitStatus, "제출 중…", "busy");

    try {
      // 필수값 체크
      if (!odorType.value) throw "냄새 종류";
      if (!durationCode.value) throw "지속시간";
      if (!contextCode.value) throw "발생 상황";
      if (!exposureHeight.value) throw "노출 높이";
      if (!perceptionLevel.value) throw "인지 수준";

      const loc = await getLocation();

      const payload = {
        report_id: "r_" + Date.now(),
        client_time: nowISO(),
        lat: loc.lat,
        lon: loc.lon,
        gps_accuracy_m: Math.round(loc.acc),
        odor_type: odorType.value,
        odor_intensity: Number(odorIntensity.value),
        duration_code: durationCode.value,
        context_code: contextCode.value,
        exposure_height: exposureHeight.value,
        perception_level: perceptionLevel.value,
        memo_short: (memoShort.value || "").slice(0, 80)
      };

      await sendToServer(payload);
      setStatus(submitStatus, "제보가 접수되었다.", "ok");
      memoShort.value = "";

    } catch (e) {
      setStatus(submitStatus, `제출 실패: ${e} 선택 필요`, "err");
    }
  });
});
