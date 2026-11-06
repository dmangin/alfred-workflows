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
const noteplan = require('lib/noteplan');
const { parseFollowArgs, isWaiting, planTask, followTaskLine, findOpenTask } = require('lib/follow');
const gmail = require('lib/sources/gmail');
const { buildMarkdown, messageKey } = require('lib/sources/slack');

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

// --- parseur fe -------------------------------------------------------------
eq('args vides', parseFollowArgs(''), { days: null, prio: '', action: '' });
eq('args « 0 »', parseFollowArgs('0'), { days: 0, prio: '', action: '' });
eq('args « 2 »', parseFollowArgs('2'), { days: 2, prio: '', action: '' });
eq('args « 2 !!! »', parseFollowArgs('2 !!!'), { days: 2, prio: '!!!', action: '' });
eq('args « 2 !!! voir XX »', parseFollowArgs('2 !!! voir XX'), { days: 2, prio: '!!!', action: 'voir XX' });
eq('args « !! relancer »', parseFollowArgs('!! relancer'), { days: null, prio: '!!', action: 'relancer' });

// --- aiguillage attente / action ---------------------------------------------
[
  ['action vide', '', true],
  ['verbe seul', 'Suivre', true],
  ['verbe, casse ignorée', 'suivre devis Bob', true],
  ['verbe en mot entier seulement', 'suivi devis', false],
  ['verbe collé', 'Suivrez', false],
  ['autre action', 'relancer Bob', false],
  ['verbe pas en tête', 'relancer et suivre', false],
].forEach(([name, action, exp]) => eq('isWaiting ' + name, isWaiting(action, 'Suivre'), exp));
eq('isWaiting verbe configuré accentué', isWaiting('ÉCOUTER la réponse', 'écouter'), true);
eq('isWaiting verbe avec caractères spéciaux', isWaiting('(att) x', '(att)'), true);

const P = (args) => planTask(args, { verb: 'Suivre', waitingDays: 2 });
[
  ['fe -> attente, délai par défaut', '', { waiting: true, days: 2, prio: '', action: 'Suivre' }],
  ['fe 0 -> attente J+0', '0', { waiting: true, days: 0, prio: '', action: 'Suivre' }],
  ['fe !!! -> attente, délai par défaut', '!!!', { waiting: true, days: 2, prio: '!!!', action: 'Suivre' }],
  ['fe 3 suivre devis -> attente J+3', '3 suivre devis', { waiting: true, days: 3, prio: '', action: 'suivre devis' }],
  ['fe relancer -> action J+0', 'relancer Bob', { waiting: false, days: 0, prio: '', action: 'relancer Bob' }],
  ['fe 2 !!! répondre -> action J+2', '2 !!! répondre', { waiting: false, days: 2, prio: '!!!', action: 'répondre' }],
].forEach(([name, args, exp]) => eq('planTask ' + name, P(args), exp));

// --- ligne de tâche et URL NotePlan -----------------------------------------
const line = followTaskLine({
  prio: '!!!', action: 'Suivre', created: D(2026, 9, 28), author: '@xy',
  link: '[@: Budget  2027](https://mail.google.com/mail/u/0/#inbox/abc)',
});
eq('ligne complète', line, '- [ ] !!! 28/09/2026: Suivre @xy [@: Budget 2027](https://mail.google.com/mail/u/0/#inbox/abc)');
eq('ligne sans priorité ni auteur',
  followTaskLine({ prio: '', action: 'Suivre', created: D(2026, 9, 28), author: '', link: '[x](u)' }),
  '- [ ] 28/09/2026: Suivre [x](u)');

eq('URL note du jour', noteplan.addTextUrl({ date: D(2026, 10, 1), text: '- [ ] a b' }),
  'noteplan://x-callback-url/addText?noteDate=20261001&openNote=yes&text=-%20%5B%20%5D%20a%20b');
eq('URL ajout en tête', noteplan.prependUrl({ title: 'En attente', text: '- [ ] a >2026-10-01' }),
  'noteplan://x-callback-url/addText?noteTitle=En%20attente&openNote=yes&mode=prepend&text=-%20%5B%20%5D%20a%20%3E2026-10-01');
