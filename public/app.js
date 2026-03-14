const defaultDefinitionPayload = JSON.stringify({
  name: "headline-capture",
  request: {
    name: "headline-capture",
    steps: [
      { type: "navigate", url: "https://example.com" },
      { type: "waitForSelector", selector: "h1" },
      { type: "extractText", selector: "h1", outputKey: "headline" },
      { type: "screenshot", fileName: "headline-capture.png" }
    ]
  }
}, null, 2);

const defaultBundlePayload = JSON.stringify({
  version: 1,
  name: "starter-bundle",
  definitions: [
    {
      name: "example-definition",
      request: {
        name: "example-definition",
        steps: [
          { type: "navigate", url: "https://example.com" },
          { type: "waitForSelector", selector: "h1" },
          { type: "screenshot", fileName: "bundle-example.png" }
        ]
      }
    }
  ],
  schedules: []
}, null, 2);

const defaultScheduleRequest = JSON.stringify({
  name: "quarter-hourly-example",
  steps: [
    { type: "navigate", url: "https://example.com" },
    { type: "screenshot", fileName: "quarter-hourly-example.png" }
  ]
}, null, 2);

const defaultWebhookRequest = JSON.stringify({
  name: "inline-webhook-example",
  steps: [
    { type: "navigate", url: "https://example.com" },
    { type: "screenshot", fileName: "inline-webhook.png" }
  ]
}, null, 2);

const metricContainer = document.getElementById("metrics");
const definitionsContainer = document.getElementById("definitions");
const schedulesContainer = document.getElementById("schedules");
const webhooksContainer = document.getElementById("webhooks");
const tasksContainer = document.getElementById("tasks");
const artifactsContainer = document.getElementById("artifacts");
const usersContainer = document.getElementById("users");
const openClawStatusContainer = document.getElementById("openClawStatus");
const authShell = document.getElementById("authShell");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authMessage = document.getElementById("authMessage");
const currentUserLabel = document.getElementById("currentUser");

let authToken = window.localStorage.getItem("openclawwindowsdock.authToken") || "";
let currentUser = null;

document.getElementById("definitionRequest").value = defaultDefinitionPayload;
document.getElementById("bundlePayload").value = defaultBundlePayload;
document.getElementById("scheduleRequest").value = defaultScheduleRequest;
document.getElementById("webhookRequest").value = defaultWebhookRequest;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEmpty(container, message) {
  container.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
}

