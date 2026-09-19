// MediSync frontend — plain JS, no build step required.
// Talks to the FastAPI backend defined in /backend.

const API_BASE = window.MEDISYNC_API_BASE || "http://localhost:8000";

const state = {
  token: localStorage.getItem("medisync_token") || null,
  user: JSON.parse(localStorage.getItem("medisync_user") || "null"),
  patients: [],
  selectedPatientId: null,
  selectedPatient: null,
  showResolvedConflicts: false,
};

// ---------------------------------------------------------------
// API helper
// ---------------------------------------------------------------
async function api(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data;
}

async function apiLoginForm(email, password) {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Login failed");
  return data;
}

// ---------------------------------------------------------------
// Toast
// ---------------------------------------------------------------
let toastTimer = null;
function showToast(message, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.toggle("toast-error", isError);
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

// ---------------------------------------------------------------
// Auth
// ---------------------------------------------------------------
function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("medisync_token", token);
  localStorage.setItem("medisync_user", JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("medisync_token");
  localStorage.removeItem("medisync_user");
}

function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("main-app").classList.remove("hidden");
  document.getElementById("user-name").textContent = state.user.full_name;
  loadPatients();
}

function showAuth() {
  document.getElementById("main-app").classList.add("hidden");
  document.getElementById("auth-screen").classList.remove("hidden");
}

document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    document.getElementById("login-form").classList.toggle("hidden", target !== "login");
    document.getElementById("register-form").classList.toggle("hidden", target !== "register");
    document.getElementById("auth-error").classList.add("hidden");
  });
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("auth-error");
  errorEl.classList.add("hidden");
  try {
    const data = await apiLoginForm(email, password);
    setSession(data.access_token, data.user);
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
});

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const full_name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const errorEl = document.getElementById("auth-error");
  errorEl.classList.add("hidden");
  try {
    const data = await api("/api/auth/register", { method: "POST", body: { full_name, email, password } });
    setSession(data.access_token, data.user);
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  clearSession();
  showAuth();
});

