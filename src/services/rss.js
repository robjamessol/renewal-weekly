/**
 * RSS Feed Service for Renewal Weekly
 * Fetches articles from RSS.app bundle feed (aggregates multiple sources)
 */

// RSS.app bundle feed URL - aggregates all your curated sources
const RSS_APP_BUNDLE_URL = 'https://rss.app/feeds/v1.1/_LuMwsuTISMoZcOMw.json';

// Category metadata for AI matching (keywords are guidelines, not filters)
export const FEED_CATEGORIES = {
  stemCells: {
    name: 'Stem Cells',
    guidelines: ['human trial', 'patient outcome', 'clinical results', 'treatment access'],
    sectionFit: ['leadStory', 'researchRoundup', 'onOurRadar']
  },
  regenerativeMedicine: {
    name: 'Regenerative Medicine',
    guidelines: ['tissue engineering', 'cell therapy', 'organ repair', 'clinical application'],
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
    name: 'Nutrition',
    guidelines: ['daily diet', 'food for health', 'eating habits', 'meal planning'],
    sectionFit: ['deepDive', 'worthKnowing', 'quickHits']
  },
  supplements: {
    name: 'Supplements & Vitamins',
    guidelines: ['daily dose', 'supplement for joints', 'vitamin benefits', 'evidence-based'],
    sectionFit: ['deepDive', 'worthKnowing', 'quickHits']
  },
  clinicalTrials: {
    name: 'Clinical Trials & Research',
    guidelines: ['trial results', 'FDA approval', 'patient recruitment', 'breakthrough'],
    sectionFit: ['leadStory', 'researchRoundup', 'statOfWeek']
  }
};

// Content to avoid (for AI guidance)
export const CONTENT_TO_AVOID = [
  'animal study', 'mouse model', 'in vitro', 'preclinical',
  'molecular mechanism', 'gene expression', 'biomarker',
  'venture capital', 'funding round', 'pipeline abstract'
];

/**
 * Fetch articles from RSS.app bundle feed
 * @param {number} daysBack - How many days of articles to include (default 14)
 * @returns {Promise<Array>} Array of normalized article objects
 */
export const fetchArticlePool = async (daysBack = 14) => {
  try {
    console.log('RSS: Fetching from RSS.app bundle feed...');

    const response = await fetch(RSS_APP_BUNDLE_URL);

    if (!response.ok) {
      throw new Error(`RSS.app fetch failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid RSS.app feed structure');
    }

    console.log(`RSS: Received ${data.items.length} items from RSS.app`);

    // Calculate cutoff date
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    // Normalize and filter articles
    const articles = data.items
      .map(item => normalizeRssAppArticle(item))
      .filter(article => {
        const articleDate = new Date(article.date);
        return articleDate > cutoffDate;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

    console.log(`RSS: ${articles.length} articles from past ${daysBack} days`);

    return articles;

  } catch (error) {
    console.error('RSS fetch error:', error);
    return [];
  }
};

/**
 * Normalize article from RSS.app JSON format
 */
const normalizeRssAppArticle = (item) => {
  // Extract source from URL
  let source = 'Unknown';
  try {
    const url = new URL(item.url);
    source = getSourceName(url.hostname);
  } catch (e) {
    // Keep default
  }

  return {
    id: item.id || btoa(item.url).slice(0, 16),
    title: item.title || 'Untitled',
    url: item.url,  // REAL URL from RSS.app!
    date: item.date_published || new Date().toISOString(),
    dateFormatted: formatDate(item.date_published),
    source: source,
    summary: cleanSummary(item.content_text || item.content_html || ''),
    category: detectCategory(item.title, item.content_text || ''),
    audienceRelevance: null
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
 * Auto-detect category from content (fallback if not set in config)
 */
const detectCategory = (title, content) => {
  const text = `${title} ${content}`.toLowerCase();

  // Stem cells specific
  if (text.includes('stem cell')) {
    return 'stemCells';
  }
  // Regenerative medicine (broader)
  if (text.includes('regenerat') || text.includes('tissue engineer') || text.includes('cell therapy')) {
    return 'regenerativeMedicine';
  }
  // Clinical trials
  if (text.includes('clinical trial') || text.includes('phase 1') || text.includes('phase 2') || text.includes('phase 3') || text.includes('fda approv')) {
    return 'clinicalTrials';
  }
  // Longevity/anti-aging
  if (text.includes('longevity') || text.includes('anti-aging') || text.includes('lifespan') || text.includes('senolytic') || text.includes('aging')) {
    return 'longevity';
  }
  // Supplements
  if (text.includes('supplement') || text.includes('vitamin') || text.includes('omega-3') || text.includes('probiotic')) {
    return 'supplements';
  }
  // Nutrition
  if (text.includes('nutrition') || text.includes('diet') || text.includes('eating') || text.includes('food')) {
    return 'nutrition';
  }
  // Chronic disease
  if (text.includes('diabetes') || text.includes('parkinson') || text.includes('alzheimer') || text.includes('chronic') || text.includes('arthritis') || text.includes('heart disease')) {
    return 'chronicDisease';
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
