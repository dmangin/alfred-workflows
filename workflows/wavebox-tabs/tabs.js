#!/usr/bin/env osascript -l JavaScript
// Wavebox Tabs — met au premier plan l'onglet d'un service (ou l'onglet suivant
// du même service s'il l'est déjà), ou active NotePlan.
//   tabs.js <gmail|slack|whatsapp|calendar|noteplan>
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

const { env, main, UserError } = require('lib/alfred');
const wavebox = require('lib/wavebox');

// Le titre départage plusieurs comptes : adresse Gmail et nom de l'espace
// Slack viennent de la configuration du workflow (vides = premier onglet).
const TABS = () => ({
  gmail: { url: 'https://mail.google.com/', title: env('gca_conf_gmail_account', '') },
  slack: { url: 'https://app.slack.com/', title: env('gca_conf_slack_workspace', '') },
  whatsapp: { url: 'https://web.whatsapp.com/', title: 'WhatsApp' },
  calendar: { url: 'https://calendar.google.com/', title: 'Agenda' },
});

function run(argv) {
  return main('Wavebox Tabs', () => {
    const target = argv[0];
    if (target === 'noteplan') {
      Application('NotePlan').activate();
      return 'noteplan activated';
    }
    const spec = TABS()[target];
    if (!spec) throw new UserError('Cible inconnue : « ' + target + ' ».');
    if (!wavebox.focusTab(wavebox.browser('Wavebox'), spec)) {
      throw new UserError('Aucun onglet ' + target + ' ouvert dans Wavebox.');
    }
    return target + ' activated';
  });
}
