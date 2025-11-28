/**
 * RSS Feed Service for Renewal Weekly
 * Fetches curated articles from RSS.app bundle feed
 * Replaces unreliable web search with guaranteed real URLs
 */

// RSS.app bundle feed URL (combines all curated sources)
const RSS_FEED_URL = 'https://rss.app/feeds/v1.1/cRDeGfxwf6t2nR8S.json';

// Category metadata for AI matching (keywords are guidelines, not filters)
export const FEED_CATEGORIES = {
  stemCells: {
    name: 'Stem Cells & Regenerative Medicine',
    guidelines: ['human trial', 'patient outcome', 'clinical results', 'treatment access'],
    sectionFit: ['leadStory', 'researchRoundup', 'onOurRadar']
  },
  longevity: {
    name: 'Anti-Aging & Longevity',
    guidelines: ['daily habit', 'practical longevity', 'affordable option', 'aging independence'],
    sectionFit: ['leadStory', 'deepDive', 'onOurRadar', 'quickHits']
  },
  chronicDisease: {
    name: 'Chronic Disease Management',
    guidelines: ['patient recovery', 'daily symptom ease', 'home management', 'remission story'],
    sectionFit: ['leadStory', 'onOurRadar', 'quickHits']
  },
  nutrition: {
    name: 'Nutrition & Supplements',
    guidelines: ['daily dose', 'supplement for joints', 'heart health easy', 'food for energy'],
    sectionFit: ['deepDive', 'worthKnowing', 'quickHits']
  }
};

// Content to avoid (for AI guidance)
export const CONTENT_TO_AVOID = [
  'animal study', 'mouse model', 'in vitro', 'preclinical',
  'molecular mechanism', 'gene expression', 'biomarker',
  'venture capital', 'funding round', 'pipeline abstract'
];

/**
 * Fetch articles from RSS feed
 * @param {number} daysBack - How many days of articles to include (default 7)
 * @returns {Promise<Array>} Array of normalized article objects
 */
export const fetchArticlePool = async (daysBack = 7) => {
  try {
    const response = await fetch(RSS_FEED_URL);

    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid RSS feed structure');
    }

    // Calculate cutoff date
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    // Normalize and filter articles
    const articles = data.items
      .map(item => normalizeArticle(item))
      .filter(article => {
        // Filter by date
        const articleDate = new Date(article.date);
        return articleDate > cutoffDate;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

    console.log(`RSS: Fetched ${articles.length} articles from past ${daysBack} days`);

    return articles;

  } catch (error) {
    console.error('RSS fetch error:', error);
    throw error;
  }
};

/**
 * Normalize article data from RSS feed format
 * @param {Object} item - Raw RSS item
 * @returns {Object} Normalized article object
 */
const normalizeArticle = (item) => {
  // Extract source/publisher from URL
  let source = 'Unknown';
  try {
    const url = new URL(item.url);
    source = getSourceName(url.hostname);
  } catch (e) {
    // Keep default
  }

  return {
    id: item.id || generateId(item.url),
    title: item.title || 'Untitled',
    url: item.url,  // REAL URL - guaranteed from RSS!
    date: item.date_published || new Date().toISOString(),
    dateFormatted: formatDate(item.date_published),
    source: source,
    author: item.authors?.[0]?.name || source,
    summary: cleanSummary(item.content_text || ''),
    image: item.image || item.attachments?.[0]?.url || null,
    // Metadata for AI matching
    category: detectCategory(item.title, item.content_text),
    audienceRelevance: null // AI will score this
  };
};

/**
 * Get friendly source name from hostname
 */
const getSourceName = (hostname) => {
  const sourceMap = {
    'www.sciencedaily.com': 'ScienceDaily',
    'sciencedaily.com': 'ScienceDaily',
    'www.nature.com': 'Nature',
    'nature.com': 'Nature',
    'www.cell.com': 'Cell',
    'cell.com': 'Cell',
    'stemcells.nih.gov': 'NIH Stem Cell',
    'www.nih.gov': 'NIH',
    'nih.gov': 'NIH',
    'www.statnews.com': 'STAT News',
    'statnews.com': 'STAT News',
    'www.healthline.com': 'Healthline',
    'healthline.com': 'Healthline',
    'www.mayoclinic.org': 'Mayo Clinic',
    'mayoclinic.org': 'Mayo Clinic',
    'newsnetwork.mayoclinic.org': 'Mayo Clinic',
    'www.biospace.com': 'BioSpace',
    'biospace.com': 'BioSpace',
    'longevity.technology': 'Longevity Technology',
    'www.lifespan.io': 'Lifespan.io',
    'lifespan.io': 'Lifespan.io',
    'www.fightaging.org': 'Fight Aging!',
    'fightaging.org': 'Fight Aging!',
    'www.healthrising.org': 'Health Rising',
    'healthrising.org': 'Health Rising',
    'www.parkinson.org': "Parkinson's Foundation",
    'parkinson.org': "Parkinson's Foundation",
    'www.alzforum.org': 'ALZFORUM',
    'alzforum.org': 'ALZFORUM',
    'www.nutraingredients.com': 'NutraIngredients',
    'nutraingredients.com': 'NutraIngredients',
    'examine.com': 'Examine.com',
    'www.examine.com': 'Examine.com',
    'nutritionfacts.org': 'NutritionFacts.org',
    'www.nutritionfacts.org': 'NutritionFacts.org',
    'newsinhealth.nih.gov': 'NIH News in Health',
    'www.cnn.com': 'CNN Health',
    'cnn.com': 'CNN Health',
    'www.npr.org': 'NPR',
    'npr.org': 'NPR'
  };

  return sourceMap[hostname] || hostname.replace('www.', '').split('.')[0];
};

/**
 * Auto-detect category from content
 */
const detectCategory = (title, content) => {
  const text = `${title} ${content}`.toLowerCase();

  if (text.includes('stem cell') || text.includes('regenerat') || text.includes('tissue engineer')) {
    return 'stemCells';
  }
  if (text.includes('longevity') || text.includes('anti-aging') || text.includes('lifespan') || text.includes('senolytic')) {
    return 'longevity';
  }
  if (text.includes('diabetes') || text.includes('parkinson') || text.includes('alzheimer') || text.includes('chronic')) {
    return 'chronicDisease';
  }
  if (text.includes('nutrition') || text.includes('supplement') || text.includes('vitamin') || text.includes('diet')) {
    return 'nutrition';
  }

  return 'general';
};

/**
 * Clean up summary text
 */
const cleanSummary = (text) => {
  if (!text) return '';
  // Remove HTML tags, extra whitespace
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500); // Limit length
};

