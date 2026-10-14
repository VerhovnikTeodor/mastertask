// Preveri sintakso vseh .js datotek backenda (brez dodatnih odvisnosti).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
})(root);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed += 1;
    process.stderr.write(err.stderr.toString());
  }
}
console.log(`[lint] ${files.length - failed}/${files.length} datotek brez sintaktičnih napak`);
process.exit(failed ? 1 : 0);
