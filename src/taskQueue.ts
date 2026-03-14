import crypto from "node:crypto";
import { BrowserSession } from "./browserSession";
import { appendLog, listTasks, loadTask, saveTask } from "./storage";
import { BrowserTaskRequest, TaskOrigin, TaskRecord, TaskStatus } from "./types";

export class TaskQueue {
  private readonly pendingTaskIds: string[] = [];
  private isRunning = false;

  constructor(private readonly browserSession: BrowserSession) {
  }

  async initialize(): Promise<void> {
    const tasks = await listTasks();

    for (const task of tasks.reverse()) {
      if (task.status === "queued" || task.status === "running") {
        task.status = "queued";
        task.updatedAt = new Date().toISOString();
        await saveTask(task);
        this.pendingTaskIds.push(task.id);
      }
    }

    this.startWorker();
  }

  async enqueue(request: BrowserTaskRequest, origin?: TaskOrigin): Promise<TaskRecord> {
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: crypto.randomUUID(),
      name: request.name ?? `task-${now}`,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      request,
      origin
    };

    await saveTask(task);
    this.pendingTaskIds.push(task.id);
    this.startWorker();
    await appendLog(`${task.id} queued`);

    return task;
  }

  async getTask(taskId: string): Promise<TaskRecord | null> {
    return loadTask(taskId);
  }

  async getAllTasks(): Promise<TaskRecord[]> {
    return listTasks();
  }

  async getStats(): Promise<{ total: number; queued: number; running: number; completed: number; failed: number }> {
    const tasks = await listTasks();
    const summary: Record<TaskStatus, number> = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0
    };

    for (const task of tasks) {
      summary[task.status] += 1;
    }

    return {
      total: tasks.length,
      queued: summary.queued,
      running: summary.running,
      completed: summary.completed,
      failed: summary.failed
    };
  }

  async retry(taskId: string): Promise<TaskRecord | null> {
    const task = await loadTask(taskId);

    if (!task) {
      return null;
    }

    task.status = "queued";
    task.updatedAt = new Date().toISOString();
    delete task.error;
    delete task.result;
    await saveTask(task);

    this.pendingTaskIds.push(task.id);
    this.startWorker();
    await appendLog(`${task.id} requeued`);

    return task;
  }

  getDepth(): number {
    return this.pendingTaskIds.length;
  }

  private startWorker(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    void this.processLoop();
  }

  private async processLoop(): Promise<void> {
    while (this.pendingTaskIds.length > 0) {
      const taskId = this.pendingTaskIds.shift();
      if (!taskId) {
        continue;
      }

      const task = await loadTask(taskId);
      if (!task || task.status !== "queued") {
        continue;
      }

      task.status = "running";
      task.updatedAt = new Date().toISOString();
      await saveTask(task);
      await appendLog(`${task.id} running`);

      try {
        task.result = await this.browserSession.runTask(task);
        task.status = "completed";
        task.updatedAt = new Date().toISOString();
        delete task.error;
        await saveTask(task);
        await appendLog(`${task.id} completed`);
      }
      catch (error) {
        task.status = "failed";
        task.updatedAt = new Date().toISOString();
        task.error = error instanceof Error ? error.message : String(error);
        await saveTask(task);
        await appendLog(`${task.id} failed ${task.error}`);
      }
    }

    this.isRunning = false;
  }
}