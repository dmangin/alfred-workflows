#!/usr/bin/env osascript -l JavaScript
// Follow — liens et tâches de suivi NotePlan depuis l'onglet actif du navigateur
// (Wavebox) : message Slack survolé, conversation Gmail ou page web.
//   copy                lien de l'onglet actif -> presse-papier  (keyword fec, ⌥⌘,)
//   link                lien de l'onglet actif, renvoyé à Alfred qui le colle  (snippet ::mp)
//   task <args>         tâche de suivi pour l'onglet actif  (keyword fe)
//   status              recherche NotePlan sur l'onglet actif : déjà suivi ?  (keyword fes)
//   resolve             résout ses suivis ouverts et archive le mail  (keyword fer)
//   open                range la note de suivi et l'ouvre  (keyword feg, Hyper+A)
// <args> = « <jours ouvrés> <priorité> <action> », tout optionnel : « 2 !!! voir XX ».
// Toutes les tâches vont dans la note de suivi (« Suivi »), triées par échéance
// décroissante, pastilles 🔵🟡🟠🔴⚪ à jour : action vide ou commençant par le
// verbe par défaut (« Suivre ») dans la section « En attente », toute autre
// dans « À faire ».
// --dry-run : affiche le résultat sans presse-papier, activation ni ajout.
'use strict';

ObjC.import('Foundation');
const require = (() => {
  const argv = ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments);
  let me = argv.find((a) => /\.js$/.test(a));
  if (!me.startsWith('/')) me = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath) + '/' + me;
  const root = ObjC.unwrap($(me).stringByResolvingSymlinksInPath).replace(/\/(workflows\/[^/]+|tests|tools)\/[^/]+$/, '');
  const src = $.NSString.stringWithContentsOfFileEncodingError(root + '/lib/require.js', $.NSUTF8StringEncoding, null);
  return new Function('root', ObjC.unwrap(src))(root);
})();

const { app, env, main, UserError } = require('lib/alfred');
const { addWorkingDays, frDate } = require('lib/dates');
const noteplan = require('lib/noteplan');
const { TODO, WAITING, planTask, followTaskLine, findOpenTask, sortFollow, resolveFollow } = require('lib/follow');
const { currentItem } = require('lib/sources/current');
const gmail = require('lib/sources/gmail');

function conf() {
  const days = parseInt(env('gca_conf_waiting_days', '2'), 10);
  return {
    browser: env('gca_conf_gmail_app', 'Wavebox'),
    // Variable historique : elle désignait la note d'attente, devenue note de suivi.
    note: env('gca_conf_waiting_note', 'Suivi'),
    waitingDays: days >= 0 ? days : 2,
    verb: env('gca_conf_waiting_verb', 'Suivre'),
    aliases: gmail.parseAliases(env('gca_conf_gmail_aliases', '')),
  };
}

// Dialogue au premier plan, une notification passerait inaperçue.
// true = `ok` ; `cancel` ou Échap = false.
function confirm(text, ok, cancel = 'Annuler') {
  app.activate();
  try {
    app.displayDialog(text, { withTitle: 'Follow', withIcon: 'caution', buttons: [cancel, ok], defaultButton: ok, cancelButton: cancel });
    return true;
  } catch (e) {
    if (e.errorNumber === -128) return false;
    throw e;
  }
}

const confirmDuplicate = (c, dup) => confirm('Déjà suivi' + (dup.created ? ' depuis le ' + dup.created : '') +
  ' dans « ' + c.note + ' ».', 'Créer quand même');

// Dans la note de suivi (créée si absente), section « En attente » ou « À
// faire », avec l'échéance « >AAAA-MM-JJ », à sa place dans l'ordre des
// échéances (la note est réécrite rangée), après confirmation si le message y
// est déjà suivi.
function addTask(ui, c, { rawArgs, author, link, key }, dryRun) {
  const { waiting, days, prio, action } = planTask(rawArgs, { verb: c.verb, waitingDays: c.waitingDays });
  const now = new Date();
  const due = addWorkingDays(now, days);
  const add = { section: waiting ? WAITING : TODO, line: noteplan.scheduled(followTaskLine({ prio, action, created: now, author, link }), due) };
  const content = noteplan.readNote(c.note);
  const message = 'Tâche ajoutée à « ' + c.note + ' » (' + add.section + '), échéance ' + frDate(due) + '.';
  let url;
  if (content === null) {
    url = noteplan.addNoteUrl({ title: c.note, text: sortFollow('', { add, today: now }) });
    if (dryRun) return url;
  } else {
    url = noteplan.openNoteUrl(c.note);
    const dup = findOpenTask(content, key);
    const sorted = sortFollow(content, { add, today: now });
    if (dryRun) return 'writeNote « ' + c.note + ' » + ' + url + (dup ? ' (doublon : ' + (dup.created || 'sans date') + ')' : '') + '\n' + sorted;
    if (dup && !confirmDuplicate(c, dup)) return '';
    noteplan.writeNote(c.note, sorted);
  }
  app.openLocation(url);
  ui.notify(message);
  return url;
}