eq('URL création de note', noteplan.addNoteUrl({ title: 'En attente', text: '- [ ] a' }),
  'noteplan://x-callback-url/addNote?noteTitle=En%20attente&openNote=yes&text=-%20%5B%20%5D%20a');
eq('URL ouverture de note', noteplan.openNoteUrl('En attente'), 'noteplan://x-callback-url/openNote?noteTitle=En%20attente');
eq('URL recherche', noteplan.searchUrl('FMfcgzAAAA'), 'noteplan://x-callback-url/search?text=FMfcgzAAAA');
eq('tâche planifiée', noteplan.scheduled('- [ ] a', D(2026, 10, 1)), '- [ ] a >2026-10-01');

// --- doublons dans la note d'attente ----------------------------------------
const note = `# En attente de retour
- [x] 01/10/2026: Suivre [@: fini](https://mail.google.com/mail/u/0/#inbox/KEYDONE0000000000) >2026-10-03
- [ ] 02/10/2026: Suivre @bob [@: devis](https://mail.google.com/mail/u/0/#inbox/KEYOPEN0000000000) >2026-10-06
* [ ] Suivre sans date KEYSTAR0000000000`;
eq('doublon : tâche ouverte', findOpenTask(note, 'KEYOPEN0000000000'), { created: '02/10/2026' });
eq('doublon : tâche faite ignorée', findOpenTask(note, 'KEYDONE0000000000'), null);
eq('doublon : marqueur *, sans date', findOpenTask(note, 'KEYSTAR0000000000'), { created: '' });
const web = `- [ ] 03/11/2026: Suivre [🌐 Ticket](https://exemple.test/browse/ABC-12) >2026-11-05
- [ ] 03/11/2026: Suivre [🌐 Vue](https://exemple.test/view?id=2&x=1) >2026-11-05
- [ ] 03/11/2026: Suivre [#️⃣ #dev](https://exemple.slack.com/archives/C01/p1700000000999999?thread_ts=1700000000.123456&cid=C01) >2026-11-05`;
eq('doublon : URL de page exacte', findOpenTask(web, 'https://exemple.test/browse/ABC-12'), { created: '03/11/2026' });
eq('doublon : URL préfixe d\'une autre (…/ABC-1)', findOpenTask(web, 'https://exemple.test/browse/ABC-1'), null);
eq('doublon : URL parente (…/browse)', findOpenTask(web, 'https://exemple.test/browse'), null);
eq('doublon : URL avec paramètres', findOpenTask(web, 'https://exemple.test/view?id=2&x=1'), { created: '03/11/2026' });
eq('doublon : autre valeur de paramètre', findOpenTask(web, 'https://exemple.test/view?id=20'), null);
eq('doublon : réponse de fil Slack', findOpenTask(web, 'p1700000000999999'), { created: '03/11/2026' });
eq('doublon : identifiant Slack préfixe', findOpenTask(web, 'p170000000099999'), null);
eq('doublon : absent', findOpenTask(note, 'KEYNONE0000000000'), null);
eq('doublon : sans clé (page web)', findOpenTask(note, ''), null);
eq('doublon : note absente', findOpenTask(null, 'KEYOPEN0000000000'), null);

// --- source Gmail --------------------------------------------------------------
eq('cleanUrl label + compose',
  gmail.cleanUrl('https://mail.google.com/mail/u/0/#label/.Projets%2FAlpha/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG?compose=new'),
  'https://mail.google.com/mail/u/0/#inbox/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG');
eq('threadKey depuis un libellé', gmail.threadKey('https://mail.google.com/mail/u/1/#label/.Projets%2FAlpha/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG?compose=new'),
  'FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG');
eq('threadKey URL nettoyée', gmail.threadKey('https://mail.google.com/mail/u/0/#inbox/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG'),
  'FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG');
