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

function Read-EnvFile {
    $root = Split-Path -Parent $PSScriptRoot
    $envPath = Join-Path $root ".env"
    $values = @{}

    if (-not (Test-Path $envPath)) {
        return $values
    }

    foreach ($line in Get-Content $envPath) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        if ($line.TrimStart().StartsWith("#")) {
            continue
        }

        $parts = $line -split '=', 2
        if ($parts.Count -ne 2) {
            continue
        }

        $values[$parts[0]] = $parts[1]
    }

    return $values
}

function Set-EnvValue {
    param(
        [hashtable]$Values,
        [string]$Key,
        [string]$Value
    )

    $Values[$Key] = $Value
}

function Save-EnvFile {
    param([hashtable]$Values)

    $root = Split-Path -Parent $PSScriptRoot
    $envPath = Join-Path $root ".env"
    $templatePath = Join-Path $root ".env.example"

    $outputLines = New-Object System.Collections.Generic.List[string]
    $writtenKeys = New-Object System.Collections.Generic.HashSet[string]

    if (Test-Path $templatePath) {
        foreach ($line in Get-Content $templatePath) {
            if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#") -or -not ($line -match '=')) {
                $outputLines.Add($line)
                continue
            }

            $parts = $line -split '=', 2
            $key = $parts[0]
            if ($Values.ContainsKey($key)) {
                $outputLines.Add("$key=$($Values[$key])")
                $null = $writtenKeys.Add($key)
            }
            else {
                $outputLines.Add($line)
            }
        }
    }

    foreach ($key in $Values.Keys) {
        if (-not $writtenKeys.Contains($key)) {
            $outputLines.Add("$key=$($Values[$key])")
        }
    }

    Set-Content -Path $envPath -Value $outputLines
}

function Prompt-Value {
    param(
        [string]$Label,
        [string]$CurrentValue,
        [string]$DefaultValue,
        [switch]$Required
    )

    $effectiveDefault = $CurrentValue
    if ([string]::IsNullOrWhiteSpace($effectiveDefault)) {
        $effectiveDefault = $DefaultValue
    }

    while ($true) {
        if ([string]::IsNullOrWhiteSpace($effectiveDefault)) {
            $inputValue = Read-Host "$Label"
        }
        else {
            $inputValue = Read-Host "$Label [$effectiveDefault]"
        }

        if ([string]::IsNullOrWhiteSpace($inputValue)) {
            $inputValue = $effectiveDefault
        }

        if ($Required -and [string]::IsNullOrWhiteSpace($inputValue)) {
            Write-Step "$Label is required. Please enter a value."
            continue
        }

        return $inputValue
    }
}

function Prompt-Choice {
    param(
        [string]$Label,
        [string[]]$Choices,
        [string]$CurrentValue,
        [string]$DefaultValue,
        [string[]]$Descriptions
    )

    $effectiveDefault = $CurrentValue
    if ([string]::IsNullOrWhiteSpace($effectiveDefault)) {
        $effectiveDefault = $DefaultValue
    }

    $choiceList = $Choices -join '/'

    Write-Host ""
    Write-Host $Label
    for ($index = 0; $index -lt $Choices.Count; $index++) {
        $description = ""
        if ($Descriptions -and $Descriptions.Count -gt $index -and -not [string]::IsNullOrWhiteSpace($Descriptions[$index])) {
            $description = " - $($Descriptions[$index])"
        }

        Write-Host "  $($index + 1). $($Choices[$index])$description"
    }

    while ($true) {
        $answer = Read-Host "Choose an option by number or name [$effectiveDefault]"
        if ([string]::IsNullOrWhiteSpace($answer)) {
            $answer = $effectiveDefault
        }

        $numericChoice = 0
        if ([int]::TryParse($answer, [ref]$numericChoice)) {
            if ($numericChoice -ge 1 -and $numericChoice -le $Choices.Count) {
                return $Choices[$numericChoice - 1]
            }
        }

        foreach ($choice in $Choices) {
            if ($answer -ieq $choice) {
                return $choice
            }
        }

        Write-Step "Please choose one of: $choiceList"
    }
}

function Prompt-YesNo {
    param(
        [string]$Label,
        [bool]$DefaultValue = $false
    )

    $defaultText = if ($DefaultValue) { "Y/n" } else { "y/N" }

    while ($true) {
        $answer = Read-Host "$Label [$defaultText]"
        if ([string]::IsNullOrWhiteSpace($answer)) {
            return $DefaultValue
        }

        switch -Regex ($answer.Trim()) {
            '^(y|yes)$' { return $true }
            '^(n|no)$' { return $false }
        }

        Write-Step "Please answer yes or no."
    }
}

