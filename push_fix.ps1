Set-Location "C:\Users\rutas\OneDrive\Изображения\Свечи Мася\GitHUB PHICANDLES\PHICANDLES Claude"

Write-Host "=== Удаляю index.lock ===" -ForegroundColor Cyan
$lock = ".git\index.lock"
if (Test-Path $lock) {
    Remove-Item $lock -Force
    Write-Host "index.lock удалён" -ForegroundColor Green
} else {
    Write-Host "index.lock не найден (это нормально)" -ForegroundColor Yellow
}

Write-Host "`n=== Сброс HEAD на последний задеплоенный коммит ===" -ForegroundColor Cyan
git reset --mixed 215c1baf3fb286a7fdd5e39c8176ac7455acb31c
Write-Host "Готово" -ForegroundColor Green

Write-Host "`n=== Добавляю все изменённые файлы ===" -ForegroundColor Cyan
git add -A
git status --short | Select-Object -First 20

Write-Host "`n=== Создаю коммит ===" -ForegroundColor Cyan
git commit -m "Грани свечения L/M/S: описание, размеры, плашки, цвета, shortDescription"

Write-Host "`n=== Отправляю на GitHub ===" -ForegroundColor Cyan
git push

Write-Host "`n=== Готово! ===" -ForegroundColor Green
Write-Host "Подожди 1-2 минуты и обнови страницы на сайте (Ctrl+Shift+R)" -ForegroundColor Yellow
Read-Host "Нажми Enter для закрытия"
