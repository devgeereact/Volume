#!/usr/bin/env python3
"""GEE OS verify: checks the project contract and guards. Not a test of the app itself.

Run from anywhere: python3 scripts/verify.py
Exit 0 = contract complete (open markers may remain, reported as PARTIAL). Exit 1 = FAIL.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
CORE = ['AGENTS.md', 'CLAUDE.md', '.agent/PROJECT.yml', '.agent/CURRENT-TASK.md',
        '.claude/settings.json', '.githooks/pre-commit', 'scripts/agent_guard.py', 'scripts/guard.py']
PACK_DOCS = ['docs/BRIEF.md', 'docs/ARCHITECTURE.md', 'docs/SCHEMA.md', 'docs/DESIGN.md',
             'docs/DEPLOYMENT.md', 'docs/HOOKS.md', 'docs/VERIFICATION.md']
FORGE_DOCS = ['docs/01-product/PRODUCT-SPEC.md', 'docs/05-security/SECURITY.md']
MEMORY = ['PROJECT-MEMORY.md', 'docs/00-foundation/PROJECT-MEMORY.md']  # new builds, older GEE OS projects
MARKER = re.compile(r'(^|[\s|])OPEN:|\{\{FILL:')
SKIP = {'node_modules', 'vendor', '.git', 'dist'}

memory = next((m for m in MEMORY if (root / m).is_file()), None)
required = CORE + (FORGE_DOCS if memory else PACK_DOCS)
missing = [n for n in required if not (root / n).is_file() or (root / n).stat().st_size == 0]
problems = []

try:
    settings = json.loads((root / '.claude/settings.json').read_text(encoding='utf-8'))
    if 'agent_guard.py' not in json.dumps(settings.get('hooks', {})):
        problems.append('.claude/settings.json does not run agent_guard.py')
except (OSError, ValueError):
    problems.append('.claude/settings.json is missing or not valid JSON')

try:
    hooks_path = subprocess.run(['git', '-C', str(root), 'config', '--get', 'core.hooksPath'],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True).stdout.strip()
except OSError:
    hooks_path = ''

open_markers = 0
for path in root.rglob('*.md'):
    if SKIP.intersection(path.parts) or path.name in {'WORKFLOW.md', 'RESTRUCTURE.md'}:
        continue
    try:
        open_markers += sum(1 for line in path.read_text(encoding='utf-8').splitlines() if MARKER.search(line))
    except (OSError, UnicodeError):
        continue

for name in missing:
    print('FAIL: missing or empty: ' + name)
for problem in problems:
    print('FAIL: ' + problem)
if hooks_path == '.githooks':
    print('PASS: git hook enabled')
else:
    print('NOT TESTED: git hook not enabled (run: git config core.hooksPath .githooks)')
print(('PASS' if open_markers == 0 else 'PARTIAL') + f': open doc markers: {open_markers}')
if missing or problems:
    sys.exit(1)
print('PASS: GEE OS contract and guards present. App behaviour and deploy: NOT TESTED by this script.')
