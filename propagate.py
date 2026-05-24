"""
1. Copies images from subfolders to main products folder.
2. Propagates catalog.json into all HTML pages.
Runs automatically from ОБНОВИТЬ_САЙТ.bat
"""
import os, re, json, sys, shutil

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

with open(catalog_path, "rb") as f:
    raw = f.read().rstrip(b"\x00")

text = raw.decode("utf-8").rstrip()
if not text.endswith("}"):
    text = text + "\n}"

try:
    catalog = json.loads(text)
    print("\n=== Step 2: propagate catalog ===")
    print("Catalog OK: " + str(len(catalog.get("products", []))) + " products")
except json.JSONDecodeError as e:
    print("JSON ERROR: " + str(e))
    sys.exit(1)

catalog_json = json.dumps(catalog, ensure_ascii=False, indent=2)
opening = '<script id="phicandles-catalog-json" type="application/json">'
closing = '</script>'
script_tag = opening + catalog_json + closing

cat_pattern = re.compile(
    r'<script\s+id="phicandles-catalog-json"\s+type="application/json">.*?</script>',
    re.DOTALL,
)

updated = 0
skipped = 0

for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in [".git", "node_modules"]]
    for fname in files:
        if fname != "index.html":
            continue
        fpath = os.path.join(root, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            continue
        if 'id="phicandles-catalog-json"' not in content:
            skipped += 1
            continue
        new_content = cat_pattern.sub(lambda m: script_tag, content)
        if new_content != content:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(new_content)
            updated += 1
            print("  Updated: " + os.path.relpath(fpath, BASE))

print("\nDone! Updated " + str(updated) + " pages, skipped " + str(skipped) + ".")

if "--no-wait" not in sys.argv:
    input("\nPress Enter to close...")
