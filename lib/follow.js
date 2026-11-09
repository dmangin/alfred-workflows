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

// --- Tri de la note d'attente -----------------------------------------------
// Bloc trié : du titre (« # … », après les propriétés « --- ») au titre suivant
// (« ## Terminé »…) ; les sections d'archive ne bougent pas. Une tâche (« - [ ] »,
// « - [x] »… en début de ligne) emporte les lignes qui la suivent jusqu'à la
// tâche suivante (sous-lignes, texte) ; ce qui précède la première tâche reste
// en tête, les lignes vides de fin de bloc restent en fin.
const TASK = /^[-*+]\s+\[[ xX>\-]\]/;
const HEADING = /^#{1,6}\s/;

function blockBounds(lines) {
  let start = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) start = end + 1;
  }
  if (HEADING.test(lines[start] || '')) start++;
  let end = start;
  while (end < lines.length && !HEADING.test(lines[end])) end++;
  return { start, end };
}

// Clé de tri : échéance (dernière « >AAAA-MM-JJ » de la ligne, '' si aucune) puis
// date de création « jj/mm/aaaa: » remise en AAAA-MM-JJ.
function taskKey(line) {
  const due = (line.match(/>(\d{4}-\d{2}-\d{2})(?!.*>\d{4}-\d{2}-\d{2})/) || [])[1] || '';
  const c = line.match(/(\d{2})\/(\d{2})\/(\d{4}):/);
  return { due, created: c ? c[3] + '-' + c[2] + '-' + c[1] : '' };
}

// Pastille d'une tâche ouverte selon son échéance, en jours calendaires depuis
// `today` : 🔵 au-delà de J+7, 🟡 d'aujourd'hui à J+7, 🟠 en retard de 1 à 7
// jours, 🔴 au-delà ; ⚪ sans échéance (NotePlan ne la remontera jamais).
function dueBadge(due, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due || '');
  if (!m) return '⚪';
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((new Date(+m[1], m[2] - 1, +m[3]) - t) / 864e5);
  return days > 7 ? '🔵' : days >= 0 ? '🟡' : days >= -7 ? '🟠' : '🔴';
}

// Ligne de tâche avec sa pastille à jour, placée après la case, la priorité et
// la date de création (« - [ ] !!! 28/10/2026: 🔴 Suivre … ») ; retirée d'une
// tâche cochée ou annulée.
const BADGED = /^([-*+]\s+\[(.)\]\s+(?:!{1,3}\s+)?(?:\d{2}\/\d{2}\/\d{4}:\s+)?)(?:(?:🔵|🟡|🟠|🔴|⚪\uFE0F?) )?/u;
function markTask(line, today) {
  return line.replace(BADGED, (all, prefix, state) => {
    const badge = state === ' ' ? dueBadge(taskKey(line).due, today) : '';
    return prefix + (badge ? badge + ' ' : '');
  });
}

// Contenu de la note avec `newLine` (facultative) en tête du bloc, puis le bloc
// trié par échéance décroissante (les plus anciennes en bas), à échéance égale
// par création décroissante, sinon ordre d'origine ; tâches sans échéance en
// dernier. Avec `today`, chaque tâche du bloc reçoit sa pastille (markTask).
function sortWaiting(content, newLine, today) {
  const lines = String(content).split('\n');
  const { start, end } = blockBounds(lines);
  const block = lines.slice(start, end);
  let tail = block.length;
  while (tail > 0 && block[tail - 1].trim() === '') tail--;
  if (newLine) {
    const first = block.findIndex((l) => TASK.test(l));
    block.splice(first < 0 ? tail : first, 0, newLine);
    tail++;
  }
  const head = [], items = [];
  block.slice(0, tail).forEach((l) => {
    if (TASK.test(l)) items.push({ lines: [today ? markTask(l, today) : l], key: taskKey(l), i: items.length });
    else if (items.length) items[items.length - 1].lines.push(l);
    else head.push(l);
  });
  const desc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
  items.sort((a, b) =>
    (!a.key.due - !b.key.due) || desc(a.key.due, b.key.due) || desc(a.key.created, b.key.created) || a.i - b.i);
  const sorted = head.concat(...items.map((it) => it.lines), block.slice(tail));
  return lines.slice(0, start).concat(sorted, lines.slice(end)).join('\n');
}

module.exports = { parseFollowArgs, isWaiting, planTask, followTaskLine, findOpenTask, dueBadge, markTask, sortWaiting };
