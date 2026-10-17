#!/usr/bin/env python3
"""Basic staged-file guard. Never print staged content or credential matches."""
from pathlib import PurePosixPath
import re
import subprocess
import sys

def git(*args):
    return subprocess.run(['git', *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout

def main():
    names = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split(b'\0')
    blocked = []
    for raw in names:
        if not raw:
            continue
        name = raw.decode('utf-8', errors='surrogateescape')
        p = PurePosixPath(name)
        sensitive = any(x == '.env' or (x.startswith('.env.') and not x.endswith(('.example', '.sample', '.template'))) for x in p.parts)
        sensitive |= p.suffix.lower() in {'.pem', '.key', '.p12', '.pfx'} or p.name in {'id_rsa', 'id_ed25519', '.npmrc', '.netrc'}
        sensitive |= p.name.lower() in {'credentials.json', 'service-account.json', 'config.php', 'backend-path.php', 'secrets.env', '.dev.vars'}
        if sensitive:
            blocked.append((name, 'credential or environment file'))
            continue
        size = int(git('cat-file', '-s', ':'+name))
        if size > 2_000_000:
            blocked.append((name, 'over 2 MB; manual review required'))
            continue
        content = git('show', ':'+name)
        patterns = [rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', rb'sb_secret_[A-Za-z0-9_-]{10,}', rb'sk_(?:live|test)_[A-Za-z0-9]{10,}', rb'AKIA[0-9A-Z]{16}', rb'xox[baprs]-[A-Za-z0-9-]{10,}', rb'gh[pousr]_[A-Za-z0-9]{30,}']
        if any(re.search(pattern, content) for pattern in patterns):
            blocked.append((name, 'possible secret signature'))
    if blocked:
        for name, reason in blocked:
            print('FAIL: '+ascii(name)+' ('+reason+')', file=sys.stderr)
        return 1
    print('PASS: basic staged-file guard. This is not a complete secret or security audit.')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (subprocess.CalledProcessError, OSError, ValueError):
        print('BLOCKED: staged-file inspection failed; commit guard did not pass.', file=sys.stderr)
        sys.exit(1)
