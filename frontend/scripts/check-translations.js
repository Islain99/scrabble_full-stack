// scripts/check-translations.js
//
// Vérifie la cohérence des traductions de src/i18n/translations.js :
//   1. même jeu de clés dans chaque langue (FR = référence)
//   2. aucune valeur vide
//   3. mêmes variables {{interpolation}} d'une langue à l'autre
//
// Usage : npm run check:i18n        (code de sortie 1 en cas d'erreur → CI)
//
// Le module de traductions est importé tel quel (pas de regex) : le script
// voit exactement ce que voit l'application.

import { translations } from '../src/i18n/translations.js';

const REF = 'fr';
const langs = Object.keys(translations);
const ref = translations[REF];
const refKeys = Object.keys(ref);

const vars = (s) => new Set(String(s).match(/\{\{\s*\w+\s*\}\}/g)?.map((v) => v.replace(/\s/g, '')) ?? []);
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

let errors = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); errors++; };

for (const lang of langs) {
  const dict = translations[lang];
  const keys = Object.keys(dict);
  console.log(`\n[${lang}] ${keys.length} clés`);

  if (lang !== REF) {
    refKeys.filter((k) => !(k in dict)).forEach((k) => fail(`manquante : ${k}`));
    keys.filter((k) => !(k in ref)).forEach((k) => fail(`absente en ${REF} : ${k}`));
  }

  for (const k of keys) {
    const v = dict[k];
    if (v === '' || v == null) fail(`valeur vide : ${k}`);
    if (lang !== REF && k in ref && typeof v === 'string' && typeof ref[k] === 'string'
        && !sameSet(vars(v), vars(ref[k]))) {
      fail(`variables différentes de ${REF} : ${k}  (${[...vars(ref[k])]} ≠ ${[...vars(v)]})`);
    }
  }
}

if (errors) {
  console.error(`\n❌ ${errors} problème(s) de traduction.\n`);
  process.exit(1);
}
console.log(`\n✅ Traductions OK — ${langs.length} langues, ${refKeys.length} clés chacune.\n`);
