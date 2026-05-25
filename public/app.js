const API = "/api";

const SYMPTOM_TYPES = [
  { id: "good", label: "✅ Хороший день", bad: false },
  { id: "pain", label: "🩹 Боль", bad: true },
  { id: "nausea", label: "🤢 Тошнота", bad: true },
  { id: "weakness", label: "😔 Слабость", bad: true },
  { id: "confusion", label: "😵 Спутанность", bad: true },
  { id: "fall", label: "⚠️ Падение", bad: true },
  { id: "other", label: "📝 Другое", bad: false },
];

const TYPE_LABELS = Object.fromEntries(SYMPTOM_TYPES.map((s) => [s.id, s.label]));

const ROLE_LABELS = {
  coordinator: "Координатор",
  caregiver: "Ухаживающий",
  observer: "Помощник",
};

let state = {
  code: null,
  memberName: null,
  memberId: null,
  family: null,
  selectedSymptom: "good",
  aiQuestionHistory: [],
  aiCommunicationHistory: [],
  aiScenariosLoaded: false,
};

function loadSession() {
  const raw = localStorage.getItem("uideKutim");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    state.code = data.code;
    state.memberName = data.memberName;
    state.memberId = data.memberId;
  } catch {
    localStorage.removeItem("uideKutim");
  }
}

function saveSession() {
  localStorage.setItem(
    "uideKutim",
    JSON.stringify({
      code: state.code,
      memberName: state.memberName,
      memberId: state.memberId,
    })
  );
}

function clearSession() {
  localStorage.removeItem("uideKutim");
  state = {
    code: null,
    memberName: null,
    memberId: null,
    family: null,
    selectedSymptom: "good",
    aiQuestionHistory: [],
    aiCommunicationHistory: [],
    aiScenariosLoaded: false,
  };
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2800);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ошибка сервера");
  return data;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("ru-KZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderSymptomButtons(containerId, selectedId, onSelect) {
  const el = document.getElementById(containerId);
  el.innerHTML = SYMPTOM_TYPES.map(
    (t) =>
      `<button type="button" class="symptom-btn ${t.bad ? "bad" : ""} ${t.id === selectedId ? "selected" : ""}" data-type="${t.id}">${t.label}</button>`
  ).join("");

  el.querySelectorAll(".symptom-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      onSelect(btn.dataset.type);
      el.querySelectorAll(".symptom-btn").forEach((b) => {
        b.classList.toggle("selected", b.dataset.type === btn.dataset.type);
      });
    });
  });
}

function renderSymptomList(items, targetId, limit) {
  const el = document.getElementById(targetId);
  const list = limit ? items.slice(0, limit) : items;
  if (!list.length) {
    el.innerHTML = '<li class="empty">Пока нет записей</li>';
    return;
  }
  el.innerHTML = list
    .map(
      (s) => `
    <li>
      <strong>${TYPE_LABELS[s.type] || s.type}</strong>
      ${s.note ? `<div>${escapeHtml(s.note)}</div>` : ""}
      <div class="meta">${formatDate(s.createdAt)} · ${escapeHtml(s.memberName || "—")}</div>
    </li>`
    )
    .join("");
}

function renderTasks(tasks, targetId) {
  const el = document.getElementById(targetId);
  const open = tasks.filter((t) => t.status !== "done");
  if (!open.length) {
    el.innerHTML = '<li class="empty">Нет открытых задач</li>';
    return;
  }
  el.innerHTML = open
    .map(
      (t) => `
    <li class="task-item" data-id="${t.id}">
      <input type="checkbox" ${t.status === "done" ? "checked" : ""} />
      <div>
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="meta">${t.assignee ? `👤 ${escapeHtml(t.assignee)}` : "Без исполнителя"}${t.dueDate ? ` · до ${t.dueDate}` : ""}</div>
      </div>
    </li>`
    )
    .join("");

  el.querySelectorAll(".task-item input").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const id = cb.closest(".task-item").dataset.id;
      try {
        await api(`/families/${state.code}/tasks/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: cb.checked ? "done" : "open" }),
        });
        await refreshFamily();
        toast("Задача обновлена");
      } catch (e) {
        toast(e.message);
        cb.checked = !cb.checked;
      }
    });
  });
}

function renderFullTasks(tasks) {
  const el = document.getElementById("task-list");
  if (!tasks.length) {
    el.innerHTML = '<li class="empty">Задач пока нет</li>';
    return;
  }
  el.innerHTML = tasks
    .map(
      (t) => `
    <li class="task-item ${t.status === "done" ? "done" : ""}" data-id="${t.id}">
      <input type="checkbox" ${t.status === "done" ? "checked" : ""} />
      <div>
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="meta">${t.assignee ? escapeHtml(t.assignee) : "—"} · ${formatDate(t.createdAt)}</div>
      </div>
    </li>`
    )
    .join("");

  el.querySelectorAll(".task-item input").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const id = cb.closest(".task-item").dataset.id;
      try {
        await api(`/families/${state.code}/tasks/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: cb.checked ? "done" : "open" }),
        });
        await refreshFamily();
      } catch (e) {
        toast(e.message);
        cb.checked = !cb.checked;
      }
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function refreshFamily() {
  const family = await api(`/families/${state.code}`);
  state.family = family;
  renderDashboard();
}

