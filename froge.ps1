param(
  [ValidateSet('menu', 'start', 'stop', 'restart', 'reset', 'status')]
  [string]$Action = 'menu'
)

$ErrorActionPreference = 'SilentlyContinue'
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

$HubPort = 8899
$AgentPort = 8901
$WebPort = 8080

function Get-PortPid([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen | Select-Object -First 1
  if ($conn) { return [int]$conn.OwningProcess }
  return $null
}

function Stop-PortProcess([int]$Port, [string]$Label) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  if ($pids) {
    foreach ($procId in $pids) {
      & cmd.exe /c "taskkill /F /T /PID $procId >nul 2>&1"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      Write-Host "  [stopped] $Label (port $Port, PID $procId)" -ForegroundColor Yellow
    }
  } else {
    Write-Host "  [idle]    $Label (port $Port not running)" -ForegroundColor DarkGray
  }
}

function Stop-AllFroge {
  Write-Host "`nStopping Froge Trainer services..." -ForegroundColor Cyan
  Stop-PortProcess -Port $WebPort -Label "Vite Web UI"
  Stop-PortProcess -Port $AgentPort -Label "Froge Agent"

  # Stop any stray train_worker.py processes
  $workers = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match 'train_worker\.py'
  }
  foreach ($w in $workers) {
    Stop-Process -Id $w.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  [stopped] Python training worker (PID $($w.ProcessId))" -ForegroundColor Yellow
  }
}

function Start-AllFroge {
  Write-Host "`nStarting Froge Trainer..." -ForegroundColor Cyan

  $hubPid = Get-PortPid $HubPort
  if (-not $hubPid) {
    Write-Host "  [warn] Model Hub on port $HubPort is not running. Froge will start, but Hub models will be offline until port $HubPort is up." -ForegroundColor Yellow
  } else {
    Write-Host "  [ok]   Model Hub detected on port $HubPort (PID $hubPid)" -ForegroundColor Green
  }

  if (-not (Get-PortPid $AgentPort)) {
    Start-Process -FilePath "node" -ArgumentList "server/index.mjs" -WorkingDirectory $RootDir -WindowStyle Minimized | Out-Null
    Write-Host "  [started] Froge Agent -> http://127.0.0.1:$AgentPort" -ForegroundColor Green
  } else {
    Write-Host "  [running] Froge Agent already listening on :$AgentPort" -ForegroundColor DarkGreen
  }

  if (-not (Get-PortPid $WebPort)) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev:web" -WorkingDirectory $RootDir -WindowStyle Minimized | Out-Null
    Write-Host "  [started] Froge Web UI -> http://localhost:$WebPort" -ForegroundColor Green
  } else {
    Write-Host "  [running] Froge Web UI already listening on :$WebPort" -ForegroundColor DarkGreen
  }

  Start-Sleep -Seconds 2
  Start-Process "http://localhost:$WebPort" | Out-Null
}

function Invoke-SystemReset {
  Write-Host "`n=== SYSTEM RESET ===" -ForegroundColor Red
  Write-Host "This will stop Froge services and delete all saved runs, logs, adapters, and imported datasets in ./data/." -ForegroundColor Yellow
  $confirm = Read-Host "Type RESET to confirm (or anything else to cancel)"
  if ($confirm -ne 'RESET') {
    Write-Host "Reset cancelled." -ForegroundColor DarkGray
    return
  }

  Stop-AllFroge

  $dataDir = Join-Path $RootDir "data"
  if (Test-Path $dataDir) {
    Remove-Item -Path $dataDir -Recurse -Force
    Write-Host "  [cleared] Removed $dataDir" -ForegroundColor Yellow
  } else {
    Write-Host "  [clean]   No $dataDir directory present" -ForegroundColor DarkGray
  }

  Write-Host "System reset complete. Starting fresh..." -ForegroundColor Green
  Start-AllFroge
}

function Setup-PythonVenv {
  Write-Host "`nSetting up Froge_Trainer\.venv with Python 3.12 + CUDA PyTorch + training packages..." -ForegroundColor Cyan
  $venvDir = Join-Path $RootDir ".venv"
  if (Test-Path $venvDir) {
    Remove-Item -Path $venvDir -Recurse -Force
  }
  $py312 = "C:\Python312\python.exe"
  if (Test-Path $py312) {
    & $py312 -m venv $venvDir
  } elseif (Get-Command py -ErrorAction SilentlyContinue) {
    py -3.12 -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { py -3.11 -m venv $venvDir }
    if ($LASTEXITCODE -ne 0) { python -m venv $venvDir }
  } else {
    python -m venv $venvDir
  }
  $pip = Join-Path $venvDir "Scripts\pip.exe"
  if (-not (Test-Path $pip)) {
    Write-Host "Failed to locate $pip. Ensure Python is on PATH." -ForegroundColor Red
    return
  }
  & $pip install --upgrade pip
  & $pip install --index-url https://download.pytorch.org/whl/cu126 torch
  & $pip install -r (Join-Path $RootDir "server\requirements.txt")
  Write-Host "Python CUDA environment setup finished." -ForegroundColor Green
}