// Résolution : les suivis ouverts de l'onglet passent cochés en tête de
// « Terminé » ; aucun : dialogue pour en créer un déjà résolu (traçabilité) ou
// ne rien faire. Puis, sur une conversation Gmail portant un libellé à soi,
// archivage.
function resolve(ui, c, { author, link, key, tab }, dryRun) {
  if (!key) throw new UserError('Rien à résoudre : ouvre une conversation Gmail, survole un message Slack ou ouvre une page.');
  const content = noteplan.readNote(c.note);
  if (content === null) throw new UserError('La note « ' + c.note + ' » n’existe pas encore.');
  const now = new Date();
  const mail = !!gmail.threadKey(tab.url());
  let r = resolveFollow(content, key, now);
  if (!r.count) {
    const line = followTaskLine({ prio: '', action: c.verb, created: now, author, link });
    if (dryRun) return 'aucun suivi ouvert : dialogue, puis' + (mail ? ' archivage +' : '') + ' writeNote\n' +
      resolveFollow(content, key, now, line).content;
    if (!confirm('Aucun suivi ouvert pour cet onglet dans « ' + c.note + ' ».', 'Créer résolu', 'Ne rien faire')) return '';
    r = resolveFollow(content, key, now, line);
  }
  if (dryRun) return r.count + ' suivi(s) résolu(s)' + (mail ? ' + archivage' : '') + ' : writeNote\n' + r.content;
  noteplan.writeNote(c.note, r.content);
  const done = r.count > 1 ? r.count + ' suivis résolus' : r.count ? 'Suivi résolu' : 'Suivi créé déjà résolu';
  const archive = mail ? gmail.archiveThread(tab) : '';
  ui.notify(done + ({
    archived: ', mail archivé.',
    nolabel: ' ; aucun libellé : mail non archivé.',
    nobutton: ' ; bouton Archiver introuvable, mail non archivé.',
  }[archive] || '.'));
  return done;
}

// Comme dans une tâche fe : l'auteur d'un mail devant son lien.
function currentLink(c) {
  const { author, link } = currentItem(c.browser, c.aliases);
  return [author, link].filter(Boolean).join(' ');
}

function run(argv) {
  return main('Follow', (ui) => {
    const dryRun = argv.includes('--dry-run');
    const [cmd, rawArgs = ''] = argv.filter((a) => a !== '--dry-run');
    const c = conf();

    switch (cmd) {
      case 'link':
        return currentLink(c);
      case 'copy': {
        const text = currentLink(c);
        if (dryRun) return text;
        app.setTheClipboardTo(text);
        ui.notify('Lien copié — Cmd+V pour le coller.');
        return text;
      }
      case 'task':
        return addTask(ui, c, { rawArgs, ...currentItem(c.browser, c.aliases) }, dryRun);
      case 'status': {
        const { key } = currentItem(c.browser, c.aliases);
        if (!key) throw new UserError('Aucune conversation Gmail ouverte.');
        const url = noteplan.searchUrl(key);
        if (!dryRun) app.openLocation(url);
        return url;
      }
      case 'resolve':
        return resolve(ui, c, currentItem(c.browser, c.aliases), dryRun);
      case 'open': {
        const url = noteplan.openNoteUrl(c.note);
        // NotePlan fermé : l'URL le lance, sans tri ni pastilles.
        if (!noteplan.isRunning()) {
          if (!dryRun) app.openLocation(url);
          return dryRun ? 'NotePlan fermé : ' + url : url;
        }
        const content = noteplan.readNote(c.note);
        if (content === null) {
          throw new UserError('La note « ' + c.note + ' » n’existe pas encore : le premier fe la créera.');
        }
        const tidy = sortFollow(content, { today: new Date() });
        if (dryRun) return (tidy === content ? 'inchangée' : 'writeNote') + ' + ' + url + '\n' + tidy;
        if (tidy !== content) noteplan.writeNote(c.note, tidy);
        app.openLocation(url);
        return url;
      }
      default:
        throw new UserError('Commande inconnue : « ' + cmd + ' » (copy, link, task, status, resolve, open).');
    }
  });
}
