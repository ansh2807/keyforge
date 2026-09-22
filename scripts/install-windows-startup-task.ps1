param([string]$TaskName = "Keyforge Production")

$ErrorActionPreference = "Stop"
$startScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "start-production.ps1"))
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType S4U -RunLevel Highest
try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Write-Output "Installed and started boot task: $TaskName"
} catch [Microsoft.Management.Infrastructure.CimException] {
  $startupDirectory = [Environment]::GetFolderPath("Startup")
  $shortcutPath = Join-Path $startupDirectory "$TaskName.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "powershell.exe"
  $shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Start Keyforge production after Windows sign-in"
  $shortcut.Save()
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`"" -WorkingDirectory $projectRoot -WindowStyle Hidden
  Write-Output "Administrator rights were unavailable. Installed and started per-user sign-in startup: $shortcutPath"
}
