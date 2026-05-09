[CmdletBinding()]
param(
    [switch]$Stop,
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

# Find .env file in parent directories
$envPath = Join-Path (Split-Path (Split-Path $root -Parent) -Parent) ".env"
if (-not (Test-Path $envPath)) {
    # Fallback to 1 directory up if the structure changes
    $envPath = Join-Path (Split-Path $root -Parent) ".env"
}

if (Test-Path $envPath) {
    Write-Host "Loading environment variables from $envPath" -ForegroundColor Cyan
    foreach ($line in Get-Content $envPath) {
        $line = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
        if ($line -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim()
            if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
            [Environment]::SetEnvironmentVariable($key, $val, 'Process')
        }
    }
}
else {
    Write-Host "Warning: .env file not found at $envPath" -ForegroundColor DarkYellow
}

$services = @(
    @{ Name = 'Auth.API'; Project = 'ConnectHub.Auth.API'; Port = 5001 },
    @{ Name = 'Message.API'; Project = 'ConnectHub.Message.API'; Port = 5002 },
    @{ Name = 'Room.API'; Project = 'ConnectHub.Room.API'; Port = 5003 },
    @{ Name = 'Hub.API'; Project = 'ConnectHub.Hub.API'; Port = 5004 },
    @{ Name = 'Notification.API'; Project = 'ConnectHub.Notification.API'; Port = 5005 },
    @{ Name = 'Media.API'; Project = 'ConnectHub.Media.API'; Port = 5006 },
    @{ Name = 'Gateway'; Project = 'ConnectHub.Gateway'; Port = 5000 }
)

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

Stop-AllServices
Start-Sleep -Seconds 2

if (-not $NoBuild) {
    Write-Host "Building solution..." -ForegroundColor Cyan
    Push-Location $root
    & dotnet build ConnectHub.sln --nologo -v quiet
    $exitCode = $LASTEXITCODE
    Pop-Location
    
    if ($exitCode -ne 0) {
        Write-Host "Build failed. Aborting." -ForegroundColor Red
        return
    }
}

$running = @()
foreach ($svc in $services) {
    if ($svc.Name -eq 'Gateway') {
        $proj = Join-Path $root "$($svc.Project)\$($svc.Project).csproj"
    }
    else {
        $proj = Join-Path $root "Services\$($svc.Project)\$($svc.Project).csproj"
    }

    if (-not (Test-Path $proj)) {
        Write-Host "  SKIP $($svc.Name) - project not found at $proj" -ForegroundColor DarkYellow
        continue
    }

    $projDir = Split-Path $proj -Parent
    $batPath = Join-Path ([System.IO.Path]::GetTempPath()) "ConnectHub_$($svc.Name).bat"
    
    $batContent = "@echo off`r`ntitle ConnectHub :: $($svc.Name)`r`ncd /d `"$projDir`"`r`ndotnet run --no-build`r`necho.`r`necho Service exited or crashed. Press any key to close this window.`r`npause >nul"
    Set-Content -Path $batPath -Value $batContent -Encoding ASCII

    Start-Process "cmd.exe" -ArgumentList "/c `"$batPath`""
    $running += $svc
}

Write-Host "Waiting for ports to open (up to 90 seconds)..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(90)

foreach ($svc in $running) {
    while ((Get-Date) -lt $deadline) {
        $listening = Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue
        if ($listening) { break }
        Start-Sleep -Milliseconds 500
    }
    $ok = [bool](Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue)
    if ($ok) {
        Write-Host ("  [READY ] {0,-18} :: http://localhost:{1}" -f $svc.Name, $svc.Port) -ForegroundColor Green
    }
    else {
        Write-Host ("  [TIMED OUT] {0,-18} :: http://localhost:{1}" -f $svc.Name, $svc.Port) -ForegroundColor Red
    }
}

Write-Host "`nStack is up. Frontend Gateway: http://localhost:5000" -ForegroundColor Cyan
Write-Host "Stop everything later with: .\start-all.ps1 -Stop" -ForegroundColor DarkGray
