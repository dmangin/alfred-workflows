#!/usr/bin/env python3
"""Génère les icônes des workflows à partir de glyphes SVG et des icônes des
applications installées (Wavebox, NotePlan, retrouvées via Spotlight), sans rien
télécharger.

  tools/icons.py preview <dossier>   écrit les PNG dans <dossier> pour relecture
  tools/icons.py install             écrit les PNG dans les dossiers Alfred
                                     (puis `make pull` pour les recopier ici)

Icône de workflow = icon.png ; icône propre à un objet = <UID>.png.
"""
import base64, pathlib, plistlib, subprocess, sys, tempfile

SLACK = '''
<path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9z" fill="#E01E5A"/>
<path d="M32.3 77.6c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A"/>
<path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2z" fill="#36C5F0"/>
<path d="M45.2 32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36C5F0"/>
<path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2z" fill="#2EB67D"/>
<path d="M90.5 45.2c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2EB67D"/>
<path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9z" fill="#ECB22E"/>
<path d="M77.6 90.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ECB22E"/>
'''
GLYPHS = {
    'slack': ('0 0 123 123', SLACK),
    'gmail': ('52 42 88 66', '''
<path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/>
<path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/>
<path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/>
<path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/>
<path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"/>'''),
    'whatsapp': ('8 6 86 86', '''
<path fill="#25D366" d="M50 10a38 38 0 1 1-19.4 70.7L12 88l7.3-18A38 38 0 0 1 50 10z"/>
<path fill="#fff" d="M36 30c2-2 5-2 6 0l4 7c1 2 0 4-1 5l-2 2c2 5 6 9 11 11l2-2c1-1 3-2 5-1l7 4c2 1 2 4 0 6l-3 3c-3 3-8 3-13 0-8-4-15-11-19-19-3-5-3-10 0-13z"/>'''),
    'calendar': ('0 0 100 100', '''
<rect x="4" y="4" width="92" height="92" rx="16" fill="#fff" stroke="#DADCE0" stroke-width="3"/>
<path d="M4 20a16 16 0 0 1 16-16h60a16 16 0 0 1 16 16v10H4z" fill="#4285F4"/>
<text x="50" y="80" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial" font-weight="700" font-size="46" fill="#1A73E8">31</text>'''),
    'paste': ('0 0 512 512', '''
<rect x="92" y="62" width="328" height="424" rx="40" fill="#8D6E63"/>
<rect x="124" y="118" width="264" height="336" rx="18" fill="#fff"/>
<rect x="180" y="34" width="152" height="84" rx="24" fill="#90A4AE"/>
<circle cx="256" cy="66" r="14" fill="#8D6E63"/>
<g transform="translate(256 232) rotate(-45)" fill="none">
  <rect x="-122" y="-32" width="140" height="64" rx="32" stroke="#1E88E5" stroke-width="22"/>
  <rect x="-18" y="-32" width="140" height="64" rx="32" fill="#fff" stroke="#fff" stroke-width="40"/>
  <rect x="-18" y="-32" width="140" height="64" rx="32" stroke="#1E88E5" stroke-width="22"/>
</g>
<rect x="160" y="352" width="192" height="52" rx="14" fill="#E3F2FD"/>
<text x="256" y="389" text-anchor="middle" font-family="Menlo, monospace" font-weight="700" font-size="30" fill="#1565C0">2026-09-30</text>'''),
}

SHADOW = '''<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
<feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.28"/></filter></defs>'''


def app_icns(app_name):
    """Icône d'une application installée, quel que soit son emplacement :
    recherche Spotlight, puis CFBundleIconFile."""
    found = subprocess.run(['mdfind', "kMDItemContentType == 'com.apple.application-bundle'"
                            f" && kMDItemFSName == '{app_name}.app'"],
                           capture_output=True, text=True, check=True).stdout.split('\n')
    app = next((pathlib.Path(p) for p in found if p), None)
    if not app:
        sys.exit(f'Application introuvable : {app_name}')
    icon = plistlib.load(open(app / 'Contents' / 'Info.plist', 'rb'))['CFBundleIconFile']
    return app / 'Contents' / 'Resources' / (icon if icon.endswith('.icns') else icon + '.icns')


