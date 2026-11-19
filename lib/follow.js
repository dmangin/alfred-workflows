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

// Échéance (dernière « >AAAA-MM-JJ » de la ligne, '' si aucune), date de
// création « jj/mm/aaaa: » remise en AAAA-MM-JJ ('' si aucune) et priorité
// (nombre de « ! » après la case, 0 à 3).
function taskKey(line) {
  const due = (line.match(/>(\d{4}-\d{2}-\d{2})(?!.*>\d{4}-\d{2}-\d{2})/) || [])[1] || '';
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

// Section rangée `name` (ses lignes, sans son titre), `newLine` (facultative)
// ajoutée. Les tâches cochées ou annulées en sortent : `closed`, [{ state,
// lines }] dans l'ordre de la note. Les autres, pastille à jour, vont dans la
// sous-section « ### » de leur tranche d'échéance (tranches vides omises,
// anciennes sous-sections refaites) : la plus prioritaire (« !!! ») d'abord,
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
      const key = taskKey(l);
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
    if (!i || open[i - 1].bucket !== it.bucket) lines.push('### ' + bucketTitle(name, BUCKETS[it.bucket]));
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

// Récapitulatif : une ligne par section rangée, « **À faire** (12) : » puis le
// nombre de tâches de chaque tranche derrière sa pastille, lié à sa
// sous-section (« [ 12 ](…) » : espaces pour aérer, NotePlan pouvant afficher
// le markdown brut) (lien NotePlan vers « titre de la note#titre de sous-section »)
// quand la note a un titre ; « — » pour une tranche vide. Puis la légende des
// pastilles. (Un tableau NotePlan n'affiche pas les liens markdown, et des
// colonnes alignées par des espaces se décalent en police proportionnelle.)
const LEGEND = BUCKETS.map((b) => b.badge + ' ' + b.label).join(' · ');
const SUMMARY_LINE = new RegExp('^\\*\\*(?:' + SORTED.map(escapeRe).join('|') + ')\\*\\* \\(\\d+\\) :');
const OLD_TABLE = '| Échéance |'; // tableau des premières versions, remplacé
function summaryLines(title, counts) {
  const link = (text, heading) => (title
    ? '[ ' + text + ' ](noteplan://x-callback-url/openNote?noteTitle=' + encodeURIComponent(title + '#' + heading) + ')'
    : text);
  return SORTED.map((name) => '**' + name + '** (' + counts[name].reduce((a, n) => a + n, 0) + ') : ' +
    BUCKETS.map((b, k) => b.badge + ' ' + (counts[name][k] ? link(String(counts[name][k]), bucketTitle(name, b)) : '—')).join('   '))
    .concat(LEGEND);
}

// Le récapitulatif à la fin du bloc entre le titre et « À faire » (après ce que
// tu y as mis), séparé par des lignes vides ; l'ancien (ou l'ancien tableau),
// où qu'il soit dans ce bloc, est retiré.
function withSummary(lines, counts) {
  const from = titleEnd(lines);
  const h = sectionRange(lines, TODO).start - 1;
  let inTable = false;
  const intro = lines.slice(from, h).filter((l) => {
    inTable = l.startsWith(OLD_TABLE) || (inTable && l.startsWith('|'));
    return !inTable && !SUMMARY_LINE.test(l) && l !== LEGEND;
  });
  intro.splice(contentEnd(intro));
  const title = from > 0 && level(lines[from - 1]) === 1 ? lines[from - 1].replace(/^#\s+/, '').trim() : '';
  const block = (intro.length ? intro.concat('') : []).concat(summaryLines(title, counts), '');
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

// --- Résolution (fer) ----------------------------------------------------------
// Les tâches ouvertes des sections rangées qui citent `key` sont cochées et
// datées « @done(AAAA-MM-JJ HH:MM) » comme le fait NotePlan ; le rangement
// (sortFollow) les déplace avec leurs sous-lignes en tête de « Terminé ».
// `newLine` (facultative) : tâche à créer directement résolue quand aucune ne
// cite `key`. -> { content, count } (count : tâches existantes résolues).
const pad2 = (n) => String(n).padStart(2, '0');
const doneStamp = (now) => '@done(' + isoDate(now) + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ')';
const resolveLine = (line, now) => markTask(line.replace(/^([-*+]\s+)\[ \]/, '$1[x]'), now) + ' ' + doneStamp(now);

function resolveFollow(content, key, now, newLine) {
  const cited = citing(key);
  let count = 0;
  const lines = eachSorted(ensureSections(String(content || '').split('\n')), (block) =>
    block.map((l) => {
      if (!TASK.test(l) || !OPEN.test(l) || !cited.test(l)) return l;
      count++;
      return resolveLine(l, now);
    }));
  if (!count && !newLine) return { content: String(content), count };
  const add = count ? undefined : { section: TODO, line: resolveLine(newLine, now) };
  return { content: sortFollow(lines.join('\n'), { add, today: now }), count };
}

module.exports = {
  TODO, WAITING, parseFollowArgs, isWaiting, planTask, followTaskLine, findOpenTask,
  dueBadge, markTask, sortFollow, resolveFollow,
};
