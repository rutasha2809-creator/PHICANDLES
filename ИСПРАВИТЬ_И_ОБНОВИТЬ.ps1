Set-Location "C:\Users\rutas\OneDrive\Изображения\Свечи Мася\GitHUB PHICANDLES\PHICANDLES Claude"

Write-Host "=== Step 1: Remove all lock files ===" -ForegroundColor Cyan
Get-ChildItem ".git" -Filter "*.lock*" -Recurse | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "Removed: $($_.Name)"
}

Write-Host ""
Write-Host "=== Step 2: Stage all changes ===" -ForegroundColor Cyan
git add -A
Write-Host "Staged."
git status --short

Write-Host ""
Write-Host "=== Step 3: Commit ===" -ForegroundColor Cyan
$result = git commit -m "Set price 1180 for shalfei (dark glass); fix truncated catalog.json and product page"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Committed OK" -ForegroundColor Green
} else {
    Write-Host "Nothing new to commit (existing commits will be pushed)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 4: Push to GitHub ===" -ForegroundColor Cyan
git push origin HEAD:main
if ($LASTEXITCODE -eq 0) {
    Write-Host "PUSHED OK! Wait 2 min, then Ctrl+Shift+R on the site." -ForegroundColor Green
} else {
    Write-Host "ERROR pushing. Check internet/GitHub credentials." -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"
