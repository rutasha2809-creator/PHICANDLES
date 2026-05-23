"""
Converts all product page layouts to the accordion (Variant B) style.
- Description / Specs / Care / Manufacturing time → collapsible accordion
- Options (aroma, color, variant, finish) → below accordion
- Price → directly above CTA button
Run once: python convert_accordion.py
Already-converted pages (contain 'phi-accordion') are skipped automatically.
"""
import os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_DIR = os.path.join(BASE, "products")

# ── Shared HTML blocks ────────────────────────────────────────────────────────

ACCORDION_STYLE = """        <style>
          .phi-accordion { margin-top: 24px; border-top: 1px solid #e8e0d8; }
          .phi-accordion__item { border-bottom: 1px solid #e8e0d8; }
          .phi-accordion__toggle {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            padding: 14px 0;
            background: none;
            border: none;
            cursor: pointer;
            font-family: inherit;
            font-size: 0.95rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            color: inherit;
            text-align: left;
            text-transform: uppercase;
          }
          .phi-accordion__toggle:hover { opacity: 0.7; }
          .phi-accordion__icon {
            font-size: 1.3rem;
            font-weight: 300;
            line-height: 1;
            transition: transform 0.25s ease;
            flex-shrink: 0;
            margin-left: 12px;
          }
          .phi-accordion__toggle[aria-expanded="true"] .phi-accordion__icon { transform: rotate(45deg); }
          .phi-accordion__body {
            padding-bottom: 16px;
            font-size: 0.9rem;
            line-height: 1.7;
            color: inherit;
          }
          .phi-accordion__body[hidden] { display: none; }
          .phi-accordion__body .spec-grid { margin-top: 8px; }
          .phi-accordion__body .materials-list { margin-top: 8px; }
          .phi-accordion__body p + p { margin-top: 8px; }
          .phi-accordion__body .muted { font-style: italic; opacity: 0.6; }
        </style>"""

ACCORDION_JS = """        <script>
          (function () {
            document.querySelectorAll('.phi-accordion__toggle').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var expanded = this.getAttribute('aria-expanded') === 'true';
                var bodyId = this.getAttribute('aria-controls');
                var body = document.getElementById(bodyId);
                if (expanded) {
                  this.setAttribute('aria-expanded', 'false');
                  body.hidden = true;
                } else {
                  this.setAttribute('aria-expanded', 'true');
                  body.hidden = false;
                }
              });
            });
          })();
        </script>"""

PRICE_HERO = """        <div class="product-price-hero">
          <div class="product-price-hero__amount" data-product-price></div>
          <div class="product-price-hero__meta">
            <strong class="product-price-hero__stock" data-product-stock></strong>
          </div>
        </div>"""

CTA_ROW = """        <div class="product-cta-row">
          <button class="button button--cta-primary" type="button" data-add-product>Добавить в корзину</button>
          <a class="button-secondary button-secondary--cart" href="../../cart/index.html">Перейти в корзину</a>
        </div>"""

