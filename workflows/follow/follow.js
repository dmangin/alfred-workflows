#!/usr/bin/env osascript -l JavaScript
// Follow — liens et tâches de suivi NotePlan depuis l'onglet actif du navigateur
// (Wavebox) : message Slack survolé, conversation Gmail ou page web.
//   copy                lien de l'onglet actif -> presse-papier  (keyword fec, ⌥⌘,)
//   link                lien de l'onglet actif, renvoyé à Alfred qui le colle  (snippet ::mp)
//   task <args>         tâche de suivi pour l'onglet actif  (keyword fe)
//   status              recherche NotePlan sur l'onglet actif : déjà suivi ?  (keyword fes)
//   resolve             résout ses suivis ouverts et archive le mail  (keyword fer)
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
const { addWorkingDays, frDate, npDate } = require('lib/dates');
const noteplan = require('lib/noteplan');
const { planTask, followTaskLine, findOpenTask, sortWaiting, resolveWaiting, resolveDaily } = require('lib/follow');
const { currentItem } = require('lib/sources/current');
const gmail = require('lib/sources/gmail');

function conf() {
  const days = parseInt(env('gca_conf_waiting_days', '2'), 10);
  const span = (name, def) => {
    const n = parseInt(env(name, String(def)), 10);
    return n >= 0 ? n : def;
  };
  return {
    browser: env('gca_conf_gmail_app', 'Wavebox'),
    waitingNote: env('gca_conf_waiting_note', 'En attente de retour'),
    waitingDays: days >= 0 ? days : 2,
    resolveBefore: span('gca_conf_resolve_days_before', 60),
    resolveAfter: span('gca_conf_resolve_days_after', 30),
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

const confirmDuplicate = (c, dup) => confirm('Déjà en attente' + (dup.created ? ' depuis le ' + dup.created : '') +
  ' dans « ' + c.waitingNote + ' ».', 'Créer quand même');

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

// Notes du jour de J-before à J+after où une tâche ouverte cite `key` :
// [{ title: 'AAAAMMJJ', date, content, count }] (contenu résolu).
function dailyMatches(key, now, before, after) {
  const found = [];
  for (let i = -before; i <= after; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const title = npDate(date);
    const content = noteplan.readNote(title);
    if (!content || !content.includes(key)) continue;
    const r = resolveDaily(content, key, now);
    if (r.count) found.push({ title, date, ...r });
  }
  return found;
}

// Résolution : les suivis ouverts de l'onglet passent cochés, en tête de
// « Terminé » dans la note d'attente, sur place dans les notes du jour
// (J-60 à J+30 par défaut) ; aucun : dialogue pour en créer un déjà résolu dans
// la note d'attente (traçabilité) ou ne rien faire. Puis, sur une conversation
// Gmail portant un libellé (hors boîte de réception), archivage.
function resolve(ui, c, { author, link, key, tab }, dryRun) {
  if (!key) throw new UserError('Rien à résoudre : ouvre une conversation Gmail, survole un message Slack ou ouvre une page.');
  const content = noteplan.readNote(c.waitingNote);
  if (content === null) throw new UserError('La note « ' + c.waitingNote + ' » n’existe pas encore.');
  const now = new Date();
  const mail = !!gmail.threadKey(tab.url());
  let r = resolveWaiting(content, key, now);
  const days = dailyMatches(key, now, c.resolveBefore, c.resolveAfter);
  const total = r.count + days.reduce((n, d) => n + d.count, 0);
  const where = days.length ? ' (dont ' + days.map((d) => d.count + ' le ' + frDate(d.date)).join(', ') + ')' : '';
  if (!total) {
    const line = followTaskLine({ prio: '', action: c.verb, created: now, author, link });
    if (dryRun) return 'aucun suivi ouvert : dialogue, puis' + (mail ? ' archivage +' : '') + ' writeNote\n' +
      resolveWaiting(content, key, now, line).content;
    if (!confirm('Aucun suivi ouvert pour cet onglet, ni dans « ' + c.waitingNote + ' », ni dans les notes du jour (J-' +
      c.resolveBefore + ' à J+' + c.resolveAfter + ').', 'Créer résolu', 'Ne rien faire')) return '';
    r = resolveWaiting(content, key, now, line);
  }
  if (dryRun) {
    return total + ' suivi(s) résolu(s)' + where + (mail ? ' + archivage' : '') +
      (r.count ? '\nwriteNote « ' + c.waitingNote + ' »\n' + r.content : '') +
      days.map((d) => '\nwriteNote ' + d.title + '\n' + d.content).join('');
  }
  if (r.count || !total) noteplan.writeNote(c.waitingNote, r.content);
  days.forEach((d) => noteplan.writeNote(d.title, d.content));
  const done = (total > 1 ? total + ' suivis résolus' : total ? 'Suivi résolu' : 'Suivi créé déjà résolu') + where;
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
        throw new UserError('Commande inconnue : « ' + cmd + ' » (copy, link, task, status, resolve, waiting-open).');
    }
  });
}
