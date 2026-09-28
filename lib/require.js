// Chargeur de modules du repo, façon CommonJS. Évalué par l'amorçage des
// scripts d'entrée avec `root` (racine du repo) et doit renvoyer require().
// Un module est un fichier de lib/ qui remplit `module.exports`.
'use strict';

const cache = {};

function require(rel) {
  const path = root + '/' + rel.replace(/\.js$/, '') + '.js';
  if (cache[path]) return cache[path].exports;
  const src = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if (src.isNil()) throw new Error('require : module introuvable ' + path);
  const mod = { exports: {} };
  cache[path] = mod;
  new Function('module', 'exports', 'require', ObjC.unwrap(src) + '\n//# sourceURL=' + path)(
    mod, mod.exports, require
  );
  return mod.exports;
}

require.root = root;
return require;
