@echo off
title DhakaFlix - Build catalog index
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js pawa jayni! https://nodejs.org theke LTS version install kore abar chalan.
  pause
  exit /b 1
)
node scripts/build-index.mjs
echo.
echo Hoye gele push-index.bat chalao (GitHub-e uthbe, Vercel nije theke update hobe).
echo Naile lib\catalog-index.json file-ta github.com-e giye repo-te upload koro.
pause
