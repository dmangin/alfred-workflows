#!/usr/bin/env osascript -l JavaScript
// Follow — liens et tâches de suivi NotePlan depuis l'onglet actif du navigateur
// (Wavebox) : message Slack survolé, conversation Gmail ou page web.
//   copy                lien de l'onglet actif -> presse-papier  (keyword fec, ⌥⌘,)
//   link                lien de l'onglet actif, renvoyé à Alfred qui le colle  (snippet ::mp)
//   task <args>         tâche de suivi pour l'onglet actif  (keyword fe)
//   status              recherche NotePlan sur l'onglet actif : déjà suivi ?  (keyword fes)
//   waiting-open        trie la note d'attente, met à jour ses pastilles et l'ouvre
//                       (keyword feg, Hyper+A)
// <args> = « <jours ouvrés> <priorité> <action> », tout optionnel : « 2 !!! voir XX ».
// Action vide ou commençant par le verbe par défaut (« Suivre ») : tâche en attente
// de retour, à sa place dans la note d'attente, triée par échéance décroissante,
// pastilles 🔵🟡🟠🔴⚪ à jour ; sinon tâche d'action, dans la note du jour.
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
const { planTask, followTaskLine, findOpenTask, sortWaiting } = require('lib/follow');
const { currentItem } = require('lib/sources/current');
const gmail = require('lib/sources/gmail');

function conf() {
  const days = parseInt(env('gca_conf_waiting_days', '2'), 10);
  return {
    browser: env('gca_conf_gmail_app', 'Wavebox'),
    waitingNote: env('gca_conf_waiting_note', 'En attente de retour'),
    waitingDays: days >= 0 ? days : 2,
    verb: env('gca_conf_waiting_verb', 'Suivre'),
    aliases: gmail.parseAliases(env('gca_conf_gmail_aliases', '')),
  };
}

// Doublon : dialogue au premier plan, une notification passerait inaperçue.
// true = créer quand même ; Annuler ou Échap = false.
function confirmDuplicate(c, dup) {
  app.activate();
  try {
    app.displayDialog('Déjà en attente' + (dup.created ? ' depuis le ' + dup.created : '') +
      ' dans « ' + c.waitingNote + ' ».', {
      withTitle: 'Follow',
      withIcon: 'caution',
      buttons: ['Annuler', 'Créer quand même'],
      defaultButton: 'Créer quand même',
      cancelButton: 'Annuler',
    });
    return true;
  } catch (e) {
    if (e.errorNumber === -128) return false;
    throw e;
  }
}

// Attente : dans la note d'attente (créée si absente), avec l'échéance
// « >AAAA-MM-JJ », à sa place dans l'ordre des échéances (la note est réécrite
// triée, pastilles à jour), après confirmation si le message y est déjà en attente.
// Action : dans la note du jour de l'échéance.
function addTask(ui, c, { rawArgs, author, link, key }, dryRun) {
  const { waiting, days, prio, action } = planTask(rawArgs, { verb: c.verb, waitingDays: c.waitingDays });
  const now = new Date();
  const due = addWorkingDays(now, days);
  const text = followTaskLine({ prio, action, created: now, author, link });

  let url, message;
  if (waiting) {
    const line = noteplan.scheduled(text, due);
    const content = noteplan.readNote(c.waitingNote);
    const dup = findOpenTask(content, key);
    const doublon = dup ? ' (doublon : ' + (dup.created || 'sans date') + ')' : '';
    message = 'Tâche ajoutée à « ' + c.waitingNote + ' », échéance ' + frDate(due) + '.';
    if (content === null) {
      url = noteplan.addNoteUrl({ title: c.waitingNote, text: line });
      if (dryRun) return url;
    } else {
      url = noteplan.openNoteUrl(c.waitingNote);
      const sorted = sortWaiting(content, line, now);
      if (dryRun) return 'writeNote « ' + c.waitingNote + ' » + ' + url + doublon + '\n' + sorted;
      if (dup && !confirmDuplicate(c, dup)) return '';
      noteplan.writeNote(c.waitingNote, sorted);
    }
  } else {
    url = noteplan.addTextUrl({ date: due, text });
    if (dryRun) return url;
    message = 'Tâche ajoutée à la note du ' + frDate(due) + '.';
  }
  app.openLocation(url);
  ui.notify(message);
  return url;
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
      case 'waiting-open': {
        const url = noteplan.openNoteUrl(c.waitingNote);
        // NotePlan fermé : l'URL le lance, sans tri ni pastilles.
        if (!noteplan.isRunning()) {
          if (!dryRun) app.openLocation(url);
          return dryRun ? 'NotePlan fermé : ' + url : url;
        }
        const content = noteplan.readNote(c.waitingNote);
        if (content === null) {
          throw new UserError('La note « ' + c.waitingNote + ' » n’existe pas encore : le premier fe en attente la créera.');
        }
        const tidy = sortWaiting(content, '', new Date());
        if (dryRun) return (tidy === content ? 'inchangée' : 'writeNote') + ' + ' + url + '\n' + tidy;
        if (tidy !== content) noteplan.writeNote(c.waitingNote, tidy);
        app.openLocation(url);
        return url;
      }
      default:
        throw new UserError('Commande inconnue : « ' + cmd + ' » (copy, link, task, status, waiting-open).');
    }
  });
}
