/* One file in, one shippable folder out. The game has no bundler and no
   dependencies, so "building" means: copy the source, stamp the version into
   the service worker cache key so an old build cannot outlive a deploy, and
   fail loudly if anything the manifest promises is missing. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const pkg  = require(path.join(root, 'package.json'));

fs.mkdirSync(dist, { recursive: true });

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
fs.writeFileSync(path.join(dist, 'index.html'), html);

// the cache key is the version; a release always invalidates the last one
let sw = fs.readFileSync(path.join(root, 'dist', 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE = '[^']*'/, `const CACHE = 'bluff-v${pkg.version}'`);
fs.writeFileSync(path.join(dist, 'sw.js'), sw);

// every icon the manifest names has to actually exist
const man = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
const missing = man.icons.map(i => i.src).filter(src => !fs.existsSync(path.join(dist, src)));
if (missing.length) { console.error('missing icons:\n  ' + missing.join('\n  ')); process.exit(1); }

const size = (fs.statSync(path.join(dist, 'index.html')).size / 1024).toFixed(0);
console.log(`built v${pkg.version} · index.html ${size} KB · ${man.icons.length} icons · cache bluff-v${pkg.version}`);
