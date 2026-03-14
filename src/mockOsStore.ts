import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { appendLog } from "./storage";
import { MockOsActionResult, MockOsApp, MockOsFeature, MockOsNode, MockOsPackage, MockOsState, MockOsTerminalEntry } from "./types";

type CommandStatus = "completed" | "failed";

type CommandResult = {
  output: string;
  status: CommandStatus;
};

type MockOsActionInput =
  | { type: "command"; command: string }
  | { type: "writeFile"; path: string; content: string }
  | { type: "deletePath"; path: string }
  | { type: "upsertApp"; name: string; description?: string; command?: string }
  | { type: "removeApp"; name: string }
  | { type: "launchApp"; name: string }
  | { type: "closeApp"; name: string }
  | { type: "upsertFeature"; key: string; name: string; description?: string; enabled?: boolean }
  | { type: "toggleFeature"; key: string; enabled?: boolean }
  | { type: "installPackage"; name: string; version?: string }
  | { type: "removePackage"; name: string };

const TERMINAL_HISTORY_LIMIT = 40;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizePath(inputPath: string, cwd = "/"): string {
  const sanitizedInput = inputPath.trim().replaceAll("\\", "/");
  const combinedPath = sanitizedInput.startsWith("/") ? sanitizedInput : path.posix.join(cwd, sanitizedInput);
  const normalizedPath = path.posix.normalize(combinedPath);
  return normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
}

function parentPathOf(targetPath: string): string | null {
  if (targetPath === "/") {
    return null;
  }

  return path.posix.dirname(targetPath);
}

function baseNameOf(targetPath: string): string {
  return targetPath === "/" ? "/" : path.posix.basename(targetPath);
}

