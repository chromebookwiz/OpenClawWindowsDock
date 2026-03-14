$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)

    Write-Host "[OpenClaw] $Message"
}

function Test-DockerReady {
    try {
        docker info | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Start-DockerDesktop {
    $candidatePaths = @(
        "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$Env:ProgramFiles(x86)\Docker\Docker\Docker Desktop.exe",
        "$Env:LocalAppData\Programs\Docker\Docker\Docker Desktop.exe"
    )

    foreach ($candidate in $candidatePaths) {
        if (Test-Path $candidate) {
            Write-Step "Starting Docker Desktop..."
            Start-Process -FilePath $candidate | Out-Null
            return $true
        }
    }

    return $false
}

function Wait-ForDocker {
    $deadline = (Get-Date).AddMinutes(4)
    do {
        if (Test-DockerReady) {
            return $true
        }

        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    return $false
}

function Ensure-EnvFile {
    $root = Split-Path -Parent $PSScriptRoot
    $envPath = Join-Path $root ".env"
    $templatePath = Join-Path $root ".env.example"

    if (-not (Test-Path $envPath)) {
        Copy-Item $templatePath $envPath
        Write-Step "Created .env from template."
    }
}

function Ensure-AuthSecret {
    $root = Split-Path -Parent $PSScriptRoot
    $envPath = Join-Path $root ".env"

    if (-not (Test-Path $envPath)) {
        return
    }

    $lines = Get-Content $envPath
    $secretLineIndex = -1
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match '^AUTH_TOKEN_SECRET=') {
            $secretLineIndex = $index
            break
        }
    }

    $placeholder = "AUTH_TOKEN_SECRET=replace-with-a-random-secret"
    if ($secretLineIndex -eq -1) {
        [byte[]]$secretBytes = 1..48 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }
        $generatedSecret = [Convert]::ToBase64String($secretBytes)
        Add-Content -Path $envPath -Value "AUTH_TOKEN_SECRET=$generatedSecret"
        Write-Step "Generated AUTH_TOKEN_SECRET in .env."
        return
    }

    if ($lines[$secretLineIndex] -eq $placeholder) {
        [byte[]]$secretBytes = 1..48 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }
        $generatedSecret = [Convert]::ToBase64String($secretBytes)
        $lines[$secretLineIndex] = "AUTH_TOKEN_SECRET=$generatedSecret"
        Set-Content -Path $envPath -Value $lines
        Write-Step "Replaced placeholder AUTH_TOKEN_SECRET in .env."
    }
}

function Get-ConfiguredPort {
    $root = Split-Path -Parent $PSScriptRoot
    $envPath = Join-Path $root ".env"

    if (-not (Test-Path $envPath)) {
        return "3000"
    }

    $portLine = Get-Content $envPath | Where-Object { $_ -match '^OPENCLAW_PORT=' } | Select-Object -First 1
    if (-not $portLine) {
        return "3000"
    }

    return ($portLine -split '=', 2)[1]
}

Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Step "Preparing OpenClawWindowsDock bootstrap..."
Ensure-EnvFile
Ensure-AuthSecret

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found. Install Docker Desktop first."
}

if (-not (Test-DockerReady)) {
    $started = Start-DockerDesktop
    if (-not $started) {
        throw "Docker Desktop is not running and could not be started automatically."
    }

    Write-Step "Waiting for Docker engine..."
    if (-not (Wait-ForDocker)) {
        throw "Docker engine did not become ready in time."
    }
}

Write-Step "Docker engine is ready."

$port = Get-ConfiguredPort

Write-Step "Building and starting the sandbox container..."
& docker compose up --build -d

Write-Step "Waiting for http://localhost:$port/health ..."
$deadline = (Get-Date).AddMinutes(4)
do {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$port/health" -Method Get -TimeoutSec 5
        if ($response.status -eq "ok") {
            Write-Step "OpenClawWindowsDock is ready."
            Write-Step "API: http://localhost:$port"
            Start-Process "http://localhost:$port/dashboard" | Out-Null
            exit 0
        }
    }
    catch {
    }
} while ((Get-Date) -lt $deadline)

throw "Sandbox did not become healthy in time."