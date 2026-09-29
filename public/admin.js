const login = document.getElementById("login");
const dash = document.getElementById("dash");
const error = document.getElementById("login-error");
let password = sessionStorage.getItem("modutaxi_admin_password") || "";

function number(value) { return Number(value || 0).toLocaleString("ko-KR"); }
function metric(value, label) { return `<article class="metric"><b>${number(value)}</b><span>${label}</span></article>`; }
function rate(numerator, denominator) { return denominator ? `${Math.round(numerator / denominator * 100)}%` : "–"; }
function rows(items, left, right) {
  if (!items?.length) return '<p class="empty">아직 집계된 데이터가 없어요.</p>';
  return `<div class="table-wrap"><table><tbody>${items.map((item) => `<tr><td>${left(item)}</td><td>${right(item)}</td></tr>`).join("")}</tbody></table></div>`;
}
function render(stats) {
  document.getElementById("metrics").innerHTML = [
    metric(stats.uniqueVisitors, "전체 방문자 수"),
    metric(stats.freeTrialClicks, "무료 체험 클릭"),
    metric(stats.applicationSubmits, "서비스 신청 완료"),
    metric(stats.preorderSubmits, "사전예약 등록"),
    metric(stats.applicationsTotal, "누적 서비스 신청"),
    metric(stats.preordersTotal, "누적 사전예약"),
    metric(stats.uniqueApplicants, "고유 신청자"),
    metric(stats.repeatApplicants, "재신청자"),
  ].join("");
  document.getElementById("funnel").innerHTML = `
    <h2>전환 퍼널</h2>
    <p>방문 <span class="rate">${number(stats.uniqueVisitors)}</span> → 무료 체험 클릭 <span class="rate">${number(stats.freeTrialClicks)} (${rate(stats.freeTrialClicks, stats.uniqueVisitors)})</span> → 폼 시작 <span class="rate">${number(stats.formStarts)} (${rate(stats.formStarts, stats.freeTrialClicks)})</span> → 신청 완료 <span class="rate">${number(stats.applicationSubmits)} (${rate(stats.applicationSubmits, stats.formStarts)})</span></p>
    <p>사전예약 클릭 <span class="rate">${number(stats.preorderClicks)}</span> → 폼 시작 <span class="rate">${number(stats.preorderFormStarts)}</span> → 등록 완료 <span class="rate">${number(stats.preorderSubmits)} (${rate(stats.preorderSubmits, stats.preorderFormStarts)})</span></p>`;
  document.getElementById("routes").innerHTML = rows(stats.routes, (x) => x.label, (x) => `${number(x.count)}건`);
  document.getElementById("times").innerHTML = rows(stats.timeSlots, (x) => x.label, (x) => `${number(x.count)}건`);
  document.getElementById("channels").innerHTML = rows(stats.channels, (x) => x.label, (x) => `${number(x.visitors)} 방문 · ${number(x.submits)} 신청`);
  const op = stats.operations || {};
  document.getElementById("operations").innerHTML = `<p>매칭 완료 ${number(op.matchedApplications)}건 · 취소 ${number(op.cancelledApplications)}건 · 노쇼 ${number(op.noShows)}건 · 재이용 ${number(op.repeatRiders)}명</p><p class="help">매칭 성공률: ${rate(op.matchedApplications, stats.applicationsTotal)}</p>`;
  document.getElementById("updated").textContent = `최근 집계 시각: ${new Date().toLocaleString("ko-KR")}`;
}
async function load() {
  const res = await fetch("/api/analytics", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({password}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error === "unauthorized" ? "비밀번호가 올바르지 않거나 ADMIN_PASSWORD 설정이 없습니다." : "통계를 불러오지 못했습니다.");
  render(data); login.hidden = true; dash.hidden = false;
}
login.addEventListener("submit", async (event) => { event.preventDefault(); password = document.getElementById("password").value; error.textContent = ""; try { await load(); sessionStorage.setItem("modutaxi_admin_password", password); } catch (e) { error.textContent = e.message; } });
document.getElementById("refresh").addEventListener("click", () => load().catch((e) => alert(e.message)));
document.getElementById("logout").addEventListener("click", () => { sessionStorage.removeItem("modutaxi_admin_password"); location.reload(); });
if (password) load().catch(() => sessionStorage.removeItem("modutaxi_admin_password"));