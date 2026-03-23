# OpenClawWindowsDock

OpenClawWindowsDock is a persistent browser-automation sandbox. It gives you one place to run:

- browser tasks
- saved task definitions
- recurring schedules
- incoming webhooks
- local user login and roles
- OpenClaw connectivity in one of two modes

This README is written as a literal step-by-step tutorial. If you follow it top to bottom, you should be able to get the app running without guessing.

## What this app is for

OpenClawWindowsDock runs inside Docker and keeps its own browser profile, task history, logs, screenshots, users, schedules, and webhook configuration even after restart.

It supports two OpenClaw modes:

- `embedded`: OpenClaw is started inside the same environment by a command you provide.
- `external`: OpenClaw is already running somewhere else, and OpenClawWindowsDock connects to it over HTTP.

## Before you start

You need these things installed on Windows:

1. Docker Desktop
2. Git, if you plan to clone the repository yourself

Docker Desktop requirements:

1. Install Docker Desktop from the official Docker site.
2. Open Docker Desktop at least once after installing it.
3. Make sure Docker Desktop is using Linux containers.
4. Wait until Docker says it is running before you continue.

If Docker Desktop is not installed, the one-click launcher cannot work.

## Folder contents you should know about

- `OpenClawWindowsDock.cmd`: the only Windows command launcher and the main entrypoint
- `scripts/install-run.ps1`: PowerShell installer and starter
- `scripts/stop.ps1`: stops the Docker stack
- `scripts/status.ps1`: shows Docker/container status
- `.env.example`: template for your local settings
- `.env`: your actual local settings file
- `examples/`: sample JSON payloads

## Fastest possible start

If you want the shortest path first:

1. Open the project folder.
2. Double-click `OpenClawWindowsDock.cmd`.
3. Wait for Docker to finish starting.
4. Answer the setup prompts the first time it asks.
5. If no users exist yet, optionally create your first admin account when prompted, or skip it.
6. Wait for your browser to open `http://localhost:3000/dashboard`.
7. If you skipped admin creation in the launcher, create your first admin account on the dashboard.

If that worked, you can skip to the section called `First login and first task`.

If you want to understand each step and set the OpenClaw mode correctly first, keep reading.

## Docker compose all-in-one startup (recommended)

This repository now includes an updated `docker-compose.yml` that starts:

- `openclawwindowsdock` (this app)
- `ollama` (Llama inference server)
- `openclaw` (OpenClaw agent service)

Press a single command to start everything:

```bash
docker compose up -d --build
```

Then verify:

```bash
docker compose ps
curl http://localhost:3000/health
curl http://localhost:11434
curl http://localhost:8080/health
```

If you want logs:

```bash
docker compose logs -f
```

Stop the stack:

```bash
docker compose down
```

---

## Mock OS and mock terminal

The dashboard now includes a persistent mock OS that the model can edit without touching the real host machine.

It supports:

- a mock terminal with commands like `help`, `tree`, `find`, `grep`, `apps`, `ps`, `pkg install`, `pkg remove`, `open-app`, `close-app`, `write`, `mkdir`, `rm`, and `toggle-feature`
- direct mock file editing from the dashboard
- mock app install, launch, close, and removal
- package-style installs and removals
- mock feature creation and toggling
- batch action application through a single structured request

API endpoints for that surface:

- `GET /mock-os`
- `POST /mock-os/terminal`
- `POST /mock-os/files`
- `POST /mock-os/files/delete`
- `POST /mock-os/apps`
- `POST /mock-os/apps/remove`
- `POST /mock-os/apps/launch`
- `POST /mock-os/apps/close`
- `POST /mock-os/features`
- `POST /mock-os/features/toggle`
- `POST /mock-os/packages`
- `POST /mock-os/packages/remove`
- `POST /mock-os/actions`

## Step 1: Open PowerShell in the project folder

If your project folder is already `C:\code\OpenWindows`, open PowerShell and run:

```powershell
Set-Location "C:\code\OpenWindows"
```

If you downloaded the project somewhere else, change the path to match your folder.

## Step 2: Let the launcher create your local config file