function renderMetrics(status) {
  const items = [
    ["Browser", status.browserReady ? "Ready" : "Offline"],
    ["OpenClaw", status.openClaw?.healthy ? "Ready" : status.openClaw?.state || "Unknown"],
    ["Queue Depth", status.queueDepth],
    ["Definitions", status.definitionCount],
    ["Schedules", status.scheduleCount],
    ["Webhooks", status.webhookCount || 0],
    ["Completed", status.taskStats.completed],
    ["Failed", status.taskStats.failed]
  ];

  metricContainer.innerHTML = items.map(([label, value]) => `
    <article class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function renderOpenClawStatus(openClaw) {
  if (!openClaw) {
    renderEmpty(openClawStatusContainer, "OpenClaw status is unavailable.");
    return;
  }

  openClawStatusContainer.innerHTML = `
    <article class="card">
      <header>
        <div>
          <h3>${escapeHtml(openClaw.mode)} mode</h3>
          <div class="meta">${escapeHtml(openClaw.message)}</div>
        </div>
        <span class="status-pill ${openClaw.healthy ? "status-enabled" : "status-disabled"}">${escapeHtml(openClaw.state)}</span>
      </header>
      <div class="meta mono">${escapeHtml(openClaw.baseUrl)}</div>
      <div class="meta">Managed process ${openClaw.managedProcess ? "yes" : "no"}</div>
      <div class="meta">PID ${escapeHtml(openClaw.pid || "n/a")}</div>
      <div class="meta">Last checked ${escapeHtml(openClaw.lastCheckedAt || "never")}</div>
    </article>
  `;

  document.getElementById("restartOpenClaw").classList.toggle("hidden", openClaw.mode !== "embedded");
}

function setCounts(definitions, schedules, webhooks, tasks, artifacts, users) {
  document.getElementById("definitionCount").textContent = String(definitions.length);
  document.getElementById("scheduleCount").textContent = String(schedules.length);
  document.getElementById("webhookCount").textContent = String(webhooks.length);
  document.getElementById("taskCount").textContent = String(tasks.length);
  document.getElementById("artifactCount").textContent = String(artifacts.length);
  document.getElementById("userCount").textContent = String(users.length);
}

function renderDefinitions(definitions) {
  if (!definitions.length) {
    renderEmpty(definitionsContainer, "No saved definitions yet.");
    return;
  }

  definitionsContainer.innerHTML = definitions.map((definition) => `
    <article class="card">
      <header>
        <div>
          <h3>${escapeHtml(definition.name)}</h3>
          <div class="meta">${escapeHtml(definition.description || "No description")}</div>
        </div>
        <span class="badge">${definition.request.steps.length} steps</span>
      </header>
      <div class="meta">Updated ${new Date(definition.updatedAt).toLocaleString()}</div>
      <div class="actions">
        <button class="ghost-button" type="button" data-enqueue-definition="${definition.id}">Run Now</button>
      </div>
    </article>
  `).join("");
}

function renderSchedules(schedules) {
  if (!schedules.length) {
    renderEmpty(schedulesContainer, "No schedules configured yet.");
    return;
  }

  schedulesContainer.innerHTML = schedules.map((schedule) => `
    <article class="card">
      <header>
        <div>
          <h3>${escapeHtml(schedule.name)}</h3>
          <div class="meta">${schedule.mode === "cron" ? `Cron ${escapeHtml(schedule.cronExpression)}` : `Every ${escapeHtml(schedule.intervalMinutes)} minute(s)`}</div>
        </div>
        <span class="status-pill ${schedule.enabled ? "status-enabled" : "status-disabled"}">${schedule.enabled ? "enabled" : "disabled"}</span>
      </header>
      <div class="meta">Next run ${new Date(schedule.nextRunAt).toLocaleString()}</div>
      <div class="meta">Last task ${escapeHtml(schedule.lastTaskId || "none")}</div>
      <div class="actions">
        <button class="ghost-button" type="button" data-toggle-schedule="${schedule.id}">${schedule.enabled ? "Disable" : "Enable"}</button>
        <button class="ghost-button" type="button" data-run-schedule="${schedule.id}">Run Now</button>
      </div>
    </article>
  `).join("");
}

function renderWebhooks(webhooks) {
  if (!webhooks.length) {
    renderEmpty(webhooksContainer, "No webhooks configured yet.");
    return;
  }

  webhooksContainer.innerHTML = webhooks.map((webhook) => `
    <article class="card">
      <header>
        <div>
          <h3>${escapeHtml(webhook.name)}</h3>
          <div class="meta">Target ${escapeHtml(webhook.targetType)}</div>
        </div>
        <span class="status-pill ${webhook.enabled ? "status-enabled" : "status-disabled"}">${webhook.enabled ? "enabled" : "disabled"}</span>
      </header>
      <div class="meta mono">${escapeHtml(webhook.triggerUrl)}</div>
      <div class="meta">Last task ${escapeHtml(webhook.lastTaskId || "none")}</div>
      <div class="actions">
        <button class="ghost-button" type="button" data-toggle-webhook="${webhook.id}">${webhook.enabled ? "Disable" : "Enable"}</button>
        <button class="ghost-button" type="button" data-rotate-webhook="${webhook.id}">Rotate Secret</button>
      </div>
    </article>
  `).join("");
}

function renderTasks(tasks) {
  if (!tasks.length) {
    renderEmpty(tasksContainer, "No task runs yet.");
    return;
  }

  tasksContainer.innerHTML = tasks.slice(0, 12).map((task) => `
    <article class="card">
      <header>
        <div>
          <h3>${escapeHtml(task.name)}</h3>
          <div class="meta">${escapeHtml(task.id)}</div>
        </div>
        <span class="status-pill status-${task.status}">${escapeHtml(task.status)}</span>
      </header>
      <div class="meta">Created ${new Date(task.createdAt).toLocaleString()}</div>
      <div class="meta">Origin ${escapeHtml(task.origin?.type || "manual")}</div>
      <div class="meta">Final URL ${escapeHtml(task.result?.finalUrl || task.error || "pending")}</div>
      <div class="actions">
        <button class="ghost-button" type="button" data-retry-task="${task.id}">Retry</button>
      </div>
    </article>
  `).join("");
}

function renderArtifacts(artifacts) {
  if (!artifacts.length) {
    renderEmpty(artifactsContainer, "No artifacts captured yet.");
    return;
  }

  artifactsContainer.innerHTML = artifacts.slice(0, 20).map((artifact) => `
    <article class="card">
      <header>
        <div>
          <h3>${escapeHtml(artifact.fileName)}</h3>
        </div>
      </header>
      <div class="actions">
        <a class="text-link" href="${artifact.url}" target="_blank" rel="noreferrer">Open Artifact</a>
      </div>
    </article>
  `).join("");
}

function renderUsers(users) {
  if (!users.length) {
    renderEmpty(usersContainer, "No additional users created yet.");
    return;
  }

  usersContainer.innerHTML = users.map((user) => `
    <article class="card">
      <header>
        <div>
          <h3>${escapeHtml(user.username)}</h3>
          <div class="meta">Role ${escapeHtml(user.role)}</div>
        </div>
      </header>
      <div class="meta">Last login ${escapeHtml(user.lastLoginAt || "never")}</div>
    </article>
  `).join("");
}

async function fetchJson(url, options) {
  const headers = new Headers(options?.headers || {});
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Request failed for ${url}`);
  }

  return response.json();
}

