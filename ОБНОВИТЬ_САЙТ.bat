@echo off
cd /d "C:\Users\rutas\OneDrive\Изображения\Свечи Мася\GitHUB PHICANDLES\PHICANDLES Claude"

echo === Step 1: Remove index.lock ===
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo Done: lock removed
) else (
    echo OK: no lock found
)

echo.
echo === Step 2: Stage all changes ===
git add -A
echo Done
git status --short

echo.
echo === Step 3: Commit ===
git commit -m "Fix truncated pages: kub, bubl, izyashnye-linii-k restored"
if %errorlevel% neq 0 ( echo ERROR at commit && pause && exit /b 1 )

echo.
echo === Step 4: Push to GitHub ===
git push origin HEAD:main
if %errorlevel% neq 0 ( echo ERROR at push && pause && exit /b 1 )

echo.
echo === DONE! Wait 2 min then press Ctrl+Shift+R on the site ===
pause
