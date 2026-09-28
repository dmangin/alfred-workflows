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

// Onglet actif de la fenêtre de premier plan. Une visio Meet en arrière-plan
// prend le dessus et renvoie about:blank : on se rabat alors sur `fallback`.
function activeTab(b, fallback) {
  const tab = b.windows[0].activeTab;
  if (tab.url() !== 'about:blank' || !fallback) return tab;
  const found = findTab(b, fallback);
  return found ? found.tab : tab;
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
