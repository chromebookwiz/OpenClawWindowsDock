import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { ScheduleRecord, TaskDefinition, TaskRecord, UserRecord, WebhookRecord } from "./types";

async function ensureDirectory(directoryPath: string): Promise<void> {
  await fs.mkdir(directoryPath, { recursive: true });
}

export async function ensureStorage(): Promise<void> {
  await Promise.all([
    ensureDirectory(config.tasksDir),
    ensureDirectory(config.definitionsDir),
    ensureDirectory(config.schedulesDir),
    ensureDirectory(config.usersDir),
    ensureDirectory(config.webhooksDir),
    ensureDirectory(config.artifactsDir),
    ensureDirectory(config.logsDir),
    ensureDirectory(config.browserProfileDir)
  ]);
}

function taskFilePath(taskId: string): string {
  return path.join(config.tasksDir, `${taskId}.json`);
}

function definitionFilePath(definitionId: string): string {
  return path.join(config.definitionsDir, `${definitionId}.json`);
}

function scheduleFilePath(scheduleId: string): string {
  return path.join(config.schedulesDir, `${scheduleId}.json`);
}

function userFilePath(userId: string): string {
  return path.join(config.usersDir, `${userId}.json`);
}

function webhookFilePath(webhookId: string): string {
  return path.join(config.webhooksDir, `${webhookId}.json`);
}

export async function saveTask(task: TaskRecord): Promise<void> {
  await fs.writeFile(taskFilePath(task.id), `${JSON.stringify(task, null, 2)}\n`, "utf8");
}

export async function saveDefinition(definition: TaskDefinition): Promise<void> {
  await fs.writeFile(definitionFilePath(definition.id), `${JSON.stringify(definition, null, 2)}\n`, "utf8");
}

export async function saveSchedule(schedule: ScheduleRecord): Promise<void> {
  await fs.writeFile(scheduleFilePath(schedule.id), `${JSON.stringify(schedule, null, 2)}\n`, "utf8");
}

export async function saveUser(user: UserRecord): Promise<void> {
  await fs.writeFile(userFilePath(user.id), `${JSON.stringify(user, null, 2)}\n`, "utf8");
}

export async function saveWebhook(webhook: WebhookRecord): Promise<void> {
  await fs.writeFile(webhookFilePath(webhook.id), `${JSON.stringify(webhook, null, 2)}\n`, "utf8");
}

export async function loadTask(taskId: string): Promise<TaskRecord | null> {
  try {
    const rawTask = await fs.readFile(taskFilePath(taskId), "utf8");
    return JSON.parse(rawTask) as TaskRecord;
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return null;
    }

    throw error;
  }
}

export async function loadDefinition(definitionId: string): Promise<TaskDefinition | null> {
  try {
    const rawDefinition = await fs.readFile(definitionFilePath(definitionId), "utf8");
    return JSON.parse(rawDefinition) as TaskDefinition;
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return null;
    }

    throw error;
  }
}

export async function loadSchedule(scheduleId: string): Promise<ScheduleRecord | null> {
  try {
    const rawSchedule = await fs.readFile(scheduleFilePath(scheduleId), "utf8");
    return JSON.parse(rawSchedule) as ScheduleRecord;
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return null;
    }

    throw error;
  }
}

export async function loadUser(userId: string): Promise<UserRecord | null> {
  try {
    const rawUser = await fs.readFile(userFilePath(userId), "utf8");
    return JSON.parse(rawUser) as UserRecord;
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return null;
    }

    throw error;
  }
}

export async function loadWebhook(webhookId: string): Promise<WebhookRecord | null> {
  try {
    const rawWebhook = await fs.readFile(webhookFilePath(webhookId), "utf8");
    return JSON.parse(rawWebhook) as WebhookRecord;
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return null;
    }

    throw error;
  }
}

export async function listTasks(): Promise<TaskRecord[]> {
  const entries = await fs.readdir(config.tasksDir, { withFileTypes: true });
  const taskFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const tasks = await Promise.all(
    taskFiles.map(async (fileName) => {
      const rawTask = await fs.readFile(path.join(config.tasksDir, fileName), "utf8");
      return JSON.parse(rawTask) as TaskRecord;
    })
  );

  return tasks.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function listDirectoryItems<T>(directoryPath: string): Promise<T[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    fileNames.map(async (fileName) => {
      const rawItem = await fs.readFile(path.join(directoryPath, fileName), "utf8");
      return JSON.parse(rawItem) as T;
    })
  );
}

export async function listDefinitions(): Promise<TaskDefinition[]> {
  const definitions = await listDirectoryItems<TaskDefinition>(config.definitionsDir);
  return definitions.sort((left, right) => left.name.localeCompare(right.name));
}

export async function listSchedules(): Promise<ScheduleRecord[]> {
  const schedules = await listDirectoryItems<ScheduleRecord>(config.schedulesDir);
  return schedules.sort((left, right) => left.name.localeCompare(right.name));
}

export async function listUsers(): Promise<UserRecord[]> {
  const users = await listDirectoryItems<UserRecord>(config.usersDir);
  return users.sort((left, right) => left.username.localeCompare(right.username));
}

export async function loadUserByUsername(username: string): Promise<UserRecord | null> {
  const users = await listUsers();
  return users.find((user) => user.username.toLowerCase() === username.toLowerCase()) ?? null;
}

export async function listWebhooks(): Promise<WebhookRecord[]> {
  const webhooks = await listDirectoryItems<WebhookRecord>(config.webhooksDir);
  return webhooks.sort((left, right) => left.name.localeCompare(right.name));
}

export async function listArtifacts(): Promise<string[]> {
  const entries = await fs.readdir(config.artifactsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
}

export async function appendLog(line: string): Promise<void> {
  const logFile = path.join(config.logsDir, "runtime.log");
  await fs.appendFile(logFile, `${new Date().toISOString()} ${line}\n`, "utf8");
}