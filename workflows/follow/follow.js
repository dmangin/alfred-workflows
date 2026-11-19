#!/usr/bin/env osascript -l JavaScript
// Follow — liens et tâches de suivi NotePlan depuis l'onglet actif du navigateur
// (Wavebox) : message Slack survolé, conversation Gmail ou page web.
//   copy                lien de l'onglet actif -> presse-papier  (keyword fel, ⌥⌘,)
//   link                lien de l'onglet actif, renvoyé à Alfred qui le colle  (snippet ::mp)
//   task <args>         tâche de suivi pour l'onglet actif  (keyword fe)
//   status              recherche NotePlan sur l'onglet actif : déjà suivi ?  (keyword fe?)
//   resolve [libellé]   résout ses suivis ouverts et archive le mail  (keyword fex)
//   cancel [libellé]    annule ses suivis ouverts et archive le mail  (keyword fe-)
//   open                range la note de suivi et l'ouvre  (keyword feg, Hyper+A)
// <args> = « <jours ouvrés> <priorité> <action> », tout optionnel : « 2 !!! voir XX ».
// Toutes les tâches vont dans la note de suivi (« Suivi »), rangées par tranche
// d'échéance et priorité, pastilles 🔴🟠🟣🟡🔵⚪ et récapitulatif à jour : action vide
// ou commençant par le verbe par défaut (« Suivre ») dans la section
// « En attente », toute autre dans « À faire ».
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
const { TODO, WAITING, parseFollowArgs, planTask, followTaskLine, sortFollow, closeFollow, completeFollow } = require('lib/follow');
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

// Dans la note de suivi (créée si absente), section « En attente » ou « À
// faire », avec l'échéance « >AAAA-MM-JJ », à sa place dans l'ordre des
// échéances (la note est réécrite rangée). Message déjà suivi : on propose de
// compléter sa tâche (completeFollow : sous-ligne datée, échéance, priorité)
// ou de ne rien faire.
function addTask(ui, c, { rawArgs, author, link, key }, dryRun) {
  const now = new Date();
  const content = noteplan.readNote(c.note);
  const typed = parseFollowArgs(rawArgs);
  const more = content !== null &&
    completeFollow(content, key, { text: typed.action, prio: typed.prio, days: typed.days, waitingDays: c.waitingDays, now });
  if (more) return completeTask(ui, c, more, dryRun);
  const { waiting, days, prio, action } = planTask(rawArgs, { verb: c.verb, waitingDays: c.waitingDays });
  const due = addWorkingDays(now, days);
  const add = { section: waiting ? WAITING : TODO, line: noteplan.scheduled(followTaskLine({ prio, action, created: now, author, link }), due) };
  const message = 'Tâche ajoutée à « ' + c.note + ' » (' + add.section + '), échéance ' + frDate(due) + '.';
  let url;
  if (content === null) {
    url = noteplan.addNoteUrl({ title: c.note, text: sortFollow('', { add, today: now }) });
    if (dryRun) return url;
  } else {
    url = noteplan.openNoteUrl(c.note);
    const sorted = sortFollow(content, { add, today: now });
    if (dryRun) return 'writeNote « ' + c.note + ' » + ' + url + '\n' + sorted;
    noteplan.writeNote(c.note, sorted);
  }
  app.openLocation(url);
  ui.notify(message);
  return url;
}

// Complément d'un suivi existant, après confirmation.
function completeTask(ui, c, more, dryRun) {
  const url = noteplan.openNoteUrl(c.note);
  const where = (more.section ? ' (' + more.section + ')' : '') + ', échéance ' + frDate(more.due);
  if (dryRun) return 'déjà suivi' + (more.created ? ' depuis le ' + more.created : '') + ' : dialogue Compléter, puis writeNote + ' + url + '\n' + more.content;
  if (!confirm('Déjà suivi' + (more.created ? ' depuis le ' + more.created : '') + ' dans « ' + c.note + ' ».\n\n' +
    'Compléter la tâche' + where + ' ?', 'Compléter', 'Ne rien faire')) return '';
  noteplan.writeNote(c.note, more.content);
  app.openLocation(url);
  ui.notify('Suivi complété dans « ' + c.note + ' »' + where + '.');
  return url;
}

// Fermeture, résolution (fex) ou annulation (fe-) : les suivis ouverts de
// l'onglet passent cochés en tête de « Terminé » ou annulés en tête
// d'« Annulé », le libellé saisi (facultatif) en entrée datée de la plus
// récente ; aucun : dialogue pour en créer un déjà fermé (traçabilité) ou ne
// rien faire. Puis, sur une conversation Gmail portant un libellé à soi,
// archivage.
function close(ui, c, { author, link, key, tab }, text, cancel, dryRun) {
  const [verb, done1, doneN, created] = cancel
    ? ['annuler', 'Suivi annulé', ' suivis annulés', 'Suivi créé déjà annulé']
    : ['résoudre', 'Suivi résolu', ' suivis résolus', 'Suivi créé déjà résolu'];
  if (!key) throw new UserError('Rien à ' + verb + ' : ouvre une conversation Gmail, survole un message Slack ou ouvre une page.');
  const content = noteplan.readNote(c.note);
  if (content === null) throw new UserError('La note « ' + c.note + ' » n’existe pas encore.');
  const now = new Date();
  const mail = !!gmail.threadKey(tab.url());
  let r = closeFollow(content, key, now, { cancel, text });
  if (!r.count) {
    const newLine = followTaskLine({ prio: '', action: c.verb, created: now, author, link });
    const createClosed = () => closeFollow(content, key, now, { cancel, text, newLine });
    if (dryRun) return 'aucun suivi ouvert : dialogue, puis' + (mail ? ' archivage +' : '') + ' writeNote\n' + createClosed().content;
    if (!confirm('Aucun suivi ouvert pour cet onglet dans « ' + c.note + ' ».', cancel ? 'Créer annulé' : 'Créer résolu', 'Ne rien faire')) return '';
    r = createClosed();
  }
  if (dryRun) return r.count + (cancel ? ' suivi(s) annulé(s)' : ' suivi(s) résolu(s)') + (mail ? ' + archivage' : '') + ' : writeNote\n' + r.content;
  noteplan.writeNote(c.note, r.content);
  const done = r.count > 1 ? r.count + doneN : r.count ? done1 : created;
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
      case 'cancel':
        return close(ui, c, currentItem(c.browser, c.aliases), rawArgs, cmd === 'cancel', dryRun);
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
        throw new UserError('Commande inconnue : « ' + cmd + ' » (copy, link, task, status, resolve, cancel, open).');
    }
  });
}
