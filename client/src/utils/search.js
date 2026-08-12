export const normalizeSearchText = (value = '') => String(value ?? '').trim().toLowerCase();

const collectSearchValues = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectSearchValues(entry));
  }

  if (value === null || value === undefined) return [];

  if (typeof value === 'object') {
    return Object.values(value).flatMap((entry) => collectSearchValues(entry));
  }

  return [String(value)];
};

export const matchesSearchQuery = (item, query, fields = []) => {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) return true;
  if (!Array.isArray(fields) || fields.length === 0) return false;

  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return true;

  const values = fields.flatMap((field) => collectSearchValues(item?.[field]));
  const flattenedText = values.map((value) => normalizeSearchText(value)).join(' ');

  return queryTerms.every((term) => flattenedText.includes(term));
};