function Run-Checks {
  Write-Host "`nRunning typecheck, lint, and production build..." -ForegroundColor Cyan
  npm run typecheck
  if ($LASTEXITCODE -eq 0) { npm run lint }
  if ($LASTEXITCODE -eq 0) { npm run build }
}

function Show-StatusHeader {
  Clear-Host
  Write-Host "============================================================" -ForegroundColor DarkCyan
  Write-Host "               FROGE TRAINER  //  COMMAND PANEL             " -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkCyan

  $hubPid = Get-PortPid $HubPort
  $agentPid = Get-PortPid $AgentPort
  $webPid = Get-PortPid $WebPort

  $hubText = if ($hubPid) { "ONLINE  (PID $hubPid)" } else { "OFFLINE" }
  $agentText = if ($agentPid) { "RUNNING (PID $agentPid)" } else { "STOPPED" }
  $webText = if ($webPid) { "RUNNING (PID $webPid) -> http://localhost:$WebPort" } else { "STOPPED" }

  Write-Host ("  Model Hub  (:{0}) : " -f $HubPort) -NoNewline
  Write-Host $hubText -ForegroundColor $(if ($hubPid) { 'Green' } else { 'Yellow' })

  Write-Host ("  Froge Agent(:{0}) : " -f $AgentPort) -NoNewline
  Write-Host $agentText -ForegroundColor $(if ($agentPid) { 'Green' } else { 'DarkGray' })

  Write-Host ("  Web UI     (:{0}) : " -f $WebPort) -NoNewline
  Write-Host $webText -ForegroundColor $(if ($webPid) { 'Green' } else { 'DarkGray' })

  $gpuLine = nvidia-smi --query-gpu=name,memory.free,memory.total --format=csv,noheader 2>$null | Select-Object -First 1
  if ($gpuLine) {
    Write-Host "  GPU               : $gpuLine" -ForegroundColor Gray
  }

  $venvPy = Join-Path $RootDir ".venv\Scripts\python.exe"
  $pyLabel = if (Test-Path $venvPy) { ".venv (isolated)" } else { "system python" }
  Write-Host "  Python Target     : $pyLabel" -ForegroundColor Gray
  Write-Host "============================================================" -ForegroundColor DarkCyan
}

switch ($Action) {
  'start' { Start-AllFroge; exit 0 }
  'stop' { Stop-AllFroge; exit 0 }
  'restart' { Stop-AllFroge; Start-Sleep -Seconds 1; Start-AllFroge; exit 0 }
  'reset' { Invoke-SystemReset; exit 0 }
  'status' { Show-StatusHeader; exit 0 }
}

while ($true) {
  Show-StatusHeader
  Write-Host ""
  Write-Host "  [1] Start Everything       (Agent :8901 + Web UI :8080 + Browser)"
  Write-Host "  [2] Stop Froge Services    (Agent + Web UI + Training Workers)"
  Write-Host "  [3] Restart Everything"
  Write-Host "  [4] System Reset           (Stop services & wipe ./data/ state)" -ForegroundColor Yellow
  Write-Host "  [5] Setup Python CUDA Venv (Install CUDA PyTorch + PEFT/TRL)"
  Write-Host "  [6] Run Checks & Build     (typecheck, lint, vite build)"
  Write-Host "  [7] Open Web UI in Browser"
  Write-Host "  [R] Refresh Status"
  Write-Host "  [Q] Quit"
  Write-Host ""

  $choice = (Read-Host "Select command").Trim().ToUpperInvariant()
  switch ($choice) {
    '1' { Start-AllFroge; Read-Host "`nPress Enter to continue" }
    '2' { Stop-AllFroge; Read-Host "`nPress Enter to continue" }
    '3' { Stop-AllFroge; Start-Sleep -Seconds 1; Start-AllFroge; Read-Host "`nPress Enter to continue" }
    '4' { Invoke-SystemReset; Read-Host "`nPress Enter to continue" }
    '5' { Setup-PythonVenv; Read-Host "`nPress Enter to continue" }
    '6' { Run-Checks; Read-Host "`nPress Enter to continue" }
    '7' { Start-Process "http://localhost:$WebPort" | Out-Null }
    'R' { continue }
    'Q' { break }
    default { Write-Host "Invalid selection." -ForegroundColor Red; Start-Sleep -Milliseconds 700 }
  }
  if ($choice -eq 'Q') { break }
}
