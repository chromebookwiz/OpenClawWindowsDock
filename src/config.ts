import fs from "node:fs";
import path from "node:path";

function loadDotEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const values: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [key, ...rest] = line.split("=");
    values[key] = rest.join("=");
  }

  return values;
}

const envValues = loadDotEnv();

function readValue(name: string): string | undefined {
  return process.env[name] ?? envValues[name];
}

function readNumber(name: string, fallback: number): number {
  const rawValue = readValue(name);

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

const dataRoot = readValue("DATA_ROOT") ?? "/app/data";

export const config = {
  port: readNumber("PORT", 3000),
  dataRoot,
  tasksDir: path.join(dataRoot, "tasks"),
  definitionsDir: path.join(dataRoot, "definitions"),
  schedulesDir: path.join(dataRoot, "schedules"),
  usersDir: path.join(dataRoot, "users"),
  webhooksDir: path.join(dataRoot, "webhooks"),
  artifactsDir: path.join(dataRoot, "artifacts"),
  logsDir: path.join(dataRoot, "logs"),
  browserProfileDir: readValue("BROWSER_PROFILE_DIR") ?? path.join(dataRoot, "browser-profile"),
  browserHeadless: (readValue("BROWSER_HEADLESS") ?? "true").toLowerCase() !== "false",
  defaultTimeoutMs: readNumber("DEFAULT_TIMEOUT_MS", 15000),
  schedulerTickMs: readNumber("SCHEDULER_TICK_MS", 15000),
  authTokenSecret: readValue("AUTH_TOKEN_SECRET") ?? "openclawwindowsdock-local-dev-secret",
  authTokenTtlHours: readNumber("AUTH_TOKEN_TTL_HOURS", 12),
  openClawMode: (readValue("OPENCLAW_MODE") ?? "embedded").toLowerCase() === "external" ? "external" : "embedded",
  openClawBaseUrl: readValue("OPENCLAW_BASE_URL") ?? "http://127.0.0.1:8080",
  openClawHealthPath: readValue("OPENCLAW_HEALTH_PATH") ?? "/health",
  openClawStartCommand: readValue("OPENCLAW_START_COMMAND") ?? "",
  openClawWorkingDir: readValue("OPENCLAW_WORKING_DIR") ?? process.cwd(),
  openClawStartTimeoutMs: readNumber("OPENCLAW_START_TIMEOUT_MS", 30000)
} as const;