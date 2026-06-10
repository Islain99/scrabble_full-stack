// scripts/check-translations.js
// Vérifie la parité fr ↔ en du fichier translations.js
// Usage : node scripts/check-translations.js
// En CI : ajouter dans package.json → "check:i18n": "node scripts/check-translations.js"

const path = require('path');

// Résolution du fichier source (ESM → extraction manuelle)
const fs   = require('fs');
const src  = fs.readFileSync(
  path.resolve(__dirname, '../frontend/src/i18n/translations.js'),
  'utf8'
);

// Extraction des blocs fr: { ... } et en: { ... }
function extractKeys(src, lang) {
  const blockRe = new RegExp(`\\b${lang}\\s*:\\s*\\{([\\s\\S]*?)\\n  \\}`, 'm');
  const block = src.match(blockRe)?.[1] ?? '';
  const keyRe = /^\s{4}(\w+)\s*:/gm;
  const keys = [];
  let m;
  while ((m = keyRe.exec(block)) !== null) keys.push(m[1]);
  return keys;
}

const frKeys = extractKeys(src, 'fr');
const enKeys = extractKeys(src, 'en');

const missingInEn = frKeys.filter(k => !enKeys.includes(k));
const extraInEn   = enKeys.filter(k => !frKeys.includes(k));

let hasError = false;

if (missingInEn.length) {
  console.error(`\n❌ ${missingInEn.length} clé(s) présente(s) en FR mais absente(s) en EN :\n`);
  missingInEn.forEach(k => console.error(`   • ${k}`));
  hasError = true;
}

if (extraInEn.length) {
  console.warn(`\n⚠️  ${extraInEn.length} clé(s) présente(s) en EN mais absente(s) en FR :\n`);
  extraInEn.forEach(k => console.warn(`   • ${k}`));
}

if (!hasError) {
  console.log(`\n✅ Parité OK — ${frKeys.length} clés fr = ${enKeys.length} clés en\n`);
  process.exit(0);
} else {
  process.exit(1);
}