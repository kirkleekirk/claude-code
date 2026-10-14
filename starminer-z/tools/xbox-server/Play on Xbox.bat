@echo off
rem StarMiner Z: play your copy on an Xbox (or anything else on your Wi-Fi). Keep this file
rem next to play-on-xbox.ps1 and starminer-z.html, and double-click it.
if not exist "%~dp0play-on-xbox.ps1" (
  echo Can't find play-on-xbox.ps1 next to this file. If you opened it from inside the zip,
  echo extract everything first ^(right-click the zip, Extract All^) and run it from there.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0play-on-xbox.ps1"
pause
