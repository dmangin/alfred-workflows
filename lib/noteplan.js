// URL scheme NotePlan : ajout de texte dans une note datée, ou en tête d'une
// note « Inbox » avec la date d'échéance en suffixe « >AAAA-MM-JJ ».
'use strict';

const { isoDate, npDate } = require('lib/dates');

const BASE = 'noteplan://x-callback-url/addText';

// { date, text, inboxNote } : inboxNote renseigné -> mode Inbox.
function addTextUrl({ date, text, inboxNote }) {
  if (inboxNote) {
    return BASE + '?noteTitle=' + encodeURIComponent(inboxNote) + '&openNote=yes&mode=prepend&text=' +
      encodeURIComponent(text + ' >' + isoDate(date));
  }
  return BASE + '?noteDate=' + npDate(date) + '&openNote=yes&text=' + encodeURIComponent(text);
}

module.exports = { addTextUrl };
