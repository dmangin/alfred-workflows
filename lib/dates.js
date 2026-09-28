// Dates en heure locale. toJSON() est en UTC : il décale d'un jour entre
// minuit et 2 h en France, d'où les formateurs explicites ci-dessous.
'use strict';

const pad2 = (n) => String(n).padStart(2, '0');

const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

// Un samedi ou un dimanche compte comme le lundi suivant, puis on ajoute
// N jours ouvrés : samedi + 0 -> lundi, samedi + 1 -> mardi.
function addWorkingDays(from, n) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (isWeekend(d)) d.setDate(d.getDate() + 1);
  let left = Number(n) || 0;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) left--;
  }
  return d;
}

const frDate = (d) => pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
const isoDate = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const npDate = (d) => isoDate(d).replace(/-/g, '');

module.exports = { addWorkingDays, isWeekend, frDate, isoDate, npDate };
