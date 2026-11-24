"""Write the Korean version of each documentation page into the page itself.

Source: i18n/ko/<page>.html — the inside of the Korean <main>, with placeholders
        {{TILES}}, {{PRE}} and {{FIG}}. Each placeholder takes the next image grid,
        diagram or figure from the English <main>, in order, so images and diagrams
        are the same in both languages and are edited in one place only.
Output: <page>.html gets a second <main lang="ko" hidden> between the markers
        <!-- ko:start --> and <!-- ko:end --> (replaced on every run). A page opened
        on its own shows English only; desktop.js shows the Korean <main> in a
        pop-up when KR is selected.

Run from the site root after any change to a page or to i18n/ko/:
        python scripts/i18n-ko.py
"""
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'i18n' / 'ko'
START, END = '<!-- ko:start -->', '<!-- ko:end -->'
PARTS = {
    'TILES': re.compile(r'<div class="tiles[^"]*"[^>]*>.*?</div>', re.S),
    'PRE': re.compile(r'<pre>.*?</pre>', re.S),
    'FIG': re.compile(r'<figure>.*?</figure>', re.S),
}


def main():
    failed = False
    for src in sorted(SRC.glob('*.html')):
        page = ROOT / src.name
        html = io.open(page, encoding='utf-8').read()
        # Remove an earlier Korean block first, so the English <main> is found alone.
        html = re.sub(r'\n*' + re.escape(START) + r'.*?' + re.escape(END), '', html, flags=re.S)
        en = html[html.index('<main'):html.index('</main>')]
        ko = io.open(src, encoding='utf-8').read().rstrip()
        bad = False
        for name, rx in PARTS.items():
            blocks = rx.findall(en)
            need = ko.count('{{%s}}' % name)
            if need != len(blocks):
                print(f'{src.name}: {name} {need} in Korean, {len(blocks)} in English - page not written')
                bad = True
                continue
            for b in blocks:
                ko = ko.replace('{{%s}}' % name, b, 1)
        if bad:
            failed = True
            continue
        block = f'\n\n    {START}\n    <main lang="ko" hidden>\n{ko}\n    </main>\n    {END}'
        cut = html.index('</main>') + len('</main>')
        html = html[:cut] + block + html[cut:]
        io.open(page, 'w', encoding='utf-8', newline='\n').write(html)
        print('wrote', page.name)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
