// Prefill name from URL ?employee=
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const employee = params.get("employee") || params.get("name") || "";
  if (employee) document.getElementById("nameBox").value = employee;
});

function doAction(action) {
  const name = document.getElementById("nameBox").value.trim();
  if (!name) return setStatus("⛔ Enter name first");

  fetch("/attendance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee: name, action })
  })
  .then(r => r.json())
  .then(d => setStatus(d.msg || "Unknown response"))
  .catch(err => setStatus("Error: " + err.message));
}

function setStatus(text) {
  document.getElementById("status").innerText = text;
}
