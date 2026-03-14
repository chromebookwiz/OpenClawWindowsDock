export type TaskStatus = "queued" | "running" | "completed" | "failed";
export type UserRole = "admin" | "operator" | "viewer";
export type ScheduleMode = "interval" | "cron";
export type OpenClawMode = "embedded" | "external";
export type OpenClawState = "healthy" | "starting" | "unreachable" | "unconfigured" | "stopped";

export type NavigateStep = {
  type: "navigate";
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
};

export type NewPageStep = {
  type: "newPage";
};

export type ClickStep = {
  type: "click";
  selector: string;
  button?: "left" | "right" | "middle";
  timeoutMs?: number;
};

export type FillStep = {
  type: "fill";
  selector: string;
  value: string;
  timeoutMs?: number;
};

export type PressStep = {
  type: "press";
  key: string;
  selector?: string;
  timeoutMs?: number;
};

export type WaitForSelectorStep = {
  type: "waitForSelector";
  selector: string;
  state?: "attached" | "detached" | "visible" | "hidden";
  timeoutMs?: number;
};

export type ExtractTextStep = {
  type: "extractText";
  selector: string;
  outputKey?: string;
  timeoutMs?: number;
};

export type ScreenshotStep = {
  type: "screenshot";
  fileName?: string;
  fullPage?: boolean;
};

export type ClosePageStep = {
  type: "closePage";
};

export type BrowserStep =
  | NavigateStep
  | NewPageStep
  | ClickStep
  | FillStep
  | PressStep
  | WaitForSelectorStep
  | ExtractTextStep
  | ScreenshotStep
  | ClosePageStep;

export type BrowserTaskRequest = {
  name?: string;
  steps: BrowserStep[];
};

export type TaskOrigin = {
  type: "manual" | "definition" | "schedule" | "bundle-import";
  definitionId?: string;
  scheduleId?: string;
  bundleName?: string;
};

export type BrowserTaskResult = {
  outputs: Record<string, string | null>;
  artifacts: string[];
  finalUrl: string;
};

export type TaskRecord = {
  id: string;
  name: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  request: BrowserTaskRequest;
  origin?: TaskOrigin;
  result?: BrowserTaskResult;
  error?: string;
};

export type TaskDefinition = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  request: BrowserTaskRequest;
};

export type ScheduleRecord = {
  id: string;
  name: string;
  enabled: boolean;
  mode: ScheduleMode;
  intervalMinutes?: number;
  cronExpression?: string;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string;
  lastRunAt?: string;
  lastTaskId?: string;
  request: BrowserTaskRequest;
  definitionId?: string;
};

export type TaskBundle = {
  version: 1;
  exportedAt: string;
  name: string;
  definitions: Array<{
    name: string;
    description?: string;
    request: BrowserTaskRequest;
  }>;
  schedules: Array<{
    name: string;
    enabled: boolean;
    mode?: ScheduleMode;
    intervalMinutes?: number;
    cronExpression?: string;
    request: BrowserTaskRequest;
    definitionId?: string;
  }>;
};

export type UserRecord = {
  id: string;
  username: string;
  role: UserRole;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

export type SafeUserRecord = Omit<UserRecord, "passwordHash" | "passwordSalt">;

export type AuthTokenPayload = {
  sub: string;
  username: string;
  role: UserRole;
  exp: number;
};

export type WebhookTargetType = "definition" | "schedule" | "request";

export type WebhookRecord = {
  id: string;
  name: string;
  enabled: boolean;
  secret: string;
  targetType: WebhookTargetType;
  definitionId?: string;
  scheduleId?: string;
  request?: BrowserTaskRequest;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string;
  lastTaskId?: string;
  createdByUserId?: string;
};

export type SafeWebhookRecord = Omit<WebhookRecord, "secret"> & {
  triggerUrl: string;
};

export type OpenClawStatus = {
  mode: OpenClawMode;
  state: OpenClawState;
  baseUrl: string;
  managedProcess: boolean;
  healthy: boolean;
  lastCheckedAt?: string;
  message: string;
  pid?: number;
};