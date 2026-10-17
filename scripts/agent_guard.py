#!/usr/bin/env python3
"""GEE OS agent guard: a Claude Code PreToolUse hook.

Reads the hook JSON from stdin and answers with a permission decision:
- deny: reading or writing secret files (.env, keys, real config.php)
- ask:  destructive or remote-changing commands (force push, DROP, db push, deploy)
- silent pass for everything else.

It never prints file contents or secret values. It is a seatbelt, not a security audit.
Wire it in .claude/settings.json (project) or hooks/hooks.json (plugin).
"""
import json
import re
import sys
from pathlib import PurePath

SAFE_SUFFIXES = ('.example', '.sample', '.template', '.dist')
SECRET_NAMES = {'id_rsa', 'id_ed25519', 'id_ecdsa', '.npmrc', '.netrc', '.pgpass',
                'credentials.json', 'service-account.json', 'config.php', 'backend-path.php',
                'secrets.env', '.dev.vars'}
SECRET_EXTENSIONS = {'.pem', '.key', '.p12', '.pfx', '.jks'}

# A .env file token inside a shell command: .env, .env.local, app/.env.production
ENV_TOKEN = re.compile(r'(?:^|[\s/\'"=<>(])\.env(?:\.[A-Za-z0-9_-]+)?(?=$|[\s\'";|&)<>])')

ASK_COMMANDS = [
    (r'\bgit\s+push\b[^|;&]*\s(--force(?!-with-lease)|-f\b)', 'force push rewrites shared history'),
    (r'\bgit\s+reset\s+--hard\b', 'git reset --hard discards local work'),
    (r'\bgit\s+clean\s+-[a-zA-Z]*f', 'git clean deletes untracked files'),
    (r'\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)', 'discards all local changes'),
    (r'\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]+\s+)*(/|~|\$HOME|\*|\.)(\s|/?$)', 'recursive delete of a broad path'),
    (r'\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE?)\b', 'destructive SQL'),
    (r'\bDELETE\s+FROM\s+\w+\s*(;|$)', 'DELETE without WHERE'),
    (r'\bsupabase\s+(db\s+(push|reset)|migration\s+repair|functions\s+deploy|secrets\s+set)\b', 'changes a Supabase project'),
    (r'\b(bin/)?migrate\.php\b.*\b(apply|--apply)\b', 'applies database migrations'),
    (r'\brollback\.sh\b.*--go\b', 'live rollback'),
    (r'\b(gh\s+(repo\s+(delete|edit)|secret\s+set|workflow\s+run|release\s+create|pr\s+merge))\b', 'changes GitHub state'),
    (r'\b(wrangler\s+(deploy|publish|secret)|vercel\s+--prod|netlify\s+deploy\s+--prod)\b', 'production deploy'),
    (r'\b(rsync|scp|sftp)\b.*@', 'copies files to a remote server'),
    (r'\bcurl\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b', 'pipes a download into a shell'),
    (r'\bchmod\s+(-R\s+)?777\b', 'world-writable permissions'),
    (r'\bnpm\s+publish\b', 'publishes a package'),
]


def secret_path(raw):
    if not raw or not isinstance(raw, str):
        return False
    lower = PurePath(raw).name.lower()
    if lower.endswith(SAFE_SUFFIXES):
        return False
    if lower == '.env' or lower.startswith('.env.'):
        return True
    if lower in SECRET_NAMES:
        return True
    return PurePath(lower).suffix in SECRET_EXTENSIONS


def env_in_command(command):
    for match in ENV_TOKEN.finditer(command):
        token = match.group(0).lstrip(' \t/\'"=<>(')
        if not token.lower().endswith(SAFE_SUFFIXES):
            return True
    return False


def decide(event):
    tool = event.get('tool_name', '')
    data = event.get('tool_input') or {}
    if tool in ('Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Grep', 'Glob'):
        for key in ('file_path', 'notebook_path', 'path'):
            if secret_path(data.get(key)):
                return 'deny', 'GEE OS guard: secret file. Ask the owner to handle credentials; use .env.example for names only.'
        return None, None
    if tool == 'Bash':
        command = data.get('command') or ''
        if env_in_command(command) or re.search(r'\b(cat|less|more|head|tail|bat|cp|scp)\b[^|;&]*\b(id_rsa|id_ed25519|config\.php)\b', command):
            return 'deny', 'GEE OS guard: command touches a secret file. Ask the owner instead.'
        for pattern, why in ASK_COMMANDS:
            if re.search(pattern, command, re.IGNORECASE):
                return 'ask', 'GEE OS guard: ' + why + '. Confirm target, rollback and approval first.'
    return None, None


def main():
    try:
        event = json.load(sys.stdin)
    except (ValueError, OSError):
        print('GEE OS guard: unreadable hook input; not checked.', file=sys.stderr)
        return 0
    decision, reason = decide(event if isinstance(event, dict) else {})
    if decision:
        print(json.dumps({'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': decision,
            'permissionDecisionReason': reason,
        }}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
