@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================
echo   Создание обложки для ВК 1280x720
echo ===================================
echo.
echo Убедитесь что фото сохранено в эту папку
echo под именем: cover_source.jpg
echo.
pause

python -c "
from PIL import Image, ImageFilter
import os

src = os.path.join(os.path.dirname(os.path.abspath('.')), 'cover_source.jpg')
src = 'cover_source.jpg'

if not os.path.exists(src):
    print('ОШИБКА: файл cover_source.jpg не найден в папке!')
    input('Нажмите Enter...')
    exit()

img = Image.open(src).convert('RGB')
W, H = 1280, 720

scale = H / img.height
new_w = int(img.width * scale)
img_resized = img.resize((new_w, H), Image.LANCZOS)

bg = img.resize((W, H), Image.LANCZOS)
bg = bg.filter(ImageFilter.GaussianBlur(radius=25))

x = (W - new_w) // 2
bg.paste(img_resized, (x, 0))

bg.save('vk_oblozhka_1280x720.jpg', quality=95)
print('Готово! Файл: vk_oblozhka_1280x720.jpg')
input('Нажмите Enter для закрытия...')
"
