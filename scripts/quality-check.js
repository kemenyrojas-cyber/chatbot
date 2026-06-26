const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceRoots = ['server.js', 'backend', 'frontend/src', 'ai-engine/scripts', 'scripts'];
const ignoredDirectories = new Set(['node_modules', 'coverage', 'dist', '.git']);

function collectJavaScript(target, files = []) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return files;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (absolute.endsWith('.js')) files.push(absolute);
    return files;
  }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relative = path.relative(root, path.join(absolute, entry.name));
    collectJavaScript(relative, files);
  }
  return files;
}

function checkRepositoryPolicy() {
  const tracked = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8'
  }).split(/\r?\n/).filter(Boolean);
  const forbidden = tracked.filter(file => (
    file === '.env'
    || file === 'data/accounts.json'
    || file.includes('/node_modules/')
    || file.endsWith('.log')
  ));
  if (forbidden.length) {
    throw new Error(`Archivos privados o generados bajo control de versiones:\n- ${forbidden.join('\n- ')}`);
  }
}

function checkSyntax() {
  const files = sourceRoots.flatMap(target => collectJavaScript(target));
  for (const file of files) {
    execFileSync(process.execPath, ['--check', file], {
      cwd: root,
      stdio: 'pipe'
    });
  }
  return files.length;
}

try {
  checkRepositoryPolicy();
  const checkedFiles = checkSyntax();
  console.log(`Quality check passed: repository policy + ${checkedFiles} JavaScript files.`);
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exit(1);
}
