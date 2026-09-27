#!/usr/bin/env python3
"""src/ から index.html を組み立てる（ブックマークレットの埋め込みも更新）"""
import json, re, urllib.parse
from pathlib import Path
root = Path(__file__).parent
src = root / 'src'
# ブックマークレット：コメント行を除いて1行にし、URLエンコード
lines = []
for l in (src / 'bookmarklet.js').read_text(encoding='utf-8').split('\n'):
    s = l.strip()
    if not s or s.startswith('//'):
        continue
    lines.append(re.sub(r"\s//\s[^'\"`]*$", '', s))
bm = 'javascript:' + urllib.parse.quote(' '.join(lines), safe='')
tpl = (src / 'app_template.html').read_text(encoding='utf-8')
tpl = re.sub(r'const BOOKMARKLET = "[^"]*";', lambda m: 'const BOOKMARKLET = ' + json.dumps(bm) + ';', tpl, count=1)
parser = re.sub(r"\nif \(typeof module.*\n?", "\n", (src / 'parser.js').read_text(encoding='utf-8'))
(root / 'index.html').write_text(tpl.replace('/*PARSER*/', parser), encoding='utf-8')
print('index.html を作成しました')
