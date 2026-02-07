const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, '../dist/ui.js');
const cssPath = path.join(__dirname, '../src/styles.css');

const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf-8') : '';
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf-8') : '';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Edgy</title>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script>${js}</script>
</body>
</html>`;

const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

fs.writeFileSync(path.join(distDir, 'ui.html'), html);
console.log('✅ Built ui.html');
