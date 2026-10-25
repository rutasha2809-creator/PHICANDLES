"""Сжатие фотографий сайта (идемпотентно): быстрее загрузка страниц, внешний вид прежний.

Запускается из tools/seo_static.py (шаг 0c в ОБНОВИТЬ_САЙТ.bat), после propagate.py.
- Обрабатываются только файлы, на которые реально ссылаются страницы, стили, скрипты и catalog.json
  (исходные папки с оригиналами фото, вроде assets/img/products/osobie povodi/, не трогаются).
- JPEG: сторона не больше 1400 px, качество 82, прогрессивная развёртка. Заменяется, только если файл
  стал меньше хотя бы на 10 %.
- PNG без прозрачности (фото товаров): рядом создаётся .jpg, и в catalog.json на него ссылаются вместо .png.
- tools/images.json хранит контрольные суммы уже сжатых файлов, поэтому повторный запуск ничего не пересжимает.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'tools' / 'images.json'
MAX_SIDE_JPG = 1400
MAX_SIDE_PNG = 1200
MIN_BYTES = 150 * 1024
SKIP = re.compile(r'(icon-\d+|favicon|logo|wordmark|placeholder)', re.I)
REF = re.compile(r'assets/img/[^"\\\s)\'<>]+\.(?:jpe?g|png)', re.I)


def sha(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()


def referenced_images() -> list[Path]:
    seen: set[str] = set()
    files = [ROOT / 'data' / 'catalog.json']
    for pattern in ('*.html', '*/*.html', '*/*/*.html', '*/*/*/*.html'):
        files += [f for f in ROOT.glob(pattern) if not f.relative_to(ROOT).parts[0] in ('tools', '_admin', '.git')]
    files += list((ROOT / 'assets' / 'css').glob('*.css')) + list((ROOT / 'assets' / 'js').glob('*.js'))
    for f in files:
        try:
            text = f.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        if f.suffix == '.html':
            text = re.sub(r'<script id="phicandles-catalog-json".*?</script>', '', text, flags=re.S)
        seen.update(m.replace('\\/', '/') for m in REF.findall(text))
    return sorted(p for p in (ROOT / s for s in seen) if p.exists() and not SKIP.search(p.name))


def optimize_jpeg(path: Path) -> bool:
    before = path.stat().st_size
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert('RGB')
        im.thumbnail((MAX_SIDE_JPG, MAX_SIDE_JPG), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=82, optimize=True, progressive=True)
    if len(buf.getvalue()) < before * 0.9:
        path.write_bytes(buf.getvalue())
        return True
    return False


def png_to_jpg(path: Path) -> Path | None:
    with Image.open(path) as im:
        if 'A' in im.getbands() and im.getchannel('A').getextrema()[0] < 250:
            return None   # настоящая прозрачность: оставляем PNG
        im = im.convert('RGB')
        im.thumbnail((MAX_SIDE_PNG, MAX_SIDE_PNG), Image.LANCZOS)
        out = path.with_suffix('.jpg')
        im.save(out, 'JPEG', quality=85, optimize=True, progressive=True)
    return out


THUMB_RE = re.compile(r'^assets/img/products/([^/]+)\.jpe?g$', re.I)
THUMB_BOX = (640, 853)


def thumb_rel(rel: str) -> str:
    """Лёгкая копия фото для карточек (около 640 px). Создаётся при необходимости; если не вышло, вернёт исходный путь."""
    rel = rel.removeprefix('./').lstrip('/')
    m = THUMB_RE.match(rel)
    src = ROOT / rel
    if not m or not src.exists():
        return rel
    out_rel = f'assets/img/products/thumbs/{m.group(1)}.jpg'
    out = ROOT / out_rel
    try:
        if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
            out.parent.mkdir(exist_ok=True)
            with Image.open(src) as im:
                im = ImageOps.exif_transpose(im).convert('RGB')
                im.thumbnail(THUMB_BOX, Image.LANCZOS)
                im.save(out, 'JPEG', quality=78, optimize=True, progressive=True)
        return out_rel
    except Exception:
        return rel


def main() -> None:
    state = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    saved = done = 0
    for path in referenced_images():
        rel = path.relative_to(ROOT).as_posix()
        size = path.stat().st_size
        current = sha(path)
        if state.get(rel) == current:
            continue
        if path.suffix.lower() == '.png':
            if size > MIN_BYTES:
                out = png_to_jpg(path)
                if out:
                    saved += size - out.stat().st_size
                    done += 1
        else:
            with Image.open(path) as im:
                big = max(im.size) > MAX_SIDE_JPG
            if size > MIN_BYTES or big:
                if optimize_jpeg(path):
                    saved += size - path.stat().st_size
                    done += 1
        state[rel] = sha(path)
    for path in referenced_images():
        thumb_rel(path.relative_to(ROOT).as_posix())
    MANIFEST.write_text(json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    print(f'Фото: обработано {done}, сэкономлено {saved / 1e6:.1f} МБ')


if __name__ == '__main__':
    main()
