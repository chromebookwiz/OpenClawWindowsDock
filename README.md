# OpenClawWindowsDock

OpenClawWindowsDock runs browser automation, scheduling, auth, and OpenClaw connectivity inside one persistent environment. It supports two OpenClaw modes: a locally managed OpenClaw process inside the same environment, or an already running OpenClaw instance somewhere else.

## One-click install and run

Double-click [OpenClawWindowsDock.cmd](OpenClawWindowsDock.cmd) from Explorer, or run it from PowerShell:

```powershell
./OpenClawWindowsDock.cmd
```

That launcher will:

- create `.env` from `.env.example` if needed
- try to start Docker Desktop if it is installed but not already running
- wait for the Docker engine to become available
- build and start the OpenClawWindowsDock container
- wait for the health endpoint to report ready

If you prefer PowerShell directly, use [scripts/install-run.ps1](scripts/install-run.ps1).

## What it does

- Runs a long-lived browser automation service on port 3000
- Persists browser state, tasks, logs, and screenshots across restarts
- Restarts automatically with Docker using `unless-stopped`
- Accepts queued browser tasks over HTTP
- Keeps all automation inside the sandbox container
- Exposes service metadata, queue status, and task retry operations
- Stores reusable task definitions and recurring schedules
- Supports both interval-based and cron-style recurring schedules
- Imports and exports task bundles as JSON
- Accepts incoming webhook-triggered runs
- Requires local user authentication for dashboard and API actions
- Ships with a browser dashboard for queue state, runs, schedules, and artifacts
- Connects to OpenClaw in `embedded` mode or `external` mode

## Requirements

- Docker Desktop on Windows with Linux containers enabled
- Enough memory for Chromium inside the container

## First-run configuration

The launcher will create `.env` automatically from `.env.example`. Update it if you want to change the exposed port or browser mode.
The one-click installer will generate `AUTH_TOKEN_SECRET` automatically if the env file still contains the placeholder value.

OpenClaw modes:

- `embedded`: OpenClaw is installed in the same environment and launched by `OPENCLAW_START_COMMAND`
- `external`: OpenClaw is already running elsewhere and reached through `OPENCLAW_BASE_URL`

## Start

From PowerShell:

```powershell
./scripts/install-run.ps1
```

Or directly:

```powershell
docker compose up --build -d
```

## Stop

```powershell
./scripts/stop.ps1
```

## Health check

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
Invoke-RestMethod -Uri "http://localhost:3000/status"
```

Open the dashboard in a browser:

```powershell
Start-Process "http://localhost:3000/dashboard"
```

On first load, the dashboard will ask you to create the initial admin account.

## OpenClaw connection modes

Embedded mode example:

```powershell
OPENCLAW_MODE=embedded
OPENCLAW_START_COMMAND=npx openclaw serve
OPENCLAW_BASE_URL=http://127.0.0.1:8080
```

External mode example:

```powershell
OPENCLAW_MODE=external
OPENCLAW_BASE_URL=http://host.docker.internal:8080
OPENCLAW_HEALTH_PATH=/health
```

## Queue a task

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

Invoke-RestMethod -Uri "http://localhost:3000/tasks" -Method Post -ContentType "application/json" -Body $body
```

## Inspect tasks

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/tasks"
Invoke-RestMethod -Uri "http://localhost:3000/tasks/<task-id>"
```

## Retry a task

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/tasks/<task-id>/retry" -Method Post
```

## Save and run definitions

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

$saved = Invoke-RestMethod -Uri "http://localhost:3000/definitions" -Method Post -ContentType "application/json" -Body $definition
Invoke-RestMethod -Uri "http://localhost:3000/definitions/$($saved.id)/enqueue" -Method Post
```

## Create recurring schedules

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

Invoke-RestMethod -Uri "http://localhost:3000/schedules" -Method Post -ContentType "application/json" -Body $schedule
```

Cron example:

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

Invoke-RestMethod -Uri "http://localhost:3000/schedules" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer <token>" } -Body $cronSchedule
```

## Authentication

Bootstrap the first admin user:

```powershell
$bootstrap = @{ username = "admin"; password = "ChangeThisPassword123!" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/auth/bootstrap" -Method Post -ContentType "application/json" -Body $bootstrap
```

Then log in and store the returned token:

```powershell
$login = @{ username = "admin"; password = "ChangeThisPassword123!" } | ConvertTo-Json
$session = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body $login
$token = $session.token
```

## Webhooks

Create a webhook against an existing definition:

```powershell
$body = @{
  name = "definition-webhook"
  targetType = "definition"
  definitionId = "<definition-id>"
} | ConvertTo-Json

$webhook = Invoke-RestMethod -Uri "http://localhost:3000/webhooks" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" } -Body $body
Invoke-RestMethod -Uri $webhook.triggerUrl -Method Post
```

## Import and export bundles

```powershell
Get-Content ./examples/starter-bundle.json -Raw |
  Invoke-RestMethod -Uri "http://localhost:3000/bundles/import" -Method Post -ContentType "application/json"

Invoke-RestMethod -Uri "http://localhost:3000/bundles/export" -Method Get
```

## Restart browser session

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/browser/restart" -Method Post
```

## Supported step types

- `navigate`
- `newPage`
- `click`
- `fill`
- `press`
- `waitForSelector`
- `extractText`
- `screenshot`
- `closePage`

## Service endpoints

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

Artifacts are stored in the `openclaw_artifacts` Docker volume. Task metadata and results are stored in the `openclaw_tasks` volume. Definitions are stored in the `openclaw_definitions` volume. Recurring schedules are stored in the `openclaw_schedules` volume. Local users are stored in the `openclaw_users` volume. Managed webhooks are stored in the `openclaw_webhooks` volume. Logs are stored in the `openclaw_logs` volume. Browser cookies and session state live in the `openclaw_browser` volume.

## Environment variables

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

## Examples

Sample task payloads live in [examples](examples).

## Notes

- This project is intentionally scoped to the sandbox container. It does not install persistence or control mechanisms on the Windows host.
- If you need to inspect the persistent volumes, use Docker Desktop or `docker volume inspect`.