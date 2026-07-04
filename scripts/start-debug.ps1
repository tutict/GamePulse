param(
  [ValidateSet("web", "desktop")]
  [string]$Mode = "web",
  [switch]$SkipInstall,
  [switch]$SkipDocker,
  [switch]$SkipMigrate,
  [string]$WebUrl = "http://127.0.0.1:5173",
  [string]$ApiUrl = "http://127.0.0.1:4317/api/health"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Set-DefaultEnv {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, "Process"))) {
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
  }
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "Timed out waiting for $Url"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "GamePulse debug launcher" -ForegroundColor Green
Write-Host "Repository: $repoRoot"
Write-Host "Mode: $Mode"

if (-not (Test-Command "npm.cmd")) {
  throw "npm.cmd not found. Install Node.js 22+ and retry."
}

if (-not $SkipDocker) {
  if (-not (Test-Command "docker")) {
    throw "docker not found. Install Docker Desktop or rerun with -SkipDocker if Postgres/Redis are already running."
  }

  Write-Step "Starting Postgres and Redis"
  docker compose up -d postgres redis
}

if (-not $SkipInstall -and -not (Test-Path "node_modules")) {
  Write-Step "Installing npm dependencies"
  npm.cmd install
}

Set-DefaultEnv -Name "DATABASE_URL" -Value "postgres://gamepulse:gamepulse@localhost:5432/gamepulse"
Set-DefaultEnv -Name "REDIS_URL" -Value "redis://localhost:6379"
Set-DefaultEnv -Name "MODEL_PROVIDER" -Value "heuristic"

if (-not $SkipMigrate) {
  Write-Step "Running database migrations"
  npm.cmd run db:migrate
}

if ($Mode -eq "desktop") {
  Write-Step "Launching Electron desktop app"
  Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "Set-Location '$repoRoot'; npm.cmd run desktop:dev"
  )
  exit 0
}

Write-Step "Launching API, Worker, and Web dashboard"
$devCommand = @"
`$env:DATABASE_URL = 'postgres://gamepulse:gamepulse@localhost:5432/gamepulse'
`$env:REDIS_URL = 'redis://localhost:6379'
`$env:MODEL_PROVIDER = 'heuristic'
`$env:CORS_ORIGIN = 'http://127.0.0.1:5173'
`$env:VITE_API_BASE = 'http://127.0.0.1:4317'
Set-Location '$repoRoot'
npm.cmd run dev
"@

Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  $devCommand
)

Write-Step "Waiting for local services"
Wait-HttpOk -Url $ApiUrl -TimeoutSeconds 90
Wait-HttpOk -Url $WebUrl -TimeoutSeconds 90

Write-Step "Opening debug page"
Start-Process $WebUrl

Write-Host ""
Write-Host "GamePulse is ready: $WebUrl" -ForegroundColor Green
Write-Host "Close the spawned PowerShell window to stop API/Worker/Web dev servers."
