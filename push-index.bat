@echo off
title DhakaFlix - Push catalog index
cd /d "%~dp0"
git add lib\catalog-index.json
git commit -m "Update catalog index"
git push
if errorlevel 1 (
  echo.
  echo Push hoyni — hoyto git login kora nei. Tahole lib\catalog-index.json file-ta github.com-e giye repo-te upload koro.
)
pause
