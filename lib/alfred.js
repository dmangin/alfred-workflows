// Utilitaires communs aux scripts lancés par Alfred : notifications, sortie
// en erreur, variables d'environnement (variables et config utilisateur).
'use strict';

ObjC.import('stdlib');

const app = Application.currentApplication();
app.includeStandardAdditions = true;

// Erreur destinée à l'utilisateur : son message est affiché tel quel.
class UserError extends Error {}

function env(name, fallback) {
  const all = ObjC.deepUnwrap($.NSProcessInfo.processInfo.environment);
  const v = all[name];
  return v === undefined || v === '' ? fallback : v;
}

function ui(title) {
  const notify = (message) => app.displayNotification(message, { withTitle: title });
  return {
    notify,
    fail(message) {
      notify(message);
      $.exit(1);
    },
  };
}

// Exécute le corps d'un script d'entrée : une UserError devient une
// notification + code 1 ; toute autre erreur est relancée (trace complète).
function main(title, body) {
  const u = ui(title);
  try {
    return body(u);
  } catch (e) {
    if (e instanceof UserError) u.fail(e.message);
    throw e;
  }
}

module.exports = { app, env, ui, main, UserError };
