// Lien markdown vers le message Slack survolé (ou sélectionné au clavier)
// dans l'onglet Slack actif du navigateur.
'use strict';

const { UserError } = require('lib/alfred');
const wavebox = require('lib/wavebox');

// JS injecté dans l'onglet Slack. Cible en priorité le message survolé
// (:hover), sinon le message porteur du focus clavier. Le permalien est lu
// sur le lien du timestamp, qui inclut déjà thread_ts pour les fils.
const PAYLOAD = String.raw`(() => {
  const CONTAINER = '[data-qa="message_container"], .c-message_kit__background';
  const SENDER = '[data-qa="message_sender_name"], .c-message__sender_button, .c-message__sender a';
  const containers = Array.from(document.querySelectorAll(CONTAINER));

  let msg = containers.filter((el) => el.matches(':hover')).pop();
  if (!msg && document.activeElement) {
    msg = document.activeElement.closest(CONTAINER);
  }
  if (!msg) return JSON.stringify({ error: 'no-message' });

  const tsLink = msg.querySelector('a[data-qa="message_timestamp"], a.c-timestamp');
  if (!tsLink || !tsLink.href) return JSON.stringify({ error: 'no-permalink' });

  // Auteur : absent des messages groupés -> remonter les items précédents.
  let author = (msg.querySelector(SENDER) || {}).textContent || '';
  if (!author) {
    let item = msg.closest('[data-qa="virtual-list-item"], .c-virtual_list__item');
    while (item && !author) {
      item = item.previousElementSibling;
      const s = item && item.querySelector(SENDER);
      if (s) author = s.textContent;
    }
  }

  // Canal. Source prioritaire : l'entrée de la sidebar correspondant à l'id
  // de conversation du permalien — elle porte le type réel (im/mpim/channel,
  // un DM de groupe pouvant avoir un id en C…) et, pour les groupes, la liste
  // complète des membres là où l'en-tête tronque ("…, 2 others").
  let channel = '';
  let ctype = '';
  const convId = (tsLink.href.match(/\/archives\/(\w+)/) || [])[1] || '';
  const sb = convId && document.querySelector('[data-qa-channel-sidebar-channel-id="' + convId + '"]');
  if (sb) {
    ctype = sb.getAttribute('data-qa-channel-sidebar-channel-type') || '';
    if (ctype === 'mpim') {
      const name = sb.querySelector('[data-qa^="channel_sidebar_name"], .p-channel_sidebar__name');
      if (name) channel = name.textContent;
    }
  }

  // Replis. Vue conversation (/client/T…/C|D|G…) : en-tête global, sinon titre
  // de la page. Vue agrégée (Unreads, Threads… — l'en-tête global n'y est que
  // le titre de la vue) : en-tête de groupe précédant le message dans la liste
  // virtuelle ; introuvable -> segment omis.
  const conv = (location.pathname.match(/^\/client\/T\w+\/(\w+)/) || [])[1] || '';
  if (!channel && /^[CDG]/.test(conv)) {
    const head = document.querySelector(
      '[data-qa="channel_name"], .p-view_header__channel_title, [data-qa="channel-header-title"]'
    );
    if (head) channel = head.textContent;
    if (!channel) {
      channel = document.title.split(' - ')[0]
        .replace(/^\(\d+\)\s*/, '').replace(/^[*!]\s*/, '')
        .replace(/\s*\([^)]*\)$/, '');
    }
  } else if (!channel) {
    const GROUP_HEADER = '[data-qa*="channel_name"], [data-qa*="channel-name"], button[data-qa*="channel"]';
    let it = msg.closest('[data-qa="virtual-list-item"], .c-virtual_list__item');
    while (it && !channel) {
      const h = it.querySelector(GROUP_HEADER);
      if (h) channel = h.textContent;
      it = it.previousElementSibling;
    }
  }

  // Début du texte du message (vide pour un message sans texte, ex. image seule).
  const body = msg.querySelector('[data-qa="message-text"], .c-message_kit__blocks');
  const snippet = body ? body.textContent : '';

  return JSON.stringify({
    url: tsLink.href,
    author: author.trim(),
    channel: channel.trim(),
    ctype: ctype,
    snippet: snippet.trim(),
  });
})();`;

function slackTab(appName) {
  const tab = wavebox.browser(appName).windows[0].activeTab;
  if (!/^https:\/\/app\.slack\.com\//.test(tab.url())) {
    throw new UserError('L’onglet actif du navigateur n’est pas Slack.');
  }
  return tab;
}

function captureMessage(tab) {
  const raw = wavebox.executeJS(tab, PAYLOAD);
  let res;
  try {
    res = JSON.parse(raw);
  } catch (e) {
    throw new UserError('Réponse illisible du DOM Slack : ' + raw);
  }
  if (res.error === 'no-message') throw new UserError('Aucun message survolé ou sélectionné au clavier.');
  if (res.error) throw new UserError('Permalien introuvable sur ce message (' + res.error + ').');
  return res;
}

// [Slack - @auteur - #canal - début du message](url) ; les segments absents
// sont omis ; DM/groupe libellés d'après le type (/archives/C|D|G…) ; repli
// sur l'URL brute si tout est vide.
function buildMarkdown(res) {
  const clean = (s) => s.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
  // "Jean Le Floch" -> "JLF". Seuls les composants multi-mots (noms de
  // personnes) sont réduits : un nom de canal ou de bot mononyme reste intact.
  const initials = (name) =>
    /\s/.test(name)
      ? name.split(/\s+/).map((w) => (Array.from(w)[0] || '').toUpperCase()).join('')
      : name;
  const personList = (s) => s.split(',').map((p) => initials(p.trim())).join(',');

  const author = initials(clean(res.author || ''));
  const channel = clean(res.channel || '');
  // Type de conversation : celui de la sidebar quand il est connu (un DM de
  // groupe peut avoir un id en C…), sinon la 1re lettre de l'id du permalien.
  const kind = res.ctype === 'im' ? 'D'
    : res.ctype === 'mpim' ? 'G'
    : res.ctype ? 'C'
    : (res.url.match(/\/archives\/(\w)/) || [])[1];

  // Troncature en points de code : ne coupe jamais un emoji (paire de
  // substituts UTF-16) en deux.
  let snippet = clean(res.snippet || '');
  const chars = Array.from(snippet);
  if (chars.length > 60) snippet = chars.slice(0, 59).join('').trimEnd() + '…';

  let where = '';
  if (channel) {
    if (kind === 'D') where = '#DM-' + personList(channel);
    else if (kind === 'G') where = '#' + personList(channel);
    else where = '#' + personList(channel.replace(/^#/, ''));
  }

  const parts = [author && '@' + author, where, snippet].filter(Boolean);
  return parts.length ? '[#️⃣ ' + parts.join(' - ') + '](' + res.url + ')' : res.url;
}

function currentMessageLink(appName) {
  return buildMarkdown(captureMessage(slackTab(appName)));
}

module.exports = { PAYLOAD, slackTab, captureMessage, buildMarkdown, currentMessageLink };
