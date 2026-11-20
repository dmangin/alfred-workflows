// Tâches de suivi NotePlan créées par `fe`, quel que soit l'onglet :
// « <jours> <priorité> <action> », ex. « 2 !!! voir XX ».
'use strict';

const { addWorkingDays, frDate, isoDate } = require('lib/dates');

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

// Tâche ouverte de `content` qui cite `key` (identifiant du mail, du message ou
// URL de la page), la plus récemment créée s'il y en a plusieurs (la première
// à date égale) : { created: 'jj/mm/aaaa' (vide si la ligne n'en a pas),
// index (de sa ligne) }, sinon null. La clé doit être suivie d'une fin d'URL —
// « ) ? & # », espace — pour que …/a ne trouve pas …/abc ni …/a/b.
const citing = (key) => new RegExp(escapeRe(key) + '(?=[)?&#\\s\\]]|$)');
const OPEN = /^\s*[-*+]\s+\[ \]/;
const CREATED = /(\d{2})\/(\d{2})\/(\d{4}):/;
const createdIso = (line) => {
  const c = CREATED.exec(line);
  return c ? c[3] + '-' + c[2] + '-' + c[1] : '';
};

// Index de la plus récemment créée des lignes `indexes` de `lines` (la
// première à date égale), -1 si aucune.
const latest = (lines, indexes) =>
  indexes.reduce((best, i) => (best < 0 || createdIso(lines[i]) > createdIso(lines[best]) ? i : best), -1);

function findOpenTask(content, key) {
  if (!key) return null;
  const cited = citing(key);
  const lines = String(content || '').split('\n');
  const index = latest(lines, lines.map((l, i) => (OPEN.test(l) && cited.test(l) ? i : -1)).filter((i) => i >= 0));
  return index < 0 ? null : { created: (CREATED.exec(lines[index]) || [''])[0].slice(0, -1), index };
}

// --- Note de suivi ------------------------------------------------------------
// Toutes les tâches de fe vont dans une note : sous son titre (« # … », après
// les propriétés « --- »), un récapitulatif, puis deux sections rangées,
// « À faire » (actions) et « En attente » (de retour), puis les autres
// (« Terminé », « Annulé »…), qui ne bougent pas. Une section va de son titre
// au titre suivant de même niveau ou plus haut : ses sous-sections « ### » en
// font partie. Dans une section rangée, une tâche (« - [ ] », « - [x] »… en
// début de ligne) emporte les lignes qui la suivent jusqu'à la tâche suivante
// (sous-lignes, texte) ; ce qui précède la première tâche reste en tête, les
// lignes vides de fin de section restent en fin.
const TODO = 'À faire';
const WAITING = 'En attente';
const DONE = 'Terminé';
const CANCELLED = 'Annulé';
const SORTED = [TODO, WAITING];
const TASK = /^[-*+]\s+\[[ xX>\-]\]/;
const HEADING = /^(#{1,6})\s/;
const level = (l) => (HEADING.exec(l) || ['', ''])[1].length;
const headingOf = (name) => new RegExp('^#{1,6}\\s+' + escapeRe(name) + '\\s*$');

// Index de la première ligne après les propriétés et le titre.
function titleEnd(lines) {
  let start = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) start = end + 1;
  }
  return level(lines[start] || '') === 1 ? start + 1 : start;
}

// Lignes de la section `name` : { start (après son titre), end (titre suivant
// de même niveau ou plus haut) }, null si absente.
function sectionRange(lines, name) {
  const re = headingOf(name);
  const from = titleEnd(lines);
  const h = lines.findIndex((l, i) => i >= from && re.test(l));
  if (h < 0) return null;
  const lv = level(lines[h]);
  let end = h + 1;
  while (end < lines.length && !(level(lines[end]) && level(lines[end]) <= lv)) end++;
  return { start: h + 1, end };
}

// Ajoute les sections rangées absentes : « À faire » juste sous le titre (ou
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

// Échéance : « >AAAA-MM-JJ » ou « >today », la date spéciale de NotePlan qui
// remonte la tâche chaque jour jusqu'à ce qu'elle soit fermée.
const DUE_MARK = />(\d{4}-\d{2}-\d{2}|today)(?![\w-])/;
const LAST_DUE = new RegExp(DUE_MARK.source + '(?![\\s\\S]*' + DUE_MARK.source + ')');

