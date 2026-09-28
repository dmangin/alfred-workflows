#!/usr/bin/env osascript -l JavaScript
// Tests unitaires de lib/ : osascript -l JavaScript tests/run.js (ou make test).
// Aucun accès au navigateur ni à NotePlan : fonctions pures uniquement.
'use strict';

ObjC.import('Foundation');
ObjC.import('stdlib');
const require = (() => {
  const argv = ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments);
  let me = argv.find((a) => /\.js$/.test(a));
  if (!me.startsWith('/')) me = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath) + '/' + me;
  const root = ObjC.unwrap($(me).stringByResolvingSymlinksInPath).replace(/\/(workflows\/[^/]+|tests|tools)\/[^/]+$/, '');
  const src = $.NSString.stringWithContentsOfFileEncodingError(root + '/lib/require.js', $.NSUTF8StringEncoding, null);
  return new Function('root', ObjC.unwrap(src))(root);
})();

const dates = require('lib/dates');
const { addTextUrl } = require('lib/noteplan');
const { parseFollowArgs, followTaskLine } = require('lib/follow');
const gmail = require('lib/sources/gmail');
const { buildMarkdown } = require('lib/sources/slack');

let passed = 0;
const failures = [];
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + '\n    obtenu  : ' + a + '\n    attendu : ' + e);
}

// --- dates : jours ouvrés, week-end calé sur le lundi ---------------------
const D = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const wd = (from, n) => dates.frDate(dates.addWorkingDays(from, n));
[
  ['lundi + 0', D(2026, 9, 28), 0, '28/09/2026'],
  ['lundi + 1', D(2026, 9, 28), 1, '29/09/2026'],
  ['lundi + 4', D(2026, 9, 28), 4, '02/10/2026'],
  ['lundi + 5', D(2026, 9, 28), 5, '05/10/2026'],
  ['vendredi + 1', D(2026, 10, 2), 1, '05/10/2026'],
  ['vendredi + 3', D(2026, 10, 2), 3, '07/10/2026'],
  ['samedi + 0 -> lundi', D(2026, 10, 3), 0, '05/10/2026'],
  ['samedi + 1 -> mardi', D(2026, 10, 3), 1, '06/10/2026'],
  ['dimanche + 0 -> lundi', D(2026, 10, 4), 0, '05/10/2026'],
  ['dimanche + 1 -> mardi', D(2026, 10, 4), 1, '06/10/2026'],
  ['fin de mois : mercredi 30/09 + 2', D(2026, 9, 30), 2, '02/10/2026'],
  ['mercredi + 10', D(2026, 9, 30), 10, '14/10/2026'],
  ['N en texte', D(2026, 9, 28), '3', '01/10/2026'],
  ['N invalide -> 0', D(2026, 9, 28), 'abc', '28/09/2026'],
].forEach(([name, from, n, exp]) => eq('addWorkingDays ' + name, wd(from, n), exp));

eq('npDate à 00:30 locale (pas de décalage UTC)', dates.npDate(D(2026, 9, 29, 0, 30)), '20260929');
eq('isoDate', dates.isoDate(D(2026, 1, 5)), '2026-01-05');

// --- parseur fe / fs ---------------------------------------------------------
eq('args vides', parseFollowArgs(''), { days: 0, prio: '', action: 'Suivre' });
eq('args « 0 » (⌥⇧T)', parseFollowArgs('0'), { days: 0, prio: '', action: 'Suivre' });
eq('args « 2 »', parseFollowArgs('2'), { days: 2, prio: '', action: 'Suivre' });
eq('args « 2 !!! »', parseFollowArgs('2 !!!'), { days: 2, prio: '!!!', action: 'Suivre' });
eq('args « 2 !!! voir XX »', parseFollowArgs('2 !!! voir XX'), { days: 2, prio: '!!!', action: 'voir XX' });
eq('args « !! relancer »', parseFollowArgs('!! relancer'), { days: 0, prio: '!!', action: 'relancer' });

// --- ligne de tâche et URL NotePlan -----------------------------------------
const line = followTaskLine({
  prio: '!!!', action: 'Suivre', created: D(2026, 9, 28), recipients: '@ab',
  link: '[@: Budget  2027](https://mail.google.com/mail/u/0/#inbox/abc)',
});
eq('ligne complète', line, '- [ ] !!! 28/09/2026: Suivre @ab [@: Budget 2027](https://mail.google.com/mail/u/0/#inbox/abc)');
eq('ligne sans priorité ni destinataires',
  followTaskLine({ prio: '', action: 'Suivre', created: D(2026, 9, 28), recipients: '', link: '[x](u)' }),
  '- [ ] 28/09/2026: Suivre [x](u)');

