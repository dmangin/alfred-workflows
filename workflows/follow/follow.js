#!/usr/bin/env osascript -l JavaScript
// Follow — liens et tâches de suivi NotePlan depuis Slack et Gmail (Wavebox).
//   slack-copy          lien du message Slack survolé -> presse-papier + active NotePlan
//   slack-task <args>   tâche de suivi pour ce message  (keyword fs)
//   mail-task <args>    tâche de suivi pour le mail/l'onglet courant (keyword fe, ⌥⇧T)
// <args> = « <jours ouvrés> <priorité> <action> », tout optionnel : « 2 !!! voir XX ».
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
const { addTextUrl } = require('lib/noteplan');
const { parseFollowArgs, followTaskLine } = require('lib/follow');
const gmail = require('lib/sources/gmail');
const slack = require('lib/sources/slack');

function conf() {
  return {
    mailBrowser: env('gca_conf_gmail_app', 'Wavebox'),
    modeToday: env('gca_conf_mode_today', '1') === '1',
    inboxNote: env('gca_conf_inbox_note', '📥 Inbox'),
  };
}

function addTask(ui, c, rawArgs, recipients, link, dryRun) {
  const { days, prio, action } = parseFollowArgs(rawArgs);
  const now = new Date();
  const due = addWorkingDays(now, days);
  const text = followTaskLine({ prio, action, created: now, recipients, link });
  const url = addTextUrl({ date: due, text, inboxNote: c.modeToday ? '' : c.inboxNote });
  if (dryRun) return url;
  app.openLocation(url);
  ui.notify(c.modeToday
    ? 'Tâche ajoutée à la note du ' + frDate(due) + '.'
    : 'Tâche ajoutée à « ' + c.inboxNote + ' », échéance ' + frDate(due) + '.');
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
      case 'slack-task':
        return addTask(ui, c, rawArgs, '', slack.currentMessageLink('Wavebox'), dryRun);
      case 'mail-task': {
        const { recipients, link } = gmail.currentTab(c.mailBrowser);
        return addTask(ui, c, rawArgs, recipients, link, dryRun);
      }
      default:
        throw new UserError('Commande inconnue : « ' + cmd + ' » (slack-copy, slack-task, mail-task).');
    }
  });
}
