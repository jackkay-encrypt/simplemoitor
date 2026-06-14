#!/usr/bin/env python3
# coding: utf-8

import argparse
import os
import re
import tempfile
import time

TIMESTAMP_RE = re.compile(r'^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]')


def parse_line_ts(line):
    match = TIMESTAMP_RE.match(line)
    if not match:
        return None
    try:
        return int(time.mktime(time.strptime(match.group(1), '%Y-%m-%d %H:%M:%S')))
    except Exception:
        return None


def cleanup_log(path, cutoff, dry_run=False):
    if not os.path.exists(path):
        return {'path': path, 'exists': False, 'before': 0, 'after': 0, 'changed': False}

    before = os.path.getsize(path)
    if before == 0:
        return {'path': path, 'exists': True, 'before': 0, 'after': 0, 'changed': False}

    kept = []
    current_block_keep = os.path.getmtime(path) >= cutoff
    saw_timestamp = False

    with open(path, 'r', encoding='utf-8', errors='replace') as fp:
        for line in fp:
            line_ts = parse_line_ts(line)
            if line_ts is not None:
                saw_timestamp = True
                current_block_keep = line_ts >= cutoff
            if current_block_keep:
                kept.append(line)

    if not saw_timestamp:
        if os.path.getmtime(path) < cutoff:
            kept = []
        else:
            return {'path': path, 'exists': True, 'before': before, 'after': before, 'changed': False}

    new_content = ''.join(kept)
    after = len(new_content.encode('utf-8'))
    changed = after != before

    if changed and not dry_run:
        folder = os.path.dirname(path) or '.'
        fd, tmp_path = tempfile.mkstemp(prefix='.{}.'.format(os.path.basename(path)), suffix='.tmp', dir=folder)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as fp:
                fp.write(new_content)
            os.replace(tmp_path, path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    return {'path': path, 'exists': True, 'before': before, 'after': after, 'changed': changed}


def main():
    parser = argparse.ArgumentParser(description='保留最近指定小时数的 simplemoitor 本地日志')
    parser.add_argument('--runtime-dir', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'runtime'))
    parser.add_argument('--hours', type=int, default=24)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    cutoff = int(time.time()) - max(int(args.hours), 1) * 3600
    log_files = [
        os.path.join(args.runtime_dir, 'agent.log'),
        os.path.join(args.runtime_dir, 'controller.log'),
        os.path.join(args.runtime_dir, 'log_cleanup.log')
    ]
    for log_path in log_files:
        result = cleanup_log(log_path, cutoff, dry_run=args.dry_run)
        if result.get('exists'):
            print('{path}: {before} -> {after}{suffix}'.format(
                path=result['path'],
                before=result['before'],
                after=result['after'],
                suffix=' (dry-run)' if args.dry_run else ''
            ))


if __name__ == '__main__':
    main()
