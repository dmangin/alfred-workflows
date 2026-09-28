// Lien markdown vers l'onglet courant du navigateur : un mail Gmail (@:) ou
// n'importe quelle page web (🌐), avec les destinataires détectés.
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

// Gmail suffixe le titre par « - <adresse du compte> - <nom du service> » ; le
// titre porte aussi les destinataires sous la forme <|@ab @cd|>, grâce à
// l'extension Wavebox « mail.google.com sender in title ».
function splitAndCleanTitle(title) {
  let t = title
    .replace(/\s*-\s+[^\s@]+@[^\s@]+\s+-\s+[^<]*/, ' ')
    .replace(/^(Fwd|Re|Fw|Tr)\s*:/i, '')
    .replaceAll('[', '{')
    .replaceAll(']', '}');
  let recipients = '';
  const m = t.match(/<\|(.+?)\|>/);
  if (m) {
    recipients = m[1].trim();
    t = t.replace(/<\|.+?\|>/, '');
  }
  return { title: t.trim(), recipients };
}

function describeTab(url, rawTitle) {
  const clean = cleanUrl(url);
  const { title, recipients } = splitAndCleanTitle(rawTitle);
  const symbol = clean.includes('mail.google.com/') ? '@:' : '🌐';
  return { recipients, link: '[' + symbol + ' ' + title + '](' + clean + ')' };
}

function currentTab(appName) {
  const tab = wavebox.activeTab(wavebox.browser(appName), gmailTab());
  return describeTab(tab.url(), tab.title());
}

module.exports = { cleanUrl, splitAndCleanTitle, describeTab, currentTab };