function Read-PlainPassword {
    param([string]$Label)

    $secureValue = Read-Host $Label -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)

    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

function Prompt-AdminUsername {
    while ($true) {
        $username = Read-Host "Admin username [admin]"
        if ([string]::IsNullOrWhiteSpace($username)) {
            $username = "admin"
        }

        if ($username.Length -lt 3 -or $username.Length -gt 40) {
            Write-Step "Username must be between 3 and 40 characters."
            continue
        }

        if ($username -notmatch '^[a-zA-Z0-9._-]+$') {
            Write-Step "Username can only use letters, numbers, dot, underscore, or dash."
            continue
        }

        return $username
    }
}

function Prompt-AdminPassword {
    while ($true) {
        $password = Read-PlainPassword -Label "Admin password"
        if ($password.Length -lt 10 -or $password.Length -gt 200) {
            Write-Step "Password must be between 10 and 200 characters."
            continue
        }

        $confirmation = Read-PlainPassword -Label "Confirm admin password"
        if ($password -ne $confirmation) {
            Write-Step "Passwords did not match. Try again."
            continue
        }

        return $password
    }
}

function Maybe-BootstrapAdmin {
    param([string]$Port)

    try {
        $authStatus = Invoke-RestMethod -Uri "http://localhost:$Port/auth/status" -Method Get -TimeoutSec 5
    }
    catch {
        Write-Step "Could not check auth setup automatically. You can still create an admin from the dashboard."
        return
    }

    if ($authStatus.usersExist) {
        return
    }

    Write-Host ""
    Write-Step "No local users exist yet."
    if (-not (Prompt-YesNo -Label "Create the first admin account now" -DefaultValue $false)) {
        Write-Step "Skipping admin creation. You can create the first admin from the dashboard later."
        return
    }

    Write-Host ""
    Write-Host "Create first admin account"
    Write-Host "Username rules: 3 to 40 characters using letters, numbers, dot, underscore, or dash."
    Write-Host "Password rules: at least 10 characters."

    while ($true) {
        $username = Prompt-AdminUsername
        $password = Prompt-AdminPassword
        $payload = @{
            username = $username
            password = $password
        } | ConvertTo-Json

        try {
            $result = Invoke-RestMethod -Uri "http://localhost:$Port/auth/bootstrap" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 10
            Write-Step "Created admin user '$($result.user.username)'."
            return
        }
        catch {
            $response = $_.Exception.Response
            if ($response) {
                try {
                    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
                    $responseBody = $reader.ReadToEnd()
                    if (-not [string]::IsNullOrWhiteSpace($responseBody)) {
                        Write-Step "Admin creation failed: $responseBody"
                    }
                    else {
                        Write-Step "Admin creation failed."
                    }
                }
                catch {
                    Write-Step "Admin creation failed."
                }
            }
            else {
                Write-Step "Admin creation failed."
            }

            if (-not (Prompt-YesNo -Label "Try entering the admin account again" -DefaultValue $true)) {
                Write-Step "Skipping admin creation. You can create the first admin from the dashboard later."
                return
            }
        }
    }
}