const today = addTextUrl({ date: D(2026, 10, 1), text: '- [ ] a b', inboxNote: '' });
eq('URL note du jour', today, 'noteplan://x-callback-url/addText?noteDate=20261001&openNote=yes&text=-%20%5B%20%5D%20a%20b');
const inbox = addTextUrl({ date: D(2026, 10, 1), text: '- [ ] a', inboxNote: '📥 Inbox' });
eq('URL Inbox : note', decodeURIComponent(inbox.split('noteTitle=')[1].split('&')[0]), '📥 Inbox');
eq('URL Inbox : texte + échéance', decodeURIComponent(inbox.split('&text=')[1]), '- [ ] a >2026-10-01');
eq('URL Inbox : prepend', /&mode=prepend&/.test(inbox), true);

// --- source Gmail --------------------------------------------------------------
eq('cleanUrl label + compose',
  gmail.cleanUrl('https://mail.google.com/mail/u/0/#label/.Projets%2FAlpha/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG?compose=new'),
  'https://mail.google.com/mail/u/0/#inbox/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG');
eq('cleanUrl hors Gmail inchangée', gmail.cleanUrl('https://example.com/a'), 'https://example.com/a');
eq('titre : Re:, destinataires, crochets',
  gmail.splitAndCleanTitle('Re: [JIRA] point <|@ab @cd|> - moi@exemple.fr - Messagerie Exemple'),
  { title: '{JIRA} point', recipients: '@ab @cd' });
eq('titre : suffixe Gmail grand public',
  gmail.splitAndCleanTitle('Boîte de réception (12) - moi@gmail.com - Gmail'),
  { title: 'Boîte de réception (12)', recipients: '' });
eq('titre sans suffixe inchangé', gmail.splitAndCleanTitle('Budget - version 2'), { title: 'Budget - version 2', recipients: '' });
eq('describeTab page web',
  gmail.describeTab('https://example.com/a', 'Example'),
  { recipients: '', link: '[🌐 Example](https://example.com/a)' });

// --- source Slack : buildMarkdown -------------------------------------------
const U = (id) => 'https://exemple.slack.com/archives/' + id + '/p1';
[
  ['canal public', { author: 'Alice Martin', channel: 'dev-web', ctype: 'channel', snippet: 'hello', url: U('C0000CANAL') },
    '[#️⃣ @AM - #dev-web - hello](' + U('C0000CANAL') + ')'],
  ['DM 1-1', { author: 'Bruno Petit', channel: 'Bruno Petit', ctype: 'im', snippet: 'ok pour moi', url: U('D0000DM11') },
    '[#️⃣ @BP - #DM-BP - ok pour moi](' + U('D0000DM11') + ')'],
  ['groupe mpim (id en C)', { author: 'Emma Roux', channel: 'Chloé Durand, David Leroy, Emma Roux, Farid Nasri', ctype: 'mpim', snippet: 'ça me va !', url: U('C0000GRP4') },
    '[#️⃣ @ER - #CD,DL,ER,FN - ça me va !](' + U('C0000GRP4') + ')'],
  ['bot mononyme', { author: 'GitHub', channel: 'deploys', ctype: 'channel', snippet: 'build ok', url: U('C99') },
    '[#️⃣ @GitHub - #deploys - build ok](' + U('C99') + ')'],
  ['sans auteur', { author: '', channel: 'random', ctype: '', snippet: '', url: U('C99') },
    '[#️⃣ #random](' + U('C99') + ')'],
  ['tout vide -> URL brute', { author: '', channel: '', ctype: '', snippet: '', url: U('C99') }, U('C99')],
  ['crochets et sauts de ligne', { author: 'A [b]', channel: 'g1', ctype: '', snippet: 'multi\n  ligne   et [crochets]', url: U('G42') },
    '[#️⃣ @AB - #g1 - multi ligne et crochets](' + U('G42') + ')'],
].forEach(([name, res, exp]) => eq('buildMarkdown ' + name, buildMarkdown(res), exp));

const long = buildMarkdown({ author: 'X', channel: 'c', ctype: 'channel', snippet: 'a'.repeat(58) + '🚀🎉🔥 suite longue', url: U('C1') });
eq('troncature : emoji entier puis …', /a{58}🚀…\]/.test(long), true);

// --- bilan -------------------------------------------------------------------
function run() {
  failures.forEach((f) => console.log('ÉCHEC ' + f));
  console.log(passed + ' réussis, ' + failures.length + ' échec(s)');
  if (failures.length) $.exit(1);
}
