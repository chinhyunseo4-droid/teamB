const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function readUtm() {
  const params = new URLSearchParams(location.search);
  const fromUrl = {};
  for (const key of UTM_KEYS) {
    if (params.get(key)) fromUrl[key] = params.get(key);
  }
  if (Object.keys(fromUrl).length) {
    sessionStorage.setItem("godeata_utm", JSON.stringify(fromUrl));
    return fromUrl;
  }
  try {
    return JSON.parse(sessionStorage.getItem("godeata_utm") || "{}");
  } catch {
    return {};
  }
}

const utm = readUtm();
const visitorId = (() => {
  const key = "modutaxi_visitor_id";
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
})();

async function track(type, meta = {}) {
  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, visitorId, utm, meta }),
    });
  } catch {
    /* ignore analytics failures */
  }
}

const config = await fetch("/api/config").then((r) => r.json()).catch(() => ({}));

document.querySelectorAll("[data-retention]").forEach((el) => {
  el.textContent = config.retentionPeriod || "[보관 기간]";
});
document.querySelectorAll("[data-operator]").forEach((el) => {
  el.textContent = config.operatorEmail || "[운영팀 이메일]";
});

// Swipe, keyboard and button navigation share the same scroll-snap carousel.
const trackElement = document.getElementById("preview-track");
const carousel = document.getElementById("figma-frame");
let slides = [...trackElement.children];
let currentSlide = 0;
let previewTracked = false;
function trackPreview() {
  if (!previewTracked) { previewTracked = true; track("figma_preview"); }
}
function updatePreview() {
  const width = trackElement.clientWidth;
  currentSlide = Math.max(0, Math.min(slides.length - 1, Math.round(trackElement.scrollLeft / width)));
  document.getElementById("preview-count").textContent = String(currentSlide + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
  document.getElementById("preview-prev").disabled = currentSlide === 0;
  document.getElementById("preview-next").disabled = currentSlide === slides.length - 1;
  slides.forEach((slide, index) => slide.setAttribute("aria-hidden", String(index !== currentSlide)));
}
function goToSlide(delta) {
  trackPreview();
  const next = Math.max(0, Math.min(slides.length - 1, currentSlide + delta));
  trackElement.scrollTo({ left: next * trackElement.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}
document.getElementById("preview-prev").addEventListener("click", () => goToSlide(-1));
document.getElementById("preview-next").addEventListener("click", () => goToSlide(1));
carousel.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault(); goToSlide(event.key === "ArrowRight" ? 1 : -1);
  }
});
trackElement.addEventListener("scroll", updatePreview, { passive: true });
carousel.addEventListener("pointerdown", trackPreview, { once: true });
document.getElementById("figma-open")?.addEventListener("click", trackPreview);
new ResizeObserver(updatePreview).observe(trackElement);
updatePreview();
document.querySelectorAll('a[href="#privacy"]').forEach((link) => {
  link.addEventListener("click", () => { document.getElementById("privacy").open = true; });
});

// Display individual frames from the supplied design image without resampling it.
fetch("/preview-slides.json").then((response) => response.json()).then(async (images) => {
  if (!Array.isArray(images) || !images.length) return;
  const elements = await Promise.all(images.map(async ({ src, alt, crop }) => {
    if (typeof src !== "string" || !src.startsWith("/assets/") || typeof alt !== "string") throw new Error("invalid_slide");
    const image = new Image(); image.src = src; image.alt = alt;
    await image.decode();
    const article = document.createElement("article"); article.className = "preview-slide image-slide";
    if (crop && [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) && crop.width > 0 && crop.height > 0) {
      const frame = document.createElement("div"); frame.className = "screenshot-crop";
      frame.style.aspectRatio = `${crop.width} / ${crop.height}`;
      image.style.width = `${image.naturalWidth / crop.width * 100}%`;
      image.style.left = `${-crop.x / crop.width * 100}%`;
      image.style.top = `${-crop.y / crop.height * 100}%`;
      frame.append(image); article.append(frame);
    } else {
      article.append(image);
    }
    const caption = document.createElement("p"); caption.className = "slide-caption"; caption.textContent = alt;
    article.append(caption); return article;
  }));
  trackElement.replaceChildren(...elements); slides = elements;
  trackElement.scrollLeft = 0; updatePreview();
  carousel.setAttribute("aria-label", "고대타 앱 디자인 미리보기");
}).catch(() => { /* Keep the usable illustrated guide when screenshots are unavailable. */ });

track("page_view");

document.querySelectorAll("[data-free-trial-cta]").forEach((el) => {
  el.addEventListener("click", () => track("free_trial_click"));
});
document.querySelectorAll("[data-preorder-cta]").forEach((el) => {
  el.addEventListener("click", () => track("preorder_click"));
});

const timeSlotsByRoute = {
  "10월 2일(금) | 잠실 → 목적지": [
    "14:00~15:00", "15:00~16:00", "16:00~17:00", "17:00~18:00", "18:00~19:00", "19:00 이후",
  ],
  "10월 3일(토) | 목동운동장주경기장 → 안암": [
    "14:00~15:00", "15:00~16:00", "16:00~17:00", "17:00~18:00", "18:00~19:00", "19:00 이후",
  ],
  "10월 3일(토) 밤 ~ 10월 4일(일) 새벽 | 안암 → 목적지": [
    "22:00~23:00", "23:00~24:00", "10월 4일 00:00~01:00", "10월 4일 01:00~02:00", "10월 4일 02:00~03:00", "10월 4일 03:00~04:00", "10월 4일 04:00 이후",
  ],
};

