const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

class PythonBrain {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.python = options.python || process.env.LEXIA_PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
    this.script = options.script || path.join(__dirname, 'brain.py');
    this.timeoutMs = Number(options.timeoutMs || process.env.LEXIA_PYTHON_BRAIN_TIMEOUT_MS || 2500);
    this.process = null;
    this.pending = new Map();
    this.sequence = 0;
    this.lastError = '';
  }

  start() {
    if (!this.enabled || this.process) return;
    const child = spawn(this.python, [this.script, '--worker'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    this.process = child;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => this.handleLine(line));
    child.stderr.on('data', chunk => {
      const message = String(chunk || '').trim();
      if (message) console.warn(`[LEXIA Python Brain] ${message}`);
    });
    child.on('error', error => this.handleExit(error));
    child.on('exit', code => this.handleExit(new Error(`Proceso finalizado con código ${code}.`)));
  }

  handleLine(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    const entry = this.pending.get(response.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(response.id);
    if (response.error) {
      entry.reject(new Error(response.error));
      return;
    }
    entry.resolve(response.result);
  }

  handleExit(error) {
    if (!this.process) return;
    this.lastError = error.message;
    this.process = null;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  async analyze(payload = {}) {
    if (!this.enabled) {
      return { available: false, reason: 'disabled' };
    }
    try {
      this.start();
      if (!this.process?.stdin?.writable) throw new Error('Python Brain no está disponible.');
      const id = `brain-${Date.now()}-${++this.sequence}`;
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`Python Brain excedió ${this.timeoutMs} ms.`));
        }, this.timeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        this.process.stdin.write(`${JSON.stringify({ id, payload })}\n`);
      });
      this.lastError = '';
      return { available: true, ...result };
    } catch (error) {
      this.lastError = error.message;
      return { available: false, reason: error.message };
    }
  }

  stop() {
    this.process?.kill();
    this.process = null;
  }
}

function createPythonBrain(options = {}) {
  return new PythonBrain(options);
}

module.exports = {
  PythonBrain,
  createPythonBrain
};
