import crypto from "node:crypto";
import { listDefinitions, loadDefinition, saveDefinition } from "./storage";
import { BrowserTaskRequest, TaskDefinition } from "./types";

export class DefinitionsStore {
  async create(input: { name: string; description?: string; request: BrowserTaskRequest }): Promise<TaskDefinition> {
    const now = new Date().toISOString();
    const definition: TaskDefinition = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
      request: input.request
    };

    await saveDefinition(definition);
    return definition;
  }

  async list(): Promise<TaskDefinition[]> {
    return listDefinitions();
  }

  async get(definitionId: string): Promise<TaskDefinition | null> {
    return loadDefinition(definitionId);
  }
}