function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArticleReferences(query) {
  const normalized = normalizeText(query);
  const references = [];
  const patterns = [
    /\barticulo\s+(\d+[a-z]?)\b/g,
    /\bart\s+(\d+[a-z]?)\b/g,
    /\binciso\s+(\d+[a-z]?)\b/g
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(normalized);
    while (match) {
      references.push(match[1]);
      match = pattern.exec(normalized);
    }
  }

  return [...new Set(references)];
}

function scoreExactArticlePriority(result, articleRefs) {
  if (!articleRefs.length) return 0;
  const text = normalizeText([
    result?.titulo,
    result?.title,
    result?.resumen,
    result?.excerpt,
    result?.contenido,
    result?.content,
    result?.fuente,
    result?.source
  ].join(' '));

  let priority = 0;
  for (const article of articleRefs) {
    const articlePattern = new RegExp(`\\barticulo\\s+${article}\\b|\\bart\\s+${article}\\b`, 'i');
    const numericPattern = new RegExp(`\\b${article}\\b`, 'i');
    if (articlePattern.test(text)) priority += 1000;
    else if (numericPattern.test(text) && /\b(codigo|ley|constitucion|norma|decreto)\b/i.test(text)) priority += 350;
  }

  return priority;
}

function prioritizeKnowledgeResults(results, query) {
  const list = Array.isArray(results) ? results : [];
  const articleRefs = extractArticleReferences(query);
  if (!articleRefs.length) return list;

  return list
    .map((item, index) => ({
      item,
      index,
      priority: scoreExactArticlePriority(item, articleRefs)
    }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const relevanceDiff = Number(b.item?.relevance || 0) - Number(a.item?.relevance || 0);
      return relevanceDiff || a.index - b.index;
    })
    .map(entry => entry.item);
}

module.exports = {
  prioritizeKnowledgeResults,
  extractArticleReferences
};
