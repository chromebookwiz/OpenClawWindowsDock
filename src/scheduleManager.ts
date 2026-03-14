import crypto from "node:crypto";
import { config } from "./config";
import { nextCronRun } from "./cron";
import { appendLog, listSchedules, loadSchedule, saveSchedule } from "./storage";
import { BrowserTaskRequest, ScheduleRecord } from "./types";
import { TaskQueue } from "./taskQueue";

function nextRunFrom(baseDate: Date, intervalMinutes: number): string {
  return new Date(baseDate.getTime() + intervalMinutes * 60_000).toISOString();
}

function computeNextRun(schedule: Pick<ScheduleRecord, "mode" | "intervalMinutes" | "cronExpression">, baseDate: Date): string {
  if (schedule.mode === "cron") {
    return nextCronRun(schedule.cronExpression ?? "* * * * *", baseDate);
  }

  return nextRunFrom(baseDate, schedule.intervalMinutes ?? 1);
}

export class ScheduleManager {
  private timer: NodeJS.Timeout | null = null;
  private readonly runningScheduleIds = new Set<string>();

  constructor(private readonly taskQueue: TaskQueue) {
  }

  async initialize(): Promise<void> {
    this.start();
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, config.schedulerTickMs);

    void this.tick();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  async create(input: {
    name: string;
    mode?: "interval" | "cron";
    intervalMinutes?: number;
    cronExpression?: string;
    request: BrowserTaskRequest;
    enabled?: boolean;
    definitionId?: string;
  }): Promise<ScheduleRecord> {
    const now = new Date();
    const timestamp = now.toISOString();
    const mode = input.mode ?? "interval";
    const schedule: ScheduleRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      enabled: input.enabled ?? true,
      mode,
      intervalMinutes: input.intervalMinutes,
      cronExpression: input.cronExpression,
      createdAt: timestamp,
      updatedAt: timestamp,
      nextRunAt: computeNextRun({ mode, intervalMinutes: input.intervalMinutes, cronExpression: input.cronExpression }, now),
      request: input.request,
      definitionId: input.definitionId
    };

    await saveSchedule(schedule);
    await appendLog(`${schedule.id} schedule-created`);
    return schedule;
  }

  async list(): Promise<ScheduleRecord[]> {
    return listSchedules();
  }

  async get(scheduleId: string): Promise<ScheduleRecord | null> {
    return loadSchedule(scheduleId);
  }

  async toggle(scheduleId: string): Promise<ScheduleRecord | null> {
    const schedule = await loadSchedule(scheduleId);
    if (!schedule) {
      return null;
    }

    schedule.enabled = !schedule.enabled;
    schedule.updatedAt = new Date().toISOString();
    if (schedule.enabled) {
      schedule.nextRunAt = computeNextRun(schedule, new Date());
    }

    await saveSchedule(schedule);
    await appendLog(`${schedule.id} schedule-${schedule.enabled ? "enabled" : "disabled"}`);
    return schedule;
  }

  async runNow(scheduleId: string): Promise<ScheduleRecord | null> {
    const schedule = await loadSchedule(scheduleId);
    if (!schedule) {
      return null;
    }

    const queuedTask = await this.taskQueue.enqueue(schedule.request, {
      type: "schedule",
      scheduleId: schedule.id,
      definitionId: schedule.definitionId
    });

    schedule.lastRunAt = new Date().toISOString();
    schedule.lastTaskId = queuedTask.id;
    schedule.nextRunAt = computeNextRun(schedule, new Date());
    schedule.updatedAt = schedule.lastRunAt;
    await saveSchedule(schedule);
    await appendLog(`${schedule.id} schedule-run-now ${queuedTask.id}`);

    return schedule;
  }

  private async tick(): Promise<void> {
    const schedules = await listSchedules();
    const now = new Date();

    for (const schedule of schedules) {
      if (!schedule.enabled) {
        continue;
      }

      if (this.runningScheduleIds.has(schedule.id)) {
        continue;
      }

      if (new Date(schedule.nextRunAt).getTime() > now.getTime()) {
        continue;
      }

      this.runningScheduleIds.add(schedule.id);
      try {
        const queuedTask = await this.taskQueue.enqueue(schedule.request, {
          type: "schedule",
          scheduleId: schedule.id,
          definitionId: schedule.definitionId
        });

        const refreshedSchedule = await loadSchedule(schedule.id);
        if (!refreshedSchedule) {
          continue;
        }

        refreshedSchedule.lastRunAt = now.toISOString();
        refreshedSchedule.lastTaskId = queuedTask.id;
        refreshedSchedule.nextRunAt = computeNextRun(refreshedSchedule, now);
        refreshedSchedule.updatedAt = now.toISOString();
        await saveSchedule(refreshedSchedule);
        await appendLog(`${schedule.id} schedule-fired ${queuedTask.id}`);
      }
      finally {
        this.runningScheduleIds.delete(schedule.id);
      }
    }
  }
}