function showAuth(mode, message = "") {
  authShell.classList.remove("hidden");
  authTitle.textContent = mode === "bootstrap" ? "Create the first admin user" : "Sign in to OpenClawWindowsDock";
  authSubtitle.textContent = mode === "bootstrap"
    ? "Bootstrap local authentication by creating the first administrator account."
    : "Authenticate to access the sandbox dashboard and API actions.";
  document.getElementById("authSubmit").textContent = mode === "bootstrap" ? "Create Admin" : "Sign In";
  authForm.dataset.mode = mode;
  authMessage.textContent = message;
}

function hideAuth() {
  authShell.classList.add("hidden");
}

function updateCurrentUserLabel() {
  currentUserLabel.textContent = currentUser
    ? `${currentUser.username} · ${currentUser.role}`
    : "Not signed in";
}

function updateFormOptions(definitions, schedules) {
  const definitionSelect = document.getElementById("webhookDefinitionId");
  const scheduleSelect = document.getElementById("webhookScheduleId");

  definitionSelect.innerHTML = definitions.length
    ? definitions.map((definition) => `<option value="${definition.id}">${escapeHtml(definition.name)}</option>`).join("")
    : "<option value=\"\">No definitions</option>";

  scheduleSelect.innerHTML = schedules.length
    ? schedules.map((schedule) => `<option value="${schedule.id}">${escapeHtml(schedule.name)}</option>`).join("")
    : "<option value=\"\">No schedules</option>";
}

async function refresh() {
  const authStatus = await fetchJson("/auth/status");
  if (!authStatus.authenticated) {
    currentUser = null;
    updateCurrentUserLabel();
    showAuth(authStatus.usersExist ? "login" : "bootstrap");
    return;
  }

  currentUser = authStatus.user;
  updateCurrentUserLabel();
  hideAuth();

  const requests = [
    fetchJson("/status"),
    fetchJson("/definitions"),
    fetchJson("/schedules"),
    fetchJson("/webhooks"),
    fetchJson("/tasks"),
    fetchJson("/artifacts")
  ];

  if (currentUser.role === "admin") {
    requests.push(fetchJson("/users"));
  }
  else {
    requests.push(Promise.resolve({ users: [] }));
  }

  const [status, definitionsData, schedulesData, webhooksData, tasksData, artifactsData, usersData] = await Promise.all(requests);
  renderMetrics(status);
  renderOpenClawStatus(status.openClaw);
  renderDefinitions(definitionsData.definitions);
  renderSchedules(schedulesData.schedules);
  renderWebhooks(webhooksData.webhooks);
  renderTasks(tasksData.tasks);
  renderArtifacts(artifactsData.artifacts);
  renderUsers(usersData.users);
  updateFormOptions(definitionsData.definitions, schedulesData.schedules);
  setCounts(
    definitionsData.definitions,
    schedulesData.schedules,
    webhooksData.webhooks,
    tasksData.tasks,
    artifactsData.artifacts,
    usersData.users
  );
  document.getElementById("usersPanel").classList.toggle("hidden", currentUser.role !== "admin");
}

document.getElementById("refreshAll").addEventListener("click", () => {
  void refresh();
});

