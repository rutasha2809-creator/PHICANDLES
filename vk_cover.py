"""
Создаёт обложку для ВК из фото без обрезки.
Поместите фото рядом с этим файлом и укажите его имя ниже.
"""

from PIL import Image, ImageFilter
import os

# ——— НАСТРОЙКИ ———
INPUT_FILE  = 'cover_source.jpg'   # <-- укажите имя вашего файла
OUTPUT_FILE = 'vk_cover_1590x530.jpg'
CANVAS_W, CANVAS_H = 1590, 530    # размер обложки ВК
# —————————————————

script_dir = os.path.dirname(os.path.abspath(__file__))
src_path   = os.path.join(script_dir, INPUT_FILE)
out_path   = os.path.join(script_dir, OUTPUT_FILE)

img = Image.open(src_path).convert('RGB')
orig_w, orig_h = img.size

# Масштабируем фото по высоте холста
scale  = CANVAS_H / orig_h
new_w  = int(orig_w * scale)
new_h  = CANVAS_H
img_resized = img.resize((new_w, new_h), Image.LANCZOS)

# Создаём фон: размытая и растянутая версия фото
bg = img.resize((CANVAS_W, CANVAS_H), Image.LANCZOS)
bg = bg.filter(ImageFilter.GaussianBlur(radius=30))

# Накладываем фото по центру
x_offset = (CANVAS_W - new_w) // 2
bg.paste(img_resized, (x_offset, 0))

bg.save(out_path, quality=95)
print(f'Готово! Сохранено: {out_path}')
print(f'Размер: {CANVAS_W}x{CANVAS_H} px')
