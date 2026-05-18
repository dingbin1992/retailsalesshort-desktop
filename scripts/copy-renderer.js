const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'renderer');
const dstDir = path.join(__dirname, '..', 'dist', 'renderer');

fs.mkdirSync(dstDir, { recursive: true });

const files = ['index.html', 'styles.css', 'renderer.js'];
files.forEach((f) => {
  fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
  console.log(`Copied: ${f}`);
});
