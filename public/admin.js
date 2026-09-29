const login = document.getElementById("login");
const dash = document.getElementById("dash");
const error = document.getElementById("login-error");
let password = sessionStorage.getItem("modutaxi_admin_password") || "";

function metric(value, label) { return `<article class="metric"><b>${Number(value || 0).toLocaleString("ko-KR")}</b><span>${label}</span></article>`; }
function render(stats) {
  document.getElementById("metrics").innerHTML = [
    metric(stats.uniqueVisitors, "전체 방문자 수"),
    metric(stats.freeTrialClicks, "고연전 서비스 무료 체험 클릭"),
    metric(stats.preorderClicks, "사전 예약 990원 클릭"),
  ].join("");
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