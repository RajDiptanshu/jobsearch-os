param([string]$DotNetPath = 'dotnet', [switch]$Audio)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$testArgs = @()
if ($Audio) { $testArgs += '--audio' }
& $DotNetPath run --project (Join-Path $projectRoot 'tests\InterviewAssistant.Tests.csproj') -c Release -p:UseSharedCompilation=false -p:RestoreLockedMode=true -- @testArgs
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