// Échéance (dernière de la ligne en AAAA-MM-JJ, « >today » valant `today`, ''
// si aucune), date de création « jj/mm/aaaa: » remise en AAAA-MM-JJ ('' si
// aucune) et priorité (nombre de « ! » après la case, 0 à 3).
function taskKey(line, today = new Date()) {
  const d = (line.match(LAST_DUE) || [])[1] || '';
  const due = d === 'today' ? isoDate(today) : d;
  const c = line.match(/(\d{2})\/(\d{2})\/(\d{4}):/);
  const prio = (line.match(/^[-*+]\s+\[.\]\s+(!{1,3})(?=\s)/) || ['', ''])[1].length;
  return { due, created: c ? c[3] + '-' + c[2] + '-' + c[1] : '', prio };
}

// Jours calendaires de `today` à l'échéance `due` (négatif en retard), null
// sans échéance.
function dueDays(due, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due || '');
  if (!m) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((new Date(+m[1], m[2] - 1, +m[3]) - t) / 864e5);
}

// Tranches d'échéance, de la plus urgente à la moins urgente : sous-sections
// des sections rangées et nombres du récapitulatif.
const BUCKETS = [
  { badge: '🔴', label: 'retard > 7 j', has: (d) => d < -7 },
  { badge: '🟠', label: 'retard ≤ 7 j', has: (d) => d < 0 },
  { badge: '🟣', label: 'aujourd\'hui', has: (d) => d === 0 },
  { badge: '🟡', label: '7 prochains jours', has: (d) => d <= 7 },
  { badge: '🔵', label: 'plus tard', has: () => true },
  { badge: '⚪', label: 'sans échéance', has: () => true },
];
const bucketOf = (days) => (days === null ? BUCKETS.length - 1 : BUCKETS.findIndex((b) => b.has(days)));
// Titre de sous-section, unique dans la note pour que les liens du récapitulatif
// mènent au bon endroit : « 🔴 À faire · retard > 7 j ».
const bucketTitle = (section, b) => b.badge + ' ' + section + ' · ' + b.label;
const BADGES = '🔴|🟠|🟣|🟡|🔵|⚪';
const BUCKET_HEADING = new RegExp('^#{2,6}\\s+(?:' + BADGES + ')\\uFE0F?\\s+(?:' +
  SORTED.map(escapeRe).join('|') + ')\\s+·\\s', 'u');

// Pastille d'une tâche ouverte selon son échéance : 🔵 au-delà de J+7, 🟡 de
// J+1 à J+7, 🟣 aujourd'hui, 🟠 en retard de 1 à 7 jours, 🔴 au-delà ; ⚪ sans
// échéance (NotePlan ne la remontera jamais).
const dueBadge = (due, today) => BUCKETS[bucketOf(dueDays(due, today))].badge;

// Ligne de tâche avec sa pastille à jour, placée après la case, la priorité et
// la date de création (« - [ ] !!! 28/10/2026: 🔴 Suivre … ») ; retirée d'une
// tâche cochée ou annulée.
const BADGED = /^([-*+]\s+\[(.)\]\s+(?:!{1,3}\s+)?(?:\d{2}\/\d{2}\/\d{4}:\s+)?)(?:(?:🔵|🟡|🟣|🟠|🔴|⚪️?) )?/u;
function markTask(line, today) {
  return line.replace(BADGED, (all, prefix, state) => {
    const badge = state === ' ' ? dueBadge(taskKey(line, today).due, today) : '';
    return prefix + (badge ? badge + ' ' : '');
  });
}

// Index de fin du contenu d'un bloc, lignes vides finales exclues.
function contentEnd(block) {
  let tail = block.length;
  while (tail > 0 && block[tail - 1].trim() === '') tail--;
  return tail;
}

