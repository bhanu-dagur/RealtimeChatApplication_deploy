# =============================================================================
# ConnectHub — one-shot launcher for the full backend stack.
#
# USAGE:
#   .\start-all.ps1            # build (if needed) + start all services
#   .\start-all.ps1 -NoBuild   # skip the dotnet build pass; start instantly
#   .\start-all.ps1 -Stop      # kill everything we started
#
# Each service runs in its OWN PowerShell window so logs stay visible per-service
# and you can Ctrl+C any one of them without taking down the others. Closing all
# windows (or running with -Stop) cleans up.
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Stop,
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot   # this script lives in the solution root

# Ordered service list. Auth/Message/Room/Notification own data and need to be
# up before the Gateway accepts traffic; Hub.API only needs Redis (or runs
# single-node); Media.API is independent. The Gateway goes LAST so its
# YARP health checks find live upstreams immediately.
$services = @(
    @{ Name = 'Auth.API'; Project = 'ConnectHub.Auth.API'; Port = 5001 },
    @{ Name = 'Message.API'; Project = 'ConnectHub.Message.API'; Port = 5002 },
    @{ Name = 'Room.API'; Project = 'ConnectHub.Room.API'; Port = 5003 },
    @{ Name = 'Hub.API'; Project = 'ConnectHub.Hub.API'; Port = 5004 },
    @{ Name = 'Notification.API'; Project = 'ConnectHub.Notification.API'; Port = 5005 },
    @{ Name = 'Media.API'; Project = 'ConnectHub.Media.API'; Port = 5006 },
    @{ Name = 'Gateway'; Project = 'ConnectHub.Gateway'; Port = 5000 }
)

# ── Stop mode ────────────────────────────────────────────────────────────────
# Kills every ConnectHub.*.exe process. Idempotent — missing processes are fine.
function Stop-AllServices {
    $names = @(
        'ConnectHub.Auth.API',
        'ConnectHub.Message.API',
        'ConnectHub.Room.API',
        'ConnectHub.Hub.API',
        'ConnectHub.Notification.API',
        'ConnectHub.Media.API',
        'ConnectHub.Gateway'
    )
    $stopped = 0
    foreach ($n in $names) {
        $procs = Get-Process -Name $n -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; $stopped++ } catch { }
        }
    }
    Write-Host "Stopped $stopped ConnectHub process(es)." -ForegroundColor Yellow
}

if ($Stop) { Stop-AllServices; return }

# ── Pre-flight: clean slate ─────────────────────────────────────────────────
# If a previous run left services running, the new build will fail with file
# locks. Kill first, then build.
Stop-AllServices
Start-Sleep -Seconds 2

# ── Build once for all projects ─────────────────────────────────────────────
# `dotnet run` per-project would build each one serially and burn ~20s/service.
# Building the solution once and starting with --no-build is dramatically faster.
if (-not $NoBuild) {
    Write-Host "Building solution..." -ForegroundColor Cyan
    Push-Location $root
    try {
        & dotnet build ConnectHub.sln --nologo -v quiet
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Build failed — aborting." -ForegroundColor Red
            return
        }
    }
    finally { Pop-Location }
}

# ── Spawn each service in its own window ────────────────────────────────────
$running = @()
foreach ($svc in $services) {
    if ($svc.Name -eq 'Gateway') {
        $proj = Join-Path $root "$($svc.Project)\$($svc.Project).csproj"
    } else {
        $proj = Join-Path $root "Services\$($svc.Project)\$($svc.Project).csproj"
    }

    if (-not (Test-Path $proj)) {
        Write-Host "  SKIP $($svc.Name) — project not found at $proj" -ForegroundColor DarkYellow
        continue
    }

    # Title makes the taskbar / Alt-Tab readable at a glance.
    $title = "ConnectHub :: $($svc.Name)"
    # -NoExit keeps the window open after the service exits so you can read the
    # last log lines on a crash. Remove if you prefer windows to auto-close.
    $args = @(
        '-NoExit',
        '-Command',
        "& { `$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$root'; dotnet run --project '$proj' --no-build }"
    )
    Start-Process pwsh -ArgumentList $args
    $running += $svc
}

Write-Host "Waiting for ports to open..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(45)

foreach ($svc in $running) {
    while ((Get-Date) -lt $deadline) {
        $listening = Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue
        if ($listening) { break }
        Start-Sleep -Milliseconds 500
    }
    $ok = [bool](Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue)
    $status = if ($ok) { 'READY ' } else { 'TIMED OUT' }
    $color = if ($ok) { 'Green' } else { 'Red' }
    Write-Host ("  [{0}] {1,-18} :: http://localhost:{2}" -f $status, $svc.Name, $svc.Port) -ForegroundColor $color
}

Write-Host "`nStack is up. Frontend Gateway: http://localhost:5000" -ForegroundColor Cyan
Write-Host "Stop everything later with: .\start-all.ps1 -Stop" -ForegroundColor DarkGray
