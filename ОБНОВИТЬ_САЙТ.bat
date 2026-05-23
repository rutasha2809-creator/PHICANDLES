@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo === Step 0a: Convert all product pages to accordion layout ===
python convert_accordion.py --no-wait
if %errorlevel% neq 0 ( echo WARNING: convert_accordion.py finished with errors, continuing... )
echo Done

echo.
echo === Step 0b: Propagate catalog to all pages ===
python propagate.py --no-wait
if %errorlevel% neq 0 ( echo WARNING: propagate.py finished with errors, continuing... )
echo Done

echo.
echo === Step 1: Remove git lock files ===
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo Done: index.lock removed
) else (
    echo OK: no index.lock found
)
if exist ".git\HEAD.lock" (
    del /f ".git\HEAD.lock"
    echo Done: HEAD.lock removed
) else (
    echo OK: no HEAD.lock found
)

echo.
echo === Step 2: Stage all changes ===
git add -A
echo Done
git status --short

echo.
echo === Step 3: Commit ===
git commit -m "Update site"
if %errorlevel% neq 0 ( echo Nothing new to commit, pushing existing commits... )

echo.
echo === Step 4: Push to GitHub ===
git push origin HEAD:main
if %errorlevel% neq 0 ( echo ERROR at push - check internet/GitHub credentials && pause && exit /b 1 )

echo.
echo === DONE! Wait 2 min then press Ctrl+Shift+R on the site ===
pause
