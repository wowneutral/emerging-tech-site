#!/usr/bin/env python3
"""Recompute the CSP sha256 hashes for the site's inline <script> blocks.

Run this after editing ANY inline script, paste the output into the
Content-Security-Policy line in .htaccess. An edited inline block whose hash
was not updated is silently blocked by the browser — the page still loads, the
script just never runs, which is a genuinely annoying thing to debug.
"""
import re, glob, hashlib, base64, os

os.chdir(os.path.join(os.path.dirname(__file__), '..'))
found = {}
for f in sorted(glob.glob('*.html')):
    src = open(f, encoding='utf-8').read()
    for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.S):
        h = 'sha256-' + base64.b64encode(
            hashlib.sha256(m.group(1).encode()).digest()).decode()
        found.setdefault(h, []).append(f)

for h, files in found.items():
    print(f"'{h}'  <- {', '.join(files)}")
print()
print("script-src 'self' https://unpkg.com " + ' '.join(f"'{h}'" for h in found))