eq('threadKey id hexadécimal', gmail.threadKey('https://mail.google.com/mail/u/0/#search/devis/18c2f0a1b2c3d4e5'), '18c2f0a1b2c3d4e5');
eq('threadKey liste (pas de conversation)', gmail.threadKey('https://mail.google.com/mail/u/0/#inbox'), '');
eq('threadKey liste paginée', gmail.threadKey('https://mail.google.com/mail/u/0/#inbox/p2'), '');
eq('followKey conversation Gmail', gmail.followKey('https://mail.google.com/mail/u/1/#inbox/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG'),
  'FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG');
eq('followKey liste Gmail -> rien', gmail.followKey('https://mail.google.com/mail/u/0/#inbox'), '');
eq('followKey page web -> URL', gmail.followKey('https://exemple.test/view?id=2&x=1#s'), 'https://exemple.test/view?id=2&x=1#s');
eq('threadKey hors Gmail', gmail.threadKey('https://example.com/a/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG'), '');
eq('cleanUrl hors Gmail inchangée', gmail.cleanUrl('https://example.com/a'), 'https://example.com/a');
eq('titre : Re:, crochets, suffixe du compte',
  gmail.cleanTitle('Re: [JIRA] point - moi@exemple.fr - Messagerie Exemple'), '{JIRA} point');
eq('titre : suffixe Gmail grand public',
  gmail.cleanTitle('Boîte de réception (12) - moi@gmail.com - Gmail'), 'Boîte de réception (12)');
eq('titre sans suffixe inchangé', gmail.cleanTitle('Budget - version 2'), 'Budget - version 2');
eq('tabLink page web', gmail.tabLink('https://example.com/a', 'Example'), '[🌐 Example](https://example.com/a)');
eq('tabLink mail',
  gmail.tabLink('https://mail.google.com/mail/u/0/#inbox/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG', 'Devis - moi@exemple.fr - Gmail'),
  '[@: Devis](https://mail.google.com/mail/u/0/#inbox/FMfcgzAAAAbbbbCCCCddddEEEEffffGGGG)');

// --- auteur des conversations Gmail -----------------------------------------
const aliases = gmail.parseAliases(`# collègues
alice.martin@exemple.fr = @alice
  Bruno.Petit@Exemple.fr:bp

ligne invalide
chloe@exemple.fr = @chloe   # commentaire`);
eq('table d\'alias : formats, casse, @ manquant, commentaires', aliases,
  { 'alice.martin@exemple.fr': '@alice', 'bruno.petit@exemple.fr': '@bp', 'chloe@exemple.fr': '@chloe' });
eq('table vide', gmail.parseAliases(''), {});
eq('auteur dans la table (casse de l\'adresse ignorée)',
  gmail.authorTag({ email: 'Alice.Martin@exemple.fr', name: 'Alice Martin' }, aliases), '@alice');
eq('auteur inconnu -> @prénom_nom sans accents',
  gmail.authorTag({ email: 'emilie@ailleurs.fr', name: 'Émilie Dupré-Lefèvre' }, aliases), '@emilie_dupre_lefevre');
eq('auteur inconnu sans nom -> partie locale',
  gmail.authorTag({ email: 'no-reply.service@ailleurs.fr', name: '' }, aliases), '@no_reply_service');
eq('pas d\'auteur (hors conversation)', gmail.authorTag(null, aliases), '');

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

eq('messageKey lien markdown', messageKey('[#️⃣ @AM - #dev](https://exemple.slack.com/archives/C0000CANAL/p1700000000123456)'), 'p1700000000123456');
eq('messageKey message de fil', messageKey('https://exemple.slack.com/archives/C0000CANAL/p1700000000999999?thread_ts=1700000000.123456&cid=C0000CANAL'), 'p1700000000999999');
eq('messageKey URL sans permalien', messageKey('https://app.slack.com/client/T000/C000'), '');

const long = buildMarkdown({ author: 'X', channel: 'c', ctype: 'channel', snippet: 'a'.repeat(58) + '🚀🎉🔥 suite longue', url: U('C1') });
eq('troncature : emoji entier puis …', /a{58}🚀…\]/.test(long), true);

// --- bilan -------------------------------------------------------------------
function run() {
  failures.forEach((f) => console.log('ÉCHEC ' + f));
  console.log(passed + ' réussis, ' + failures.length + ' échec(s)');
  if (failures.length) $.exit(1);
}
