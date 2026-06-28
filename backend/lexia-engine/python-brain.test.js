const test = require('node:test');
const assert = require('node:assert/strict');
const { createPythonBrain } = require('./python-brain');

test('Python Brain mantiene un proceso y devuelve el contrato de intención', async t => {
  const brain = createPythonBrain({ timeoutMs: 5000 });
  t.after(() => brain.stop());

  const penal = await brain.analyze({
    query: 'Me investigan por posesión ilícita de drogas.',
    baseline: {
      area: { id: 'derecho_familia', label: 'Derecho de Familia', confidence: 'alta' },
      topic: { id: 'tenencia', label: 'Tenencia', confidence: 'alta' },
      interpretation: {}
    }
  });
  assert.equal(penal.available, true);
  assert.equal(penal.intent.area.id, 'derecho_penal');
  assert.ok(Array.isArray(penal.candidates));

  const ambiguous = await brain.analyze({
    query: 'Tengo un problema de tenencia.',
    baseline: {
      area: { id: 'derecho_familia', label: 'Derecho de Familia', confidence: 'alta' },
      interpretation: {}
    }
  });
  assert.equal(ambiguous.decision.status, 'clarify');
  assert.equal(ambiguous.intent.area.id, 'area_no_determinada');
});

test('Python Brain falla de forma controlada si Python no está disponible', async () => {
  const brain = createPythonBrain({
    python: 'lexia-python-inexistente',
    timeoutMs: 1000
  });
  const result = await brain.analyze({ query: 'Consulta legal' });
  assert.equal(result.available, false);
  assert.match(result.reason, /lexia-python-inexistente|disponible|ENOENT/i);
});
