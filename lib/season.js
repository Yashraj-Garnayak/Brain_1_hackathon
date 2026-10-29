'use strict';

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function seasonKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function keysFor(date) {
  const d = date instanceof Date ? date : new Date();
  return { weekKey: isoWeekKey(d), seasonKey: seasonKey(d) };
}

function seasonLabel(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!match) return String(key || '—');
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

function weekLabel(key) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(key || ''));
  if (!match) return String(key || '—');
  return `WEEK ${match[2]} · ${match[1]}`;
}

module.exports = { keysFor, isoWeekKey, seasonKey, seasonLabel, weekLabel };
