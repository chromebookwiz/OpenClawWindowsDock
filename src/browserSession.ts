import path from "node:path";
import { BrowserContext, Page, chromium } from "playwright";
import { config } from "./config";
import { appendLog } from "./storage";
import { BrowserStep, TaskRecord, BrowserTaskResult } from "./types";

export class BrowserSession {
  private context: BrowserContext | null = null;

  async start(): Promise<void> {
    if (this.context) {
      return;
    }

    this.context = await chromium.launchPersistentContext(config.browserProfileDir, {
      headless: config.browserHeadless,
      viewport: { width: 1440, height: 960 },
      args: ["--disable-dev-shm-usage"]
    });

    await appendLog("browser-started");
  }

  async stop(): Promise<void> {
    if (!this.context) {
      return;
    }

    await this.context.close();
    this.context = null;
    await appendLog("browser-stopped");
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  isReady(): boolean {
    return this.context !== null;
  }

  async runTask(task: TaskRecord): Promise<BrowserTaskResult> {
    await this.start();

    let activePage = await this.getPage();
    const outputs: Record<string, string | null> = {};
    const artifacts: string[] = [];

    for (const [stepIndex, step] of task.request.steps.entries()) {
      activePage = await this.executeStep(task.id, stepIndex, activePage, step, outputs, artifacts);
    }

    return {
      outputs,
      artifacts,
      finalUrl: activePage.url()
    };
  }

  private async getPage(): Promise<Page> {
    if (!this.context) {
      throw new Error("Browser context is not initialized.");
    }

    const existingPage = this.context.pages().find((page) => !page.isClosed());
    if (existingPage) {
      return existingPage;
    }

    return this.context.newPage();
  }

  private async executeStep(
    taskId: string,
    stepIndex: number,
    page: Page,
    step: BrowserStep,
    outputs: Record<string, string | null>,
    artifacts: string[]
  ): Promise<Page> {
    const timeoutMs = "timeoutMs" in step && step.timeoutMs ? step.timeoutMs : config.defaultTimeoutMs;

    switch (step.type) {
      case "navigate": {
        await appendLog(`${taskId} step-${stepIndex + 1} navigate ${step.url}`);
        await page.goto(step.url, { waitUntil: step.waitUntil ?? "load", timeout: config.defaultTimeoutMs });
        return page;
      }

      case "newPage": {
        await appendLog(`${taskId} step-${stepIndex + 1} newPage`);
        if (!this.context) {
          throw new Error("Browser context is not initialized.");
        }

        return this.context.newPage();
      }

      case "click": {
        await appendLog(`${taskId} step-${stepIndex + 1} click ${step.selector}`);
        await page.locator(step.selector).click({ button: step.button ?? "left", timeout: timeoutMs });
        return page;
      }

      case "fill": {
        await appendLog(`${taskId} step-${stepIndex + 1} fill ${step.selector}`);
        await page.locator(step.selector).fill(step.value, { timeout: timeoutMs });
        return page;
      }

      case "press": {
        await appendLog(`${taskId} step-${stepIndex + 1} press ${step.key}`);
        if (step.selector) {
          await page.locator(step.selector).press(step.key, { timeout: timeoutMs });
        }
        else {
          await page.keyboard.press(step.key);
        }

        return page;
      }

      case "waitForSelector": {
        await appendLog(`${taskId} step-${stepIndex + 1} waitForSelector ${step.selector}`);
        await page.locator(step.selector).waitFor({ state: step.state ?? "visible", timeout: timeoutMs });
        return page;
      }

      case "extractText": {
        await appendLog(`${taskId} step-${stepIndex + 1} extractText ${step.selector}`);
        const text = await page.locator(step.selector).textContent({ timeout: timeoutMs });
        outputs[step.outputKey ?? `step-${stepIndex + 1}`] = text?.trim() ?? null;
        return page;
      }

      case "screenshot": {
        const fileName = step.fileName ?? `${taskId}-step-${stepIndex + 1}.png`;
        const targetPath = path.join(config.artifactsDir, fileName);

        await appendLog(`${taskId} step-${stepIndex + 1} screenshot ${fileName}`);
        await page.screenshot({ path: targetPath, fullPage: step.fullPage ?? true });
        artifacts.push(targetPath);
        return page;
      }

      case "closePage": {
        await appendLog(`${taskId} step-${stepIndex + 1} closePage`);
        await page.close();
        return this.getPage();
      }

      default: {
        const neverStep: never = step;
        throw new Error(`Unsupported step: ${JSON.stringify(neverStep)}`);
      }
    }
  }
}