// Section rangée `name` (ses lignes, sans son titre), `newLine` (facultative)
// ajoutée. Les tâches cochées ou annulées en sortent : `closed`, [{ state,
// lines }] dans l'ordre de la note. Les autres, pastille à jour, vont dans la
// sous-section « ### » de leur tranche d'échéance (tranches vides omises,
// anciennes sous-sections refaites, une ligne vide avant chacune sauf juste
// sous le titre de la section) : la plus prioritaire (« !!! ») d'abord,
// puis l'échéance la plus ancienne, puis la création la plus ancienne, sinon
// l'ordre d'origine. Les lignes vides qui terminaient une tâche disparaissent.
// -> { lines, closed, counts (tâches par tranche) }
function arrangeSection(block, name, today, newLine) {
  block = block.filter((l) => !BUCKET_HEADING.test(l));
  let tail = contentEnd(block);
  if (newLine) {
    block.splice(tail, 0, newLine);
    tail++;
  }
  const head = [], items = [];
  block.slice(0, tail).forEach((l) => {
    if (TASK.test(l)) {
      const key = taskKey(l, today);
      items.push({ lines: [markTask(l, today)], state: l.match(/\[(.)\]/)[1], key, bucket: bucketOf(dueDays(key.due, today)) });
    } else if (items.length) items[items.length - 1].lines.push(l);
    else head.push(l);
  });
  items.forEach((it) => it.lines.splice(contentEnd(it.lines)));
  const closed = items.filter((it) => /[xX-]/.test(it.state));
  const open = items.filter((it) => !closed.includes(it)).map((it, i) => Object.assign(it, { i }));
  const asc = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  open.sort((a, b) => a.bucket - b.bucket || b.key.prio - a.key.prio ||
    asc(a.key.due, b.key.due) || asc(a.key.created, b.key.created) || a.i - b.i);
  const counts = BUCKETS.map(() => 0);
  const lines = head.slice();
  open.forEach((it, i) => {
    if (!i || open[i - 1].bucket !== it.bucket) {
      if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
      lines.push('### ' + bucketTitle(name, BUCKETS[it.bucket]));
    }
    counts[it.bucket]++;
    lines.push(...it.lines);
  });
  return { lines: lines.concat(block.slice(tail)), closed, counts };
}

// Remplace les lignes de chaque section rangée par f(bloc, nom), de la dernière
// à la première pour garder les index valides.
function eachSorted(lines, f) {
  let out = lines;
  SORTED.slice().reverse().forEach((name) => {
    const r = sectionRange(out, name);
    out = out.slice(0, r.start).concat(f(out.slice(r.start, r.end), name), out.slice(r.end));
  });
  return out;
}

// `items` (listes de lignes) en tête de la section `name`, créée en fin de note
// si absente.
function prependTo(lines, name, items) {
  if (!items.length) return lines;
  const out = lines.slice();
  let r = sectionRange(out, name);
  if (!r) {
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    out.push('', '## ' + name, '');
    r = { start: out.length - 1 };
  }
  out.splice(r.start, 0, ...[].concat(...items));
  return out;
}

// Récapitulatif : un tableau de deux lignes, une par section rangée,
// « À faire (12) » puis une cellule par tranche : sa pastille et son nombre de
// tâches, lié à sa sous-section (« [ 12 ](…) », lien NotePlan vers « titre de
// la note#titre de sous-section ») quand la note a un titre, « — » si vide.
// La première ligne sert d'en-tête (NotePlan la rend comme les autres). La
// légende des pastilles suit, collée au tableau (NotePlan l'en sépare quand
// même). La ligne de séparation porte la largeur des colonnes (nombre de
// tirets), que NotePlan réécrit quand on redimensionne le tableau : celle déjà
// dans la note est gardée.
const LEGEND = BUCKETS.map((b) => b.badge + ' ' + b.label).join(' · ');
const row = (cells) => '| ' + cells.join(' | ') + ' |';
const DEFAULT_RULE = row(['-'.repeat(13)].concat(BUCKETS.map(() => '-'.repeat(11))));
const RULE = /^\|(?:\s*:?-+:?\s*\|)+\s*$/;
const isRule = (l) => RULE.test(l) && l.split('|').length - 2 === BUCKETS.length + 1;
const TABLE_START = '| ' + SORTED[0] + ' (';
// Formes précédentes, retirées : lignes « **À faire** (12) : … » et tableau
// « | Échéance | … ».
const OLD_LINE = new RegExp('^\\*\\*(?:' + SORTED.map(escapeRe).join('|') + ')\\*\\* \\(\\d+\\) :');
const OLD_TABLE = '| Échéance |';
function summaryLines(title, counts, rule) {
  const link = (text, heading) => (title
    ? '[ ' + text + ' ](noteplan://x-callback-url/openNote?noteTitle=' + encodeURIComponent(title + '#' + heading) + ')'
    : text);
  const rows = SORTED.map((name) => row([name + ' (' + counts[name].reduce((a, n) => a + n, 0) + ')'].concat(
    BUCKETS.map((b, k) => b.badge + ' ' + (counts[name][k] ? link(String(counts[name][k]), bucketTitle(name, b)) : '—')))));
  return [rows[0], rule].concat(rows.slice(1), LEGEND);
}

