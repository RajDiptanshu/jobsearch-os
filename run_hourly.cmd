@echo off
rem JobSearchOS hourly pipeline — invoked by Windows Task Scheduler.
rem Uses absolute node path so it works regardless of the scheduler's PATH.
cd /d "C:\Users\tansh\JoBSearchOS\jobsearch-os"
if not exist data\logs mkdir data\logs
echo.>> data\logs\pipeline.log
echo ===== %date% %time% =====>> data\logs\pipeline.log
"C:\Program Files\nodejs\node.exe" pipeline\run.js >> data\logs\pipeline.log 2>&1
rem publish the fresh results to the Vercel web app (best-effort — never blocks the scan)
call "C:\Users\tansh\JoBSearchOS\jobsearch-web\sync-vercel.cmd" >> data\logs\vercel-sync.log 2>&1
