// NotePlan : écritures et recherche par l'URL scheme x-callback-url ; lecture
// d'une note par le dictionnaire AppleScript de l'app (une URL ne renvoie rien).
'use strict';

const { UserError } = require('lib/alfred');
const { isoDate, npDate } = require('lib/dates');

const BASE = 'noteplan://x-callback-url/';

// Ajout en fin de note du jour.
function addTextUrl({ date, text }) {
  return BASE + 'addText?noteDate=' + npDate(date) + '&openNote=yes&text=' + encodeURIComponent(text);
}

// Ajout en tête (sous le titre) d'une note existante : addText ignore sans
// erreur une note absente, que addNoteUrl crée avec le texte.
function prependUrl({ title, text }) {
  return BASE + 'addText?noteTitle=' + encodeURIComponent(title) + '&openNote=yes&mode=prepend&text=' +
    encodeURIComponent(text);
}

function addNoteUrl({ title, text }) {
  return BASE + 'addNote?noteTitle=' + encodeURIComponent(title) + '&openNote=yes&text=' + encodeURIComponent(text);
}

const openNoteUrl = (title) => BASE + 'openNote?noteTitle=' + encodeURIComponent(title);

// Recherche dans toutes les notes, du jour comprises.
const searchUrl = (text) => BASE + 'search?text=' + encodeURIComponent(text);

// « texte >AAAA-MM-JJ » : tâche planifiée, que NotePlan montre dans la note du
// jour de l'échéance.
const scheduled = (text, date) => text + ' >' + isoDate(date);

const quote = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

// Contenu de la note `title`, null si elle n'existe pas. JXA ne sait pas
// appeler le dictionnaire de NotePlan (-1708), d'où NSAppleScript.
function readNote(title) {
  const err = Ref();
  const res = $.NSAppleScript.alloc.initWithSource('tell application "NotePlan" to readNote titled ' + quote(title))
    .executeAndReturnError(err);
  if (res.isNil()) {
    throw new UserError('Lecture de la note « ' + title + ' » impossible : ' +
      (ObjC.deepUnwrap(err[0]) || {}).NSAppleScriptErrorMessage);
  }
  const s = ObjC.unwrap(res.stringValue);
  return s === undefined ? null : s;
}

module.exports = { addTextUrl, prependUrl, addNoteUrl, openNoteUrl, searchUrl, scheduled, quote, readNote };
