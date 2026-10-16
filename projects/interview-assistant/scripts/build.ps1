param([string]$DotNetPath = 'dotnet')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& $DotNetPath build (Join-Path $projectRoot 'src\InterviewAssistant.csproj') -c Release --nologo -m:1 -p:UseSharedCompilation=false -p:RestoreLockedMode=true
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
