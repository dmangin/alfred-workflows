#!/usr/bin/env osascript -l JavaScript
// Follow — liens et tâches de suivi NotePlan depuis l'onglet actif du navigateur
// (Wavebox) : message Slack survolé, conversation Gmail ou page web.
//   slack-copy          lien du message Slack survolé -> presse-papier + active NotePlan
//   task <args>         tâche de suivi pour l'onglet actif  (keyword fe)
//   status              recherche NotePlan sur l'onglet actif : déjà suivi ?  (keyword fes)
//   waiting-open        ouvre la note d'attente  (keyword feg, Hyper+A)
// <args> = « <jours ouvrés> <priorité> <action> », tout optionnel : « 2 !!! voir XX ».
// Action vide ou commençant par le verbe par défaut (« Suivre ») : tâche en attente
// de retour, en tête de la note d'attente ; sinon tâche d'action, dans la note du jour.
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
const { planTask, followTaskLine, findOpenTask } = require('lib/follow');
const { currentItem } = require('lib/sources/current');
const gmail = require('lib/sources/gmail');
const slack = require('lib/sources/slack');

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

// Attente : en tête de la note d'attente (créée si absente), avec l'échéance
// « >AAAA-MM-JJ », après confirmation si le message y est déjà en attente.
// Action : dans la note du jour de l'échéance.
function addTask(ui, c, { rawArgs, recipients, link, key }, dryRun) {
  const { waiting, days, prio, action } = planTask(rawArgs, { verb: c.verb, waitingDays: c.waitingDays });
  const now = new Date();
  const due = addWorkingDays(now, days);
  const text = followTaskLine({ prio, action, created: now, recipients, link });

  let url, message;
  if (waiting) {
    const note = { title: c.waitingNote, text: noteplan.scheduled(text, due) };
    const content = noteplan.readNote(c.waitingNote);
    const dup = findOpenTask(content, key);
    url = content === null ? noteplan.addNoteUrl(note) : noteplan.prependUrl(note);
    if (dryRun) return url + (dup ? ' (doublon : ' + (dup.created || 'sans date') + ')' : '');
    if (dup && !confirmDuplicate(c, dup)) return '';
    message = 'Tâche ajoutée à « ' + c.waitingNote + ' », échéance ' + frDate(due) + '.';
  } else {
    url = noteplan.addTextUrl({ date: due, text });
    if (dryRun) return url;
    message = 'Tâche ajoutée à la note du ' + frDate(due) + '.';
  }
  app.openLocation(url);
  ui.notify(message);
  return url;
}

function run(argv) {
  return main('Follow', (ui) => {
    const dryRun = argv.includes('--dry-run');
    const [cmd, rawArgs = ''] = argv.filter((a) => a !== '--dry-run');
    const c = conf();

    switch (cmd) {
      case 'slack-copy': {
        const link = slack.currentMessageLink('Wavebox');
        if (dryRun) return link;
        app.setTheClipboardTo(link);
        Application('NotePlan').activate();
        ui.notify('Lien copié — Cmd+V pour le coller.');
        return link;
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
        if (noteplan.readNote(c.waitingNote) === null) {
          throw new UserError('La note « ' + c.waitingNote + ' » n’existe pas encore : le premier fe en attente la créera.');
        }
        const url = noteplan.openNoteUrl(c.waitingNote);
        if (!dryRun) app.openLocation(url);
        return url;
      }
      default:
        throw new UserError('Commande inconnue : « ' + cmd + ' » (slack-copy, task, status, waiting-open).');
    }
  });
}
