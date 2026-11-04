#!/usr/bin/env osascript -l JavaScript
// Paste — texte renvoyé à Alfred, qui le copie et le colle dans l'app active.
//   date [N]    date AAAA-MM-JJ à J+N jours ouvrés ; N absent -> variable Alfred numdays  (sdn, sdNd)
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
const { addWorkingDays, isoDate } = require('lib/dates');

function run(argv) {
  return main('Paste', () => {
    const [cmd, arg] = argv;
    switch (cmd) {
      case 'date':
        return isoDate(addWorkingDays(new Date(), arg !== undefined ? arg : env('numdays', '0')));
      default:
        throw new UserError('Commande inconnue : « ' + cmd + ' » (date).');
    }
  });
}
