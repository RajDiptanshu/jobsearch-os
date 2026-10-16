param([string]$DotNetPath = 'dotnet', [string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot 'publish\win-x64' }
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
& $DotNetPath publish (Join-Path $projectRoot 'src\InterviewAssistant.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -p:UseSharedCompilation=false -p:RestoreLockedMode=true -o $OutputPath --nologo
if ($LASTEXITCODE -ne 0) { throw 'Publish failed.' }
Copy-Item -LiteralPath (Join-Path $projectRoot 'samples') -Destination $OutputPath -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination $OutputPath -Force
Write-Output "Portable application: $OutputPath\InterviewAssistant.exe"
