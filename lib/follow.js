// Tâches de suivi NotePlan créées par `fe`, quel que soit l'onglet :
// « <jours> <priorité> <action> », ex. « 2 !!! voir XX ».
'use strict';

const { frDate } = require('lib/dates');

// Tout est optionnel. days = null si absent : le délai par défaut dépend du
// type de tâche (voir planTask) ; action = '' si absente.
function parseFollowArgs(s) {
  const m = String(s || '').trim().match(/^(\d*)\s*(!*)\s*(.*)$/);
  return {
    days: m[1] === '' ? null : Number(m[1]),
    prio: m[2],
    action: m[3].trim(),
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tâche « en attente de retour » : action vide ou commençant par le verbe par
// défaut, en mot entier, casse ignorée (« suivre devis » oui, « suivi » non).
function isWaiting(action, verb) {
  return !action || new RegExp('^' + escapeRe(verb) + '(\\s|$)', 'iu').test(action);
}

// Type et échéance d'une tâche. Attente : délai par défaut waitingDays.
// Action : J+0 par défaut, c'est pour aujourd'hui.
function planTask(rawArgs, { verb, waitingDays }) {
  const { days, prio, action } = parseFollowArgs(rawArgs);
  const waiting = isWaiting(action, verb);
  return {
    waiting,
    days: days !== null ? days : waiting ? waitingDays : 0,
    prio,
    action: action || verb,
  };
}

// - [ ] !!! 24/03/2025: Suivre XX [@: titre](https://…)
function followTaskLine({ prio, action, created, author, link }) {
  return ['- [ ]', prio, frDate(created) + ':', action, author, link]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}

// Première tâche ouverte de `content` qui cite `key` (identifiant du mail, du
// message ou URL de la page) : { created: 'jj/mm/aaaa' } (vide si la ligne
// n'en a pas), sinon null. La clé doit être suivie d'une fin d'URL — « ) ? & # »,
// espace — pour que …/a ne trouve pas …/abc ni …/a/b.
function findOpenTask(content, key) {
  if (!key) return null;
  const cited = new RegExp(escapeRe(key) + '(?=[)?&#\\s\\]]|$)');
  const line = String(content || '').split('\n')
    .find((l) => /^\s*[-*+]\s+\[ \]/.test(l) && cited.test(l));
  if (line === undefined) return null;
  return { created: (line.match(/(\d{2}\/\d{2}\/\d{4}):/) || [])[1] || '' };
}

module.exports = { parseFollowArgs, isWaiting, planTask, followTaskLine, findOpenTask };
