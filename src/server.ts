import express from "express";
import path from "node:path";
import pino from "pino";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { sanitizeUser, signAuthToken, verifyAuthToken, verifyPassword } from "./auth";
import { BrowserSession } from "./browserSession";
import { config } from "./config";
import { DefinitionsStore } from "./definitionsStore";
import { formatMockOsBatchResults, MockOsStore } from "./mockOsStore";
import { OpenClawConnection } from "./openClawConnection";
import { bundleSchema, browserTaskSchema, loginSchema, mockOsAppRemoveSchema, mockOsAppSchema, mockOsBatchSchema, mockOsDeleteSchema, mockOsFeatureSchema, mockOsFeatureToggleSchema, mockOsFileSchema, mockOsPackageSchema, mockOsTerminalSchema, scheduleSchema, taskDefinitionSchema, userBootstrapSchema, userCreateSchema, webhookSchema } from "./schema";
import { ensureStorage, listArtifacts } from "./storage";
import { ScheduleManager } from "./scheduleManager";
import { TaskQueue } from "./taskQueue";
import { TaskBundle, UserRole } from "./types";
import { UsersStore } from "./usersStore";
import { WebhooksStore } from "./webhooksStore";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

function baseUrlFor(request: express.Request): string {
  return `${request.protocol}://${request.get("host")}`;
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function authRequired(minimumRole: UserRole = "viewer") {
  const allowedRoles: Record<UserRole, UserRole[]> = {
    viewer: ["viewer", "operator", "admin"],
    operator: ["operator", "admin"],
    admin: ["admin"]
  };

  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }

    const payload = verifyAuthToken(token);
    if (!payload) {
      response.status(401).json({ error: "Invalid or expired token." });
      return;
    }

    if (!allowedRoles[minimumRole].includes(payload.role)) {
      response.status(403).json({ error: "Insufficient permissions." });
      return;
    }

    request.authUser = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      createdAt: "",
      updatedAt: "",
      lastLoginAt: undefined
    };

    next();
  };
}

