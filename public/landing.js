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

async function track(type) {
  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, utm }),
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
document.getElementById("figma-open").addEventListener("click", trackPreview);
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

document.querySelectorAll("[data-cta]").forEach((el) => {
  el.addEventListener("click", () => track("cta_click"));
});

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
  name: (v) => v.trim().length > 0 && v.trim().length <= 40,
  email: (v) => /^[^\s@]+@korea\.ac\.kr$/i.test(v.trim()),
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  timeFrom: (v) => Boolean(v),
  timeTo: (v, all) => !v || v >= all.timeFrom,
  origin: (v) => v.trim().length > 0,
  destination: (v) => v.trim().length > 0,
  partySize: (v) => ["1", "2", "3", "4"].includes(v),
  flexible: (_v, all) => all.flexible === "true" || all.flexible === "false",
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
    consentNews: data.get("consentNews") === "on",
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
    if (json.duplicateUpdate) {
      document.getElementById("duplicate-note").hidden = false;
    }
  } catch {
    statusEl.className = "status err";
    statusEl.textContent = "신청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
    submitBtn.disabled = false;
  }
});