// Le récapitulatif à la fin du bloc entre le titre et « À faire » (après ce que
// tu y as mis), entre deux lignes vides (pas avant en tout début de note) ;
// l'ancien, où qu'il soit dans ce bloc, est retiré.
function withSummary(lines, counts) {
  const from = titleEnd(lines);
  const h = sectionRange(lines, TODO).start - 1;
  let rule = DEFAULT_RULE;
  let inTable = false;
  const intro = lines.slice(from, h).filter((l) => {
    inTable = l.startsWith(TABLE_START) || l.startsWith(OLD_TABLE) || (inTable && l.startsWith('|'));
    if (inTable && isRule(l)) rule = l;
    return !inTable && !OLD_LINE.test(l) && l !== LEGEND;
  });
  intro.splice(contentEnd(intro));
  const title = from > 0 && level(lines[from - 1]) === 1 ? lines[from - 1].replace(/^#\s+/, '').trim() : '';
  const block = (intro.length || from > 0 ? intro.concat('') : []).concat(summaryLines(title, counts, rule), '');
  return lines.slice(0, from).concat(block, lines.slice(h));
}

// Note de suivi rangée (`today` : date du jour, maintenant par défaut) :
// sections rangées présentes et découpées en tranches d'échéance (voir
// arrangeSection), `add` ({ section, line }, facultatif) ajoutée à sa section,
// tâches cochées ou annulées de ces sections déplacées en tête de « Terminé »
// ou d'« Annulé » (créées en fin de note si absentes), récapitulatif à jour
// sous le titre. Partout ailleurs, une tâche cochée ou annulée perd sa
// pastille (restée si NotePlan l'a archivée avant un rangement) ; les tâches
// ouvertes hors sections rangées ne bougent pas.
const isClosed = (l) => TASK.test(l) && !/^[-*+]\s+\[ \]/.test(l);
function sortFollow(content, { add, today = new Date() } = {}) {
  const counts = {};
  let closed = [];
  let lines = ensureSections(String(content || '').split('\n'))
    .map((l) => (isClosed(l) ? markTask(l, today) : l));
  lines = eachSorted(lines, (block, name) => {
    const r = arrangeSection(block, name, today, add && add.section === name ? add.line : '');
    counts[name] = r.counts;
    closed = r.closed.concat(closed); // sections parcourues de bas en haut
    return r.lines;
  });
  const cancelled = closed.filter((it) => it.state === '-');
  lines = prependTo(lines, DONE, closed.filter((it) => !cancelled.includes(it)).map((it) => it.lines));
  lines = prependTo(lines, CANCELLED, cancelled.map((it) => it.lines));
  return withSummary(lines, counts).join('\n');
}

// --- Historique d'une tâche ----------------------------------------------------
// Entrée datée « jj/mm/aaaa: <text> » ajoutée à la tâche de la ligne `i` de
// `lines` (modifiées sur place) : à la suite de sa dernière sous-ligne si c'est
// une citation « > », après un retour à la ligne doux (U+2028, Maj+Entrée dans
// NotePlan : un seul bloc), sinon dans une nouvelle sous-ligne « \t> » après
// les existantes. Sous-lignes : lignes non vides qui la suivent, plus indentées
// qu'elle, ou pour une tâche en début de ligne jusqu'à la tâche ou au titre
// suivant.
const lead = (l) => l.match(/^[ \t]*/)[0].length;
const SOFT_BREAK = ' ';
function addEntry(lines, i, text, now) {
  const indent = lead(lines[i]);
  const attached = (l) => l.trim() !== '' && !level(l) && (indent ? lead(l) > indent : !TASK.test(l));
  let end = i + 1;
  while (end < lines.length && attached(lines[end])) end++;
  const entry = frDate(now) + ': ' + text;
  if (end > i + 1 && /^\s*>/.test(lines[end - 1])) lines[end - 1] += SOFT_BREAK + entry;
  else lines.splice(end, 0, lines[i].match(/^[ \t]*/)[0] + '\t> ' + entry);
}

// --- Fermeture (fex : résolue, fe- : annulée) -----------------------------------
// Les tâches ouvertes des sections rangées qui citent `key` sont cochées
// (« [x] », datées « @done(AAAA-MM-JJ HH:MM) » comme le fait NotePlan) ou, avec
// `cancel`, annulées (« [-] ») ; `text` (facultatif) devient une entrée datée
// (addEntry) de la plus récente. Le rangement (sortFollow) les déplace avec
// leurs sous-lignes en tête de « Terminé » ou d'« Annulé ». `newLine`
// (facultative) : tâche à créer directement fermée, avec l'entrée, quand
// aucune ne cite `key`. -> { content, count } (count : tâches existantes
// fermées).
const pad2 = (n) => String(n).padStart(2, '0');
const doneStamp = (now) => '@done(' + isoDate(now) + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ')';
const closeLine = (line, now, cancel) =>
  markTask(line.replace(/^([-*+]\s+)\[ \]/, cancel ? '$1[-]' : '$1[x]'), now) + (cancel ? '' : ' ' + doneStamp(now));

function closeFollow(content, key, now, { cancel = false, text = '', newLine = '' } = {}) {
  const cited = citing(key);
  const lines = ensureSections(String(content || '').split('\n'));
  const found = [];
  SORTED.forEach((name) => {
    const r = sectionRange(lines, name);
    for (let i = r.start; i < r.end; i++) if (TASK.test(lines[i]) && OPEN.test(lines[i]) && cited.test(lines[i])) found.push(i);
  });
  const count = found.length;
  if (!count && !newLine) return { content: String(content), count };
  if (!count) {
    const r = sectionRange(lines, TODO);
    const at = r.start + contentEnd(lines.slice(r.start, r.end));
    lines.splice(at, 0, newLine);
    found.push(at);
  }
  const target = latest(lines, found);
  found.forEach((i) => { lines[i] = closeLine(lines[i], now, cancel); });
  if (String(text || '').trim()) addEntry(lines, target, String(text).trim(), now);
  return { content: sortFollow(lines.join('\n'), { today: now }), count };
}

// --- Complément (fe sur un message déjà suivi) --------------------------------
// La tâche ouverte qui cite `key` (findOpenTask) reçoit l'entrée datée `text`
// (« relance » si vide, voir addEntry), sa priorité remplacée par `prio` si
// donnée, et une échéance « >AAAA-MM-JJ » à `days` jours ouvrés de `now` (la
// dernière de la ligne remplacée, ajoutée s'il n'y en a pas) ; sans `days`, le
// délai dépend de sa section : `waitingDays` sous « En attente », aujourd'hui
// ailleurs. La tâche ne change pas de section ; la note est ensuite rangée
// (sortFollow). -> { content, created, section, due } ou null si aucune tâche
// ne cite `key`.
function completeFollow(content, key, { text, prio, days, waitingDays, now }) {
  const found = findOpenTask(content, key);
  if (!found) return null;
  const lines = String(content).split('\n');
  const i = found.index;
  let h = i;
  while (h >= 0 && level(lines[h]) !== 2 && level(lines[h]) !== 1) h--;
  const section = h >= 0 && level(lines[h]) === 2 ? lines[h].replace(/^##\s+/, '').trim() : '';
  const due = addWorkingDays(now, days !== null && days !== undefined ? days : section === WAITING ? waitingDays : 0);
  let line = lines[i];
  if (prio) line = line.replace(/^(\s*[-*+]\s+\[ \]\s+)(?:!{1,3}\s+)?/, '$1' + prio + ' ');
  lines[i] = DUE_MARK.test(line)
    ? line.replace(new RegExp('^([\\s\\S]*)' + DUE_MARK.source), '$1>' + isoDate(due))
    : line.replace(/\s+$/, '') + ' >' + isoDate(due);
  addEntry(lines, i, String(text || '').trim() || 'relance', now);
  return { content: sortFollow(lines.join('\n'), { today: now }), created: found.created, section, due };
}

// --- Archivage (feg) ----------------------------------------------------------
// Les tâches fermées quittent la note de suivi pour une note d'archives par
// année (archiveTitle), avec leurs sous-lignes. « Terminé » garde les tâches
// cochées depuis ARCHIVE_DAYS jours au plus (date du « @done », une cochée
// sans « @done » part, datée du jour). « Annulé » garde ses KEEP_CANCELLED
// premières tâches, les plus récentes puisque les annulées y arrivent en tête
// (fe- comme NotePlan après un rangement) ; NotePlan ne datant pas une
// annulation, les suivantes partent datées du jour d'archivage. Les autres
// lignes de ces sections ne bougent pas.
// -> { content, archives: [{ year, items: [{ date, lines }] }] } (années
// décroissantes, items dans l'ordre de la note).
const ARCHIVE_DAYS = 7;
const KEEP_CANCELLED = 10;
const archiveTitle = (note, year) => note + ' — Archives ' + year;
const DONE_AT = /@done\((\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\)/;

function archiveFollow(content, today = new Date()) {
  let lines = String(content || '').split('\n');
  const out = [];
  [[DONE, /[xX]/], [CANCELLED, /-/]].forEach(([name, state]) => {
    const r = sectionRange(lines, name);
    if (!r) return;
    const block = lines.slice(r.start, r.end);
    const tail = contentEnd(block);
    const head = [], items = [];
    block.slice(0, tail).forEach((l) => {
      if (TASK.test(l)) items.push({ lines: [l], state: l.match(/\[(.)\]/)[1] });
      else if (items.length) items[items.length - 1].lines.push(l);
      else head.push(l);
    });
    let kept = 0;
    const keep = [];
    items.forEach((it) => {
      let date = null;
      if (state.test(it.state)) {
        if (name === DONE) {
          const d = (it.lines[0].match(DONE_AT) || [])[1];
          date = !d ? isoDate(today) : dueDays(d.slice(0, 10), today) < -ARCHIVE_DAYS ? d : null;
        } else if (++kept > KEEP_CANCELLED) date = isoDate(today);
      }
      if (date) out.push({ date, lines: it.lines.slice(0, contentEnd(it.lines)) });
      else keep.push(...it.lines);
    });
    lines = lines.slice(0, r.start).concat(head, keep, block.slice(tail), lines.slice(r.end));
  });
  const years = [...new Set(out.map((it) => it.date.slice(0, 4)))].sort().reverse();
  return {
    content: lines.join('\n'),
    archives: years.map((year) => ({ year, items: out.filter((it) => it.date.startsWith(year)) })),
  };
}

// Note d'archives `title` (contenu actuel `existing`, null si absente) avec
// `items` ajoutés : une section « ## <mois> <année> » par mois de leur date,
// mois les plus récents en tête ; dans une section, les nouveaux en tête, du
// plus récent au plus ancien. Une tâche dont la ligne y est déjà n'est pas
// recopiée (archivage relancé après une écriture perdue de la note de suivi).
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
const MONTH_HEADING = new RegExp('^##\\s+(' + MONTHS.join('|') + ')\\s+(\\d{4})\\s*$');
const monthKey = (l) => {
  const m = MONTH_HEADING.exec(l);
  return m ? m[2] + '-' + pad2(MONTHS.indexOf(m[1]) + 1) : '';
};

function mergeArchive(existing, title, items) {
  const lines = existing === null || existing === undefined ? ['# ' + title, ''] : String(existing).split('\n');
  const present = new Set(lines.filter((l) => TASK.test(l)).map((l) => l.trim()));
  const fresh = items.filter((it) => !present.has(it.lines[0].trim()))
    .map((it, i) => Object.assign({ i }, it))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.i - b.i));
  if (!fresh.length && existing !== null && existing !== undefined) return String(existing);
  const months = [...new Set(fresh.map((it) => it.date.slice(0, 7)))].sort().reverse();
  months.forEach((key) => {
    const add = [].concat(...fresh.filter((it) => it.date.startsWith(key)).map((it) => it.lines));
    const h = lines.findIndex((l) => monthKey(l) === key);
    if (h >= 0) {
      lines.splice(h + 1, 0, ...add);
      return;
    }
    const heading = '## ' + MONTHS[Number(key.slice(5)) - 1] + ' ' + key.slice(0, 4);
    const next = lines.findIndex((l) => monthKey(l) && monthKey(l) < key);
    if (next >= 0) {
      lines.splice(next, 0, heading, ...add, '');
      return;
    }
    while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', heading, ...add);
  });
  return lines.join('\n') + (lines[lines.length - 1] === '' ? '' : '\n');
}

module.exports = {
  TODO, WAITING, parseFollowArgs, isWaiting, planTask, followTaskLine, findOpenTask,
  dueBadge, markTask, sortFollow, closeFollow, completeFollow,
  archiveTitle, archiveFollow, mergeArchive,
};
