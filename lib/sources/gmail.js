// Lien markdown vers l'onglet courant du navigateur : un mail Gmail (@:) ou
// n'importe quelle page web (🌐), et auteur de la conversation Gmail ouverte.
'use strict';

const { env } = require('lib/alfred');
const wavebox = require('lib/wavebox');

// Onglet Gmail de repli ; l'adresse du compte (config Alfred gca_conf_gmail_account)
// départage plusieurs comptes ouverts, vide = premier onglet Gmail.
const gmailTab = () => ({ url: 'https://mail.google.com/', title: env('gca_conf_gmail_account', '') });

// …/mail/u/0/#label/.Projets%2FAlpha/FMfcgz…?compose=new
//   -> …/mail/u/0/#inbox/FMfcgz…
function cleanUrl(url) {
  const m = url.match(/https:\/\/mail.google.com\/mail\/u\/(\d+)\/.*?(\w{32,})/);
  return m ? 'https://mail.google.com/mail/u/' + m[1] + '/#inbox/' + m[2] : url;
}

// Identifiant de la conversation ouverte (jeton FMfcg… ou id hexadécimal) :
// clé de recherche des tâches dans NotePlan, la même quels que soient le
// libellé et le numéro de compte de l'URL. '' hors conversation.
function threadKey(url) {
  const m = String(url).match(/^https:\/\/mail\.google\.com\/mail\/u\/\d+\/#[^?]*\/([A-Za-z0-9]{16,})/);
  return m ? m[1] : '';
}

// Clé de recherche des tâches dans NotePlan pour l'onglet `url` : identifiant
// de conversation pour Gmail ('' hors conversation : une liste n'identifie
// rien), sinon l'URL de la page, telle qu'écrite dans le lien de la tâche.
function followKey(url) {
  return /^https:\/\/mail\.google\.com\//.test(url) ? threadKey(url) : url;
}

// Gmail suffixe le titre par « - <adresse du compte> - <nom du service> » ;
// les crochets deviennent des accolades pour ne pas casser le lien markdown.
function cleanTitle(title) {
  return title
    .replace(/\s*-\s+[^\s@]+@[^\s@]+\s+-\s+.*$/, '')
    .replace(/^(Fwd|Re|Fw|Tr)\s*:/i, '')
    .replaceAll('[', '{')
    .replaceAll(']', '}')
    .trim();
}

// [@: sujet](url) pour un mail, [🌐 titre](url) pour une page.
function tabLink(url, title) {
  const clean = cleanUrl(url);
  const symbol = clean.includes('mail.google.com/') ? '@:' : '🌐';
  return '[' + symbol + ' ' + cleanTitle(title) + '](' + clean + ')';
}

function currentTab(appName) {
  const tab = wavebox.activeTab(wavebox.browser(appName), gmailTab());
  return { link: tabLink(tab.url(), tab.title()), tab };
}

// Premier expéditeur de la conversation ouverte : chaque message, replié ou
// déplié, porte un span.gD (attributs email et name), dans l'ordre
// chronologique. null hors conversation (liste, recherche…).
const AUTHOR_JS = String.raw`(() => {
  if (!/#[^?]*\/[A-Za-z0-9]{16,}/.test(location.href)) return 'null';
  const main = document.querySelector('div[role="main"]');
  const first = main && Array.from(main.querySelectorAll('span.gD[email]')).find((e) => e.offsetParent !== null);
  return JSON.stringify(first ? { email: first.getAttribute('email'), name: first.getAttribute('name') || '' } : null);
})()`;

function threadAuthor(tab) {
  if (!tab.url().includes('mail.google.com/')) return null;
  return JSON.parse(wavebox.executeJS(tab, AUTHOR_JS));
}

// Libellés de la conversation ouverte : pastilles (.hN, nom dans data-name) à
// côté du sujet (h2.hP), système compris, [{ name, inNav }] ; inNav : la barre
// latérale a un lien « #label/<nom> » vers lui, donc c'est un libellé à soi.
// [] si le sujet est introuvable.
const LABELS_JS = String.raw`(() => {
  const subject = document.querySelector('h2.hP');
  const box = subject && (subject.closest('.ha') || subject.parentElement);
  if (!box) return '[]';
  const nav = new Set([...document.querySelectorAll('a[href*="#label/"]')].map((a) => {
    try { return decodeURIComponent(a.getAttribute('href').replace(/^.*#label\//, '').replace(/\+/g, ' ')); } catch (e) { return ''; }
  }));
  return JSON.stringify([...box.querySelectorAll('.hN')]
    .map((e) => (e.getAttribute('data-name') || e.textContent).trim()).filter(Boolean)
    .map((name) => ({ name, inNav: nav.has(name) })));
})()`;

// Libellés système de Gmail, en anglais et en français : boîte de réception,
// suivis, en attente, envoyés, brouillons, programmés, tous les messages,
// corbeille, catégories…
const SYSTEM = new RegExp('^(' + [
  'Inbox', 'Boîte de réception', 'Starred', 'Messages suivis', 'Snoozed', 'En attente', 'Important',
  'Sent', 'Messages envoyés', 'Drafts', 'Brouillons', 'Scheduled', 'Programmés', 'All Mail', 'Tous les messages',
  'Spam', 'Trash', 'Corbeille', 'Chats', 'Archived', 'Archivés', 'Muted', 'Ignorés',
  'Social', 'Réseaux sociaux', 'Updates', 'Mises à jour', 'Forums', 'Promotions', 'Purchases', 'Achats',
].join('|') + ')$', 'i');

// Libellés à soi parmi ceux de la conversation : présents dans la barre
// latérale, ou d'un nom qui n'est pas celui d'un libellé système.
const userLabels = (labels) => labels.filter((l) => l.inNav || !SYSTEM.test(l.name)).map((l) => l.name);

// Archive la conversation ouverte en cliquant le bouton Archiver de Gmail
// (act="7", le seul visible ; Gmail réagit à mousedown/mouseup, pas au seul
// click), seulement si elle porte au moins un libellé à soi : un mail archivé
// sans libellé ne se retrouve plus que par recherche.
const ARCHIVE_JS = String.raw`(() => {
  const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const button = [...document.querySelectorAll('[act="7"][role="button"]')].find(visible);
  if (!button) return 'false';
  ['mousedown', 'mouseup', 'click'].forEach((type) =>
    button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })));
  return 'true';
})()`;

// -> 'archived', 'nolabel' (rien fait) ou 'nobutton' ; '' hors conversation.
function archiveThread(tab) {
  if (!threadKey(tab.url())) return '';
  if (!userLabels(JSON.parse(wavebox.executeJS(tab, LABELS_JS))).length) return 'nolabel';
  return wavebox.executeJS(tab, ARCHIVE_JS) === 'true' ? 'archived' : 'nobutton';
}

// Table d'alias (config Alfred gca_conf_gmail_aliases), une ligne par
// correspondant : « adresse = @alias » ; lignes vides et # ignorées.
function parseAliases(text) {
  const aliases = {};
  String(text || '').split(/\r?\n/).forEach((line) => {
    const m = line.replace(/#.*$/, '').match(/^\s*([^\s=:]+@[^\s=:]+)\s*[=:]\s*(\S+)\s*$/);
    if (m) aliases[m[1].toLowerCase()] = m[2].startsWith('@') ? m[2] : '@' + m[2];
  });
  return aliases;
}

// Alias de la table, sinon « @prénom_nom » en minuscules sans accents (à
// défaut de nom affiché, la partie locale de l'adresse).
function authorTag(author, aliases) {
  if (!author || !author.email) return '';
  const alias = aliases[author.email.toLowerCase()];
  if (alias) return alias;
  const slug = (author.name || author.email.split('@')[0])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug ? '@' + slug : '';
}

module.exports = { cleanUrl, threadKey, followKey, cleanTitle, tabLink, currentTab, threadAuthor, userLabels, archiveThread, parseAliases, authorTag };