function renderDashboard() {
  const f = state.family;
  if (!f) return;

  document.getElementById("display-code").textContent = f.code;
  document.getElementById("display-loved").textContent = f.lovedOneName;
  document.getElementById("display-circle").textContent = f.circleName;

  const banner = document.getElementById("escalation-banner");
  if (f.escalation?.alert) {
    banner.classList.remove("hidden");
    banner.innerHTML = `⚠️ <strong>Внимание семье:</strong> ${f.escalation.streak} дней подряд отмечены тревожные симптомы. Обсудите визит к врачу. При угрозе жизни — <strong>103</strong>.`;
  } else {
    banner.classList.add("hidden");
  }

  renderSymptomList(f.symptoms, "recent-symptoms", 5);
  renderSymptomList(f.symptoms, "full-symptoms");
  renderTasks(f.tasks, "recent-tasks");
  renderFullTasks(f.tasks);

  const members = document.getElementById("member-list");
  members.innerHTML = f.members
    .map((m) => `<li><strong>${escapeHtml(m.name)}</strong> <span class="meta">${ROLE_LABELS[m.role] || m.role}</span></li>`)
    .join("");

  renderSymptomButtons("quick-symptoms", state.selectedSymptom, (type) => {
    state.selectedSymptom = type;
    quickLogSymptom(type);
  });

  renderSymptomButtons("symptom-types", state.selectedSymptom, (type) => {
    state.selectedSymptom = type;
  });
}

async function quickLogSymptom(type) {
  try {
    await api(`/families/${state.code}/symptoms`, {
      method: "POST",
      body: JSON.stringify({
        type,
        memberId: state.memberId,
        memberName: state.memberName,
      }),
    });
    await refreshFamily();
    toast("Запись сохранена");
  } catch (e) {
    toast(e.message);
  }
}

async function loadScripts() {
  const scripts = await api("/scripts");
  const el = document.getElementById("scripts-list");
  el.innerHTML = scripts
    .map(
      (s) => `
    <div class="script-card">
      <h4>${escapeHtml(s.title)}</h4>
      <p class="kz">${escapeHtml(s.titleKz)}</p>
      <p>${escapeHtml(s.body)}</p>
    </div>`
    )
    .join("");
}

async function loadReportPreview() {
  const report = await api(`/families/${state.code}/report`);
  const el = document.getElementById("report-preview");
  const rows = report.entries
    .map(
      (e) =>
        `<tr><td>${formatDate(e.date)}</td><td>${escapeHtml(e.type)}</td><td>${escapeHtml(e.note || "—")}</td><td>${escapeHtml(e.recordedBy || "—")}</td></tr>`
    )
    .join("");

  const tasks = report.openTasks
    .map((t) => `<li>${escapeHtml(t.title)} (${escapeHtml(t.assignee || "—")})</li>`)
    .join("");

  el.innerHTML = `
    <div class="report-box" id="report-print-area">
      <h2>Журнал для врача — ${escapeHtml(report.lovedOneName)}</h2>
      <p class="muted">Семейный круг: ${escapeHtml(report.circleName)} · Сформировано: ${formatDate(report.generatedAt)}</p>
      <p><em>Не является медицинским заключением. Составлено семьёй.</em></p>
      ${report.escalation.alert ? `<p style="color:#b42318"><strong>⚠️ Тревожные дни подряд: ${report.escalation.streak}</strong></p>` : ""}
      <h3>Записи за ${report.periodDays} дней</h3>
      <table><thead><tr><th>Дата</th><th>Состояние</th><th>Комментарий</th><th>Кто записал</th></tr></thead><tbody>${rows || "<tr><td colspan=4>Нет записей</td></tr>"}</tbody></table>
      <h3>Открытые задачи семьи</h3>
      <ul>${tasks || "<li>—</li>"}</ul>
    </div>`;
}

function renderAiAnswer(targetId, text, isError = false) {
  const el = document.getElementById(targetId);
  el.classList.remove("hidden");
  el.style.borderColor = isError ? "#fecdca" : "var(--border)";
  el.style.background = isError ? "#fef3f2" : "#fafdfb";
  el.textContent = text;
}

async function loadAiScenarios() {
  if (state.aiScenariosLoaded) return;
  const select = document.getElementById("ai-scenario");
  select.innerHTML = "<option>Загрузка...</option>";
  try {
    const scenarios = await api("/ai/scenarios");
    select.innerHTML = scenarios
      .map((s) => `<option value="${s.id}">${escapeHtml(s.title)} — ${escapeHtml(s.description)}</option>`)
      .join("");
    state.aiScenariosLoaded = true;
  } catch (err) {
    select.innerHTML = '<option value="custom">Своя ситуация</option>';
    renderAiAnswer("ai-communication-answer", err.message, true);
  }
}

