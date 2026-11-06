// NotePlan : écritures et recherche par l'URL scheme x-callback-url ; lecture
// d'une note par le dictionnaire AppleScript de l'app (une URL ne renvoie rien),
// en événement Apple adressé au pid de l'app.
'use strict';

ObjC.import('AppKit');

const { app, UserError } = require('lib/alfred');
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

// Code d'événement Apple (4 caractères) -> entier.
const fourCC = (s) => [...s].reduce((n, ch) => n * 256 + ch.charCodeAt(0), 0);

// Pid de l'app NotePlan. L'app Claude lance aussi le binaire de NotePlan en
// serveur MCP (« NotePlan mcp-server »), que macOS enregistre comme une seconde
// app NotePlan : `tell application "NotePlan"` peut alors viser cette instance,
// qui ne répond pas (-600) ou fait planter osascript. Pas de lancement
// automatique : NotePlan refuse une seconde instance.
function notePlanPid() {
  const found = ObjC.unwrap($.NSWorkspace.sharedWorkspace.runningApplications)
    .filter((a) => /^co\.noteplan\.NotePlan/.test(ObjC.unwrap(a.bundleIdentifier) || ''))
    .map((a) => a.processIdentifier);
  // doShellScript sépare les lignes par \r.
  const pid = found.length && app.doShellScript('ps -o pid=,args= -p ' + found.join(','))
    .split(/[\r\n]+/).filter((l) => l.trim() && !/\smcp-server\b/.test(l)).map((l) => parseInt(l, 10))[0];
  if (!pid) throw new UserError('NotePlan n’est pas ouvert : lance-le, puis recommence.');
  return pid;
}

// Contenu de la note `title`, null si elle n'existe pas. Commande readNote du
// dictionnaire de NotePlan, envoyée directement au pid de l'app (voir plus haut).
function readNote(title) {
  const target = $.NSAppleEventDescriptor.descriptorWithProcessIdentifier(notePlanPid());
  const ev = $.NSAppleEventDescriptor.appleEventWithEventClassEventIDTargetDescriptorReturnIDTransactionID(
    fourCC('RdNo'), fourCC('teCC'), target, -1, 0);
  ev.setParamDescriptorForKeyword($.NSAppleEventDescriptor.descriptorWithString(title), fourCC('RNTL'));
  const err = Ref();
  const WAIT_REPLY_CAN_INTERACT = 3 | 0x10;
  const reply = ev.sendEventWithOptionsTimeoutError(WAIT_REPLY_CAN_INTERACT, 15, err);
  const errn = reply.isNil() ? null : reply.paramDescriptorForKeyword(fourCC('errn'));
  if (reply.isNil() || !errn.isNil()) {
    const errs = reply.isNil() ? null : reply.paramDescriptorForKeyword(fourCC('errs'));
    const why = reply.isNil() ? ObjC.unwrap(err[0].localizedDescription)
      : (!errs.isNil() && ObjC.unwrap(errs.stringValue)) || 'erreur ' + errn.int32Value;
    throw new UserError('Lecture de la note « ' + title + ' » impossible : ' + why);
  }
  const res = reply.paramDescriptorForKeyword(fourCC('----'));
  const s = res.isNil() ? undefined : ObjC.unwrap(res.stringValue);
  return s === undefined ? null : s;
}

module.exports = { addTextUrl, prependUrl, addNoteUrl, openNoteUrl, searchUrl, scheduled, readNote };