/**
 * Format date for display
 */
const formatDate = (isoDate) => {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {
    return '';
  }
};

/**
 * Generate simple ID from URL
 */
const generateId = (url) => {
  return btoa(url).slice(0, 16);
};

/**
 * Build prompt for AI to match articles to newsletter sections
 * @param {Array} articles - Array of normalized articles
 * @param {Object} audience - Audience config from audience.json
 * @returns {string} Prompt for AI matching
 */
export const buildMatchingPrompt = (articles, audience) => {
  const articleList = articles.map((a, i) =>
    `[${i + 1}] "${a.title}" (${a.source}, ${a.dateFormatted})
    URL: ${a.url}
    Category: ${a.category}
    Summary: ${a.summary.slice(0, 200)}...`
  ).join('\n\n');

  return `You are selecting articles for a health newsletter.

AUDIENCE:
- Age: ${audience.demographics?.ageRange || '45-75'}
- Interests: ${audience.interests?.join(', ') || 'stem cells, regenerative medicine, longevity'}
- Conditions they care about: ${audience.conditions?.slice(0, 5).join(', ') || 'arthritis, diabetes, heart disease'}

AVAILABLE ARTICLES (${articles.length} total):
${articleList}

SELECT THE BEST ARTICLE FOR EACH SECTION:

1. LEAD STORY: Most broadly appealing, affects millions, mainstream-friendly
2. RESEARCH ROUNDUP: Scientific/clinical trial with practical implications
3. ON OUR RADAR (3 articles): Mix of topics, each from DIFFERENT source
4. DEEP DIVE: Nutrition/wellness/lifestyle with actionable tips
5. STAT OF THE WEEK: Article with a compelling statistic
6. QUICK HITS (5-7 articles): Brief news items, variety of topics

RULES:
- Each article can only be used ONCE
- Prefer articles about HUMAN research (not animal studies)
- Each "On Our Radar" story must be from a DIFFERENT website
- Prioritize articles your audience would find personally relevant

Return ONLY valid JSON:
{
  "leadStory": { "index": 1, "reason": "Why this article" },
  "researchRoundup": { "index": 2, "reason": "Why" },
  "onOurRadar": [
    { "index": 3, "reason": "Why" },
    { "index": 4, "reason": "Why" },
    { "index": 5, "reason": "Why" }
  ],
  "deepDive": { "index": 6, "reason": "Why" },
  "statOfWeek": { "index": 7, "reason": "Why" },
  "quickHits": [
    { "index": 8, "reason": "Why" },
    { "index": 9, "reason": "Why" },
    { "index": 10, "reason": "Why" },
    { "index": 11, "reason": "Why" },
    { "index": 12, "reason": "Why" }
  ]
}`;
};

export default {
  fetchArticlePool,
  buildMatchingPrompt,
  FEED_CATEGORIES,
  CONTENT_TO_AVOID
};