function parseArguments(command: string): string[] {
  const matches = command.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+/g) ?? [];
  return matches.map((token) => {
    if ((token.startsWith("\"") && token.endsWith("\"")) || (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1).replace(/\\(["'\\])/g, "$1");
    }

    return token;
  });
}

function cloneState(state: MockOsState): MockOsState {
  return JSON.parse(JSON.stringify(state)) as MockOsState;
}

function defaultNodes(): MockOsNode[] {
  const timestamp = nowIso();

  return [
    { path: "/Apps", kind: "directory", createdAt: timestamp, updatedAt: timestamp },
    { path: "/Packages", kind: "directory", createdAt: timestamp, updatedAt: timestamp },
    { path: "/System", kind: "directory", createdAt: timestamp, updatedAt: timestamp },
    { path: "/System/README.txt", kind: "file", createdAt: timestamp, updatedAt: timestamp, content: "Mock OS initialized. Use the mock terminal or API to edit files, install packages, launch apps, and toggle features." },
    { path: "/Users", kind: "directory", createdAt: timestamp, updatedAt: timestamp },
    { path: "/Users/model", kind: "directory", createdAt: timestamp, updatedAt: timestamp },
    { path: "/Users/model/Desktop", kind: "directory", createdAt: timestamp, updatedAt: timestamp },
    { path: "/Users/model/Documents", kind: "directory", createdAt: timestamp, updatedAt: timestamp },
    { path: "/Users/model/Documents/todo.txt", kind: "file", createdAt: timestamp, updatedAt: timestamp, content: "- Build a calculator app\n- Add notifications feature\n- Customize the shell prompt" },
    { path: "/Users/model/.shellrc", kind: "file", createdAt: timestamp, updatedAt: timestamp, content: "prompt=mock-os>\nalias ll=ls" }
  ];
}

function defaultApps(): MockOsApp[] {
  const timestamp = nowIso();

  return [
    {
      id: crypto.randomUUID(),
      name: "Notes",
      description: "Edit plain text notes stored inside the mock OS.",
      command: "open /Users/model/Documents/todo.txt",
      running: false,
      installedAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: crypto.randomUUID(),
      name: "Task Monitor",
      description: "Shows the latest mock terminal activity.",
      command: "tail terminal-history",
      running: false,
      installedAt: timestamp,
      updatedAt: timestamp
    }
  ];
}

function defaultFeatures(): MockOsFeature[] {
  const timestamp = nowIso();

  return [
    { key: "filesystem", name: "Mutable Filesystem", description: "Allow files and folders to be created and edited.", enabled: true, updatedAt: timestamp },
    { key: "app-installer", name: "App Installer", description: "Install and update mock applications.", enabled: true, updatedAt: timestamp },
    { key: "feature-flags", name: "Feature Flags", description: "Turn mock OS features on and off.", enabled: true, updatedAt: timestamp },
    { key: "packages", name: "Package Manager", description: "Enable package-style installs in the mock OS.", enabled: true, updatedAt: timestamp }
  ];
}

function defaultPackages(): MockOsPackage[] {
  const timestamp = nowIso();

  return [
    { name: "coreutils", version: "1.0.0", installedAt: timestamp, updatedAt: timestamp },
    { name: "window-manager", version: "1.0.0", installedAt: timestamp, updatedAt: timestamp }
  ];
}

function formatActionResult(result: MockOsActionResult): string {
  return `${result.status.toUpperCase()} ${result.type}${result.target ? ` ${result.target}` : ""}: ${result.message}`;
}

export class MockOsStore {
  private readonly statePath = path.join(config.mockOsDir, "state.json");

  async initialize(): Promise<void> {
    try {
      await fs.access(this.statePath);
    }
    catch {
      await this.saveState({
        name: "OpenWindows Mock OS",
        version: "1.1.0",
        cwd: "/Users/model",
        nodes: defaultNodes(),
        apps: defaultApps(),
        features: defaultFeatures(),
        packages: defaultPackages(),
        terminalHistory: []
      });
    }
  }

  async getState(): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    return cloneState(state);
  }

  async runCommand(command: string): Promise<{ entry: MockOsTerminalEntry; state: MockOsState }> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    const cwdBefore = state.cwd;
    const result = this.executeCommand(state, command);
    const entry: MockOsTerminalEntry = {
      id: crypto.randomUUID(),
      command,
      cwd: cwdBefore,
      output: result.output,
      status: result.status,
      ranAt: nowIso()
    };

    this.recordTerminalEntry(state, entry);
    await this.saveState(state);
    await appendLog(`mock-os command ${entry.status} ${command}`);

    return { entry, state: cloneState(state) };
  }

  async runActions(actions: MockOsActionInput[]): Promise<{ results: MockOsActionResult[]; state: MockOsState }> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    const results: MockOsActionResult[] = [];

    for (const action of actions) {
      try {
        switch (action.type) {
          case "command": {
            const cwdBefore = state.cwd;
            const commandResult = this.executeCommand(state, action.command);
            const entry: MockOsTerminalEntry = {
              id: crypto.randomUUID(),
              command: action.command,
              cwd: cwdBefore,
              output: commandResult.output,
              status: commandResult.status,
              ranAt: nowIso()
            };
            this.recordTerminalEntry(state, entry);
            results.push({ type: action.type, target: action.command, status: commandResult.status, message: commandResult.output });
            break;
          }

          case "writeFile":
            this.upsertFile(state, action.path, action.content);
            results.push({ type: action.type, target: normalizePath(action.path, state.cwd), status: "completed", message: "File saved." });
            break;

          case "deletePath":
            this.removePath(state, action.path);
            results.push({ type: action.type, target: normalizePath(action.path, state.cwd), status: "completed", message: "Path deleted." });
            break;

          case "upsertApp":
            this.upsertAppInState(state, action);
            results.push({ type: action.type, target: action.name, status: "completed", message: "App saved." });
            break;

          case "removeApp":
            this.removeAppInState(state, action.name);
            results.push({ type: action.type, target: action.name, status: "completed", message: "App removed." });
            break;

          case "launchApp":
            results.push({ type: action.type, target: action.name, status: "completed", message: this.launchAppInState(state, action.name) });
            break;

          case "closeApp":
            results.push({ type: action.type, target: action.name, status: "completed", message: this.closeAppInState(state, action.name) });
            break;

          case "upsertFeature":
            this.upsertFeatureInState(state, action);
            results.push({ type: action.type, target: action.key, status: "completed", message: "Feature saved." });
            break;

          case "toggleFeature":
            results.push({ type: action.type, target: action.key, status: "completed", message: this.toggleFeatureInState(state, action.key, action.enabled) });
            break;

          case "installPackage":
            results.push({ type: action.type, target: action.name, status: "completed", message: this.installPackageInState(state, action.name, action.version) });
            break;

          case "removePackage":
            this.removePackageInState(state, action.name);
            results.push({ type: action.type, target: action.name, status: "completed", message: "Package removed." });
            break;
        }
      }
      catch (error) {
        results.push({
          type: action.type,
          target: "path" in action ? action.path : "name" in action ? action.name : "key" in action ? action.key : undefined,
          status: "failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    await this.saveState(state);
    await appendLog(`mock-os batch ${results.length} action(s)`);
    return { results, state: cloneState(state) };
  }

  async writeFile(targetPath: string, content: string): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.upsertFile(state, targetPath, content);
    await this.saveState(state);
    await appendLog(`mock-os write ${normalizePath(targetPath, state.cwd)}`);
    return cloneState(state);
  }

  async deletePath(targetPath: string): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.removePath(state, targetPath);
    await this.saveState(state);
    await appendLog(`mock-os delete ${normalizePath(targetPath, state.cwd)}`);
    return cloneState(state);
  }

  async upsertApp(input: { name: string; description?: string; command?: string }): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.upsertAppInState(state, input);
    await this.saveState(state);
    await appendLog(`mock-os app upsert ${input.name}`);
    return cloneState(state);
  }

  async removeApp(name: string): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.removeAppInState(state, name);
    await this.saveState(state);
    await appendLog(`mock-os app remove ${name}`);
    return cloneState(state);
  }

  async launchApp(name: string): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.launchAppInState(state, name);
    await this.saveState(state);
    await appendLog(`mock-os app launch ${name}`);
    return cloneState(state);
  }

  async closeApp(name: string): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.closeAppInState(state, name);
    await this.saveState(state);
    await appendLog(`mock-os app close ${name}`);
    return cloneState(state);
  }

  async upsertFeature(input: { key: string; name: string; description?: string; enabled?: boolean }): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.upsertFeatureInState(state, input);
    await this.saveState(state);
    await appendLog(`mock-os feature upsert ${input.key}`);
    return cloneState(state);
  }

  async toggleFeature(key: string, enabled?: boolean): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.toggleFeatureInState(state, key, enabled);
    await this.saveState(state);
    await appendLog(`mock-os feature toggle ${key}`);
    return cloneState(state);
  }

  async installPackage(name: string, version?: string): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.installPackageInState(state, name, version);
    await this.saveState(state);
    await appendLog(`mock-os package install ${name}@${version ?? "latest"}`);
    return cloneState(state);
  }

  async removePackage(name: string): Promise<MockOsState> {
    const state = await this.loadState();
    this.ensureStateDefaults(state);
    this.removePackageInState(state, name);
    await this.saveState(state);
    await appendLog(`mock-os package remove ${name}`);
    return cloneState(state);
  }

  private async loadState(): Promise<MockOsState> {
    const rawState = await fs.readFile(this.statePath, "utf8");
    return JSON.parse(rawState) as MockOsState;
  }

  private async saveState(state: MockOsState): Promise<void> {
    await fs.writeFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private ensureStateDefaults(state: MockOsState): void {
    state.packages ??= [];

    for (const app of state.apps) {
      app.running ??= false;
    }
  }

  private recordTerminalEntry(state: MockOsState, entry: MockOsTerminalEntry): void {
    state.terminalHistory = [entry, ...state.terminalHistory].slice(0, TERMINAL_HISTORY_LIMIT);
  }

  private executeCommand(state: MockOsState, command: string): CommandResult {
    try {
      const args = parseArguments(command);
      if (!args.length) {
        return { output: "", status: "completed" };
      }

      const [rawVerb, ...rawRest] = args;
      const verb = rawVerb.toLowerCase();

      switch (verb) {
        case "help":
          return {
            output: [
              "Available commands:",
              "help",
              "pwd",
              "status",
              "ls [path]",
              "tree [path]",
              "find <term> [path]",
              "grep <term> [path]",
              "cd <path>",
              "open <path>",
              "cat <path>",
              "tail terminal-history",
              "mkdir <path>",
              "touch <path>",
              "write <path> <content>",
              "append <path> <content>",
              "rm <path>",
              "mv <source> <destination>",
              "apps",
              "open-app <name>",
              "close-app <name>",
              "install-app <name> [command]",
              "remove-app <name>",
              "packages",
              "pkg install <name> [version]",
              "pkg remove <name>",
              "features",
              "add-feature <key> <name> [description]",
              "toggle-feature <key> [on|off]",
              "ps"
            ].join("\n"),
            status: "completed"
          };

        case "pwd":
          return { output: state.cwd, status: "completed" };

        case "status":
          return {
            output: [
              `${state.name} ${state.version}`,
              `cwd: ${state.cwd}`,
              `nodes: ${state.nodes.length}`,
              `apps: ${state.apps.length}`,
              `running apps: ${state.apps.filter((app) => app.running).length}`,
              `features: ${state.features.length}`,
              `packages: ${state.packages.length}`
            ].join("\n"),
            status: "completed"
          };

        case "ls": {
          const targetPath = rawRest[0] ? normalizePath(rawRest[0], state.cwd) : state.cwd;
          return { output: this.listDirectory(state, targetPath), status: "completed" };
        }

        case "tree": {
          const targetPath = rawRest[0] ? normalizePath(rawRest[0], state.cwd) : state.cwd;
          return { output: this.treeView(state, targetPath), status: "completed" };
        }

        case "find": {
          const searchTerm = (rawRest[0] ?? "").toLowerCase();
          const rootPath = rawRest[1] ? normalizePath(rawRest[1], state.cwd) : "/";
          return { output: this.findPaths(state, searchTerm, rootPath), status: "completed" };
        }

        case "grep": {
          const searchTerm = (rawRest[0] ?? "").toLowerCase();
          const rootPath = rawRest[1] ? normalizePath(rawRest[1], state.cwd) : "/";
          return { output: this.grepFiles(state, searchTerm, rootPath), status: "completed" };
        }

        case "cd": {
          const targetPath = normalizePath(rawRest[0] ?? "/Users/model", state.cwd);
          if (!this.directoryExists(state, targetPath)) {
            throw new Error(`Directory not found: ${targetPath}`);
          }

          state.cwd = targetPath;
          return { output: `cwd changed to ${state.cwd}`, status: "completed" };
        }

        case "open": {
          const targetPath = normalizePath(rawRest[0] ?? "", state.cwd);
          const node = this.requireNode(state, targetPath);
          return {
            output: node.kind === "directory" ? this.listDirectory(state, targetPath) : node.content ?? "",
            status: "completed"
          };
        }

        case "cat": {
          const targetPath = normalizePath(rawRest[0] ?? "", state.cwd);
          const node = this.requireNode(state, targetPath);
          if (node.kind !== "file") {
            throw new Error(`Not a file: ${targetPath}`);
          }

          return { output: node.content ?? "", status: "completed" };
        }

        case "tail": {
          const target = rawRest[0]?.toLowerCase();
          if (target !== "terminal-history") {
            throw new Error("tail only supports terminal-history.");
          }

          return {
            output: state.terminalHistory.length
              ? state.terminalHistory.slice(0, 10).map((entry) => `[${entry.status}] ${entry.cwd} > ${entry.command}\n${entry.output}`).join("\n\n")
              : "No terminal history yet.",
            status: "completed"
          };
        }

        case "mkdir": {
          const targetPath = normalizePath(rawRest[0] ?? "", state.cwd);
          this.createDirectoryRecursive(state, targetPath);
          return { output: `created ${targetPath}`, status: "completed" };
        }

        case "touch": {
          const targetPath = normalizePath(rawRest[0] ?? "", state.cwd);
          const existingFile = this.findNode(state, targetPath);
          if (existingFile?.kind === "directory") {
            throw new Error(`Cannot touch directory: ${targetPath}`);
          }

          this.upsertFile(state, targetPath, existingFile?.content ?? "");
          return { output: `updated ${targetPath}`, status: "completed" };
        }

        case "write":
        case "edit-file": {
          const targetPath = normalizePath(rawRest[0] ?? "", state.cwd);
          const content = rawRest.slice(1).join(" ");
          this.upsertFile(state, targetPath, content);
          return { output: `saved ${targetPath}`, status: "completed" };
        }

        case "append": {
          const targetPath = normalizePath(rawRest[0] ?? "", state.cwd);
          const existingNode = this.findNode(state, targetPath);
          const content = rawRest.slice(1).join(" ");
          if (existingNode && existingNode.kind !== "file") {
            throw new Error(`Cannot append to directory: ${targetPath}`);
          }

          this.upsertFile(state, targetPath, `${existingNode?.content ?? ""}${content}`);
          return { output: `appended ${targetPath}`, status: "completed" };
        }

        case "rm": {
          const targetPath = normalizePath(rawRest[0] ?? "", state.cwd);
          this.removePath(state, targetPath);
          return { output: `deleted ${targetPath}`, status: "completed" };
        }

        case "mv": {
          const sourcePath = normalizePath(rawRest[0] ?? "", state.cwd);
          const destinationInput = rawRest[1] ?? "";
          this.movePath(state, sourcePath, destinationInput);
          return { output: `moved ${sourcePath}`, status: "completed" };
        }

        case "apps":
          return { output: this.listApps(state), status: "completed" };

        case "open-app": {
          const appName = rawRest.join(" ").trim();
          return { output: this.launchAppInState(state, appName), status: "completed" };
        }

        case "close-app": {
          const appName = rawRest.join(" ").trim();
          return { output: this.closeAppInState(state, appName), status: "completed" };
        }

        case "install-app": {
          const appName = rawRest[0];
          if (!appName) {
            throw new Error("install-app requires a name.");
          }

          this.upsertAppInState(state, {
            name: appName,
            command: rawRest.slice(1).join(" ").trim() || `open /Apps/${appName}`,
            description: "Installed from the mock terminal."
          });
          return { output: `app installed: ${appName}`, status: "completed" };
        }

        case "remove-app": {
          const appName = rawRest.join(" ").trim();
          this.removeAppInState(state, appName);
          return { output: `app removed: ${appName}`, status: "completed" };
        }

        case "packages":
          return { output: this.listPackages(state), status: "completed" };

        case "pkg": {
          const subcommand = rawRest[0]?.toLowerCase();
          const packageName = rawRest[1];
          switch (subcommand) {
            case "install":
              if (!packageName) {
                throw new Error("pkg install requires a package name.");
              }

              return { output: this.installPackageInState(state, packageName, rawRest[2]), status: "completed" };

            case "remove":
              if (!packageName) {
                throw new Error("pkg remove requires a package name.");
              }

              this.removePackageInState(state, packageName);
              return { output: `package removed: ${packageName}`, status: "completed" };

            case "list":
            case undefined:
              return { output: this.listPackages(state), status: "completed" };

            default:
              throw new Error(`Unknown pkg subcommand: ${subcommand}`);
          }
        }

        case "features":
          return { output: this.listFeatures(state), status: "completed" };

        case "add-feature": {
          const [featureKey, featureName, ...descriptionParts] = rawRest;
          if (!featureKey || !featureName) {
            throw new Error("add-feature requires a key and name.");
          }

          this.upsertFeatureInState(state, {
            key: featureKey,
            name: featureName,
            description: descriptionParts.join(" ") || undefined,
            enabled: true
          });
          return { output: `feature saved: ${featureKey}`, status: "completed" };
        }

        case "toggle-feature": {
          const featureKey = rawRest[0];
          if (!featureKey) {
            throw new Error("toggle-feature requires a key.");
          }

          const desiredState = rawRest[1]?.toLowerCase();
          const enabled = desiredState === "on" ? true : desiredState === "off" ? false : undefined;
          return { output: this.toggleFeatureInState(state, featureKey, enabled), status: "completed" };
        }

        case "ps":
          return { output: this.listRunningApps(state), status: "completed" };

        default:
          throw new Error(`Unknown command: ${rawVerb}`);
      }
    }
    catch (error) {
      return {
        output: error instanceof Error ? error.message : String(error),
        status: "failed"
      };
    }
  }

  private findNode(state: MockOsState, targetPath: string): MockOsNode | undefined {
    return state.nodes.find((node) => node.path === targetPath);
  }

  private requireNode(state: MockOsState, targetPath: string): MockOsNode {
    const node = this.findNode(state, targetPath);
    if (!node) {
      throw new Error(`Path not found: ${targetPath}`);
    }

    return node;
  }

  private directoryExists(state: MockOsState, targetPath: string): boolean {
    if (targetPath === "/") {
      return true;
    }

    return this.findNode(state, targetPath)?.kind === "directory";
  }

  private createDirectoryRecursive(state: MockOsState, targetPath: string): void {
    const normalizedPath = normalizePath(targetPath, state.cwd);
    if (normalizedPath === "/") {
      return;
    }

    const segments = normalizedPath.split("/").filter(Boolean);
    let currentPath = "";
    for (const segment of segments) {
      currentPath = `${currentPath}/${segment}`;
      const existingNode = this.findNode(state, currentPath);
      if (existingNode?.kind === "file") {
        throw new Error(`File blocks directory creation: ${currentPath}`);
      }

      if (!existingNode) {
        const timestamp = nowIso();
        state.nodes.push({
          path: currentPath,
          kind: "directory",
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }
    }
  }

  private ensureParentDirectory(state: MockOsState, targetPath: string): void {
    const parentPath = parentPathOf(targetPath);
    if (!parentPath) {
      return;
    }

    this.createDirectoryRecursive(state, parentPath);
  }

  private upsertFile(state: MockOsState, targetPath: string, content: string): void {
    const normalizedPath = normalizePath(targetPath, state.cwd);
    if (normalizedPath === "/") {
      throw new Error("Cannot write the root path.");
    }

    this.ensureParentDirectory(state, normalizedPath);
    const existingNode = this.findNode(state, normalizedPath);
    const timestamp = nowIso();

    if (existingNode?.kind === "directory") {
      throw new Error(`Cannot overwrite directory: ${normalizedPath}`);
    }

    if (existingNode) {
      existingNode.content = content;
      existingNode.updatedAt = timestamp;
      return;
    }

    state.nodes.push({
      path: normalizedPath,
      kind: "file",
      createdAt: timestamp,
      updatedAt: timestamp,
      content
    });
  }

  private removePath(state: MockOsState, targetPath: string): void {
    const normalizedPath = normalizePath(targetPath, state.cwd);
    if (normalizedPath === "/") {
      throw new Error("Cannot delete the root path.");
    }

    const nextNodes = state.nodes.filter((node) => node.path !== normalizedPath && !node.path.startsWith(`${normalizedPath}/`));
    if (nextNodes.length === state.nodes.length) {
      throw new Error(`Path not found: ${normalizedPath}`);
    }

    state.nodes = nextNodes;
    if (!this.directoryExists(state, state.cwd)) {
      state.cwd = "/Users/model";
    }
  }

  private movePath(state: MockOsState, sourcePathInput: string, destinationPathInput: string): void {
    const sourcePath = normalizePath(sourcePathInput, state.cwd);
    if (sourcePath === "/") {
      throw new Error("Cannot move the root path.");
    }

    this.requireNode(state, sourcePath);
    const destinationPath = normalizePath(destinationPathInput, state.cwd);
    const targetBasePath = this.directoryExists(state, destinationPath)
      ? path.posix.join(destinationPath, baseNameOf(sourcePath))
      : destinationPath;

    if (targetBasePath === sourcePath || targetBasePath.startsWith(`${sourcePath}/`)) {
      throw new Error("Cannot move a path into itself.");
    }

    const existingTarget = this.findNode(state, targetBasePath);
    if (existingTarget) {
      throw new Error(`Destination already exists: ${targetBasePath}`);
    }

    this.ensureParentDirectory(state, targetBasePath);
    state.nodes = state.nodes.map((node) => {
      if (node.path === sourcePath || node.path.startsWith(`${sourcePath}/`)) {
        const suffix = node.path.slice(sourcePath.length);
        return { ...node, path: `${targetBasePath}${suffix}`, updatedAt: nowIso() };
      }

      return node;
    });

    if (state.cwd.startsWith(sourcePath)) {
      state.cwd = state.cwd.replace(sourcePath, targetBasePath);
    }
  }

  private upsertAppInState(state: MockOsState, input: { name: string; description?: string; command?: string }): void {
    const existingApp = state.apps.find((app) => app.name.toLowerCase() === input.name.toLowerCase());
    const timestamp = nowIso();

    if (existingApp) {
      existingApp.description = input.description ?? existingApp.description;
      existingApp.command = input.command?.trim() || existingApp.command;
      existingApp.updatedAt = timestamp;
    }
    else {
      state.apps.push({
        id: crypto.randomUUID(),
        name: input.name,
        description: input.description,
        command: input.command?.trim() || `open /Apps/${input.name}`,
        running: false,
        installedAt: timestamp,
        updatedAt: timestamp
      });
      state.apps.sort((left, right) => left.name.localeCompare(right.name));
    }
  }

  private removeAppInState(state: MockOsState, name: string): void {
    const nextApps = state.apps.filter((app) => app.name.toLowerCase() !== name.toLowerCase());
    if (nextApps.length === state.apps.length) {
      throw new Error(`App not found: ${name}`);
    }

    state.apps = nextApps;
  }

  private launchAppInState(state: MockOsState, name: string): string {
    const app = state.apps.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (!app) {
      throw new Error(`App not found: ${name}`);
    }

    app.running = true;
    app.launchedAt = nowIso();
    app.updatedAt = app.launchedAt;
    return `app running: ${app.name}\n${app.command}`;
  }

  private closeAppInState(state: MockOsState, name: string): string {
    const app = state.apps.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (!app) {
      throw new Error(`App not found: ${name}`);
    }

    app.running = false;
    app.updatedAt = nowIso();
    delete app.launchedAt;
    return `app closed: ${app.name}`;
  }

  private upsertFeatureInState(state: MockOsState, input: { key: string; name: string; description?: string; enabled?: boolean }): void {
    const existingFeature = state.features.find((feature) => feature.key === input.key);
    const timestamp = nowIso();

    if (existingFeature) {
      existingFeature.name = input.name;
      existingFeature.description = input.description;
      existingFeature.enabled = input.enabled ?? existingFeature.enabled;
      existingFeature.updatedAt = timestamp;
    }
    else {
      state.features.push({
        key: input.key,
        name: input.name,
        description: input.description,
        enabled: input.enabled ?? true,
        updatedAt: timestamp
      });
      state.features.sort((left, right) => left.name.localeCompare(right.name));
    }
  }

  private toggleFeatureInState(state: MockOsState, key: string, enabled?: boolean): string {
    const feature = state.features.find((entry) => entry.key === key);
    if (!feature) {
      throw new Error(`Feature not found: ${key}`);
    }

    feature.enabled = enabled ?? !feature.enabled;
    feature.updatedAt = nowIso();
    return `feature ${feature.key}=${feature.enabled}`;
  }

  private installPackageInState(state: MockOsState, name: string, version?: string): string {
    const timestamp = nowIso();
    const effectiveVersion = version?.trim() || "latest";
    const existingPackage = state.packages.find((entry) => entry.name.toLowerCase() === name.toLowerCase());

    if (existingPackage) {
      existingPackage.version = effectiveVersion;
      existingPackage.updatedAt = timestamp;
    }
    else {
      state.packages.push({
        name,
        version: effectiveVersion,
        installedAt: timestamp,
        updatedAt: timestamp
      });
      state.packages.sort((left, right) => left.name.localeCompare(right.name));
    }

    return `package installed: ${name}@${effectiveVersion}`;
  }

  private removePackageInState(state: MockOsState, name: string): void {
    const nextPackages = state.packages.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase());
    if (nextPackages.length === state.packages.length) {
      throw new Error(`Package not found: ${name}`);
    }

    state.packages = nextPackages;
  }

  private listDirectory(state: MockOsState, targetPath: string): string {
    if (targetPath !== "/") {
      const node = this.requireNode(state, targetPath);
      if (node.kind === "file") {
        return baseNameOf(node.path);
      }
    }

    const children = state.nodes
      .filter((node) => parentPathOf(node.path) === targetPath)
      .sort((left, right) => left.path.localeCompare(right.path));

    if (!children.length) {
      return "<empty>";
    }

    return children.map((node) => `${node.kind === "directory" ? "dir " : "file"} ${baseNameOf(node.path)}`).join("\n");
  }

  private treeView(state: MockOsState, targetPath: string): string {
    if (targetPath !== "/") {
      this.requireNode(state, targetPath);
    }

    const descendants = state.nodes
      .filter((node) => node.path === targetPath || node.path.startsWith(`${targetPath === "/" ? "" : targetPath}/`))
      .sort((left, right) => left.path.localeCompare(right.path));

    if (!descendants.length) {
      return "<empty>";
    }

    return descendants.map((node) => {
      const depth = node.path === "/" ? 0 : node.path.split("/").filter(Boolean).length - (targetPath === "/" ? 0 : targetPath.split("/").filter(Boolean).length);
      const indent = "  ".repeat(Math.max(depth, 0));
      return `${indent}${node.kind === "directory" ? "[D]" : "[F]"} ${node.path === targetPath ? baseNameOf(targetPath) || "/" : baseNameOf(node.path)}`;
    }).join("\n");
  }

  private findPaths(state: MockOsState, searchTerm: string, rootPath: string): string {
    if (!searchTerm) {
      throw new Error("find requires a search term.");
    }

    const matches = state.nodes
      .filter((node) => (rootPath === "/" || node.path.startsWith(`${rootPath}/`) || node.path === rootPath) && node.path.toLowerCase().includes(searchTerm))
      .map((node) => node.path)
      .sort((left, right) => left.localeCompare(right));

    return matches.length ? matches.join("\n") : "No paths matched.";
  }

  private grepFiles(state: MockOsState, searchTerm: string, rootPath: string): string {
    if (!searchTerm) {
      throw new Error("grep requires a search term.");
    }

    const matches = state.nodes
      .filter((node) => node.kind === "file" && (rootPath === "/" || node.path.startsWith(`${rootPath}/`) || node.path === rootPath))
      .filter((node) => (node.content ?? "").toLowerCase().includes(searchTerm))
      .map((node) => `${node.path}: ${(node.content ?? "").split(/\r?\n/).find((line) => line.toLowerCase().includes(searchTerm)) ?? ""}`);

    return matches.length ? matches.join("\n") : "No file contents matched.";
  }

  private listApps(state: MockOsState): string {
    if (!state.apps.length) {
      return "No apps installed.";
    }

    return state.apps.map((app) => `${app.running ? "[running]" : "[stopped]"} ${app.name} -> ${app.command}`).join("\n");
  }

  private listRunningApps(state: MockOsState): string {
    const runningApps = state.apps.filter((app) => app.running);
    if (!runningApps.length) {
      return "No running apps.";
    }

    return runningApps.map((app) => `${app.name} since ${app.launchedAt ?? "unknown"}`).join("\n");
  }

  private listPackages(state: MockOsState): string {
    if (!state.packages.length) {
      return "No packages installed.";
    }

    return state.packages.map((entry) => `${entry.name}@${entry.version}`).join("\n");
  }

  private listFeatures(state: MockOsState): string {
    if (!state.features.length) {
      return "No features configured.";
    }

    return state.features.map((feature) => `${feature.enabled ? "[on]" : "[off]"} ${feature.key} - ${feature.name}`).join("\n");
  }
}

export function formatMockOsBatchResults(results: MockOsActionResult[]): string {
  return results.map(formatActionResult).join("\n");
}