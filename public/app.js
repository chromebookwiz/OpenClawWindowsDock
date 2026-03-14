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
const mockOsSummaryContainer = document.getElementById("mockOsSummary");
const mockOsFilesContainer = document.getElementById("mockOsFiles");
const mockOsAppsContainer = document.getElementById("mockOsApps");
const mockOsFeaturesContainer = document.getElementById("mockOsFeatures");
const mockOsPackagesContainer = document.getElementById("mockOsPackages");
const mockTerminalHistory = document.getElementById("mockTerminalHistory");
const mockOsCounts = document.getElementById("mockOsCounts");
const mockBatchSummary = document.getElementById("mockBatchSummary");
const authShell = document.getElementById("authShell");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authMessage = document.getElementById("authMessage");
const currentUserLabel = document.getElementById("currentUser");
const actionMessage = document.getElementById("actionMessage");

let authToken = window.localStorage.getItem("openclawwindowsdock.authToken") || "";
let currentUser = null;
let refreshInFlight = null;

document.getElementById("definitionRequest").value = defaultDefinitionPayload;
document.getElementById("bundlePayload").value = defaultBundlePayload;
document.getElementById("scheduleRequest").value = defaultScheduleRequest;
document.getElementById("webhookRequest").value = defaultWebhookRequest;
document.getElementById("mockTerminalCommand").value = 'help';
document.getElementById("mockFilePath").value = "/Users/model/Documents/notes.txt";
document.getElementById("mockFileContent").value = "Model-editable mock file. Add apps, features, or notes here.";
document.getElementById("mockAppName").value = "Calculator";
document.getElementById("mockAppCommand").value = "open /Apps/Calculator.app";
document.getElementById("mockAppDescription").value = "Performs mock calculations inside the simulated OS.";
document.getElementById("mockFeatureKey").value = "notifications";
document.getElementById("mockFeatureName").value = "Notifications";
document.getElementById("mockFeatureDescription").value = "Enable mock desktop alerts for completed tasks and app installs.";
document.getElementById("mockPackageName").value = "image-tools";
document.getElementById("mockPackageVersion").value = "1.0.0";
document.getElementById("mockBatchPayload").value = JSON.stringify({
  actions: [
    { type: "installPackage", name: "builder-tools", version: "2.0.0" },
    { type: "upsertApp", name: "Calculator", description: "Performs calculations.", command: "open /Apps/Calculator.app" },
    { type: "launchApp", name: "Calculator" },
    { type: "writeFile", path: "/Users/model/Documents/plan.txt", content: "Ship calculator and notifications." }
  ]
}, null, 2);

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

