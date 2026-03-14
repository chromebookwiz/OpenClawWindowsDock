$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"
$port = "3000"

if (Test-Path $envPath) {
    $portLine = Get-Content $envPath | Where-Object { $_ -match '^OPENCLAW_PORT=' } | Select-Object -First 1
    if ($portLine) {
        $port = ($portLine -split '=', 2)[1]
    }
}

Invoke-RestMethod -Uri "http://localhost:$port/status" -Method Get | ConvertTo-Json -Depth 6