// Wraps faith-landing.html (the fragment published as an artifact) in a full HTML document for
// static hosting. Run: node landing/make-index.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'faith-landing.html'), 'utf8');
const cut = src.indexOf('</style>') + '</style>'.length;
const head = src.slice(0, cut);
const body = src.slice(cut);
const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="FAITH AI — Family Assistant for Illness, Treatment & Health. A private, offline-first companion for diabetes and blood pressure, with AI that runs on the phone.">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="img/icon.png">
${head}
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, 'index.html'), doc);
console.log('wrote landing/index.html', doc.length, 'bytes');
