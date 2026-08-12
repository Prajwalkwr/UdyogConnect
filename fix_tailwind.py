from pathlib import Path
root = Path('client/src')
replacements = [
    ('rounded-[32px]', 'rounded-4xl'),
    ('rounded-[24px]', 'rounded-3xl'),
    ('rounded-[28px]', 'rounded-[28px]'),
    ('bg-gradient-to-r', 'bg-linear-to-r'),
    ('bg-gradient-to-br', 'bg-linear-to-br'),
    ('flex-shrink-0', 'shrink-0'),
    ('hover:translate-y-[-1px]', 'hover:-translate-y-px'),
    ('max-w-[150px]', 'max-w-37.5'),
    ('max-w-[200px]', 'max-w-50'),
    ('active:scale-[0.99]', 'active:scale-95'),
]
modified = []
for path in root.rglob('*.[j][s][x]'):
    text = path.read_text(encoding='utf-8')
    new_text = text
    for old, new in replacements:
        new_text = new_text.replace(old, new)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        modified.append(str(path))
print('modified', len(modified), 'files')
for p in modified:
    print(p)
