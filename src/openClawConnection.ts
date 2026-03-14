import { spawn, ChildProcess } from "node:child_process";
import { config } from "./config";
import { OpenClawStatus } from "./types";

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export class OpenClawConnection {
  private managedProcess: ChildProcess | null = null;
  private lastStatus: OpenClawStatus = {
    mode: config.openClawMode,
    state: "unconfigured",
    baseUrl: config.openClawBaseUrl,
    managedProcess: false,
    healthy: false,
    message: "OpenClaw has not been checked yet."
  };

  async initialize(): Promise<void> {
    if (config.openClawMode === "embedded") {
      await this.ensureEmbeddedReady();
      return;
    }

    await this.refreshStatus();
  }

  async shutdown(): Promise<void> {
    if (!this.managedProcess || this.managedProcess.killed) {
      return;
    }

    this.managedProcess.kill();
    this.managedProcess = null;
  }

  async restart(): Promise<OpenClawStatus> {
    if (config.openClawMode === "external") {
      return this.refreshStatus();
    }

    await this.shutdown();
    return this.ensureEmbeddedReady();
  }

  async getStatus(): Promise<OpenClawStatus> {
    return this.refreshStatus();
  }

  private async ensureEmbeddedReady(): Promise<OpenClawStatus> {
    const existingStatus = await this.refreshStatus();
    if (existingStatus.healthy) {
      return existingStatus;
    }

    if (!config.openClawStartCommand) {
      this.lastStatus = {
        mode: config.openClawMode,
        state: "unconfigured",
        baseUrl: config.openClawBaseUrl,
        managedProcess: false,
        healthy: false,
        lastCheckedAt: new Date().toISOString(),
        message: "Set OPENCLAW_START_COMMAND to launch OpenClaw inside this environment."
      };
      return this.lastStatus;
    }

    if (!this.managedProcess || this.managedProcess.killed) {
      this.managedProcess = spawn(config.openClawStartCommand, {
        cwd: config.openClawWorkingDir,
        shell: true,
        stdio: "ignore"
      });
    }

    this.lastStatus = {
      mode: config.openClawMode,
      state: "starting",
      baseUrl: config.openClawBaseUrl,
      managedProcess: true,
      healthy: false,
      lastCheckedAt: new Date().toISOString(),
      pid: this.managedProcess.pid,
      message: "Launching OpenClaw from OPENCLAW_START_COMMAND."
    };

    const deadline = Date.now() + config.openClawStartTimeoutMs;
    while (Date.now() < deadline) {
      const status = await this.refreshStatus();
      if (status.healthy) {
        return status;
      }

      await sleep(1000);
    }

    this.lastStatus = {
      mode: config.openClawMode,
      state: "unreachable",
      baseUrl: config.openClawBaseUrl,
      managedProcess: true,
      healthy: false,
      lastCheckedAt: new Date().toISOString(),
      pid: this.managedProcess?.pid,
      message: "OpenClaw did not respond before OPENCLAW_START_TIMEOUT_MS elapsed."
    };
    return this.lastStatus;
  }

  private async refreshStatus(): Promise<OpenClawStatus> {
    const healthUrl = new URL(config.openClawHealthPath, config.openClawBaseUrl).toString();
    const now = new Date().toISOString();

    try {
      const response = await fetch(healthUrl);
      if (!response.ok) {
        this.lastStatus = {
          mode: config.openClawMode,
          state: "unreachable",
          baseUrl: config.openClawBaseUrl,
          managedProcess: this.managedProcess !== null,
          healthy: false,
          lastCheckedAt: now,
          pid: this.managedProcess?.pid,
          message: `OpenClaw responded with HTTP ${response.status}.`
        };
        return this.lastStatus;
      }

      this.lastStatus = {
        mode: config.openClawMode,
        state: "healthy",
        baseUrl: config.openClawBaseUrl,
        managedProcess: this.managedProcess !== null,
        healthy: true,
        lastCheckedAt: now,
        pid: this.managedProcess?.pid,
        message: config.openClawMode === "embedded"
          ? "OpenClaw is reachable inside the local environment."
          : "OpenClaw is reachable at the configured external URL."
      };
      return this.lastStatus;
    }
    catch {
      const missingEmbeddedCommand = config.openClawMode === "embedded" && !config.openClawStartCommand;
      this.lastStatus = {
        mode: config.openClawMode,
        state: missingEmbeddedCommand
          ? "unconfigured"
          : this.managedProcess && !this.managedProcess.killed ? "starting" : "unreachable",
        baseUrl: config.openClawBaseUrl,
        managedProcess: this.managedProcess !== null,
        healthy: false,
        lastCheckedAt: now,
        pid: this.managedProcess?.pid,
        message: missingEmbeddedCommand
          ? "Set OPENCLAW_START_COMMAND to launch OpenClaw inside this environment, or switch to external mode."
          : config.openClawMode === "embedded"
          ? "OpenClaw is not reachable yet inside the local environment."
          : "OpenClaw is not reachable at the configured external URL."
      };
      return this.lastStatus;
    }
  }
}