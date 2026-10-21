/**
 * Build keyword-query candidates from a natural-language request.
 *
 * The judge (TypeSafe) selects, it does not generate, so code proposes the
 * candidates and the judge picks the one most likely to work as an engine
 * query. Candidate 0 is always the untouched request.
 */

const TIME_PHRASES = [
  /\b(in|over|during|from|within)\s+the\s+(last|past)\s+(\d+|few|couple of)?\s*(hours?|days?|weeks?|months?)\b/gi,
  /\b(last|past)\s+(\d+|few|couple of)?\s*(hours?|days?|weeks?|months?)\b/gi,
  /\b(today|yesterday|tonight|this\s+(week|month|morning)|last\s+(week|month|night)|right\s+now|lately|recently|recent|latest|newest|new)\b/gi,
  /(最近|近期|今天|今日|昨天|本周|这周|上周|这个月|本月|过去[一二三两几\d]+[天周月小时]|近[一二三两几\d]+[天周月小时])/g,
];

const SOURCE_PHRASES = [
  /\b(on|from|in|at|via|over on)\s+(hacker\s*news|hn|reddit|github|x|twitter|the\s+web|the\s+internet)\b/gi,
  /\b(hacker\s*news|hn|reddit|github|twitter)\s+(threads?|posts?|discussions?|comments?|issues?|repos?|repositories|users?|people)\b/gi,
  /(在)?(hacker\s*news|hn|reddit|github|推特|twitter|x)\s*上/gi,
];

const FILLER_PHRASES = [
  /^(what\s+(are|is)\s+(people|everyone|folks|devs|developers|the\s+community)\s+(saying|thinking|talking)\s+about)\s+/i,
  /^(what('s| is| has been)\s+(new|happening|going on|the\s+news)\s+(with|about|on|around|for))\s+/i,
  /^(any\s+(news|updates?|discussion|chatter|talk)\s+(on|about|around))\s+/i,
  /^(show\s+me|find\s+me|find|search\s+for|search|look\s+up|look\s+for|give\s+me|tell\s+me\s+about|i\s+want\s+to\s+(see|know|find))\s+/i,
  /^(discussions?|threads?|posts?|news|updates?|reactions?|opinions?|takes?)\s+(about|on|around|regarding)\s+/i,
  /^(videos?|clips?|talks?|tutorials?|papers?|research|preprints?|articles?|blog\s*posts?|repos?|repositories|projects?|tools?|libraries|libs?)\s+(about|on|for|of|around|regarding)\s+/i,
  /^(帮我|请|给我)?(找找|找一下|找|搜索|搜一下|搜|查一下|查查|查|看看|看一下)\s*/,
  /^(大家|开发者|社区)(怎么看|在讨论|对.*的看法|怎么说)\s*/,
  /^(about|on|regarding|around|of|for|with|to)\s+/i,
];

const TRAILING_FILLER = [
  /\s+(discussions?|threads?|posts?|news|updates?|reactions?|opinions?|takes?|chatter)\s*[?？.!]*$/i,
  /\s*(的讨论|的新闻|的动态|怎么样|如何|吗)\s*[?？。!]*$/,
];

/**
 * Question scaffolding and function words. A third candidate with these
 * removed gives vertical engines (IMDb, Wikipedia, arXiv) a keyword query
 * instead of a sentence; the judge decides whether it is the better one.
 */
const FUNCTION_WORDS = new Set([
  'who', 'what', 'when', 'where', 'which', 'why', 'how', 'whom', 'whose',
  'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'has', 'have', 'had',
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'about', 'from', 'by',
  'and', 'or', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'their', 'them', 'they',
  'me', 'my', 'i', 'we', 'our', 'you', 'your', 'can', 'could', 'should', 'would', 'will',
  'please', 'some', 'any', 'all', 'much', 'many',
]);

function contentWords(text: string): string {
  return text
    .split(/\s+/)
    .filter((w) => !FUNCTION_WORDS.has(w.toLowerCase().replace(/[^\p{L}\p{N}.+#-]/gu, '')))
    .join(' ');
}

/**
 * Capitalised words and version-like tokens, in order: the closest a
 * regex gets to "the thing being asked about". Used as the lookup key for
 * catalogue engines (IMDb) when the judge agrees it is the entity.
 */
function properNouns(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.+#]+$/gu, ''))
    .filter((w) => w && !FUNCTION_WORDS.has(w.toLowerCase()) && (/^\p{Lu}/u.test(w) || /\d/.test(w)))
    .join(' ');
}

function tidy(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,，:：\-–]+|[\s,，:：\-–?？!！.。]+$/g, '')
    .trim();
}

export function buildCandidates(request: string): string[] {
  const original = tidy(request);
  let stripped = original;
  for (const re of [...TIME_PHRASES, ...SOURCE_PHRASES]) {
    stripped = stripped.replace(re, ' ');
  }
  stripped = tidy(stripped);
  for (const re of FILLER_PHRASES) stripped = tidy(stripped.replace(re, ''));
  for (const re of TRAILING_FILLER) stripped = tidy(stripped.replace(re, ''));

  const candidates = [original];
  if (stripped && stripped.toLowerCase() !== original.toLowerCase()) {
    candidates.push(stripped);
  }
  const push = (value: string) => {
    if (value && !candidates.some((c) => c.toLowerCase() === value.toLowerCase())) {
      candidates.push(value);
    }
  };
  push(tidy(contentWords(stripped || original)));
  push(tidy(properNouns(stripped || original)));
  return candidates;
}
