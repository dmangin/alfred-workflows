#!/usr/bin/env osascript -l JavaScript
// Sonde de debug : attend (max 30 s) qu'un message Slack soit survolé dans
// Wavebox, puis photographie le DOM autour (ancêtres, en-têtes, chaîne :hover).
// Sortie JSON sur stdout.
'use strict';

function run() {
  const wb = Application('Wavebox');
  const w = wb.windows[0];
  const t = w.tabs[w.activeTabIndex() - 1];

  const CONT = String.raw`[data-qa="message_container"], .c-message_kit__background`;
  const check = '(() => Array.from(document.querySelectorAll(String.raw`' + CONT + '`)).some((e) => e.matches(":hover")) ? "yes" : "no")();';

  let found = false;
  for (let i = 0; i < 60; i++) {
    if (t.execute({ javascript: check }) === 'yes') { found = true; break; }
    delay(0.5);
  }

  const js = '(() => {' +
    'const out = { url: location.href.slice(0, 90), title: document.title, hover_found: ' + found + ' };' +
    'const dump = (el) => el.tagName + "|qa=" + (el.getAttribute("data-qa") || "") + "|cls=" + (el.className || "").toString().slice(0, 50) + "|" + (el.textContent || "").trim().slice(0, 50);' +
    'const hovered = Array.from(document.querySelectorAll(String.raw`' + CONT + '`)).filter((e) => e.matches(":hover")).pop();' +
    'out.hovered_message = hovered ? (hovered.textContent || "").trim().slice(0, 80) : null;' +
    'out.ancestors = [];' +
    'for (let el = hovered; el && el !== document.body && out.ancestors.length < 20; el = el.parentElement) {' +
    '  out.ancestors.push(dump(el).slice(0, 160));' +
    '}' +
    'out.hover_chain = Array.from(document.querySelectorAll(":hover")).map((e) => dump(e).slice(0, 140));' +
    'const item = hovered && hovered.closest(String.raw`[data-qa="virtual-list-item"], .c-virtual_list__item`);' +
    'out.prev_items = [];' +
    'for (let p = item && item.previousElementSibling; p && out.prev_items.length < 8; p = p.previousElementSibling) {' +
    '  out.prev_items.push(dump(p).slice(0, 160));' +
    '}' +
    'return JSON.stringify(out, null, 1);' +
  '})();';
  return t.execute({ javascript: js });
}