function setActionMessage(message, kind = "success") {
  if (!message) {
    actionMessage.textContent = "";
    actionMessage.className = "message-banner hidden";
    return;
  }

  actionMessage.textContent = message;
  actionMessage.className = `message-banner is-${kind}`;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runAction(callback, successMessage = "") {
  try {
    await callback();
    if (successMessage) {
      setActionMessage(successMessage, "success");
    }
  }
  catch (error) {
    setActionMessage(getErrorMessage(error), "error");
  }
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

function renderMockOs(state) {
  const directories = state.nodes.filter((node) => node.kind === "directory");
  const files = state.nodes.filter((node) => node.kind === "file");
  const terminalEntries = state.terminalHistory.slice(0, 12);

  mockOsCounts.textContent = `${state.nodes.length} nodes · ${state.apps.length} apps · ${state.features.length} features · ${state.packages.length} packages`;
  mockOsSummaryContainer.innerHTML = `
    <article class="card">
      <header>
        <div>
          <h3>${escapeHtml(state.name)}</h3>
          <div class="meta">Version ${escapeHtml(state.version)}</div>
        </div>
        <span class="badge">cwd ${escapeHtml(state.cwd)}</span>
      </header>
      <div class="meta">Directories ${directories.length}</div>
      <div class="meta">Files ${files.length}</div>
      <div class="meta">Running apps ${state.apps.filter((app) => app.running).length}</div>
      <div class="meta">Packages ${state.packages.length}</div>
    </article>
  `;

  mockTerminalHistory.textContent = terminalEntries.length
    ? terminalEntries
      .map((entry) => `[${entry.status}] ${entry.cwd} > ${entry.command}\n${entry.output}`)
      .join("\n\n")
    : "No mock terminal commands yet.";

  if (!state.nodes.length) {
    renderEmpty(mockOsFilesContainer, "No files or directories in the mock OS.");
  }
  else {
    mockOsFilesContainer.innerHTML = state.nodes
      .slice()
      .sort((left, right) => left.path.localeCompare(right.path))
      .slice(0, 18)
      .map((node) => `
        <article class="card">
          <header>
            <div>
              <h3>${escapeHtml(node.path)}</h3>
              <div class="meta">${escapeHtml(node.kind)}</div>
            </div>
          </header>
          ${node.kind === "file" ? `<div class="meta mono">${escapeHtml((node.content || "").slice(0, 160) || "<empty>")}</div>` : ""}
        </article>
      `).join("");
  }

  if (!state.apps.length) {
    renderEmpty(mockOsAppsContainer, "No mock apps installed.");
  }
  else {
    mockOsAppsContainer.innerHTML = state.apps.map((app) => `
      <article class="card">
        <header>
          <div>
            <h3>${escapeHtml(app.name)}</h3>
            <div class="meta">${escapeHtml(app.description || "No description")}</div>
          </div>
          <span class="status-pill ${app.running ? "status-enabled" : "status-disabled"}">${app.running ? "running" : "stopped"}</span>
        </header>
        <div class="meta mono">${escapeHtml(app.command)}</div>
        <div class="meta">${app.launchedAt ? `Launched ${escapeHtml(new Date(app.launchedAt).toLocaleString())}` : "Not running"}</div>
      </article>
    `).join("");
  }

  if (!state.features.length) {
    renderEmpty(mockOsFeaturesContainer, "No mock OS features configured.");
  }
  else {
    mockOsFeaturesContainer.innerHTML = state.features.map((feature) => `
      <article class="card">
        <header>
          <div>
            <h3>${escapeHtml(feature.name)}</h3>
            <div class="meta">${escapeHtml(feature.description || feature.key)}</div>
          </div>
          <span class="status-pill ${feature.enabled ? "status-enabled" : "status-disabled"}">${feature.enabled ? "enabled" : "disabled"}</span>
        </header>
        <div class="meta mono">${escapeHtml(feature.key)}</div>
      </article>
    `).join("");
  }

  if (!state.packages.length) {
    renderEmpty(mockOsPackagesContainer, "No packages installed.");
  }
  else {
    mockOsPackagesContainer.innerHTML = state.packages.map((pkg) => `
      <article class="card">
        <header>
          <div>
            <h3>${escapeHtml(pkg.name)}</h3>
            <div class="meta">Version ${escapeHtml(pkg.version)}</div>
          </div>
        </header>
        <div class="meta">Updated ${escapeHtml(new Date(pkg.updatedAt).toLocaleString())}</div>
      </article>
    `).join("");
  }
}

async function fetchJson(url, options) {
  const headers = new Headers(options?.headers || {});
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const payload = await response.text();
    let message = `Request failed for ${url}`;

    if (payload) {
      try {
        const parsedPayload = JSON.parse(payload);
        message = parsedPayload.error || payload;
      }
      catch {
        message = payload;
      }
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
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
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
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
      fetchJson("/artifacts"),
      fetchJson("/mock-os")
    ];

    if (currentUser.role === "admin") {
      requests.push(fetchJson("/users"));
    }
    else {
      requests.push(Promise.resolve({ users: [] }));
    }

    const [status, definitionsData, schedulesData, webhooksData, tasksData, artifactsData, mockOsState, usersData] = await Promise.all(requests);
    renderMetrics(status);
    renderOpenClawStatus(status.openClaw);
    renderDefinitions(definitionsData.definitions);
    renderSchedules(schedulesData.schedules);
    renderWebhooks(webhooksData.webhooks);
    renderTasks(tasksData.tasks);
    renderArtifacts(artifactsData.artifacts);
    renderUsers(usersData.users);
    renderMockOs(mockOsState);
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
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

document.getElementById("refreshAll").addEventListener("click", () => {
  void runAction(() => refresh());
});

document.getElementById("restartOpenClaw").addEventListener("click", () => {
  void runAction(async () => {
    await fetchJson("/openclaw/restart", { method: "POST" });
    await refresh();
  }, "Embedded OpenClaw restart requested.");
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

document.getElementById("definitionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
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
  }, "Definition saved.");
});

document.getElementById("scheduleForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
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
  }, "Schedule saved.");
});

document.getElementById("webhookForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
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
  }, "Webhook saved.");
});

document.getElementById("bundleForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
    const payload = JSON.parse(document.getElementById("bundlePayload").value);
    await fetchJson("/bundles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await refresh();
  }, "Bundle imported.");
});

document.getElementById("userForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
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
  }, "User created.");
});

document.getElementById("mockTerminalForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
    const result = await fetchJson("/mock-os/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: document.getElementById("mockTerminalCommand").value.trim() })
    });
    renderMockOs(result.state);
    setActionMessage(result.entry.output || "Mock terminal command completed.", result.entry.status === "failed" ? "error" : "success");
  });
});

