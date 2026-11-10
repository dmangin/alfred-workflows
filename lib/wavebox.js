// Pilotage des onglets d'un navigateur Chromium scriptable (Wavebox par
// défaut) : recherche, activation, injection de JavaScript.
'use strict';

const { UserError } = require('lib/alfred');

function browser(appName = 'Wavebox') {
  const b = Application(appName);
  if (!b.running()) throw new UserError(appName + ' n’est pas lancé.');
  if (b.windows.length === 0) throw new UserError('Aucune fenêtre ' + appName + ' ouverte.');
  return b;
}

// Premier onglet dont l'URL contient `url` et le titre contient `title`.
function findTab(b, { url = '', title = '' }) {
  for (const win of b.windows()) {
    const index = win.tabs().findIndex((t) => t.url().includes(url) && t.title().includes(title));
    if (index !== -1) return { win, index, tab: win.tabs[index] };
  }
  return null;
}

// Onglet actif de la fenêtre de premier plan. La vignette flottante d'une visio
// Meet (incrustation, 300×560 environ) est une fenêtre à un onglet about:blank
// qui reste devant : on prend alors l'onglet actif de la fenêtre suivante dans
// l'ordre d'empilement, et seulement si toutes sont vides, `fallback`.
function activeTab(b, fallback) {
  const wins = b.windows();
  const blank = (t) => t.url() === 'about:blank';
  const tab = wins.map((w) => w.activeTab).find((t) => !blank(t));
  if (tab) return tab;
  const found = fallback && findTab(b, fallback);
  return found ? found.tab : wins[0].activeTab;
}

// Active l'onglet `spec`. S'il est déjà au premier plan, passe à l'onglet
// suivant (plusieurs onglets Gmail, Slack… de suite).
function focusTab(b, spec) {
  const found = findTab(b, spec);
  if (!found) return false;
  let { win, index } = found;
  if (b.frontmost() && win.activeTab().url() === win.tabs[index].url()) index++;
  win.visible = true;
  win.activeTabIndex = index + 1;
  win.index = 1;
  b.activate();
  return true;
}

function executeJS(tab, js) {
  try {
    return tab.execute({ javascript: js });
  } catch (e) {
    throw new UserError('Injection JS refusée — activer View › Developer › Allow JavaScript from Apple Events dans le navigateur.');
  }
}

module.exports = { browser, findTab, activeTab, focusTab, executeJS };
