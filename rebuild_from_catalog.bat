@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>&1 && (
  python tools\rebuild_from_catalog.py
  goto :done
)
where py >nul 2>&1 && (
  py -3 tools\rebuild_from_catalog.py
  goto :done
)

echo Python not found. Install from https://www.python.org/ or add python.exe to PATH.
exit /b 1

:done
echo.
pause