document.getElementById("mockFileForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
    const state = await fetchJson("/mock-os/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: document.getElementById("mockFilePath").value.trim(),
        content: document.getElementById("mockFileContent").value
      })
    });
    renderMockOs(state);
  }, "Mock OS file saved.");
});

document.getElementById("mockFileDelete").addEventListener("click", () => {
  void runAction(async () => {
    const state = await fetchJson("/mock-os/files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: document.getElementById("mockFilePath").value.trim() })
    });
    renderMockOs(state);
  }, "Mock OS path deleted.");
});

document.getElementById("mockAppForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
    const state = await fetchJson("/mock-os/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("mockAppName").value.trim(),
        command: document.getElementById("mockAppCommand").value.trim(),
        description: document.getElementById("mockAppDescription").value.trim()
      })
    });
    renderMockOs(state);
  }, "Mock app saved.");
});

document.getElementById("mockAppLaunch").addEventListener("click", () => {
  void runAction(async () => {
    const state = await fetchJson("/mock-os/apps/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: document.getElementById("mockAppName").value.trim() })
    });
    renderMockOs(state);
  }, "Mock app launched.");
});

document.getElementById("mockAppClose").addEventListener("click", () => {
  void runAction(async () => {
    const state = await fetchJson("/mock-os/apps/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: document.getElementById("mockAppName").value.trim() })
    });
    renderMockOs(state);
  }, "Mock app closed.");
});

document.getElementById("mockAppRemove").addEventListener("click", () => {
  void runAction(async () => {
    const state = await fetchJson("/mock-os/apps/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: document.getElementById("mockAppName").value.trim() })
    });
    renderMockOs(state);
  }, "Mock app removed.");
});

document.getElementById("mockPackageForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
    const state = await fetchJson("/mock-os/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("mockPackageName").value.trim(),
        version: document.getElementById("mockPackageVersion").value.trim()
      })
    });
    renderMockOs(state);
  }, "Mock package installed.");
});

document.getElementById("mockPackageRemove").addEventListener("click", () => {
  void runAction(async () => {
    const state = await fetchJson("/mock-os/packages/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: document.getElementById("mockPackageName").value.trim() })
    });
    renderMockOs(state);
  }, "Mock package removed.");
});

document.getElementById("mockFeatureForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
    const state = await fetchJson("/mock-os/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: document.getElementById("mockFeatureKey").value.trim(),
        name: document.getElementById("mockFeatureName").value.trim(),
        description: document.getElementById("mockFeatureDescription").value.trim(),
        enabled: document.getElementById("mockFeatureEnabled").checked
      })
    });
    renderMockOs(state);
  }, "Mock OS feature saved.");
});

document.getElementById("mockBatchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
    const result = await fetchJson("/mock-os/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: document.getElementById("mockBatchPayload").value
    });
    mockBatchSummary.textContent = result.summary || "No action output.";
    renderMockOs(result.state);
  }, "Mock OS action batch applied.");
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

document.body.addEventListener("click", (event) => {
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
    void runAction(async () => {
      await fetchJson(`/tasks/${retryTaskId}/retry`, { method: "POST" });
      await refresh();
    }, "Task requeued.");
    return;
  }

  if (definitionId) {
    void runAction(async () => {
      await fetchJson(`/definitions/${definitionId}/enqueue`, { method: "POST" });
      await refresh();
    }, "Definition enqueued.");
    return;
  }

  if (toggleScheduleId) {
    void runAction(async () => {
      await fetchJson(`/schedules/${toggleScheduleId}/toggle`, { method: "POST" });
      await refresh();
    }, "Schedule updated.");
    return;
  }

  if (runScheduleId) {
    void runAction(async () => {
      await fetchJson(`/schedules/${runScheduleId}/run`, { method: "POST" });
      await refresh();
    }, "Schedule run queued.");
    return;
  }

  if (toggleWebhookId) {
    void runAction(async () => {
      await fetchJson(`/webhooks/${toggleWebhookId}/toggle`, { method: "POST" });
      await refresh();
    }, "Webhook updated.");
    return;
  }

  if (rotateWebhookId) {
    void runAction(async () => {
      await fetchJson(`/webhooks/${rotateWebhookId}/rotate`, { method: "POST" });
      await refresh();
    }, "Webhook secret rotated.");
    return;
  }
});

document.getElementById("webhookTargetType").dispatchEvent(new Event("change"));
document.getElementById("scheduleMode").dispatchEvent(new Event("change"));
void runAction(() => refresh());
setInterval(() => {
  void refresh().catch((error) => {
    setActionMessage(getErrorMessage(error), "error");
  });
}, 15000);