TRUST_STRIP = """        <div class="trust-strip" aria-label="Условия заказа">
          <div class="trust-strip__item"><strong>Надёжная упаковка</strong><span>Бережно готовим к отправке</span></div>
          <div class="trust-strip__item"><strong>Доставка по России</strong><span>Удобные способы получения</span></div>
          <div class="trust-strip__item"><strong>Для подарка</strong><span>Эстетичный презентабельный вид</span></div>
          <div class="trust-strip__item"><strong>Ручная работа</strong><span>Внимание к деталям</span></div>
        </div>"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_div_end(html, start_pos):
    """Return the index just after the closing </div> matching the <div> at start_pos."""
    pos = html.find('>', start_pos) + 1  # skip past opening tag
    depth = 1
    while depth > 0 and pos < len(html):
        next_open  = html.find('<div', pos)
        next_close = html.find('</div>', pos)
        if next_close == -1:
            break
        if next_open != -1 and next_open < next_close:
            depth += 1
            pos = next_open + 4
        else:
            depth -= 1
            pos = next_close + 6
    return pos


def extract_story_section(inner, title):
    """Return the <p> text content of a product-story-inline section by title, or None."""
    pattern = (
        r'<div class="product-story-inline"[^>]*>\s*'
        r'<h2[^>]*>' + re.escape(title) + r'</h2>\s*'
        r'<p[^>]*>(.*?)</p>\s*</div>'
    )
    m = re.search(pattern, inner, re.DOTALL)
    return m.group(1).strip() if m else None


def extract_about_title(inner):
    m = re.search(r'<h2 class="product-story-inline__title">(.*?)</h2>', inner)
    return m.group(1).strip() if m else 'О свече'


def extract_option_fields(inner):
    """Extract raw HTML of all option-field divs (between story sections and specs section)."""
    start_m = re.search(r'<div class="option-field"', inner)
    end_m   = re.search(r'<div class="product-specs-section"', inner)
    if not start_m:
        return ''
    end_pos = end_m.start() if end_m else len(inner)
    return inner[start_m.start():end_pos].rstrip()


# ── Main converter ────────────────────────────────────────────────────────────

def convert_page(fpath):
    with open(fpath, 'r', encoding='utf-8') as f:
        html = f.read()

    # Skip already-converted pages
    if 'phi-accordion' in html:
        return 'skip'

    # Find product-content div
    MARKER = '<div class="product-content product-panel">'
    content_start = html.find(MARKER)
    if content_start == -1:
        return 'no-marker'

    content_end = extract_div_end(html, content_start)
    inner = html[content_start + len(MARKER): content_end - len('</div>')]

    # ── Extract pieces ────────────────────────────────────────────────────────
    about_title   = extract_about_title(inner)
    care_text     = extract_story_section(inner, 'Рекомендации по уходу')
    manuf_text    = extract_story_section(inner, 'Срок изготовления')
    option_fields = extract_option_fields(inner)

    # ── Build accordion items ─────────────────────────────────────────────────
    items = []

    # 1. About
    items.append(
        f'          <div class="phi-accordion__item">\n'
        f'            <button class="phi-accordion__toggle" aria-expanded="false" aria-controls="acc-about">\n'
        f'              {about_title} <span class="phi-accordion__icon">+</span>\n'
        f'            </button>\n'
        f'            <div class="phi-accordion__body" id="acc-about" hidden>\n'
        f'              <p class="product-story-inline__text" data-product-short></p>\n'
        f'              <p class="muted">Настроение, аромат и идея — всё, что важно знать перед заказом.</p>\n'
        f'              <p class="product-story-inline__text" data-product-description></p>\n'
        f'            </div>\n'
        f'          </div>'
    )

    # 2. Specs
    items.append(
        '          <div class="phi-accordion__item">\n'
        '            <button class="phi-accordion__toggle" aria-expanded="false" aria-controls="acc-specs">\n'
        '              Характеристики <span class="phi-accordion__icon">+</span>\n'
        '            </button>\n'
        '            <div class="phi-accordion__body" id="acc-specs" hidden>\n'
        '              <div class="spec-grid" data-product-specs></div>\n'
        '              <ul class="materials-list" data-product-materials></ul>\n'
        '            </div>\n'
        '          </div>'
    )

    # 3. Care (if present)
    if care_text:
        items.append(
            f'          <div class="phi-accordion__item">\n'
            f'            <button class="phi-accordion__toggle" aria-expanded="false" aria-controls="acc-care">\n'
            f'              Рекомендации по уходу <span class="phi-accordion__icon">+</span>\n'
            f'            </button>\n'
            f'            <div class="phi-accordion__body" id="acc-care" hidden>\n'
            f'              <p>{care_text}</p>\n'
            f'            </div>\n'
            f'          </div>'
        )

    # 4. Manufacturing time (if present)
    if manuf_text:
        items.append(
            f'          <div class="phi-accordion__item">\n'
            f'            <button class="phi-accordion__toggle" aria-expanded="false" aria-controls="acc-time">\n'
            f'              Срок изготовления <span class="phi-accordion__icon">+</span>\n'
            f'            </button>\n'
            f'            <div class="phi-accordion__body" id="acc-time" hidden>\n'
            f'              <p>{manuf_text}</p>\n'
            f'            </div>\n'
            f'          </div>'
        )

    accordion_html = '\n'.join(items)

    # ── Assemble new product-content ──────────────────────────────────────────
    new_block = (
        '<div class="product-content product-panel">\n'
        + ACCORDION_STYLE + '\n\n'
        + '        <div class="product-collection-badge">'
          '<span class="badge badge--collection" data-product-collection-badge></span></div>\n'
        + '        <h1 class="product-title product-title--page" data-product-name></h1>\n\n'
        + '        <div class="phi-accordion">\n'
        + accordion_html + '\n'
        + '        </div>\n\n'
        + ('        ' + option_fields.lstrip() + '\n' if option_fields else '')
        + PRICE_HERO + '\n'
        + CTA_ROW + '\n'
        + TRUST_STRIP + '\n\n'
        + ACCORDION_JS + '\n'
        + '      </div>'
    )

    new_html = html[:content_start] + new_block + html[content_end:]

    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(new_html)

    return 'ok'


# ── Run ───────────────────────────────────────────────────────────────────────

def main():
    converted = 0
    skipped   = 0
    errors    = 0

    for slug in sorted(os.listdir(PRODUCTS_DIR)):
        fpath = os.path.join(PRODUCTS_DIR, slug, 'index.html')
        if not os.path.isfile(fpath):
            continue
        try:
            result = convert_page(fpath)
        except Exception as e:
            errors += 1
            print(f'  ERROR (exception): {slug} — {e}')
            continue
        if result == 'ok':
            converted += 1
            print(f'  Converted: {slug}')
        elif result == 'skip':
            skipped += 1
            print(f'  Skipped (already done): {slug}')
        else:
            errors += 1
            print(f'  ERROR ({result}): {slug}')

    print(f'\nDone! Converted {converted}, skipped {skipped}, errors {errors}.')

    if '--no-wait' not in sys.argv:
        input('\nPress Enter to close...')


if __name__ == '__main__':
    main()
