"""
Propagates catalog.json into all HTML pages.
Run this script from the project root, or just double-click it.
"""
import os, re, json, sys

# Resolve the script's own directory so it works from anywhere
BASE = os.path.dirname(os.path.abspath(__file__))
catalog_path = os.path.join(BASE, "data", "catalog.json")

# Read and validate catalog
with open(catalog_path, "rb") as f:
    raw = f.read().rstrip(b'\x00')

text = raw.decode("utf-8").rstrip()
if not text.endswith('}'):
    text = text + '\n}'

try:
    catalog = json.loads(text)
    print(f"Catalog OK: {len(catalog.get('products', []))} products")
except json.JSONDecodeError as e:
    print("JSON ERROR:", e)
    sys.exit(1)

catalog_json = json.dumps(catalog, ensure_ascii=False, indent=2)
script_tag = f'<script id="phicandles-catalog-json" type="application/json">{catalog_json}</script>'

pattern = re.compile(
    r'<script\s+id="phicandles-catalog-json"\s+type="application/json">.*?</script>',
    re.DOTALL
)

updated = 0
skipped = 0

for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules']]
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
        new_content = pattern.sub(script_tag, content)
        if new_content != content:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(new_content)
            updated += 1
            rel = os.path.relpath(fpath, BASE)
            print(f"  Updated: {rel}")

print(f"\nDone! Updated {updated} files, {skipped} skipped (no catalog tag).")
input("Press Enter to close...")
