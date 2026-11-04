// Ce que suivent fe, fes, fec et ::mp dans l'onglet actif du navigateur : le message
// Slack survolé, sinon la conversation Gmail ouverte (avec son auteur), sinon
// la page elle-même — un onglet Slack sans message survolé compris.
'use strict';

const gmail = require('lib/sources/gmail');
const slack = require('lib/sources/slack');

// { link, author, key } : lien markdown, auteur (@alias, ou ''), clé de
// recherche dans NotePlan ('' pour une liste Gmail, qui n'identifie rien).
function currentItem(appName, aliases) {
  const { link, tab } = gmail.currentTab(appName);
  const url = tab.url();
  const msg = slack.isSlack(url) && slack.captureMessage(tab);
  if (msg) {
    const slackLink = slack.buildMarkdown(msg);
    return { link: slackLink, author: '', key: slack.messageKey(slackLink) };
  }
  return { link, author: gmail.authorTag(gmail.threadAuthor(tab), aliases), key: gmail.followKey(url) };
}

module.exports = { currentItem };
