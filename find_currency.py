import os, re

for root, dirs, files in os.walk('client/src'):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.js'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            for i, line in enumerate(lines):
                matches = re.finditer(r'\$(?!\{)(?!\s+(cd|npm))', line)
                for m in matches:
                    print(f'{path}:{i+1}: {line.strip()}')
