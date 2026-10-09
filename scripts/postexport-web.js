// Prepares the exported web build (dist/) for static hosts.
//
// Vercel (and some other hosts) never upload directories named node_modules, and Expo's web export
// keeps vendored assets (the wllama and SQLite wasm files, icon fonts) under assets/node_modules/….
// This copies dist/ to an output folder with that directory renamed to assets/vendor and every
// reference in the bundles rewritten. Usage: node scripts/postexport-web.js [outputDir=dist-web]
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist-web'));
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/index.html not found; run `npx expo export --platform web` first');
fs.rmSync(out, { recursive: true, force: true });
let rewritten = 0;
(function copy(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name === 'node_modules' && path.basename(srcDir) === 'assets' ? 'vendor' : entry.name);
    if (entry.isDirectory()) copy(src, dst);
    else if (/\.(js|html|json|css|map)$/.test(entry.name)) {
      const s = fs.readFileSync(src, 'utf8');
      if (s.includes('assets/node_modules/')) rewritten++;
      fs.writeFileSync(dst, s.split('assets/node_modules/').join('assets/vendor/'));
    } else fs.copyFileSync(src, dst);
  }
})(dist, out);
fs.copyFileSync(path.join(__dirname, '..', 'vercel.json'), path.join(out, 'vercel.json'));
console.log(`postexport-web: wrote ${out} (assets/node_modules -> assets/vendor, ${rewritten} file(s) rewritten)`);