document.getElementById("restartOpenClaw").addEventListener("click", async () => {
  await fetchJson("/openclaw/restart", { method: "POST" });
  await refresh();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = authForm.dataset.mode || "login";
  const payload = {
    username: document.getElementById("authUsername").value.trim(),
    password: document.getElementById("authPassword").value
  };

  try {
    const result = await fetchJson(mode === "bootstrap" ? "/auth/bootstrap" : "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    authToken = result.token;
    currentUser = result.user;
    window.localStorage.setItem("openclawwindowsdock.authToken", authToken);
    document.getElementById("authPassword").value = "";
    authMessage.textContent = "";
    await refresh();
  }
  catch (error) {
    authMessage.textContent = error instanceof Error ? error.message : String(error);
  }
});

document.getElementById("definitionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const explicitName = document.getElementById("definitionName").value.trim();
  const payload = JSON.parse(document.getElementById("definitionRequest").value);

  if (explicitName) {
    payload.name = explicitName;
  }

  await fetchJson("/definitions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  document.getElementById("definitionName").value = "";
  await refresh();
});

document.getElementById("scheduleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = document.getElementById("scheduleMode").value;
  const payload = {
    name: document.getElementById("scheduleName").value.trim(),
    mode,
    request: JSON.parse(document.getElementById("scheduleRequest").value)
  };

  if (mode === "cron") {
    payload.cronExpression = document.getElementById("scheduleCron").value.trim();
  }
  else {
    payload.intervalMinutes = Number.parseInt(document.getElementById("scheduleInterval").value, 10);
  }

  await fetchJson("/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  document.getElementById("scheduleName").value = "";
  await refresh();
});

document.getElementById("webhookForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const targetType = document.getElementById("webhookTargetType").value;
  const payload = {
    name: document.getElementById("webhookName").value.trim(),
    targetType
  };

  if (targetType === "definition") {
    payload.definitionId = document.getElementById("webhookDefinitionId").value;
  }
  else if (targetType === "schedule") {
    payload.scheduleId = document.getElementById("webhookScheduleId").value;
  }
  else {
    payload.request = JSON.parse(document.getElementById("webhookRequest").value);
  }

  await fetchJson("/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  document.getElementById("webhookName").value = "";
  await refresh();
});

document.getElementById("bundleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = JSON.parse(document.getElementById("bundlePayload").value);
  await fetchJson("/bundles/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await refresh();
});

document.getElementById("userForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await fetchJson("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: document.getElementById("userName").value.trim(),
      password: document.getElementById("userPassword").value,
      role: document.getElementById("userRole").value
    })
  });
  document.getElementById("userName").value = "";
  document.getElementById("userPassword").value = "";
  await refresh();
});

document.getElementById("webhookTargetType").addEventListener("change", () => {
  const targetType = document.getElementById("webhookTargetType").value;
  document.getElementById("webhookDefinitionId").classList.toggle("hidden", targetType !== "definition");
  document.getElementById("webhookScheduleId").classList.toggle("hidden", targetType !== "schedule");
  document.getElementById("webhookRequest").classList.toggle("hidden", targetType !== "request");
});

document.getElementById("scheduleMode").addEventListener("change", () => {
  const mode = document.getElementById("scheduleMode").value;
  document.getElementById("scheduleInterval").classList.toggle("hidden", mode !== "interval");
  document.getElementById("scheduleCron").classList.toggle("hidden", mode !== "cron");
});

document.body.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const retryTaskId = target.getAttribute("data-retry-task");
  const definitionId = target.getAttribute("data-enqueue-definition");
  const toggleScheduleId = target.getAttribute("data-toggle-schedule");
  const runScheduleId = target.getAttribute("data-run-schedule");
  const toggleWebhookId = target.getAttribute("data-toggle-webhook");
  const rotateWebhookId = target.getAttribute("data-rotate-webhook");

  if (retryTaskId) {
    await fetchJson(`/tasks/${retryTaskId}/retry`, { method: "POST" });
    await refresh();
    return;
  }

  if (definitionId) {
    await fetchJson(`/definitions/${definitionId}/enqueue`, { method: "POST" });
    await refresh();
    return;
  }

  if (toggleScheduleId) {
    await fetchJson(`/schedules/${toggleScheduleId}/toggle`, { method: "POST" });
    await refresh();
    return;
  }

  if (runScheduleId) {
    await fetchJson(`/schedules/${runScheduleId}/run`, { method: "POST" });
    await refresh();
    return;
  }

  if (toggleWebhookId) {
    await fetchJson(`/webhooks/${toggleWebhookId}/toggle`, { method: "POST" });
    await refresh();
    return;
  }

  if (rotateWebhookId) {
    await fetchJson(`/webhooks/${rotateWebhookId}/rotate`, { method: "POST" });
    await refresh();
  }
});

document.getElementById("webhookTargetType").dispatchEvent(new Event("change"));
document.getElementById("scheduleMode").dispatchEvent(new Event("change"));
void refresh();
setInterval(() => {
  void refresh();
}, 15000);