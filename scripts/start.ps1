$ErrorActionPreference = "Stop"

$port = if ($env:OPENCLAW_PORT) { $env:OPENCLAW_PORT } else { "3000" }

Write-Host "Building and starting OpenClawWindowsDock..."
& docker compose up --build -d

Write-Host "Waiting for health endpoint..."
$deadline = (Get-Date).AddMinutes(3)
do {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$port/health" -Method Get -TimeoutSec 5
        if ($response.status -eq "ok") {
            Write-Host "OpenClawWindowsDock is ready at http://localhost:$port"
            exit 0
        }
    }
    catch {
    }
} while ((Get-Date) -lt $deadline)

Write-Error "Sandbox did not become healthy in time."