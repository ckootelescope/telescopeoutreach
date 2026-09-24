@echo off
REM Daily company-outreach reconcile. The half of /process-followups that needs
REM no judgement and no MCP, so it can run unattended.
REM
REM Drafting stays with Calvin: creating a Superhuman draft needs an MCP tool,
REM which only exists inside a Claude session. This runner only closes the seam
REM between "Calvin pressed send in Superhuman" and "the database knows it".
REM
REM Replaces scripts\run_scheduler.js, which the TelescopeFollowupScheduler task
REM still pointed at after commit 4b3c304 deleted it on 2026-07-13. The task has
REM been exiting 1 every morning since.

setlocal
cd /d "%~dp0.."

set LOGDIR=%~dp0..\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set DT=%%a
set STAMP=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%
set LOG=%LOGDIR%\company_daily_%STAMP%.log

echo ==== company outreach reconcile %DATE% %TIME% ==== >> "%LOG%"

REM mark_sent first: a step has to be known sent before a reply to it can stop
REM the cadence, otherwise sync_replies has no thread to match against.
echo --- mark_sent --- >> "%LOG%"
node scripts\mark_sent.js --apply >> "%LOG%" 2>&1

echo --- sync_replies --- >> "%LOG%"
node scripts\sync_replies.js --apply >> "%LOG%" 2>&1

echo ==== finished %DATE% %TIME% ==== >> "%LOG%"
endlocal