function openPrintReport() {
  const area = document.getElementById("report-print-area");
  if (!area) {
    toast("Сначала откройте вкладку «Врачу»");
    return;
  }
  const w = window.open("", "_blank");
  w.document.write(`
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>Отчёт для врача</title>
    <style>body{font-family:system-ui;padding:24px;max-width:800px;margin:0 auto}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;font-size:12px}h2{color:#1a5f4a}</style>
    </head><body>${area.innerHTML}</body></html>`);
  w.document.close();
  w.print();
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
      if (tab.dataset.tab === "ai") await loadAiScenarios();
      if (tab.dataset.tab === "scripts") await loadScripts();
      if (tab.dataset.tab === "report") await loadReportPreview();
    });
  });
}

document.getElementById("form-create").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const family = await api("/families", {
      method: "POST",
      body: JSON.stringify({
        circleName: fd.get("circleName"),
        lovedOneName: fd.get("lovedOneName"),
        coordinatorName: fd.get("coordinatorName"),
      }),
    });
    state.code = family.code;
    state.memberName = fd.get("coordinatorName");
    state.memberId = family.members[0].id;
    saveSession();
    await refreshFamily();
    showScreen("screen-dashboard");
    toast(`Круг создан! Код: ${family.code}`);
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById("form-join").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const { family, member } = await api("/families/join", {
      method: "POST",
      body: JSON.stringify({
        code: fd.get("code"),
        name: fd.get("name"),
        role: fd.get("role"),
      }),
    });
    state.code = family.code;
    state.memberName = member.name;
    state.memberId = member.id;
    saveSession();
    await refreshFamily();
    showScreen("screen-dashboard");
    toast("Вы в семейном круге");
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById("form-symptom").addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = new FormData(e.target).get("note");
  try {
    await api(`/families/${state.code}/symptoms`, {
      method: "POST",
      body: JSON.stringify({
        type: state.selectedSymptom,
        note,
        memberId: state.memberId,
        memberName: state.memberName,
      }),
    });
    e.target.reset();
    state.selectedSymptom = "good";
    await refreshFamily();
    toast("Запись добавлена");
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById("form-task").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api(`/families/${state.code}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: fd.get("title"),
        assignee: fd.get("assignee"),
        dueDate: fd.get("dueDate") || null,
        createdBy: state.memberName,
      }),
    });
    e.target.reset();
    await refreshFamily();
    toast("Задача добавлена");
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById("form-ai-question").addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = document.getElementById("ai-question-input").value.trim();
  if (!question) return;

  try {
    const data = await api("/ai/question", {
      method: "POST",
      body: JSON.stringify({
        familyCode: state.code,
        question,
        history: state.aiQuestionHistory,
      }),
    });
    state.aiQuestionHistory.push({ role: "user", content: question });
    state.aiQuestionHistory.push({ role: "assistant", content: data.answer });
    state.aiQuestionHistory = state.aiQuestionHistory.slice(-10);
    renderAiAnswer("ai-question-answer", data.answer);
    toast("Ответ готов");
  } catch (err) {
    renderAiAnswer("ai-question-answer", err.message, true);
  }
});

document.getElementById("form-ai-communication").addEventListener("submit", async (e) => {
  e.preventDefault();
  const scenarioId = document.getElementById("ai-scenario").value;
  const userMessage = document.getElementById("ai-communication-input").value.trim();

  try {
    const data = await api("/ai/communication", {
      method: "POST",
      body: JSON.stringify({
        scenarioId,
        userMessage,
        history: state.aiCommunicationHistory,
      }),
    });
    if (userMessage) {
      state.aiCommunicationHistory.push({ role: "user", content: userMessage });
    }
    state.aiCommunicationHistory.push({ role: "assistant", content: data.advice });
    state.aiCommunicationHistory = state.aiCommunicationHistory.slice(-10);
    renderAiAnswer("ai-communication-answer", data.advice);
    toast("Совет готов");
  } catch (err) {
    renderAiAnswer("ai-communication-answer", err.message, true);
  }
});

document.getElementById("btn-copy-code").addEventListener("click", () => {
  navigator.clipboard?.writeText(state.code);
  toast("Код скопирован — отправьте родственникам");
});

document.getElementById("btn-leave").addEventListener("click", () => {
  clearSession();
  showScreen("screen-landing");
});

document.getElementById("btn-print-report").addEventListener("click", openPrintReport);

setupTabs();
loadSession();

if (state.code) {
  refreshFamily()
    .then(() => showScreen("screen-dashboard"))
    .catch(() => {
      clearSession();
      showScreen("screen-landing");
    });
}
