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

// Création d'une note avec son premier contenu (addText ignore sans erreur une
// note absente).
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
// automatique : NotePlan refuse une seconde instance. 0 si NotePlan est fermé.
function findPid() {
  const found = ObjC.unwrap($.NSWorkspace.sharedWorkspace.runningApplications)
    .filter((a) => /^co\.noteplan\.NotePlan/.test(ObjC.unwrap(a.bundleIdentifier) || ''))
    .map((a) => a.processIdentifier);
  // doShellScript sépare les lignes par \r.
  const pid = found.length && app.doShellScript('ps -o pid=,args= -p ' + found.join(','))
    .split(/[\r\n]+/).filter((l) => l.trim() && !/\smcp-server\b/.test(l)).map((l) => parseInt(l, 10))[0];
  return pid || 0;
}

const isRunning = () => findPid() > 0;

function notePlanPid() {
  const pid = findPid();
  if (!pid) throw new UserError('NotePlan n’est pas ouvert : lance-le, puis recommence.');
  return pid;
}

// Commande `event` (code de 8 caractères du dictionnaire de NotePlan) envoyée
// directement au pid de l'app (voir plus haut), avec `params` { code: texte } ;
// renvoie le résultat texte (undefined si aucun). `what` sert au message d'erreur.
function send(event, params, what) {
  const target = $.NSAppleEventDescriptor.descriptorWithProcessIdentifier(notePlanPid());
  const ev = $.NSAppleEventDescriptor.appleEventWithEventClassEventIDTargetDescriptorReturnIDTransactionID(
    fourCC(event.slice(0, 4)), fourCC(event.slice(4)), target, -1, 0);
  Object.entries(params).forEach(([code, text]) =>
    ev.setParamDescriptorForKeyword($.NSAppleEventDescriptor.descriptorWithString(text), fourCC(code)));
  const err = Ref();
  const WAIT_REPLY_CAN_INTERACT = 3 | 0x10;
  const reply = ev.sendEventWithOptionsTimeoutError(WAIT_REPLY_CAN_INTERACT, 15, err);
  const errn = reply.isNil() ? null : reply.paramDescriptorForKeyword(fourCC('errn'));
  if (reply.isNil() || !errn.isNil()) {
    const errs = reply.isNil() ? null : reply.paramDescriptorForKeyword(fourCC('errs'));
    const why = reply.isNil() ? ObjC.unwrap(err[0].localizedDescription)
      : (!errs.isNil() && ObjC.unwrap(errs.stringValue)) || 'erreur ' + errn.int32Value;
    throw new UserError(what + ' impossible : ' + why);
  }
  const res = reply.paramDescriptorForKeyword(fourCC('----'));
  return res.isNil() ? undefined : ObjC.unwrap(res.stringValue);
}

// Contenu de la note `title`, null si elle n'existe pas.
function readNote(title) {
  const s = send('RdNoteCC', { RNTL: title }, 'Lecture de la note « ' + title + ' »');
  return s === undefined ? null : s;
}

// Remplace tout le contenu de la note `title` (propriétés et titre compris).
function writeNote(title, content) {
  send('WrNoteCC', { WNTL: title, WNCO: content }, 'Écriture de la note « ' + title + ' »');
}

module.exports = { addTextUrl, addNoteUrl, openNoteUrl, searchUrl, scheduled, isRunning, readNote, writeNote };
