const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractDerivedLegalKnowledge
} = require('./derived-knowledge');
const { createKnowledgeEngine } = require('./knowledge');
const path = require('node:path');

test('extrae teoría y normas sin copiar datos particulares del expediente', () => {
  const text = [
    'EXPEDIENTE 02715-2026-0-1864-JR-LA-12',
    'DEMANDANTE: ANTICONA VELA, KEYTH AYUMI',
    'Conforme al artículo 27 de la Constitución Política del Perú, la ley otorga protección frente al despido arbitrario.',
    'El principio de primacía de la realidad exige privilegiar los hechos comprobados sobre las formas documentales.',
    'Domicilio: Avenida Arequipa 998, Lima.'
  ].join('\n');
  const cards = extractDerivedLegalKnowledge(text, { matter: 'Derecho Laboral' });
  assert.equal(cards.length, 2);
  assert.ok(cards.some(card => card.type === 'norma' && /artículo 27/i.test(card.content)));
  assert.ok(cards.some(card => card.type === 'criterio' && /primacía de la realidad/i.test(card.content)));
  assert.ok(cards.every(card => !/ANTICONA|02715-2026|Arequipa 998/i.test(card.content)));
});

test('el conocimiento derivado entra al buscador jurídico existente', () => {
  const engine = createKnowledgeEngine({
    aiEngineRoot: path.join(__dirname, '__missing_test_kb__'),
    shouldSearchLegalEngine: () => true
  });
  const cards = extractDerivedLegalKnowledge([
    'Conforme al artículo 27 de la Constitución Política del Perú, la ley otorga protección frente al despido arbitrario.',
    'El principio de primacía de la realidad exige privilegiar los hechos comprobados sobre las formas documentales.'
  ].join('\n'), { matter: 'Derecho Laboral' });
  const text = cards
    .map(card => `## ${card.title}\nTipo: ${card.type}\nMateria: ${card.matter}\n${card.content}`)
    .join('\n\n');
  const entries = engine.buildIngestedLegalEntries({
    sourceId: 'source-derived-test',
    fileName: 'conocimiento-juridico-derivado.txt',
    title: 'Conocimiento jurídico derivado de expedientes',
    text,
    materia: 'Derecho Laboral',
    fuente: 'LEXIA · conocimiento jurídico desidentificado',
    modulo: 'normativa'
  });

  engine.mergeRuntimeLegalKnowledge(entries);
  const results = engine.searchLegalKnowledgeBase(
    '¿Qué protección establece el artículo 27 frente al despido arbitrario?'
  );

  assert.ok(results.some(result =>
    result.fuente === 'LEXIA · conocimiento jurídico desidentificado'
    && /artículo 27/i.test(result.contenido)
  ));
});
