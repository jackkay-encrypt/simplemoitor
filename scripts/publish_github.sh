#!/bin/bash
set -euo pipefail

REPO_NAME="${1:-simplemoitor}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Missing GITHUB_TOKEN. Usage: GITHUB_TOKEN=xxx bash scripts/publish_github.sh [repo-name]"
  exit 1
fi

python3 - "$PROJECT_DIR" "$REPO_NAME" <<'PY'
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

project_dir = sys.argv[1]
repo_name = sys.argv[2]
token = os.environ['GITHUB_TOKEN']
api = 'https://api.github.com'
headers = {
    'Authorization': 'Bearer {}'.format(token),
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
}

def request(method, path, data=None, ok_codes=(200, 201)):
    body = None
    if data is not None:
        body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(api + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode('utf-8')
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8')
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {'message': raw}
        if exc.code in ok_codes:
            return exc.code, payload
        raise RuntimeError('GitHub API {} {} failed: {}'.format(method, path, payload.get('message', raw)))

_, user = request('GET', '/user')
owner = user['login']
status, repo = request('GET', '/repos/{}/{}'.format(owner, repo_name), ok_codes=(200, 404))
if status == 404:
    _, repo = request('POST', '/user/repos', {
        'name': repo_name,
        'private': False,
        'description': 'Telegram multi-server monitoring bot with agent/controller architecture',
        'auto_init': False,
    })
    print('Created public repository: {}'.format(repo['html_url']))
else:
    print('Repository already exists: {}'.format(repo['html_url']))

remote_url = 'https://github.com/{}/{}.git'.format(owner, repo_name)
remotes = subprocess.check_output(['git', '-C', project_dir, 'remote'], text=True).splitlines()
if 'origin' in remotes:
    subprocess.check_call(['git', '-C', project_dir, 'remote', 'set-url', 'origin', remote_url])
else:
    subprocess.check_call(['git', '-C', project_dir, 'remote', 'add', 'origin', remote_url])

subprocess.check_call([
    'git', '-C', project_dir,
    '-c', 'http.https://github.com/.extraheader=AUTHORIZATION: bearer {}'.format(token),
    'push', '-u', 'origin', 'main'
])
print('Pushed to {}'.format(remote_url))
PY
