const { spawnSync } = require('node:child_process');

const checks = [];

function command(name, args = []) {
  const result = spawnSync(name, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  return {
    ok: result.status === 0,
    output: String(result.stdout || result.stderr || '').trim()
  };
}

function add(name, ok, detail, remediation = '') {
  checks.push({ name, ok, detail, remediation });
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
add(
  'Node.js 20 LTS',
  nodeMajor === 20,
  `detected ${process.versions.node}`,
  'Use the Dev Container or install Node.js 20 LTS.'
);

const npm = command(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']);
add('npm', npm.ok && Number(npm.output.split('.')[0]) >= 10, npm.output || 'not found', 'Install npm 10 or newer.');

const git = command('git', ['--version']);
add('Git', git.ok, git.output || 'not found', 'Install Git.');

const docker = command('docker', ['version', '--format', '{{.Server.Version}}']);
add(
  'Docker engine',
  docker.ok,
  docker.output || 'not available',
  'Install and start Docker Desktop, then rerun npm run doctor.'
);

const compose = command('docker', ['compose', 'version']);
add('Docker Compose', compose.ok, compose.output || 'not available', 'Docker Compose is included with current Docker Desktop.');

for (const check of checks) {
  console.log(`${check.ok ? 'OK' : 'FAIL'}  ${check.name}: ${check.detail}`);
  if (!check.ok && check.remediation) console.log(`      ${check.remediation}`);
}

if (checks.some(check => !check.ok)) process.exit(1);
console.log('Development environment is ready.');