def app_png(icns, name, tmp):
    out = pathlib.Path(tmp) / (name + '.iconset')
    subprocess.run(['iconutil', '-c', 'iconset', icns, '-o', out], check=True)
    best = max(out.glob('*.png'), key=lambda p: p.stat().st_size)
    return 'data:image/png;base64,' + base64.b64encode(best.read_bytes()).decode()


def glyph(name, x, y, size):
    vb, body = GLYPHS[name]
    return f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="{vb}">{body}</svg>'


def image(href, x, y, size):
    return f'<image x="{x}" y="{y}" width="{size}" height="{size}" href="{href}"/>'


def tile(name, x, y, size):
    """Glyphe sur une tuile blanche ombrée, au format des icônes d'apps."""
    pad = size * 0.2
    return (f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{size * 0.22}" fill="#fff" filter="url(#sh)"/>'
            + glyph(name, x + pad, y + pad, size - 2 * pad))


def svg(*parts):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
            + SHADOW + ''.join(parts) + '</svg>')


def designs(wavebox, noteplan):
    return {
        # workflow Follow : Slack + Wavebox -> NotePlan
        'follow': svg(glyph('slack', 26, 22, 176), image(wavebox, 4, 226, 222), image(noteplan, 186, 170, 326)),
        # keyword fs : Slack -> NotePlan (dessin d'origine)
        'fs': svg(glyph('slack', 20, 20, 234), image(noteplan, 182, 182, 330)),
        # keyword fe : Wavebox -> NotePlan
        'fe': svg(image(wavebox, 0, 0, 290), image(noteplan, 182, 182, 330)),
        'paste': svg(glyph('paste', 0, 0, 512)),
        # Wavebox Tabs : Wavebox + les services qu'il fait passer au premier plan
        'tabs': svg(image(wavebox, 76, -6, 360),
                    tile('gmail', 14, 392, 90), tile('slack', 114, 392, 90), tile('whatsapp', 214, 392, 90),
                    tile('calendar', 314, 392, 90), image(noteplan, 400, 377, 120)),
    }


# (bundleid, fichiers) pour chaque dessin ; <UID>.png = icône d'un objet
TARGETS = {
    'follow': ('com.dmangin.follow', ['icon.png']),
    'fs': ('com.dmangin.follow', ['D4D7844D-A642-481E-BEE4-D032AD254C27.png',    # keyword fs
                                  '8F2A1C3E-5B7D-4E9F-A1B2-C3D4E5F60718.png']),  # hotkey ⌥⌘,
    'fe': ('com.dmangin.follow', ['BC4F345C-879E-409D-AF43-6D111E01C152.png',    # keyword fe
                                  '9E840F4C-361A-445B-BC93-AFC2A948678F.png']),  # hotkey ⌥⇧T
    'paste': ('com.dmangin.paste', ['icon.png']),
    'tabs': ('com.dmangin.wavebox-tabs', ['icon.png']),
}


def alfred_folders():
    prefs = subprocess.run(['defaults', 'read', 'com.runningwithcrayons.Alfred-Preferences', 'syncfolder'],
                           capture_output=True, text=True, check=True).stdout.strip()
    wf = pathlib.Path(prefs).expanduser() / 'Alfred.alfredpreferences' / 'workflows'
    return {plistlib.load(open(p, 'rb')).get('bundleid'): p.parent for p in wf.glob('*/info.plist')}


def render(svg_text, out):
    subprocess.run(['rsvg-convert', '-w', '512', '-h', '512', '-o', str(out)], input=svg_text.encode(), check=True)


def main(mode, dest=None):
    with tempfile.TemporaryDirectory() as tmp:
        wavebox = app_png(app_icns('Wavebox'), 'wavebox', tmp)
        noteplan = app_png(app_icns('NotePlan'), 'noteplan', tmp)
        folders = alfred_folders() if mode == 'install' else {}
        for name, text in designs(wavebox, noteplan).items():
            bundle, filenames = TARGETS[name]
            outs = ([pathlib.Path(dest) / (name + '.png')] if mode == 'preview'
                    else [folders[bundle] / f for f in filenames])
            for out in outs:
                render(text, out)
                print(f'{name:7} -> {out}')


if __name__ == '__main__':
    main(*sys.argv[1:])
