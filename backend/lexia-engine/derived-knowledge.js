const crypto = require('node:crypto');

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sensitiveLinePattern = /\b(demandante|demandad[oa]|denunciante|denunciad[oa]|imputad[oa]|acusad[oa]|agraviad[oa]|investigad[oa]|procesad[oa]|juez|especialista\s+legal|domicilio|direcci[oó]n|dni|documento\s+de\s+identidad|ruc|tel[eé]fono|correo\s+electr[oó]nico)\b/i;
const legalReferencePattern = /\b(art(?:[íi]culo|\.)\s*\d+[A-Z°º.-]*|ley\s*(?:n[.°ºo]*)?\s*\d{3,}|decreto\s+(?:supremo|legislativo|ley)\s*(?:n[.°ºo]*)?\s*\d+|c[oó]digo\s+(?:civil|penal|procesal\s+civil|procesal\s+penal|de\s+los\s+niños\s+y\s+adolescentes)|constituci[oó]n\s+pol[ií]tica)\b/i;
const legalTheoryPattern = /\b(principio\s+de\s+(?:legalidad|tipicidad|proporcionalidad|razonabilidad|debido\s+proceso|motivaci[oó]n|primac[ií]a\s+de\s+la\s+realidad)|debido\s+proceso|tutela\s+jurisdiccional|carga\s+de\s+la\s+prueba|prescripci[oó]n|caducidad|responsabilidad\s+civil|motivaci[oó]n\s+de\s+las\s+resoluciones|competencia\s+jurisdiccional)\b/i;

function redactPrivateCaseData(value = '') {
  return String(value)
    .replace(/\b[0-9]{3,7}-20[0-9]{2}-[0-9]{1,6}-[A-Z]{2,8}-[A-Z]{2,8}(?:-[0-9]{2})?\b/gi, '[número omitido]')
    .replace(/\b(?:DNI|CE|RUC)\s*(?:n[.°ºo]*)?\s*[:\-]?\s*\d{8,11}\b/gi, '[identificador omitido]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[correo omitido]')
    .replace(/(?:\+?51[\s-]?)?(?:9\d{8}|\d{3}[\s-]\d{3}[\s-]\d{3})\b/g, '[teléfono omitido]')
    .replace(/\b(?:av\.?|avenida|jr\.?|jir[oó]n|calle|pasaje)\s+[^.;\n]{4,100}/gi, '[dirección omitida]')
    .replace(/\s+/g, ' ')
    .trim();
}

function getReferenceTitle(text, type) {
  const source = text.match(
    /\b(constituci[oó]n\s+pol[ií]tica(?:\s+del\s+per[uú])?|c[oó]digo\s+(?:civil|penal|procesal\s+civil|procesal\s+penal|de\s+los\s+niños\s+y\s+adolescentes)|ley\s*(?:n[.°ºo]*)?\s*\d{3,}|decreto\s+(?:supremo|legislativo|ley)\s*(?:n[.°ºo]*)?\s*\d+)\b/i
  )?.[1];
  const article = text.match(/\bart(?:[íi]culo|\.)\s*(\d+[A-Z°º.-]*)/i)?.[1];
  if (type === 'norma') {
    return [source, article ? `artículo ${article}` : ''].filter(Boolean).join(' · ') || 'Referencia normativa';
  }
  const theory = text.match(legalTheoryPattern)?.[1];
  return theory ? theory.charAt(0).toUpperCase() + theory.slice(1) : 'Criterio jurídico';
}

function extractDerivedLegalKnowledge(text = '', options = {}) {
  const matter = String(options.matter || '').trim().slice(0, 100);
  const candidates = String(text)
    .split(/\r?\n|(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map(line => line.replace(/^#{1,6}\s*/, '').replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 35 && line.length <= 900)
    .filter(line => !sensitiveLinePattern.test(line))
    .filter(line => legalReferencePattern.test(line) || legalTheoryPattern.test(line));
  const cards = new Map();

  for (const candidate of candidates) {
    const content = redactPrivateCaseData(candidate).slice(0, 560);
    if (content.length < 30 || sensitiveLinePattern.test(content)) continue;
    const type = legalReferencePattern.test(content) ? 'norma' : 'criterio';
    const title = getReferenceTitle(content, type).slice(0, 140);
    const id = crypto
      .createHash('sha256')
      .update(`${type}|${normalize(title)}|${normalize(content)}`)
      .digest('hex')
      .slice(0, 24);
    if (!cards.has(id)) {
      cards.set(id, {
        id,
        type,
        title,
        content,
        matter,
        derived: true
      });
    }
    if (cards.size >= 40) break;
  }
  return [...cards.values()];
}

function rankDerivedLegalKnowledge(rawCards = [], query = '', limit = 12) {
  const queryText = normalize(query);
  const queryTerms = [...new Set(queryText.split(' ').filter(term => term.length >= 4))];
  const explicitlyRequestsMemory = /\b(mis\s+expedientes|mis\s+casos|memoria\s+jur[ií]dica|aprendido\s+de\s+los\s+expedientes)\b/i.test(query);

  return (Array.isArray(rawCards) ? rawCards : [])
    .slice(0, 300)
    .map(card => {
      const type = ['norma', 'criterio'].includes(card?.type) ? card.type : '';
      const title = redactPrivateCaseData(card?.title || '').slice(0, 140);
      const content = redactPrivateCaseData(card?.content || '').slice(0, 560);
      const matter = redactPrivateCaseData(card?.matter || '').slice(0, 100);
      if (
        !type
        || content.length < 30
        || sensitiveLinePattern.test(content)
        || (!legalReferencePattern.test(content) && !legalTheoryPattern.test(content))
      ) return null;
      const searchable = normalize(`${title} ${content} ${matter}`);
      const overlap = queryTerms.filter(term => searchable.includes(term)).length;
      const score = overlap * 25
        + (matter && queryText.includes(normalize(matter).replace(/^derecho\s+/, '')) ? 20 : 0)
        + (explicitlyRequestsMemory ? 10 : 0);
      if (score <= 0) return null;
      return {
        id: `private-memory:${String(card.id || crypto.createHash('sha256').update(searchable).digest('hex').slice(0, 24))}`,
        titulo: title || 'Criterio jurídico derivado',
        materia: matter || 'Derecho peruano',
        fuente: 'Memoria jurídica privada',
        contenido: content,
        resumen: content,
        modulo: 'memoria_privada',
        relevance: Math.min(100, score)
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 12)));
}

module.exports = {
  extractDerivedLegalKnowledge,
  rankDerivedLegalKnowledge,
  redactPrivateCaseData
};
