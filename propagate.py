"""
1. Copies images from subfolders to main products folder.
2. Propagates catalog.json into all HTML pages.
Runs automatically from ОБНОВИТЬ_САЙТ.bat
"""
import os, json, sys, shutil

BASE = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_IMG = os.path.join(BASE, "assets", "img", "products")

# Step 1: copy images from subfolders
copies = [
    ("Aroma home/Aromalamp-simpl.jpg",   "aromalamp-simpl.jpg"),
    ("Aroma home/Aromalamp-simpl-1.jpg", "aromalamp-simpl-1.jpg"),
    ("Aroma home/Aromalamp-simpl-2.jpg", "aromalamp-simpl-2.jpg"),
    ("Aroma home/sashe.jpg",             "sashe.jpg"),
    ("Aroma home/sashe-1.jpg",           "sashe-1.jpg"),
    ("Aroma home/sashe-2.jpg",           "sashe-2.jpg"),
    ("Home decor/minimalizm.jpg",        "minimalizm-set.jpg"),
    ("Home decor/minimalizm-2.jpg",      "minimalizm-set-2.jpg"),
    ("Home decor/minimalizm-3.jpg",      "minimalizm-set-3.jpg"),
    ("Home decor/candlehold-tall.jpg",   "candlehold-tall.jpg"),
    ("Home decor/candlehold-tall-1.png", "candlehold-tall-1.png"),
    ("Home decor/candlehold-midi.jpg",   "candlehold-midi.jpg"),
    ("Home decor/candlehold-midi-1.jpg", "candlehold-midi-1.jpg"),
    ("Home decor/candlehold-midi-2.jpg", "candlehold-midi-2.jpg"),
    ("Home decor/candlehold-mini.jpg",   "candlehold-mini.jpg"),
    ("Home decor/candlehold-mini-1.jpg", "candlehold-mini-1.jpg"),
    ("Home decor/candlehold-mini-2.jpg", "candlehold-mini-2.jpg"),
    ("Home decor/podnos-big.jpg",        "podnos-big.jpg"),
    ("Home decor/podnos-big-1.jpg",      "podnos-big-1.jpg"),
    ("Home decor/podstavka-eggs.jpg",    "podstavka-eggs.jpg"),
    ("Home decor/podstavka-eggs-1.jpg",  "podstavka-eggs-1.jpg"),
    ("Limited edition/rose-buket.jpg",   "rose-buket.jpg"),
    ("Seasons/paskhalnyy-krolik.jpg",    "paskhalnyy-krolik.jpg"),
    ("Seasons/paskhalnyy-krolik-1.jpg",  "paskhalnyy-krolik-1.jpg"),
    ("Seasons/paskhalnyy-krolik-2.jpg",  "paskhalnyy-krolik-2.jpg"),
    ("Seasons/paskhalnyy-krolik-3.jpg",  "paskhalnyy-krolik-3.jpg"),
    ("Seasons/paskhalnyy-krolik-4.jpg",  "paskhalnyy-krolik-4.jpg"),
    ("Seasons/paskhalnyy-krolik-5.jpg",  "paskhalnyy-krolik-5.jpg"),
    ("Home decor/bubble.jpg",            "bubble.jpg"),
    ("Home decor/bubble-1.jpg",          "bubble-1.jpg"),
    ("Home decor/bubble-2.jpg",          "bubble-2.jpg"),
    ("Gifts/melts.jpg",                  "gift-melts.jpg"),
    ("Gifts/melts-1.jpg",                "gift-melts-1.jpg"),
    ("Gifts/melts-2.jpg",                "gift-melts-2.jpg"),
]

print("=== Step 1: copy images ===")
for src_rel, dst_name in copies:
    src = os.path.join(PRODUCTS_IMG, src_rel)
    dst = os.path.join(PRODUCTS_IMG, dst_name)
    if not os.path.exists(src):
        print("  NOT FOUND: " + src_rel)
        continue
    shutil.copy2(src, dst)
    print("  Copied: " + dst_name)

# Step 2: propagate catalog.json
catalog_path = os.path.join(BASE, "data", "catalog.json")

with open(catalog_path, "r", encoding="utf-8") as f:
    catalog_json = f.read()

try:
    catalog_obj = json.loads(catalog_json)
    print("\n=== Step 2: propagate catalog ===")
    print("Catalog OK: " + str(len(catalog_obj.get("products", []))) + " products")
except json.JSONDecodeError as e:
    print("JSON ERROR: " + str(e))
    sys.exit(1)

OPEN_TAG = '<script id="phicandles-catalog-json" type="application/json">'
CLOSE_TAG = '</script>'

updated = 0
repaired = 0
skipped = 0
errors = 0


def safe_write(fpath, content):
    """Записывает файл атомарно через временный файл, гарантируя полный сброс на диск."""
    tmp = fpath + ".tmp"
    encoded = content.encode("utf-8")
    with open(tmp, "wb") as f:
        f.write(encoded)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, fpath)


for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in [".git", "node_modules"]]
    for fname in files:
        if fname != "index.html":
            continue
        fpath = os.path.join(root, fname)
        content = None
        try:
            with open(fpath, "rb") as f:
                raw = f.read()
            content = raw.decode("utf-8")
        except UnicodeDecodeError:
            print("  TRUNCATED (UTF-8 broken): " + os.path.relpath(fpath, BASE))
            errors += 1
            continue
        except Exception:
            continue

        if 'id="phicandles-catalog-json"' not in content:
            skipped += 1
            continue

        idx_open = content.find(OPEN_TAG)
        if idx_open == -1:
            skipped += 1
            continue
        idx_content_start = idx_open + len(OPEN_TAG)
        idx_close = content.find(CLOSE_TAG, idx_content_start)

        if idx_close == -1:
            # Файл повреждён: нет закрывающего </script>.
            # Восстанавливаем через </body>.
            idx_body = content.find("</body>", idx_content_start)
            if idx_body == -1:
                print("  CRITICAL (cannot fix): " + os.path.relpath(fpath, BASE))
                skipped += 1
                continue
            print("  REPAIRED: " + os.path.relpath(fpath, BASE))
            new_content = content[:idx_content_start] + catalog_json + CLOSE_TAG + "\n" + content[idx_body:]
            repaired += 1
        else:
            new_content = content[:idx_content_start] + catalog_json + content[idx_close:]

        if new_content == content:
            skipped += 1
            continue

        # Атомарная запись с гарантией сброса буфера
        safe_write(fpath, new_content)

        # Верификация: читаем байты и проверяем корректность UTF-8
        try:
            with open(fpath, "rb") as f:
                verify_raw = f.read()
            verify = verify_raw.decode("utf-8")
        except UnicodeDecodeError:
            print("  ERROR: file truncated after write: " + os.path.relpath(fpath, BASE))
            errors += 1
            continue

        if not verify.rstrip().endswith("</html>"):
            print("  WARNING: missing </html>: " + os.path.relpath(fpath, BASE))

        updated += 1

suffix = ""
if repaired:
    suffix += ", repaired " + str(repaired)
if errors:
    suffix += ", ERRORS " + str(errors)
print("\nDone! Updated " + str(updated) + " pages" + suffix + ", skipped " + str(skipped) + ".")

if "--no-wait" not in sys.argv:
    input("\nPress Enter to close...")