const routeSelect = document.getElementById("date");
const timeSelect = document.getElementById("timeFrom");
function updateTimeSlots() {
  const slots = timeSlotsByRoute[routeSelect.value] || [];
  const previous = timeSelect.value;
  timeSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = slots.length ? "선택해 주세요" : "날짜·구간을 먼저 선택해 주세요";
  timeSelect.append(placeholder);
  slots.forEach((slot) => {
    const option = document.createElement("option");
    option.value = slot;
    option.textContent = slot;
    timeSelect.append(option);
  });
  timeSelect.disabled = slots.length === 0;
  if (slots.includes(previous)) timeSelect.value = previous;
}
routeSelect?.addEventListener("change", updateTimeSlots);
updateTimeSlots();
const form = document.getElementById("apply-form");
let formStarted = false;
form.addEventListener(
  "focusin",
  () => {
    if (formStarted) return;
    formStarted = true;
    track("form_start");
  },
  true
);

const fields = {
  name: () => true,
  email: (v) => v.trim().length > 0 && v.trim().length <= 80,
  date: (v) => Boolean(v),
  timeFrom: (v) => Boolean(v),
  origin: (v) => Boolean(v),
  destination: (v) => Boolean(v),
  consentRequired: (_v, all) => all.consentRequired === true,
};

function readForm() {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || ""),
    email: String(data.get("email") || ""),
    date: String(data.get("date") || ""),
    timeFrom: String(data.get("timeFrom") || ""),
    timeTo: String(data.get("timeTo") || ""),
    origin: String(data.get("origin") || ""),
    destination: String(data.get("destination") || ""),
    partySize: String(data.get("partySize") || ""),
    flexible: data.get("flexible"),
    consentRequired: data.get("consentRequired") === "on",
  };
}

function setInvalid(name, on) {
  const el = form.querySelector(`[data-field="${name}"]`);
  if (el) el.classList.toggle("invalid", on);
}

function validate() {
  const values = readForm();
  let ok = true;
  for (const [key, fn] of Object.entries(fields)) {
    const valid = fn(values[key], values);
    setInvalid(key, !valid);
    if (!valid) ok = false;
  }
  return { ok, values };
}

const statusEl = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { ok, values } = validate();
  if (!ok) {
    statusEl.className = "status err";
    statusEl.textContent = "필수 항목을 확인해 주세요.";
    return;
  }
  submitBtn.disabled = true;
  statusEl.className = "status";
  statusEl.textContent = "신청을 보내고 있어요…";
  try {
    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        partySize: Number(values.partySize),
        flexible: values.flexible === "true",
        utm,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw json;
    form.classList.add("hide");
    document.getElementById("success").classList.add("show");
    document.getElementById("success").focus();
    track("application_submit_success", { route: values.date, timeSlot: values.timeFrom });
    if (json.duplicateUpdate) {
      document.getElementById("duplicate-note").hidden = false;
    }
  } catch {
    statusEl.className = "status err";
    statusEl.textContent = "신청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
    submitBtn.disabled = false;
  }
});

// Early-access reservation: email only, no payment is taken on this page.
const preorderForm = document.getElementById("preorder-form");
let preorderFormStarted = false;
if (preorderForm) {
  preorderForm.addEventListener("focusin", () => {
    if (!preorderFormStarted) { preorderFormStarted = true; track("preorder_form_start"); }
  }, true);
  const preorderStatus = document.getElementById("preorder-status");
  const preorderSubmit = document.getElementById("preorder-submit-btn");
  const preorderSuccess = document.getElementById("preorder-success");
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setPreorderInvalid(name, invalid) {
    preorderForm.querySelector(`[data-preorder-field="${name}"]`)?.classList.toggle("invalid", invalid);
  }

  preorderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(preorderForm);
    const email = String(data.get("email") || "").trim();
    const consentRequired = data.get("consentRequired") === "on";
    const emailInvalid = !emailPattern.test(email) || email.length > 120;
    setPreorderInvalid("email", emailInvalid);
    setPreorderInvalid("consentRequired", !consentRequired);
    preorderForm.querySelector(".preorder-consent-error")?.classList.toggle("show", !consentRequired);
    if (emailInvalid || !consentRequired) {
      preorderStatus.className = "status err";
      preorderStatus.textContent = "이메일과 필수 동의를 확인해 주세요.";
      return;
    }

    preorderSubmit.disabled = true;
    preorderStatus.className = "status";
    preorderStatus.textContent = "사전 예약 알림을 등록하고 있어요…";
    try {
      const response = await fetch("/api/preorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consentRequired, utm }),
      });
      const result = await response.json();
      if (!response.ok) throw result;
      preorderForm.classList.add("hide");
      preorderSuccess.classList.add("show");
      preorderSuccess.focus();
      track("preorder_submit_success");
    } catch {
      preorderStatus.className = "status err";
      preorderStatus.textContent = "사전 예약 알림을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
      preorderSubmit.disabled = false;
    }
  });
}