function Configure-InteractiveEnv {
    $values = Read-EnvFile
    $shouldPrompt = -not (Test-Path (Join-Path (Split-Path -Parent $PSScriptRoot) ".env"))

    $currentMode = $values["OPENCLAW_MODE"]
    if ($currentMode -ne "embedded" -and $currentMode -ne "external") {
        $shouldPrompt = $true
    }

    if ($currentMode -eq "embedded" -and [string]::IsNullOrWhiteSpace($values["OPENCLAW_START_COMMAND"])) {
        $shouldPrompt = $true
    }

    if ($currentMode -eq "external" -and [string]::IsNullOrWhiteSpace($values["OPENCLAW_BASE_URL"])) {
        $shouldPrompt = $true
    }

    if (-not $shouldPrompt) {
        return
    }

    Write-Step "First-run setup: answering a few prompts so you do not need to edit .env by hand."
    Write-Host ""
    Write-Host "You can press Enter to accept the value shown in brackets."
    Write-Host ""

    $port = Prompt-Value -Label "Port to expose the dashboard/API on" -CurrentValue $values["OPENCLAW_PORT"] -DefaultValue "3000" -Required
    Set-EnvValue -Values $values -Key "OPENCLAW_PORT" -Value $port

    $headless = Prompt-Choice -Label "Browser mode" -Choices @("true", "false") -CurrentValue $values["BROWSER_HEADLESS"] -DefaultValue "true" -Descriptions @("Hidden browser inside the container. Best default.", "Visible browser mode if you need to watch what it does.")
    Set-EnvValue -Values $values -Key "BROWSER_HEADLESS" -Value $headless

    $mode = Prompt-Choice -Label "How should OpenClaw run" -Choices @("embedded", "external") -CurrentValue $values["OPENCLAW_MODE"] -DefaultValue "embedded" -Descriptions @("Start OpenClaw from inside this environment. Use this if you want this launcher to manage it.", "Connect to an OpenClaw service that is already running somewhere else.")
    Set-EnvValue -Values $values -Key "OPENCLAW_MODE" -Value $mode

    $healthPath = Prompt-Value -Label "OpenClaw health path" -CurrentValue $values["OPENCLAW_HEALTH_PATH"] -DefaultValue "/health" -Required
    Set-EnvValue -Values $values -Key "OPENCLAW_HEALTH_PATH" -Value $healthPath

    if ($mode -eq "embedded") {
        Write-Host ""
        Write-Host "Embedded mode selected."
        Write-Host "OpenClawWindowsDock will launch OpenClaw for you inside the environment."
        Write-Host "Example start command: npx openclaw serve"

        $baseUrl = Prompt-Value -Label "Embedded OpenClaw base URL" -CurrentValue $values["OPENCLAW_BASE_URL"] -DefaultValue "http://127.0.0.1:8080" -Required
        $startCommand = Prompt-Value -Label "Command to start OpenClaw inside the environment" -CurrentValue $values["OPENCLAW_START_COMMAND"] -DefaultValue "npx openclaw serve" -Required
        $workingDir = Prompt-Value -Label "OpenClaw working directory, or leave blank" -CurrentValue $values["OPENCLAW_WORKING_DIR"] -DefaultValue ""
        $startTimeout = Prompt-Value -Label "Milliseconds to wait for embedded OpenClaw startup" -CurrentValue $values["OPENCLAW_START_TIMEOUT_MS"] -DefaultValue "30000" -Required

        Set-EnvValue -Values $values -Key "OPENCLAW_BASE_URL" -Value $baseUrl
        Set-EnvValue -Values $values -Key "OPENCLAW_START_COMMAND" -Value $startCommand
        Set-EnvValue -Values $values -Key "OPENCLAW_WORKING_DIR" -Value $workingDir
        Set-EnvValue -Values $values -Key "OPENCLAW_START_TIMEOUT_MS" -Value $startTimeout
    }
    else {
        Write-Host ""
        Write-Host "External mode selected."
        Write-Host "OpenClawWindowsDock will not launch OpenClaw. It will connect to the URL you provide."
        Write-Host "If OpenClaw is running on your Windows machine, the default host.docker.internal URL is usually the right starting point."

        $baseUrl = Prompt-Value -Label "External OpenClaw base URL" -CurrentValue $values["OPENCLAW_BASE_URL"] -DefaultValue "http://host.docker.internal:8080" -Required
        Set-EnvValue -Values $values -Key "OPENCLAW_BASE_URL" -Value $baseUrl
        Set-EnvValue -Values $values -Key "OPENCLAW_START_COMMAND" -Value ""
        Set-EnvValue -Values $values -Key "OPENCLAW_WORKING_DIR" -Value ""
        Set-EnvValue -Values $values -Key "OPENCLAW_START_TIMEOUT_MS" -Value (Prompt-Value -Label "Milliseconds to wait for external status checks" -CurrentValue $values["OPENCLAW_START_TIMEOUT_MS"] -DefaultValue "30000" -Required)
    }

    if ([string]::IsNullOrWhiteSpace($values["DEFAULT_TIMEOUT_MS"])) {
        Set-EnvValue -Values $values -Key "DEFAULT_TIMEOUT_MS" -Value "15000"
    }

    if ([string]::IsNullOrWhiteSpace($values["SCHEDULER_TICK_MS"])) {
        Set-EnvValue -Values $values -Key "SCHEDULER_TICK_MS" -Value "15000"
    }

    if ([string]::IsNullOrWhiteSpace($values["AUTH_TOKEN_TTL_HOURS"])) {
        Set-EnvValue -Values $values -Key "AUTH_TOKEN_TTL_HOURS" -Value "12"
    }

    Save-EnvFile -Values $values
    Write-Step "Saved your answers to .env."
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
Configure-InteractiveEnv
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
            Maybe-BootstrapAdmin -Port $port
            Start-Process "http://localhost:$port/dashboard" | Out-Null
            exit 0
        }
    }
    catch {
    }
} while ((Get-Date) -lt $deadline)

throw "Sandbox did not become healthy in time."