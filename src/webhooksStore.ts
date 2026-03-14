import crypto from "node:crypto";
import { listWebhooks, loadWebhook, saveWebhook } from "./storage";
import { BrowserTaskRequest, SafeWebhookRecord, WebhookRecord, WebhookTargetType } from "./types";

function createSecret(): string {
  return crypto.randomBytes(24).toString("hex");
}

export class WebhooksStore {
  async create(input: {
    name: string;
    targetType: WebhookTargetType;
    definitionId?: string;
    scheduleId?: string;
    request?: BrowserTaskRequest;
    createdByUserId?: string;
    enabled?: boolean;
  }): Promise<WebhookRecord> {
    const now = new Date().toISOString();
    const webhook: WebhookRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      enabled: input.enabled ?? true,
      secret: createSecret(),
      targetType: input.targetType,
      definitionId: input.definitionId,
      scheduleId: input.scheduleId,
      request: input.request,
      createdAt: now,
      updatedAt: now,
      createdByUserId: input.createdByUserId
    };

    await saveWebhook(webhook);
    return webhook;
  }

  async list(): Promise<WebhookRecord[]> {
    return listWebhooks();
  }

  async get(webhookId: string): Promise<WebhookRecord | null> {
    return loadWebhook(webhookId);
  }

  async toggle(webhookId: string): Promise<WebhookRecord | null> {
    const webhook = await loadWebhook(webhookId);
    if (!webhook) {
      return null;
    }

    webhook.enabled = !webhook.enabled;
    webhook.updatedAt = new Date().toISOString();
    await saveWebhook(webhook);
    return webhook;
  }

  async rotate(webhookId: string): Promise<WebhookRecord | null> {
    const webhook = await loadWebhook(webhookId);
    if (!webhook) {
      return null;
    }

    webhook.secret = createSecret();
    webhook.updatedAt = new Date().toISOString();
    await saveWebhook(webhook);
    return webhook;
  }

  async markTriggered(webhookId: string, taskId?: string): Promise<void> {
    const webhook = await loadWebhook(webhookId);
    if (!webhook) {
      return;
    }

    webhook.lastTriggeredAt = new Date().toISOString();
    webhook.lastTaskId = taskId;
    webhook.updatedAt = webhook.lastTriggeredAt;
    await saveWebhook(webhook);
  }

  toSafeWebhook(webhook: WebhookRecord, baseUrl: string): SafeWebhookRecord {
    const { secret, ...safeWebhook } = webhook;
    return {
      ...safeWebhook,
      triggerUrl: `${baseUrl}/hooks/${webhook.id}/${webhook.secret}`
    };
  }
}