The app uses a file named `.env` for local settings.

You usually do not need to create or edit it by hand anymore.

When you launch `OpenClawWindowsDock.cmd`, it will:

1. Create `.env` from `.env.example` if it is missing.
2. Ask you a few setup questions with simple prompts and numbered choices.
3. Save your answers back into `.env`.

If you want to create it manually anyway, you still can:

```powershell
Copy-Item .env.example .env
```

If you use the one-click launcher, it will create `.env` automatically if it is missing and fill in the important OpenClaw settings by prompting you.

## Step 3: Choose your OpenClaw mode

This is the most important decision before first launch.

The launcher will ask you this directly, so you do not need to open `.env` first unless you want to.

### Option A: `embedded` mode

Use this when OpenClaw should be started from inside this environment.

In your `.env` file, set:

```text
OPENCLAW_MODE=embedded
OPENCLAW_BASE_URL=http://127.0.0.1:8080
OPENCLAW_HEALTH_PATH=/health
OPENCLAW_START_COMMAND=your-openclaw-start-command-here
OPENCLAW_WORKING_DIR=
OPENCLAW_START_TIMEOUT_MS=30000
```

What this means:

- `OPENCLAW_MODE=embedded` tells the app to manage OpenClaw itself.
- `OPENCLAW_START_COMMAND` is the command it will run to start OpenClaw.
- `OPENCLAW_BASE_URL` is the address OpenClawWindowsDock will test after startup.

Example embedded command:

```text
OPENCLAW_START_COMMAND=npx openclaw serve
```

Important:

- If `OPENCLAW_MODE=embedded` but `OPENCLAW_START_COMMAND` is blank, OpenClawWindowsDock will show OpenClaw as `unconfigured`.
- That is expected behavior, not a bug.

### Option B: `external` mode

Use this when OpenClaw is already running somewhere else.

In your `.env` file, set:

```text
OPENCLAW_MODE=external
OPENCLAW_BASE_URL=http://host.docker.internal:8080
OPENCLAW_HEALTH_PATH=/health
OPENCLAW_START_COMMAND=
OPENCLAW_WORKING_DIR=
OPENCLAW_START_TIMEOUT_MS=30000
```

What this means:

- `OPENCLAW_MODE=external` tells the app not to start OpenClaw itself.
- `OPENCLAW_BASE_URL` must point to your already-running OpenClaw service.
- `OPENCLAW_HEALTH_PATH` is the health-check route on that external service.

If your external OpenClaw is not on the same machine, replace the example URL with the real hostname or IP.

## Step 4: Optional manual review of the saved `.env` settings

Open `.env` in an editor and check these values:

```text
OPENCLAW_PORT=3000
BROWSER_HEADLESS=true
DEFAULT_TIMEOUT_MS=15000
SCHEDULER_TICK_MS=15000
AUTH_TOKEN_SECRET=replace-with-a-random-secret
AUTH_TOKEN_TTL_HOURS=12
```

What each one does:

- `OPENCLAW_PORT`: the local port for the API and dashboard. Leave `3000` unless you already use that port.
- `BROWSER_HEADLESS=true`: runs Chromium without showing a visible browser window inside the container.
- `DEFAULT_TIMEOUT_MS=15000`: how long a task step waits before timing out.
- `SCHEDULER_TICK_MS=15000`: how often the scheduler checks for due jobs.
- `AUTH_TOKEN_SECRET`: secret used to sign login tokens.
- `AUTH_TOKEN_TTL_HOURS=12`: login token lifetime.

You do not need to manually generate `AUTH_TOKEN_SECRET` if you use the provided launcher. The install script will replace the placeholder automatically the first time it runs.

## Step 5: Start the app the easy way

Run this in PowerShell:

```powershell
./OpenClawWindowsDock.cmd
```

Or, if you prefer running the PowerShell script directly:

```powershell
./scripts/install-run.ps1
```

What the installer does for you:

