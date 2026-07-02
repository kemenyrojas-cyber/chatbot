const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractDerivedLegalKnowledge,
  rankDerivedLegalKnowledge
} = require('./derived-knowledge');

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

test('solo recupera memoria privada relacionada con la consulta', () => {
  const cards = [
    { id: 'laboral', type: 'norma', title: 'Artículo 27', content: 'El artículo 27 regula la protección frente al despido arbitrario.', matter: 'Derecho Laboral' },
    { id: 'civil', type: 'criterio', title: 'Prescripción', content: 'La prescripción civil debe computarse desde que la acción puede ejercerse.', matter: 'Derecho Civil' }
  ];
  const results = rankDerivedLegalKnowledge(cards, 'protección ante un despido', 10);
  assert.equal(results.length, 1);
  assert.match(results[0].contenido, /despido/i);
  assert.equal(results[0].fuente, 'Memoria jurídica privada');
});
