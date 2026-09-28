// Tâches de suivi NotePlan, communes à `fe` (mail) et `fs` (Slack) :
// « <jours> <priorité> <action> », ex. « 2 !!! voir XX ».
'use strict';

const { frDate } = require('lib/dates');

// Tout est optionnel : « » -> 0 jour, sans priorité, action « Suivre ».
function parseFollowArgs(s) {
  const m = String(s || '').trim().match(/^(\d*)\s*(!*)\s*(.*)$/);
  return {
    days: Number(m[1]) || 0,
    prio: m[2],
    action: m[3].trim() || 'Suivre',
  };
}

// - [ ] !!! 24/03/2025: Suivre XX [@: titre](https://…)
function followTaskLine({ prio, action, created, recipients, link }) {
  return ['- [ ]', prio, frDate(created) + ':', action, recipients, link]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}

module.exports = { parseFollowArgs, followTaskLine };
