const fs = require('fs');
const path = require('path');
const { tokenize, stem } = require('./queryParser');

const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');

const ENGLISH_STOPWORDS = new Set(('a an the and or but of for to in on at by with from is are was were be been being am i me my mine we our '
  + 'you your it its this that these those there here what which who whom whose where when why how can could should would will '
  + 'shall do does did doing done please if then than so as not no yes also just about into out up down only own same such too '
  + 'very any all each every some more most other they them their he she his her has have had having get gets got udyogconnect').split(' '));

const keywordsOf = (text) => [...new Set(tokenize(text)
  .filter((word) => word.length > 1 && !ENGLISH_STOPWORDS.has(word) && !/^\d+$/.test(word))
  .map(stem))];

const SYNONYMS = {
  cancel: ['cancellation', 'cancelled'],
  refund: ['cancel', 'payment'],
  pay: ['payment', 'esewa', 'cash'],
  cod: ['cash', 'delivery'],
  bill: ['invoice', 'receipt', 'pdf'],
  invoice: ['bill'],
  receipt: ['bill'],
  otp: ['code', 'delivery'],
  register: ['registration', 'registering', 'seller'],
  signup: ['register'],
  approve: ['approval', 'approved', 'pending'],
  seller: ['selling', 'business'],
  password: ['reset', 'forgot'],
  rating: ['review', 'rated'],
  wishlist: ['saving', 'saved', 'heart'],
  book: ['booking', 'slot'],
  appointment: ['booking'],
  track: ['status', 'order'],
  contact: ['message', 'chat', 'care'],
  support: ['care', 'contact'],
  complaint: ['report', 'problem'],
  complain: ['report', 'problem'],
  scam: ['report'],
  fraud: ['report', 'scam'],
  login: ['sign', 'password'],
  notification: ['bell', 'update'],
};

let cache = null;

const slug = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Splits every markdown file into one chunk per "## " section. */
function loadKnowledge() {
  if (cache) return cache;
  const chunks = [];
  let files = [];
  try {
    files = fs.readdirSync(KNOWLEDGE_DIR).filter((file) => file.endsWith('.md')).sort();
  } catch (err) {
    console.warn('[ai] Knowledge folder unavailable:', err.message);
  }
  files.forEach((file) => {
    const raw = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf8').replace(/\r\n/g, '\n');
    const docTitle = (raw.match(/^#\s+(.+)$/m) || [])[1] || file.replace(/\.md$/, '');
    raw.split(/\n(?=##\s)/).forEach((block) => {
      const heading = (block.match(/^##\s+(.+)$/m) || [])[1];
      if (!heading) return;
      const text = block.replace(/^##\s+.+$/m, '').trim();
      if (!text) return;
      const id = `${file.replace(/\.md$/, '')}#${slug(heading)}`;
      chunks.push({
        id,
        doc: docTitle,
        section: heading,
        text,
        headingWords: new Set(keywordsOf(`${heading} ${docTitle}`)),
        bodyWords: keywordsOf(text),
      });
    });
  });
  cache = chunks;
  return chunks;
}

function expand(words) {
  const set = new Set(words);
  words.forEach((word) => (SYNONYMS[word] || []).forEach((extra) => set.add(extra)));
  return [...set];
}

/** Keyword search over the help pages: heading matches weigh more than body matches. */
function searchKnowledge(query, { limit = 3, minScore = 2 } = {}) {
  const words = expand(keywordsOf(query));
  if (!words.length) return [];
  return loadKnowledge()
    .map((chunk) => {
      let score = 0;
      words.forEach((word) => {
        if (chunk.headingWords.has(word)) score += 3;
        const hits = chunk.bodyWords.filter((body) => body === word || (word.length > 4 && body.startsWith(word))).length;
        score += Math.min(hits, 3);
      });
      return { chunk, score };
    })
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => ({ id: chunk.id, doc: chunk.doc, section: chunk.section, text: chunk.text, score }));
}

function resetKnowledgeCache() {
  cache = null;
}

module.exports = { loadKnowledge, searchKnowledge, resetKnowledgeCache };
