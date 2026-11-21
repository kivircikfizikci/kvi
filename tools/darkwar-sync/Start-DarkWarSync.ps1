param([string]$SiteUrl = 'https://kivircikfizikci.github.io/kvi/')
$ErrorActionPreference = 'Stop'
$scriptPath = $MyInvocation.MyCommand.Path
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $scriptPath + '"'),'-SiteUrl',('"' + $SiteUrl + '"'))
  exit
}
$toolDir = Split-Path -Parent $scriptPath
$venv = Join-Path $toolDir '.venv'
$python = Join-Path $venv 'Scripts\python.exe'
try {
  if (-not (Test-Path -LiteralPath $python)) { py -3 -m venv $venv }
  & $python -m pip install --disable-pip-version-check --quiet -r (Join-Path $toolDir 'requirements.txt')
  & $python (Join-Path $toolDir 'darkwar_sync.py') --site-url $SiteUrl
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($_.Exception.Message, 'KVI Dark War Sync') | Out-Null
}