// ---------------------------------------------------------------
// Patients
// ---------------------------------------------------------------
async function loadPatients(search) {
  try {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    state.patients = await api(`/api/patients${query}`);
    renderPatientList();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderPatientList() {
  const container = document.getElementById("patient-list");
  container.innerHTML = "";

  if (state.patients.length === 0) {
    container.innerHTML = `<div class="empty-list-msg">No patients yet. Click “+ New” to add one.</div>`;
    return;
  }

  for (const p of state.patients) {
    const card = document.createElement("div");
    card.className = "patient-card" + (p.id === state.selectedPatientId ? " selected" : "");
    card.innerHTML = `
      <div class="patient-card-name">${escapeHtml(p.full_name)}</div>
      <div class="patient-card-meta">MRN ${escapeHtml(p.mrn)} · ${p.document_count} document${p.document_count === 1 ? "" : "s"}</div>
      ${p.open_conflict_count > 0 ? `<div class="patient-card-flags">⚠ ${p.open_conflict_count} flag${p.open_conflict_count === 1 ? "" : "s"} to review</div>` : ""}
    `;
    card.addEventListener("click", () => selectPatient(p.id));
    container.appendChild(card);
  }
}

document.getElementById("patient-search").addEventListener("input", (e) => {
  loadPatients(e.target.value.trim());
});

async function selectPatient(id) {
  state.selectedPatientId = id;
  renderPatientList();
  document.getElementById("empty-state").classList.add("hidden");
  document.getElementById("patient-detail").classList.remove("hidden");
  await refreshPatientDetail();
}

async function refreshPatientDetail() {
  if (!state.selectedPatientId) return;
  try {
    const [patient, timeline, conflicts] = await Promise.all([
      api(`/api/patients/${state.selectedPatientId}`),
      api(`/api/patients/${state.selectedPatientId}/timeline`),
      api(`/api/patients/${state.selectedPatientId}/conflicts?include_resolved=${state.showResolvedConflicts}`),
    ]);
    state.selectedPatient = patient;
    renderPatientHeader(patient);
    renderTimeline(timeline);
    renderConflicts(conflicts);
    renderConflictBanner(conflicts);
    await refreshDocumentsList();
    renderPatientList(); // refresh flag counts in sidebar
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderPatientHeader(p) {
  document.getElementById("pd-name").textContent = p.full_name;
  const age = p.date_of_birth ? `, DOB ${p.date_of_birth}` : "";
  document.getElementById("pd-meta").textContent = `MRN ${p.mrn}${age}${p.gender ? " · " + capitalize(p.gender) : ""}`;

  const allergiesEl = document.getElementById("pd-allergies");
  if (p.known_allergies && p.known_allergies.length > 0) {
    allergiesEl.textContent = "Known allergies: " + p.known_allergies.join(", ");
    allergiesEl.className = "pd-allergies has-allergies";
  } else {
    allergiesEl.textContent = "No known allergies declared";
    allergiesEl.className = "pd-allergies none-declared";
  }
}

function renderConflictBanner(conflicts) {
  const banner = document.getElementById("conflict-banner");
  const unresolvedHigh = conflicts.filter((c) => !c.resolved && c.severity === "high");
  if (unresolvedHigh.length > 0) {
    banner.textContent = `⚠ ${unresolvedHigh.length} high-priority flag${unresolvedHigh.length === 1 ? "" : "s"} need${unresolvedHigh.length === 1 ? "s" : ""} clinician review before proceeding.`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
  const badge = document.getElementById("conflict-count-badge");
  const openCount = conflicts.filter((c) => !c.resolved).length;
  if (openCount > 0) {
    badge.textContent = openCount;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// ---------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ---------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------
function renderTimeline(events) {
  const container = document.getElementById("timeline-list");
  container.innerHTML = "";

  if (events.length === 0) {
    container.innerHTML = `<div class="empty-panel-msg">No documents yet. Upload a prescription, lab report, or note to start building this patient's timeline.</div>`;
    return;
  }

  for (const ev of events) {
    const item = document.createElement("div");
    item.className = "timeline-event" + (ev.date ? "" : " undated");
    item.innerHTML = `
      <div class="te-date">
        ${ev.date ? formatDate(ev.date) : "Date unknown"}
        ${ev.date_is_estimated ? '<span class="est">(auto-detected — verify)</span>' : ""}
      </div>
      <div class="te-card">
        <span class="te-type">${docTypeLabel(ev.doc_type)}</span>
        <div class="te-title">${escapeHtml(ev.title)}</div>
        <div class="te-summary">${escapeHtml(ev.summary)}</div>
      </div>
    `;
    item.querySelector(".te-card").addEventListener("click", () => openDocumentModal(ev.document_id));
    container.appendChild(item);
  }
}

// ---------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------
function renderConflicts(conflicts) {
  const container = document.getElementById("conflicts-list");
  container.innerHTML = "";

  if (conflicts.length === 0) {
    container.innerHTML = `<div class="empty-panel-msg">No flags. MediSync checks allergy/medication matches, dosage consistency, and missing dates every time a document is added.</div>`;
    return;
  }

  for (const c of conflicts) {
    const item = document.createElement("div");
    item.className = `conflict-item sev-${c.severity}` + (c.resolved ? " resolved" : "");
    item.innerHTML = `
      <span class="conflict-sev-tag">${c.severity}</span>
      <div class="conflict-body">
        <div class="conflict-desc">${escapeHtml(c.description)}</div>
        ${c.resolved ? `<div class="conflict-note">Resolved${c.resolved_note ? ": " + escapeHtml(c.resolved_note) : ""}</div>` : ""}
      </div>
      ${!c.resolved ? `<button class="btn btn-small btn-ghost conflict-resolve-btn">Mark reviewed</button>` : ""}
    `;
    if (!c.resolved) {
      item.querySelector(".conflict-resolve-btn").addEventListener("click", () => resolveConflict(c.id));
    }
    container.appendChild(item);
  }
}

async function resolveConflict(conflictId) {
  const note = prompt("Optional note on how this was resolved (leave blank to skip):", "");
  try {
    await api(`/api/patients/${state.selectedPatientId}/conflicts/${conflictId}/resolve`, {
      method: "POST",
      body: { resolved_note: note || null },
    });
    showToast("Flag marked as reviewed.");
    await refreshPatientDetail();
  } catch (err) {
    showToast(err.message, true);
  }
}

document.getElementById("show-resolved-toggle").addEventListener("change", (e) => {
  state.showResolvedConflicts = e.target.checked;
  refreshPatientDetail();
});

// ---------------------------------------------------------------
// Documents list + detail modal
// ---------------------------------------------------------------
let documentsCache = [];

async function refreshDocumentsList() {
  try {
    documentsCache = await api(`/api/patients/${state.selectedPatientId}/documents`);
    renderDocumentsList(documentsCache);
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderDocumentsList(docs) {
  const container = document.getElementById("documents-list");
  container.innerHTML = "";
  if (docs.length === 0) {
    container.innerHTML = `<div class="empty-panel-msg">No documents uploaded yet.</div>`;
    return;
  }
  for (const d of docs) {
    const row = document.createElement("div");
    row.className = "document-row";
    row.innerHTML = `
      <div>
        <div class="dr-name">${escapeHtml(d.original_filename)}</div>
        <div class="dr-meta">${docTypeLabel(d.doc_type)} · uploaded ${formatDateTime(d.uploaded_at)}</div>
      </div>
      <span class="dr-status ${d.extraction_status}">${statusLabel(d.extraction_status)}</span>
    `;
    row.addEventListener("click", () => openDocumentModal(d.id));
    container.appendChild(row);
  }
}

async function openDocumentModal(documentId) {
  try {
    const doc = await api(`/api/patients/${state.selectedPatientId}/documents/${documentId}`);
    const sd = doc.structured_data || {};
    const body = document.getElementById("document-modal-body");
    body.innerHTML = `
      <div class="doc-detail-header">
        <div>
          <h3>${escapeHtml(doc.original_filename)}</h3>
          <p class="muted">${docTypeLabel(doc.doc_type)} · ${doc.date_source === "provided" ? "Date provided at upload" : doc.date_source === "extracted" ? "Date auto-detected — please verify" : "No date identified"}${doc.document_date ? ": " + formatDate(doc.document_date) : ""}</p>
        </div>
        <button class="btn btn-small btn-ghost" id="delete-doc-btn">Delete</button>
      </div>

      ${(sd.medications && sd.medications.length) ? `
        <div class="doc-detail-section">
          <h4>Medications detected</h4>
          <div class="doc-field-list">${sd.medications.map(m => `<div>• ${escapeHtml(m.name)}${m.dosage ? " — " + escapeHtml(m.dosage) : ""}${m.frequency ? ", " + escapeHtml(m.frequency) : ""}</div>`).join("")}</div>
        </div>` : ""}

      ${(sd.diagnoses && sd.diagnoses.length) ? `
        <div class="doc-detail-section">
          <h4>Diagnoses / assessment</h4>
          <div class="doc-field-list">${sd.diagnoses.map(d => `<div>• ${escapeHtml(d)}</div>`).join("")}</div>
        </div>` : ""}

      ${(sd.lab_values && sd.lab_values.length) ? `
        <div class="doc-detail-section">
          <h4>Lab values detected</h4>
          <div class="doc-field-list">${sd.lab_values.map(l => `<div>• ${escapeHtml(l.test)}: ${escapeHtml(l.value)}${l.unit ? " " + escapeHtml(l.unit) : ""}</div>`).join("")}</div>
        </div>` : ""}

      ${(sd.allergies && sd.allergies.length) ? `
        <div class="doc-detail-section">
          <h4>Allergies mentioned in this document</h4>
          <div>${sd.allergies.map(a => `<span class="chip allergy">${escapeHtml(a)}</span>`).join("")}</div>
        </div>` : ""}

      <div class="doc-detail-section">
        <h4>Extraction notes</h4>
        <p class="muted">${escapeHtml(doc.extraction_notes || "—")}</p>
      </div>

      <div class="doc-detail-section">
        <h4>Extracted raw text</h4>
        <div class="doc-raw-text">${escapeHtml(doc.raw_text || "No text extracted from this file.")}</div>
      </div>
    `;
    body.querySelector("#delete-doc-btn").addEventListener("click", () => deleteDocument(documentId));
    openModal("document-modal");
  } catch (err) {
    showToast(err.message, true);
  }
}

async function deleteDocument(documentId) {
  if (!confirm("Delete this document? This cannot be undone.")) return;
  try {
    await api(`/api/patients/${state.selectedPatientId}/documents/${documentId}`, { method: "DELETE" });
    closeModals();
    showToast("Document deleted.");
    await refreshPatientDetail();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------------------------------------------------------------
// Modals: new patient / edit patient / upload
// ---------------------------------------------------------------
function openModal(id) {
  document.getElementById("modal-backdrop").classList.remove("hidden");
  document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}
function closeModals() {
  document.getElementById("modal-backdrop").classList.add("hidden");
}
document.getElementById("modal-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "modal-backdrop") closeModals();
});
document.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", closeModals));

document.getElementById("new-patient-btn").addEventListener("click", () => {
  document.getElementById("new-patient-form").reset();
  openModal("new-patient-modal");
});

document.getElementById("new-patient-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById("np-name").value.trim(),
    mrn: document.getElementById("np-mrn").value.trim(),
    date_of_birth: document.getElementById("np-dob").value || null,
    gender: document.getElementById("np-gender").value || null,
    known_allergies: splitCsv(document.getElementById("np-allergies").value),
    notes: document.getElementById("np-notes").value.trim() || null,
  };
  try {
    const patient = await api("/api/patients", { method: "POST", body: payload });
    closeModals();
    showToast(`Patient ${patient.full_name} created.`);
    await loadPatients();
    await selectPatient(patient.id);
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById("edit-patient-btn").addEventListener("click", () => {
  const p = state.selectedPatient;
  document.getElementById("ep-name").value = p.full_name;
  document.getElementById("ep-dob").value = p.date_of_birth || "";
  document.getElementById("ep-gender").value = p.gender || "";
  document.getElementById("ep-allergies").value = (p.known_allergies || []).join(", ");
  document.getElementById("ep-notes").value = p.notes || "";
  openModal("edit-patient-modal");
});

document.getElementById("edit-patient-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById("ep-name").value.trim(),
    date_of_birth: document.getElementById("ep-dob").value || null,
    gender: document.getElementById("ep-gender").value || null,
    known_allergies: splitCsv(document.getElementById("ep-allergies").value),
    notes: document.getElementById("ep-notes").value.trim() || null,
  };
  try {
    await api(`/api/patients/${state.selectedPatientId}`, { method: "PATCH", body: payload });
    closeModals();
    showToast("Patient updated.");
    await refreshPatientDetail();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById("upload-btn").addEventListener("click", () => {
  document.getElementById("upload-form").reset();
  openModal("upload-modal");
});

document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("up-file");
  if (!fileInput.files.length) return;

  const form = new FormData();
  form.set("doc_type", document.getElementById("up-type").value);
  const dateVal = document.getElementById("up-date").value;
  if (dateVal) form.set("document_date", dateVal);
  form.set("file", fileInput.files[0]);

  const submitBtn = document.getElementById("upload-submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Processing…";

  try {
    await api(`/api/patients/${state.selectedPatientId}/documents`, { method: "POST", body: form, isForm: true });
    closeModals();
    showToast("Document uploaded and processed.");
    await refreshPatientDetail();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Upload & process";
  }
});

// ---------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function splitCsv(str) {
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function docTypeLabel(type) {
  const labels = {
    prescription: "Prescription",
    lab_report: "Lab Report",
    consultation_note: "Consultation Note",
    scan: "Imaging / Scan",
    discharge_summary: "Discharge Summary",
    other: "Document",
  };
  return labels[type] || "Document";
}
function statusLabel(status) {
  return { ok: "Processed", failed: "Needs review", pending: "Pending" }[status] || status;
}

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------
if (state.token && state.user) {
  showApp();
} else {
  showAuth();
}
