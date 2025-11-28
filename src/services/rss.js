/**
 * RSS Feed Service for Renewal Weekly
 * Fetches articles directly from RSS feeds defined in config
 * No external service needed - just add feeds to rss-sources.json
 */

import rssSources from '../config/rss-sources.json';

// CORS proxy to allow browser fetching from external RSS feeds
const CORS_PROXY = 'https://api.allorigins.win/get?url=';

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
 * Fetch articles from all RSS feeds in config
 * @param {number} daysBack - How many days of articles to include (default 7)
 * @returns {Promise<Array>} Array of normalized article objects
 */
export const fetchArticlePool = async (daysBack = 7) => {
  const feeds = rssSources.feeds || [];

  if (feeds.length === 0) {
    console.warn('No RSS feeds configured in rss-sources.json');
    return [];
  }

  console.log(`RSS: Fetching from ${feeds.length} configured feeds...`);

  // Fetch all feeds in parallel
  const feedPromises = feeds.map(feed => fetchSingleFeed(feed));
  const results = await Promise.allSettled(feedPromises);

  // Combine all successful results
  let allArticles = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      console.log(`  ✓ ${feeds[index].name}: ${result.value.length} articles`);
      allArticles = allArticles.concat(result.value);
    } else if (result.status === 'rejected') {
      console.warn(`  ✗ ${feeds[index].name}: ${result.reason}`);
    }
  });

  // Calculate cutoff date
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Filter by date and sort
  const filteredArticles = allArticles
    .filter(article => {
      const articleDate = new Date(article.date);
      return articleDate > cutoffDate;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

  console.log(`RSS: Total ${filteredArticles.length} articles from past ${daysBack} days`);

  return filteredArticles;
};

/**
 * Fetch and parse a single RSS feed
 * @param {Object} feedConfig - Feed config object with url, name, category
 * @returns {Promise<Array>} Array of articles from this feed
 */
const fetchSingleFeed = async (feedConfig) => {
  try {
    // Use CORS proxy for browser compatibility
    const proxyUrl = CORS_PROXY + encodeURIComponent(feedConfig.url);
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const xmlText = data.contents;

    if (!xmlText) {
      throw new Error('Empty response');
    }

    // Parse XML
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');

    // Check for parse errors
    const parseError = xml.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid XML');
    }

    // Extract articles (handle both RSS 2.0 and Atom formats)
    const articles = [];

    // RSS 2.0 format: <item> elements
    const rssItems = xml.querySelectorAll('item');
    rssItems.forEach(item => {
      const article = parseRssItem(item, feedConfig);
      if (article) articles.push(article);
    });

    // Atom format: <entry> elements
    const atomEntries = xml.querySelectorAll('entry');
    atomEntries.forEach(entry => {
      const article = parseAtomEntry(entry, feedConfig);
      if (article) articles.push(article);
    });

    return articles;

  } catch (error) {
    throw new Error(`${feedConfig.name}: ${error.message}`);
  }
};

/**
 * Parse RSS 2.0 <item> element
 */
const parseRssItem = (item, feedConfig) => {
  const title = item.querySelector('title')?.textContent?.trim();
  const link = item.querySelector('link')?.textContent?.trim();
  const pubDate = item.querySelector('pubDate')?.textContent;
  const description = item.querySelector('description')?.textContent;
  const content = item.querySelector('content\\:encoded, encoded')?.textContent;

  if (!title || !link) return null;

  return normalizeArticle({
    title,
    url: link,
    date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    summary: description || content || '',
    feedName: feedConfig.name,
    feedCategory: feedConfig.category
  });
};

/**
 * Parse Atom <entry> element
 */
const parseAtomEntry = (entry, feedConfig) => {
  const title = entry.querySelector('title')?.textContent?.trim();
  const link = entry.querySelector('link[href]')?.getAttribute('href');
  const published = entry.querySelector('published, updated')?.textContent;
  const summary = entry.querySelector('summary, content')?.textContent;

  if (!title || !link) return null;

  return normalizeArticle({
    title,
    url: link,
    date: published ? new Date(published).toISOString() : new Date().toISOString(),
    summary: summary || '',
    feedName: feedConfig.name,
    feedCategory: feedConfig.category
  });
};

/**
 * Normalize article data
 * @param {Object} item - Parsed RSS item
 * @returns {Object} Normalized article object
 */
const normalizeArticle = (item) => {
  // Extract source/publisher from URL
  let source = item.feedName || 'Unknown';
  try {
    const url = new URL(item.url);
    source = getSourceName(url.hostname) || item.feedName;
  } catch (e) {
    // Keep feedName as source
  }

  return {
    id: generateId(item.url),
    title: item.title || 'Untitled',
    url: item.url,  // REAL URL - guaranteed from RSS!
    date: item.date,
    dateFormatted: formatDate(item.date),
    source: source,
    summary: cleanSummary(item.summary),
    // Metadata for AI matching
    category: item.feedCategory || detectCategory(item.title, item.summary),
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
