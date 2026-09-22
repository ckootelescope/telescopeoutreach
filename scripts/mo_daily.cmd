@echo off
REM Daily market-outreach job. Registered with Windows Task Scheduler so it runs
REM whether or not a Claude session is open: this used to be "Claude runs the
REM scripts by hand", which meant nothing went out for three days when nobody
REM was driving.
REM
REM Order matters. mo_sync first so a reply or booking stops a cadence BEFORE
REM anything is sent to that person. mo_nudge second because it is quick. mo_send
REM last because it runs for hours, and the Gmail mutex in mo_lock.js means
REM whichever holds the lock makes the others wait rather than fight for quota.

setlocal
cd /d "%~dp0.."

set LOGDIR=%~dp0..\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set DT=%%a
set STAMP=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%
set LOG=%LOGDIR%\mo_daily_%STAMP%.log

echo ==== market outreach daily run %DATE% %TIME% ==== >> "%LOG%"

echo --- mo_sync --- >> "%LOG%"
node scripts\mo_sync.js --apply >> "%LOG%" 2>&1

echo --- mo_nudge --- >> "%LOG%"
node scripts\mo_nudge.js pathwork --all --apply >> "%LOG%" 2>&1

echo --- mo_send --- >> "%LOG%"
node scripts\mo_send.js --apply >> "%LOG%" 2>&1

echo ==== finished %DATE% %TIME% ==== >> "%LOG%"
endlocal
