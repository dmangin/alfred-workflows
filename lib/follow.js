// Tâches de suivi NotePlan créées par `fe`, quel que soit l'onglet :
// « <jours> <priorité> <action> », ex. « 2 !!! voir XX ».
'use strict';

const { frDate, isoDate } = require('lib/dates');

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
const citing = (key) => new RegExp(escapeRe(key) + '(?=[)?&#\\s\\]]|$)');
const OPEN = /^\s*[-*+]\s+\[ \]/;

function findOpenTask(content, key) {
  if (!key) return null;
  const cited = citing(key);
  const line = String(content || '').split('\n')
    .find((l) => OPEN.test(l) && cited.test(l));
  if (line === undefined) return null;
  return { created: (line.match(/(\d{2}\/\d{2}\/\d{4}):/) || [])[1] || '' };
}

// --- Note de suivi ------------------------------------------------------------
// Toutes les tâches de fe vont dans une note : sous son titre (« # … », après
// les propriétés « --- »), deux sections triées, « À faire » (actions) puis
// « En attente » (de retour), puis les autres (« Terminé », « Annulé »…), qui
// ne bougent pas. Dans une section triée, une tâche (« - [ ] », « - [x] »… en
// début de ligne) emporte les lignes qui la suivent jusqu'à la tâche suivante
// (sous-lignes, texte) ; ce qui précède la première tâche reste en tête, les
// lignes vides de fin de section restent en fin.
const TODO = 'À faire';
const WAITING = 'En attente';
const SORTED = [TODO, WAITING];
const TASK = /^[-*+]\s+\[[ xX>\-]\]/;
const HEADING = /^#{1,6}\s/;
const headingOf = (name) => new RegExp('^#{1,6}\\s+' + escapeRe(name) + '\\s*$');

// Index de la première ligne après les propriétés et le titre.
function titleEnd(lines) {
  let start = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) start = end + 1;
  }
  return HEADING.test(lines[start] || '') && !/^##/.test(lines[start]) ? start + 1 : start;
}

// Lignes de la section `name` : { start (après son titre), end (titre suivant) },
// null si absente.
function sectionRange(lines, name) {
  const re = headingOf(name);
  const h = lines.findIndex((l, i) => i >= titleEnd(lines) && re.test(l));
  if (h < 0) return null;
  let end = h + 1;
  while (end < lines.length && !HEADING.test(lines[end])) end++;
  return { start: h + 1, end };
}

// Ajoute les sections triées absentes : « À faire » juste sous le titre (ou
// avant « En attente »), « En attente » après « À faire ». Une ancienne note
// sans sections voit ainsi son bloc de tête rangé sous « En attente ».
function ensureSections(lines) {
  const out = lines.slice();
  if (!sectionRange(out, WAITING)) {
    const todo = sectionRange(out, TODO);
    const at = todo ? todo.end : titleEnd(out);
    out.splice(at, 0, '## ' + WAITING);
    if (todo && at > 0 && out[at - 1].trim() !== '') out.splice(at, 0, '');
  }
  if (!sectionRange(out, TODO)) {
    const at = sectionRange(out, WAITING).start - 1;
    out.splice(at, 0, '## ' + TODO, '');
  }
  return out;
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
const BADGED = /^([-*+]\s+\[(.)\]\s+(?:!{1,3}\s+)?(?:\d{2}\/\d{2}\/\d{4}:\s+)?)(?:(?:🔵|🟡|🟠|🔴|⚪️?) )?/u;
function markTask(line, today) {
  return line.replace(BADGED, (all, prefix, state) => {
    const badge = state === ' ' ? dueBadge(taskKey(line).due, today) : '';
    return prefix + (badge ? badge + ' ' : '');
  });
}

// Index de fin du contenu d'un bloc, lignes vides finales exclues.
function contentEnd(block) {
  let tail = block.length;
  while (tail > 0 && block[tail - 1].trim() === '') tail--;
  return tail;
}

// Bloc (lignes d'une section) avec `newLine` (facultative) en tête, trié par
// échéance décroissante (les plus anciennes en bas), à échéance égale par
// création décroissante, sinon ordre d'origine ; tâches sans échéance en
// dernier. Avec `today`, chaque tâche reçoit sa pastille (markTask).
function sortBlock(block, newLine, today) {
  block = block.slice();
  let tail = contentEnd(block);
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
  return head.concat(...items.map((it) => it.lines), block.slice(tail));
}

// Remplace les lignes de chaque section triée par f(bloc, nom), de la dernière
// à la première pour garder les index valides.
function eachSorted(lines, f) {
  let out = lines;
  SORTED.slice().reverse().forEach((name) => {
    const r = sectionRange(out, name);
    out = out.slice(0, r.start).concat(f(out.slice(r.start, r.end), name), out.slice(r.end));
  });
  return out;
}

// Note de suivi rangée : sections triées présentes, `add` ({ section, line },
// facultatif) ajoutée en tête de sa section, sections triées, pastilles à jour
// avec `today`.
function sortFollow(content, { add, today } = {}) {
  const lines = ensureSections(String(content || '').split('\n'));
  return eachSorted(lines, (block, name) => sortBlock(block, add && add.section === name ? add.line : '', today)).join('\n');
}

// --- Résolution (fer) ----------------------------------------------------------
// Les tâches ouvertes des sections triées qui citent `key` sont cochées, datées
// « @done(AAAA-MM-JJ HH:MM) » comme le fait NotePlan, et déplacées avec leurs
// sous-lignes (lignes non vides qui les suivent ; une ligne vide derrière elles
// disparaît, sauf en fin de section) en tête de la section « Terminé », créée
// en fin de note si absente. `newLine` (facultative) : tâche à créer
// directement résolue quand aucune ne cite `key`. La note est ensuite rangée
// (sortFollow). -> { content, count } (count : tâches existantes résolues).
const DONE_HEADING = headingOf('Terminé');
const pad2 = (n) => String(n).padStart(2, '0');
const doneStamp = (now) => '@done(' + isoDate(now) + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ')';
const resolveLine = (line, now) => markTask(line.replace(/^([-*+]\s+)\[ \]/, '$1[x]'), now) + ' ' + doneStamp(now);

function resolveFollow(content, key, now, newLine) {
  const cited = citing(key);
  const done = [];
  const lines = eachSorted(ensureSections(String(content || '').split('\n')), (block) => {
    const tail = contentEnd(block);
    const keep = [], found = [];
    let cur = null;
    block.forEach((l, i) => {
      if (TASK.test(l)) {
        cur = OPEN.test(l) && cited.test(l) ? [resolveLine(l, now)] : null;
        if (cur) found.push(cur);
        else keep.push(l);
      } else if (cur && l.trim() !== '') cur.push(l);
      else if (cur && i < tail) cur = null; // ligne vide qui séparait la tâche partie
      else {
        cur = null;
        keep.push(l);
      }
    });
    done.unshift(...found); // sections parcourues de bas en haut
    return keep;
  });
  const count = done.length;
  if (!count && !newLine) return { content: String(content), count };
  if (!count) done.push([resolveLine(newLine, now)]);
  let h = lines.findIndex((l, i) => i >= titleEnd(lines) && DONE_HEADING.test(l));
  if (h < 0) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', '## Terminé', '');
    h = lines.length - 2;
  }
  lines.splice(h + 1, 0, ...[].concat(...done));
  return { content: sortFollow(lines.join('\n'), { today: now }), count };
}

module.exports = {
  TODO, WAITING, parseFollowArgs, isWaiting, planTask, followTaskLine, findOpenTask,
  dueBadge, markTask, sortBlock, sortFollow, resolveFollow,
};
