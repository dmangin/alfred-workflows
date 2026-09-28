#!/usr/bin/env python3
"""Recopie les workflows installés dans Alfred (info.plist, icon.png, icônes
d'objets <UID>.png) vers workflows/<nom>/ pour git.

Sens unique : Alfred est la source des info.plist. Un workflow du repo est
relié à son dossier Alfred par son bundleid, com.dmangin.<nom>.
"""
import pathlib
import plistlib
import re
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
PREFS = subprocess.run(
    ['defaults', 'read', 'com.runningwithcrayons.Alfred-Preferences', 'syncfolder'],
    capture_output=True, text=True, check=True,
).stdout.strip()
UID_PNG = re.compile(r'^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\.png$')
ALFRED = pathlib.Path(PREFS).expanduser() / 'Alfred.alfredpreferences' / 'workflows'


def installed():
    by_bundle = {}
    for plist in ALFRED.glob('*/info.plist'):
        with plist.open('rb') as f:
            bundle = plistlib.load(f).get('bundleid', '')
        by_bundle[bundle] = plist.parent
    return by_bundle


def main():
    found = installed()
    missing = []
    for wf in sorted(p for p in (REPO / 'workflows').iterdir() if p.is_dir()):
        src = found.get('com.dmangin.' + wf.name)
        if not src:
            missing.append(wf.name)
            continue
        with (src / 'info.plist').open('rb') as f:
            data = plistlib.load(f)
        # L'ordre des objets est sans effet pour Alfred, qui le change à chaque
        # sauvegarde : le trier évite des diffs git sans contenu.
        data['objects'].sort(key=lambda o: o['uid'])
        with (wf / 'info.plist').open('wb') as f:
            plistlib.dump(data, f, sort_keys=True)
        for png in src.glob('*.png'):
            if png.name == 'icon.png' or UID_PNG.match(png.name):
                shutil.copy2(png, wf / png.name)
        print(f'{wf.name:16} <- {src.name}')
    if missing:
        print('non installés dans Alfred : ' + ', '.join(missing), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