async function main(): Promise<void> {
  await ensureStorage();

  const browserSession = new BrowserSession();
  await browserSession.start();

  const openClawConnection = new OpenClawConnection();
  await openClawConnection.initialize();

  const usersStore = new UsersStore();
  const definitionsStore = new DefinitionsStore();
  const webhooksStore = new WebhooksStore();
  const taskQueue = new TaskQueue(browserSession);
  await taskQueue.initialize();
  const scheduleManager = new ScheduleManager(taskQueue);
  await scheduleManager.initialize();
  const mockOsStore = new MockOsStore();
  await mockOsStore.initialize();

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));
  app.use("/dashboard/assets", express.static(path.join(process.cwd(), "public")));

  app.get("/auth/status", async (request, response) => {
    const usersExist = (await usersStore.count()) > 0;
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const payload = token ? verifyAuthToken(token) : null;
    response.json({
      authConfigured: config.authTokenSecret !== "openclawwindowsdock-local-dev-secret",
      usersExist,
      authenticated: Boolean(payload),
      user: payload ? { id: payload.sub, username: payload.username, role: payload.role } : null
    });
  });

  app.post("/auth/bootstrap", async (request, response) => {
    try {
      if ((await usersStore.count()) > 0) {
        response.status(409).json({ error: "Bootstrap already completed." });
        return;
      }

      const input = userBootstrapSchema.parse(request.body);
      const existingUser = await usersStore.getByUsername(input.username);
      if (existingUser) {
        response.status(409).json({ error: "Username already exists." });
        return;
      }

      const user = await usersStore.create({ username: input.username, password: input.password, role: "admin" });
      await usersStore.touchLogin(user.id);
      response.status(201).json({ token: signAuthToken(user), user: sanitizeUser(user) });
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid bootstrap payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to bootstrap auth");
      response.status(500).json({ error: "Failed to bootstrap auth." });
    }
  });

  app.post("/auth/login", async (request, response) => {
    try {
      const input = loginSchema.parse(request.body);
      const user = await usersStore.getByUsername(input.username);
      if (!user || !verifyPassword(input.password, user)) {
        response.status(401).json({ error: "Invalid credentials." });
        return;
      }

      await usersStore.touchLogin(user.id);
      response.json({ token: signAuthToken(user), user: sanitizeUser(user) });
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid login payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to log in");
      response.status(500).json({ error: "Failed to log in." });
    }
  });

  app.get("/hooks/:id/:secret", async (request, response) => {
    const webhookId = routeParam(request.params.id);
    const secret = routeParam(request.params.secret);
    const webhook = await webhooksStore.get(webhookId);
    if (!webhook || !webhook.enabled || webhook.secret !== secret) {
      response.status(404).json({ error: "Webhook not found." });
      return;
    }

    response.json({ status: "ready", name: webhook.name, targetType: webhook.targetType });
  });

  app.post("/hooks/:id/:secret", async (request, response) => {
    const webhookId = routeParam(request.params.id);
    const secret = routeParam(request.params.secret);
    const webhook = await webhooksStore.get(webhookId);
    if (!webhook || !webhook.enabled || webhook.secret !== secret) {
      response.status(404).json({ error: "Webhook not found." });
      return;
    }

    try {
      let queuedTaskId: string | undefined;

      if (webhook.targetType === "definition") {
        const definition = await definitionsStore.get(webhook.definitionId ?? "");
        if (!definition) {
          response.status(404).json({ error: "Webhook definition target not found." });
          return;
        }

        const task = await taskQueue.enqueue(definition.request, {
          type: "definition",
          definitionId: definition.id,
          bundleName: `webhook:${webhook.id}`
        });
        queuedTaskId = task.id;
      }
      else if (webhook.targetType === "schedule") {
        const schedule = await scheduleManager.runNow(webhook.scheduleId ?? "");
        if (!schedule) {
          response.status(404).json({ error: "Webhook schedule target not found." });
          return;
        }

        queuedTaskId = schedule.lastTaskId;
      }
      else {
        const task = await taskQueue.enqueue(webhook.request ?? { name: webhook.name, steps: [] }, {
          type: "manual",
          bundleName: `webhook:${webhook.id}`
        });
        queuedTaskId = task.id;
      }

      await webhooksStore.markTriggered(webhook.id, queuedTaskId);
      response.status(202).json({ status: "queued", taskId: queuedTaskId });
    }
    catch (error) {
      request.log.error({ err: error }, "Failed to trigger webhook");
      response.status(500).json({ error: "Failed to trigger webhook." });
    }
  });

  app.use((request, response, next) => {
    if (request.path === "/health"
      || request.path === "/dashboard"
      || request.path.startsWith("/dashboard/assets")
      || request.path.startsWith("/hooks/")
      || request.path.startsWith("/auth/")) {
      next();
      return;
    }

    authRequired("viewer")(request, response, next);
  });

  app.use("/artifacts/files", authRequired("viewer"), express.static(config.artifactsDir));

  app.get("/dashboard", (_request, response) => {
    response.sendFile(path.join(process.cwd(), "public", "index.html"));
  });

  app.get("/", (_request, response) => {
    response.json({
      service: "OpenClawWindowsDock",
      dashboard: "/dashboard",
      authStatusEndpoint: "/auth/status",
      authLoginEndpoint: "/auth/login",
      statusEndpoint: "/status",
      openClawStatusEndpoint: "/openclaw/status",
      healthEndpoint: "/health",
      tasksEndpoint: "/tasks",
      definitionsEndpoint: "/definitions",
      schedulesEndpoint: "/schedules",
      webhooksEndpoint: "/webhooks",
      usersEndpoint: "/users",
      bundlesExportEndpoint: "/bundles/export",
      bundlesImportEndpoint: "/bundles/import",
      browserRestartEndpoint: "/browser/restart",
      mockOsEndpoint: "/mock-os",
      mockOsTerminalEndpoint: "/mock-os/terminal",
      mockOsBatchEndpoint: "/mock-os/actions"
    });
  });

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      browserReady: browserSession.isReady(),
      queueDepth: taskQueue.getDepth()
    });
  });

  app.get("/status", async (_request, response) => {
    const taskStats = await taskQueue.getStats();
    const schedules = await scheduleManager.list();
    const definitions = await definitionsStore.list();
    const webhooks = await webhooksStore.list();
    const openClaw = await openClawConnection.getStatus();
    response.json({
      status: "ok",
      browserReady: browserSession.isReady(),
      openClaw,
      queueDepth: taskQueue.getDepth(),
      taskStats,
      definitionCount: definitions.length,
      scheduleCount: schedules.length,
      webhookCount: webhooks.length,
      port: config.port
    });
  });

  app.get("/openclaw/status", async (_request, response) => {
    response.json(await openClawConnection.getStatus());
  });

  app.post("/openclaw/restart", authRequired("operator"), async (_request, response) => {
    response.status(202).json(await openClawConnection.restart());
  });

  app.get("/users", authRequired("admin"), async (_request, response) => {
    const users = await usersStore.list();
    response.json({ users: usersStore.toSafeUsers(users) });
  });

  app.post("/users", authRequired("admin"), async (request, response) => {
    try {
      const input = userCreateSchema.parse(request.body);
      const existingUser = await usersStore.getByUsername(input.username);
      if (existingUser) {
        response.status(409).json({ error: "Username already exists." });
        return;
      }

      const user = await usersStore.create(input);
      response.status(201).json(sanitizeUser(user));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid user payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to create user");
      response.status(500).json({ error: "Failed to create user." });
    }
  });

  app.get("/artifacts", async (_request, response) => {
    const artifacts = await listArtifacts();
    response.json({
      artifacts: artifacts.map((fileName) => ({
        fileName,
        url: `/artifacts/files/${encodeURIComponent(fileName)}`
      }))
    });
  });

  app.get("/tasks", async (_request, response) => {
    const tasks = await taskQueue.getAllTasks();
    response.json({ tasks });
  });

  app.get("/tasks/:id", async (request, response) => {
    const task = await taskQueue.getTask(routeParam(request.params.id));
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    response.json(task);
  });

  app.post("/tasks", authRequired("operator"), async (request, response) => {
    try {
      const taskRequest = browserTaskSchema.parse(request.body);
      const task = await taskQueue.enqueue(taskRequest, { type: "manual" });
      response.status(202).json(task);
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid task payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to enqueue task");
      response.status(500).json({ error: "Failed to enqueue task." });
    }
  });

  app.post("/tasks/:id/retry", authRequired("operator"), async (request, response) => {
    const task = await taskQueue.retry(routeParam(request.params.id));
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    response.status(202).json(task);
  });

  app.get("/definitions", async (_request, response) => {
    const definitions = await definitionsStore.list();
    response.json({ definitions });
  });

  app.get("/definitions/:id", async (request, response) => {
    const definition = await definitionsStore.get(routeParam(request.params.id));
    if (!definition) {
      response.status(404).json({ error: "Definition not found." });
      return;
    }

    response.json(definition);
  });

  app.post("/definitions", authRequired("operator"), async (request, response) => {
    try {
      const input = taskDefinitionSchema.parse(request.body);
      const definition = await definitionsStore.create(input);
      response.status(201).json(definition);
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid definition payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to create definition");
      response.status(500).json({ error: "Failed to create definition." });
    }
  });

  app.post("/definitions/:id/enqueue", authRequired("operator"), async (request, response) => {
    const definition = await definitionsStore.get(routeParam(request.params.id));
    if (!definition) {
      response.status(404).json({ error: "Definition not found." });
      return;
    }

    const task = await taskQueue.enqueue(definition.request, {
      type: "definition",
      definitionId: definition.id
    });
    response.status(202).json(task);
  });

  app.get("/schedules", async (_request, response) => {
    const schedules = await scheduleManager.list();
    response.json({ schedules });
  });

  app.get("/schedules/:id", async (request, response) => {
    const schedule = await scheduleManager.get(routeParam(request.params.id));
    if (!schedule) {
      response.status(404).json({ error: "Schedule not found." });
      return;
    }

    response.json(schedule);
  });

  app.post("/schedules", authRequired("operator"), async (request, response) => {
    try {
      const input = scheduleSchema.parse(request.body);
      const schedule = await scheduleManager.create(input);
      response.status(201).json(schedule);
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid schedule payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to create schedule");
      response.status(500).json({ error: "Failed to create schedule." });
    }
  });

  app.post("/schedules/:id/toggle", authRequired("operator"), async (request, response) => {
    const schedule = await scheduleManager.toggle(routeParam(request.params.id));
    if (!schedule) {
      response.status(404).json({ error: "Schedule not found." });
      return;
    }

    response.status(202).json(schedule);
  });

  app.post("/schedules/:id/run", authRequired("operator"), async (request, response) => {
    const schedule = await scheduleManager.runNow(routeParam(request.params.id));
    if (!schedule) {
      response.status(404).json({ error: "Schedule not found." });
      return;
    }

    response.status(202).json(schedule);
  });

  app.get("/bundles/export", async (_request, response) => {
    const definitions = await definitionsStore.list();
    const schedules = await scheduleManager.list();
    const bundle: TaskBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      name: "openclawwindowsdock-export",
      definitions: definitions.map((definition) => ({
        name: definition.name,
        description: definition.description,
        request: definition.request
      })),
      schedules: schedules.map((schedule) => ({
        name: schedule.name,
        enabled: schedule.enabled,
        mode: schedule.mode,
        intervalMinutes: schedule.intervalMinutes,
        cronExpression: schedule.cronExpression,
        request: schedule.request,
        definitionId: schedule.definitionId
      }))
    };

    response.setHeader("Content-Disposition", "attachment; filename=openclaw-bundle.json");
    response.json(bundle);
  });

  app.post("/bundles/import", authRequired("operator"), async (request, response) => {
    try {
      const bundle = bundleSchema.parse(request.body);
      const importedDefinitions = [];
      const importedSchedules = [];

      for (const definition of bundle.definitions) {
        importedDefinitions.push(await definitionsStore.create(definition));
      }

      for (const schedule of bundle.schedules) {
        importedSchedules.push(await scheduleManager.create(schedule));
      }

      response.status(201).json({ importedDefinitions, importedSchedules });
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid bundle payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to import bundle");
      response.status(500).json({ error: "Failed to import bundle." });
    }
  });

  app.get("/webhooks", async (request, response) => {
    const webhooks = await webhooksStore.list();
    const baseUrl = baseUrlFor(request);
    response.json({ webhooks: webhooks.map((webhook) => webhooksStore.toSafeWebhook(webhook, baseUrl)) });
  });

  app.post("/webhooks", authRequired("operator"), async (request, response) => {
    try {
      const input = webhookSchema.parse(request.body);
      const webhook = await webhooksStore.create({ ...input, createdByUserId: request.authUser?.id });
      response.status(201).json(webhooksStore.toSafeWebhook(webhook, baseUrlFor(request)));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid webhook payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to create webhook");
      response.status(500).json({ error: "Failed to create webhook." });
    }
  });

  app.post("/webhooks/:id/toggle", authRequired("operator"), async (request, response) => {
    const webhook = await webhooksStore.toggle(routeParam(request.params.id));
    if (!webhook) {
      response.status(404).json({ error: "Webhook not found." });
      return;
    }

    response.status(202).json(webhooksStore.toSafeWebhook(webhook, baseUrlFor(request)));
  });

  app.post("/webhooks/:id/rotate", authRequired("operator"), async (request, response) => {
    const webhook = await webhooksStore.rotate(routeParam(request.params.id));
    if (!webhook) {
      response.status(404).json({ error: "Webhook not found." });
      return;
    }

    response.status(202).json(webhooksStore.toSafeWebhook(webhook, baseUrlFor(request)));
  });

  app.post("/browser/restart", authRequired("operator"), async (_request, response) => {
    await browserSession.restart();
    response.status(202).json({ status: "restarted" });
  });

  app.get("/mock-os", async (_request, response) => {
    response.json(await mockOsStore.getState());
  });

  app.post("/mock-os/terminal", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsTerminalSchema.parse(request.body);
      response.status(202).json(await mockOsStore.runCommand(input.command));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock terminal payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to execute mock terminal command");
      response.status(500).json({ error: "Failed to execute mock terminal command." });
    }
  });

  app.post("/mock-os/files", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsFileSchema.parse(request.body);
      response.status(201).json(await mockOsStore.writeFile(input.path, input.content));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS file payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to write mock OS file");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to write mock OS file." });
    }
  });

  app.post("/mock-os/files/delete", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsDeleteSchema.parse(request.body);
      response.status(202).json(await mockOsStore.deletePath(input.path));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS delete payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to delete mock OS path");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete mock OS path." });
    }
  });

  app.post("/mock-os/apps", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsAppSchema.parse(request.body);
      response.status(201).json(await mockOsStore.upsertApp(input));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS app payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to save mock OS app");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to save mock OS app." });
    }
  });

  app.post("/mock-os/apps/remove", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsAppRemoveSchema.parse(request.body);
      response.status(202).json(await mockOsStore.removeApp(input.name));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS app remove payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to remove mock OS app");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to remove mock OS app." });
    }
  });

  app.post("/mock-os/apps/launch", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsAppRemoveSchema.parse(request.body);
      response.status(202).json(await mockOsStore.launchApp(input.name));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS app launch payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to launch mock OS app");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to launch mock OS app." });
    }
  });

  app.post("/mock-os/apps/close", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsAppRemoveSchema.parse(request.body);
      response.status(202).json(await mockOsStore.closeApp(input.name));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS app close payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to close mock OS app");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to close mock OS app." });
    }
  });

  app.post("/mock-os/features", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsFeatureSchema.parse(request.body);
      response.status(201).json(await mockOsStore.upsertFeature(input));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS feature payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to save mock OS feature");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to save mock OS feature." });
    }
  });

  app.post("/mock-os/features/toggle", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsFeatureToggleSchema.parse(request.body);
      response.status(202).json(await mockOsStore.toggleFeature(input.key, input.enabled));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS feature toggle payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to toggle mock OS feature");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to toggle mock OS feature." });
    }
  });

  app.post("/mock-os/packages", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsPackageSchema.parse(request.body);
      response.status(201).json(await mockOsStore.installPackage(input.name, input.version));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS package payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to install mock OS package");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to install mock OS package." });
    }
  });

  app.post("/mock-os/packages/remove", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsAppRemoveSchema.parse(request.body);
      response.status(202).json(await mockOsStore.removePackage(input.name));
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS package remove payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to remove mock OS package");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to remove mock OS package." });
    }
  });

  app.post("/mock-os/actions", authRequired("operator"), async (request, response) => {
    try {
      const input = mockOsBatchSchema.parse(request.body);
      const result = await mockOsStore.runActions(input.actions);
      response.status(202).json({
        ...result,
        summary: formatMockOsBatchResults(result.results)
      });
    }
    catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({ error: "Invalid mock OS actions payload.", issues: error.issues });
        return;
      }

      request.log.error({ err: error }, "Failed to execute mock OS actions");
      response.status(400).json({ error: error instanceof Error ? error.message : "Failed to execute mock OS actions." });
    }
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, openClawMode: config.openClawMode }, "OpenClawWindowsDock listening");
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");

    server.close(async () => {
      scheduleManager.stop();
      await openClawConnection.shutdown();
      await browserSession.stop();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error) => {
  logger.error({ err: error }, "Fatal startup failure");
  process.exit(1);
});