1. Creates `.env` from `.env.example` if needed.
2. Prompts you for the important setup values on first run or when required values are missing.
3. Lets you answer the mode prompts by typing either the number or the mode name.
4. Saves those answers into `.env`.
5. Generates `AUTH_TOKEN_SECRET` if it still has the placeholder value.
6. Checks whether Docker is installed.
7. Tries to start Docker Desktop if Docker is installed but not yet running.
8. Waits for the Docker engine to be ready.
9. Builds the container.
10. Starts the container in the background.
11. Waits for `http://localhost:3000/health` or your custom port.
12. If no local users exist yet, offers to create the first admin account for you.
13. Opens the dashboard in your browser.

## Step 6: What you should see when startup succeeds

When the startup script works, you should end up at:

```text
http://localhost:3000/dashboard
```

If you changed `OPENCLAW_PORT`, use that port instead.

You should also be able to check health from PowerShell:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

Expected result:

```json
{"status":"ok"}
```

You can also check the fuller runtime status:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/status"
```

## Step 7: First login and first admin account

The first time you open the dashboard, there are no users yet.

You have three ways to create the first admin user.

### Method 1: let the launcher offer it after startup

If no users exist yet, the launcher can ask:

1. Whether you want to create the first admin now.
2. What username to use.
3. What password to use.
4. To confirm the password.

This step is optional. If you skip it, the app still starts normally and opens the dashboard.

### Method 2: use the dashboard

1. Open the dashboard.
2. Enter a username.
3. Enter a strong password.
4. Submit the bootstrap form.

### Method 3: use PowerShell

Run this exactly as shown, then change the password to one you want:

```powershell
$bootstrap = @{
  username = "admin"
  password = "ChangeThisPassword123!"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/auth/bootstrap" -Method Post -ContentType "application/json" -Body $bootstrap
```

After that, log in:

```powershell
$login = @{
  username = "admin"
  password = "ChangeThisPassword123!"
} | ConvertTo-Json

$session = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body $login
$token = $session.token
```

After login, `$token` contains your bearer token for protected API calls.

Important:

- Do not keep the example password in real use.
- Change it immediately if you created the admin user with the sample value above.

## Step 8: Confirm your OpenClaw mode is working

After you log in and have `$token`, check OpenClaw status:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/openclaw/status" -Headers @{ Authorization = "Bearer $token" }
```

What the result usually means:

- `state = healthy`: OpenClaw is reachable and responding.
- `state = unreachable`: the configured URL did not respond.
- `state = unconfigured`: embedded mode was selected but no launch command was provided.

If you are using `embedded` mode and want the app to start OpenClaw for you, make sure `OPENCLAW_START_COMMAND` is set in `.env`.

If you are using `external` mode, make sure `OPENCLAW_BASE_URL` points to the right server and port.

## Step 9: Run your first browser task

This is the simplest useful test. It opens `https://example.com`, waits for the heading, extracts the heading text, and saves a screenshot.

Run this in PowerShell after login:

```powershell
$body = @{
  name = "example-search"
  steps = @(
    @{ type = "navigate"; url = "https://example.com" },
    @{ type = "waitForSelector"; selector = "h1" },
    @{ type = "extractText"; selector = "h1"; outputKey = "headline" },
    @{ type = "screenshot"; fileName = "example-home.png" }
  )
} | ConvertTo-Json -Depth 6

$task = Invoke-RestMethod -Uri "http://localhost:3000/tasks" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" } -Body $body
$task
```

This returns a task record with an ID.

To check it later:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/tasks/$($task.id)" -Headers @{ Authorization = "Bearer $token" }
```

To list all tasks:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/tasks" -Headers @{ Authorization = "Bearer $token" }
```

## Step 10: Find the screenshot and artifacts

Artifacts are available through the API:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/artifacts" -Headers @{ Authorization = "Bearer $token" }
```

They are also shown in the dashboard.

If you are using Docker Desktop, you can inspect the app volumes there too.

## Step 11: Save a reusable task definition

Definitions let you save a task template and run it again later.

Create one:

```powershell
$definition = @{
  name = "example-definition"
  description = "Capture the h1 from example.com"
  request = @{
    name = "example-definition"
    steps = @(
      @{ type = "navigate"; url = "https://example.com" },
      @{ type = "waitForSelector"; selector = "h1" },
      @{ type = "extractText"; selector = "h1"; outputKey = "headline" }
    )
  }
} | ConvertTo-Json -Depth 8

$saved = Invoke-RestMethod -Uri "http://localhost:3000/definitions" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" } -Body $definition
$saved
```

Run that definition:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/definitions/$($saved.id)/enqueue" -Method Post -Headers @{ Authorization = "Bearer $token" }
```

## Step 12: Create a recurring schedule

If you want a task to run on a timer, create a schedule.

### Simple interval schedule example

```powershell
$schedule = @{
  name = "example-hourly"
  intervalMinutes = 60
  enabled = $true
  request = @{
    name = "example-hourly"
    steps = @(
      @{ type = "navigate"; url = "https://example.com" },
      @{ type = "screenshot"; fileName = "example-hourly.png" }
    )
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Uri "http://localhost:3000/schedules" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" } -Body $schedule
```

### Cron schedule example

This example runs every 15 minutes:

```powershell
$cronSchedule = @{
  name = "quarter-hourly"
  mode = "cron"
  cronExpression = "*/15 * * * *"
  request = @{
    name = "quarter-hourly"
    steps = @(
      @{ type = "navigate"; url = "https://example.com" },
      @{ type = "screenshot"; fileName = "quarter-hourly.png" }
    )
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Uri "http://localhost:3000/schedules" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" } -Body $cronSchedule
```

## Step 13: Create a webhook trigger

Webhooks let another tool trigger a saved definition or schedule.

Create a webhook for an existing definition:

```powershell
$body = @{
  name = "definition-webhook"
  targetType = "definition"
  definitionId = "<definition-id>"
} | ConvertTo-Json

$webhook = Invoke-RestMethod -Uri "http://localhost:3000/webhooks" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" } -Body $body
$webhook
```

Trigger it:

```powershell
Invoke-RestMethod -Uri $webhook.triggerUrl -Method Post
```

## Step 14: Import and export bundles

Bundles let you move definitions and schedules in and out as JSON.

Import the starter bundle:

```powershell
Get-Content ./examples/starter-bundle.json -Raw |
  Invoke-RestMethod -Uri "http://localhost:3000/bundles/import" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" }
```

Export your current bundle:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/bundles/export" -Method Get -Headers @{ Authorization = "Bearer $token" }
```

## Everyday commands

### Start

```powershell
./OpenClawWindowsDock.cmd
```

or

```powershell
./scripts/install-run.ps1
```

### Stop

```powershell
./scripts/stop.ps1
```

### Check status

```powershell
./scripts/status.ps1
```

### Restart only the browser session

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/browser/restart" -Method Post -Headers @{ Authorization = "Bearer $token" }
```

### Restart managed OpenClaw in embedded mode

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/openclaw/restart" -Method Post -Headers @{ Authorization = "Bearer $token" }
```

## If something goes wrong

### Problem: the launcher says Docker is missing

Fix:

1. Install Docker Desktop.
2. Close PowerShell.
3. Open a new PowerShell window.
4. Run `docker version` to confirm Docker is on your PATH.
5. Start again.

### Problem: the launcher waits forever for Docker

Fix:

1. Open Docker Desktop manually.
2. Wait until it shows that Docker is running.
3. Run the launcher again.

### Problem: the app starts but the dashboard does not open

Fix:

1. Open `http://localhost:3000/dashboard` manually in your browser.
2. If you changed `OPENCLAW_PORT`, use that port instead.
3. Run the health check command from this README.

### Problem: OpenClaw status says `unconfigured`

Fix:

1. Open `.env`.
2. If you want embedded mode, set `OPENCLAW_START_COMMAND`.
3. If you do not want embedded mode, switch to `OPENCLAW_MODE=external`.
4. Start the app again.

### Problem: OpenClaw status says `unreachable`

Fix:

1. Check the value of `OPENCLAW_BASE_URL`.
2. Check that the target OpenClaw server is really running.
3. Check that `OPENCLAW_HEALTH_PATH` is correct.
4. Restart the app after fixing `.env`.

### Problem: a protected API call returns `401`

Fix:

1. Log in again.
2. Make sure you are passing the `Authorization` header.
3. Make sure the header looks like `Bearer your-token-here`.

## Supported task step types

- `navigate`
- `newPage`
- `click`
- `fill`
- `press`
- `waitForSelector`
- `extractText`
- `screenshot`
- `closePage`

## Service endpoints reference

- `GET /` basic service metadata and available endpoints
- `GET /dashboard` browser UI for queue, definitions, schedules, and artifacts
- `GET /auth/status` returns auth readiness and current token state
- `POST /auth/bootstrap` creates the first local admin user when no users exist
- `POST /auth/login` returns a bearer token for API and dashboard use
- `GET /health` liveness check for orchestrators and scripts
- `GET /status` queue counts and runtime metadata
- `GET /openclaw/status` returns the current OpenClaw mode and reachability
- `POST /openclaw/restart` restarts the managed OpenClaw process in embedded mode
- `GET /artifacts` list persisted artifact files
- `GET /users` list local users, admin only
- `POST /users` create a local user, admin only
- `GET /tasks` list persisted tasks
- `GET /tasks/:id` fetch one task record
- `POST /tasks` enqueue a new browser task
- `POST /tasks/:id/retry` reset a failed or completed task back to queued
- `GET /definitions` list reusable task definitions
- `GET /definitions/:id` fetch one definition
- `POST /definitions` create a reusable task definition
- `POST /definitions/:id/enqueue` enqueue a run from a definition
- `GET /schedules` list recurring schedules
- `GET /schedules/:id` fetch one schedule
- `POST /schedules` create a recurring schedule
- `POST /schedules/:id/toggle` enable or disable a schedule
- `POST /schedules/:id/run` trigger a schedule immediately
- `GET /webhooks` list managed incoming webhooks
- `POST /webhooks` create a webhook targeting a definition, schedule, or inline request
- `POST /webhooks/:id/toggle` enable or disable a webhook
- `POST /webhooks/:id/rotate` rotate a webhook secret
- `GET /hooks/:id/:secret` inspect a public webhook target
- `POST /hooks/:id/:secret` public trigger URL for a managed webhook
- `GET /bundles/export` export all definitions and schedules as a JSON bundle
- `POST /bundles/import` import a JSON bundle of definitions and schedules
- `POST /browser/restart` restart the persistent browser session

## Environment variables reference

- `OPENCLAW_PORT`: host port for the API, default `3000`
- `BROWSER_HEADLESS`: `true` or `false`, default `true`
- `DEFAULT_TIMEOUT_MS`: step timeout, default `15000`
- `SCHEDULER_TICK_MS`: how often the schedule runner scans for due jobs, default `15000`
- `AUTH_TOKEN_SECRET`: HMAC secret used to sign login tokens
- `AUTH_TOKEN_TTL_HOURS`: bearer token lifetime, default `12`
- `OPENCLAW_MODE`: `embedded` or `external`
- `OPENCLAW_BASE_URL`: URL to the OpenClaw HTTP service
- `OPENCLAW_HEALTH_PATH`: health endpoint path for status checks
- `OPENCLAW_START_COMMAND`: shell command used to launch OpenClaw in embedded mode
- `OPENCLAW_WORKING_DIR`: working directory for the embedded OpenClaw command
- `OPENCLAW_START_TIMEOUT_MS`: how long to wait for embedded OpenClaw to become reachable

## Where data is stored

The Docker volumes keep your data after restart:

- `openclaw_artifacts`: screenshots and saved artifacts
- `openclaw_tasks`: task records and results
- `openclaw_definitions`: saved definitions
- `openclaw_schedules`: recurring schedules
- `openclaw_users`: local user accounts
- `openclaw_webhooks`: managed webhook definitions
- `openclaw_logs`: logs
- `openclaw_browser`: browser profile, cookies, and session state

## Examples

Sample payloads live in [examples](examples).

## Scope note

This project is intentionally limited to its sandbox environment. It does not install persistence or control mechanisms on the Windows host.