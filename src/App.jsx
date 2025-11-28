import React, { useState, useEffect, useRef, Component } from 'react';
import { getStyleRules, getAudienceContext, getSourceGuidance, getWordLimits, sources, audience } from './config';
import { fetchArticlePool, buildMatchingPrompt, CONTENT_TO_AVOID } from './services/rss';

// Error Boundary Component to catch rendering errors and prevent white screen
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('Newsletter App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Something went wrong</h1>
              <p className="text-gray-600 mb-4">The newsletter app encountered an error. Please try refreshing the page.</p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-left">
                <p className="text-sm text-red-800 font-mono break-all">
                  {this.state.error?.message || 'Unknown error'}
                </p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Rate limiting helper - delays between API calls to avoid hitting rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry helper with exponential backoff for rate limits
const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 15000, setStatus = null) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error.message?.includes('rate limit') || error.message?.includes('429') || error.message?.includes('overloaded')) {
        const waitTime = initialDelay * Math.pow(2, i); // 15s, 30s, 60s
        console.log(`Rate limit hit, waiting ${waitTime/1000}s before retry ${i + 1}/${maxRetries}`);
        if (setStatus) {
          setStatus(`⏳ Rate limit - waiting ${Math.round(waitTime/1000)}s then retrying (${i + 1}/${maxRetries})...`);
        }
        await delay(waitTime);
      } else {
        throw error; // Don't retry non-rate-limit errors
      }
    }
  }
  throw lastError;
};

// Local state input component to prevent focus loss on every keystroke
const PromptInput = ({ value, onChange, placeholder, disabled }) => {
  const [localValue, setLocalValue] = useState(value || '');
  const inputRef = useRef(null);

  // Sync local value when parent value changes (e.g., on reset)
  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      onChange(localValue);
      inputRef.current?.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
    />
  );
};

const RenewalWeeklyCompiler = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSettingsTab, setActiveSettingsTab] = useState('ai');
  const [isLoading, setIsLoading] = useState({});
  const [lastFetched, setLastFetched] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedSection, setCopiedSection] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    section1: true, section1b: true, section2: true, section3: true, section4: true,
    section4b: true, section5: true, section6: true, section7: true, section8: true,
    section9: true, section10: true, section11: true, section12: true,
    section13: true, section14: true, section15: true
  });
  const [sectionPrompts, setSectionPrompts] = useState({});
  const [section4Format, setSection4Format] = useState('treatment_spotlight');

  // ===== AI INTEGRATION =====
  const [anthropicApiKey, setAnthropicApiKey] = useState(() => {
    return localStorage.getItem('renewalWeekly_anthropicKey') || '';
  });
  const [testMode, setTestMode] = useState(() => {
    return localStorage.getItem('renewalWeekly_testMode') === 'true';
  });
  const [aiStatus, setAiStatus] = useState('');

  useEffect(() => {
    localStorage.setItem('renewalWeekly_testMode', testMode);
  }, [testMode]);

  useEffect(() => {
    if (anthropicApiKey) {
      localStorage.setItem('renewalWeekly_anthropicKey', anthropicApiKey);
    }
  }, [anthropicApiKey]);

  // ===== NEW 3-PHASE ARCHITECTURE =====

  // PHASE 1: Research - Fetch articles from curated RSS feeds (no web search!)
  // This replaces unreliable web search with guaranteed real URLs from RSS.app
  const researchArticles = async () => {
    if (!anthropicApiKey) return null;

    setAiStatus('📡 Phase 1: Fetching articles from RSS feeds...');

    try {
      // Step 1: Fetch articles from RSS feed (real URLs guaranteed!)
      const articlePool = await fetchArticlePool(7); // Last 7 days

      if (!articlePool || articlePool.length === 0) {
        setAiStatus('⚠️ No articles found in RSS feed');
        return null;
      }

      setAiStatus(`📰 Found ${articlePool.length} articles, AI is selecting best matches...`);

      // Filter out previously used URLs
      const freshArticles = articlePool.filter(a => !usedUrls.includes(a.url));

      if (freshArticles.length < 5) {
        setAiStatus('⚠️ Not enough fresh articles (most already used)');
        // Fall back to all articles if too few fresh ones
      }

      const articlesToUse = freshArticles.length >= 5 ? freshArticles : articlePool;

      // Step 2: AI matches articles to newsletter sections (no web search needed)
      const matchingPrompt = buildMatchingPrompt(articlesToUse, audience);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'anthropic-beta': 'prompt-caching-2024-07-31'
        },
        body: JSON.stringify({
          model: testMode ? 'claude-3-5-haiku-20241022' : 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: [{
            type: 'text',
            text: 'You are selecting articles for a health newsletter. Match articles to sections based on audience relevance. Return ONLY valid JSON.',
            cache_control: { type: 'ephemeral' }
          }],
          // NO web search tool - just reasoning!
          messages: [{ role: 'user', content: matchingPrompt }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'AI matching failed');
      }

      const data = await response.json();
      let content = '';
      for (const block of data.content) {
        if (block.type === 'text') content += block.text;
      }

      // Parse the AI's selection
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const selections = JSON.parse(jsonMatch[0]);

        // Convert selections to article objects with real data
        const selectedArticles = [];

        // Helper to get article by index
        const getArticle = (sel) => {
          if (!sel || !sel.index) return null;
          const article = articlesToUse[sel.index - 1]; // 1-indexed in prompt
          if (article) {
            return {
              ...article,
              suggestedSection: sel.reason,
              audienceScore: 9 // AI selected it, so high score
            };
          }
          return null;
        };

        // Lead Story
        if (selections.leadStory) {
          const a = getArticle(selections.leadStory);
          if (a) selectedArticles.push({ ...a, suggestedSection: 'leadStory' });
        }

        // Research Roundup
        if (selections.researchRoundup) {
          const a = getArticle(selections.researchRoundup);
          if (a) selectedArticles.push({ ...a, suggestedSection: 'researchRoundup' });
        }

        // On Our Radar (3 articles)
        if (selections.onOurRadar && Array.isArray(selections.onOurRadar)) {
          selections.onOurRadar.forEach(sel => {
            const a = getArticle(sel);
            if (a) selectedArticles.push({ ...a, suggestedSection: 'onOurRadar' });
          });
        }

        // Deep Dive
        if (selections.deepDive) {
          const a = getArticle(selections.deepDive);
          if (a) selectedArticles.push({ ...a, suggestedSection: 'deepDive' });
        }

        // Stat of Week
        if (selections.statOfWeek) {
          const a = getArticle(selections.statOfWeek);
          if (a) selectedArticles.push({ ...a, suggestedSection: 'statOfWeek' });
        }

        // Quick Hits (5-7 articles)
        if (selections.quickHits && Array.isArray(selections.quickHits)) {
          selections.quickHits.forEach(sel => {
            const a = getArticle(sel);
            if (a) selectedArticles.push({ ...a, suggestedSection: 'quickHits' });
          });
        }

        setAiStatus(`✓ Selected ${selectedArticles.length} articles for newsletter`);

        // Store the full article pool for reference
        window.__rssArticlePool = articlesToUse;

        return selectedArticles;
      }

      return null;
    } catch (error) {
      console.error('RSS research error:', error);
      setAiStatus(`RSS error: ${error.message}`);
      return null;
    }
  };

  // PHASE 2: Distribute - Assign articles to newsletter sections
  const distributeArticles = (articles) => {
    if (!articles || articles.length === 0) return null;

    setAiStatus('📋 Phase 2: Distributing articles to sections...');

    // Sort by audience score
    const sorted = [...articles].sort((a, b) => (b.audienceScore || 5) - (a.audienceScore || 5));

    // Distribute to sections
    const distribution = {
      leadStory: null,
      researchRoundup: null,
      livingWell: null,
      onOurRadar: [],
      deepDive: null,
      worthKnowing: [],
      quickHits: [],
      statOfWeek: null
    };

    // Lead Story: Highest scoring stem cell, regenerative medicine, or clinical trial article
    const leadCandidates = sorted.filter(a =>
      ['stemCells', 'regenerativeMedicine', 'clinicalTrials', 'chronicDisease'].includes(a.category) || a.audienceScore >= 8
    );
    distribution.leadStory = leadCandidates[0] || sorted[0];

    // Research Roundup: Best scientific/stem cell article
    const researchCandidates = sorted.filter(a =>
      ['stemCells', 'regenerativeMedicine', 'longevity', 'clinicalTrials'].includes(a.category)
    ).filter(a => a !== distribution.leadStory);
    distribution.researchRoundup = researchCandidates[0] || sorted.filter(a => a !== distribution.leadStory)[0];

    // Living Well: Lifestyle/nutrition article (lighthearted)
    const livingWellCandidates = sorted.filter(a =>
      ['nutrition', 'longevity', 'supplements'].includes(a.category)
    ).filter(a => a !== distribution.leadStory && a !== distribution.researchRoundup);
    distribution.livingWell = livingWellCandidates[0];

    // On Our Radar: 3 diverse articles
    const radarCandidates = sorted.filter(a =>
      a !== distribution.leadStory && a !== distribution.researchRoundup && a !== distribution.livingWell
    );
    distribution.onOurRadar = radarCandidates.slice(0, 3);

    // Deep Dive: Best wellness/nutrition/supplements article (different from Living Well)
    const deepDiveCandidates = sorted.filter(a =>
      ['nutrition', 'supplements', 'longevity', 'chronicDisease'].includes(a.category)
    ).filter(a => !distribution.onOurRadar.includes(a) && a !== distribution.leadStory && a !== distribution.researchRoundup && a !== distribution.livingWell);
    distribution.deepDive = deepDiveCandidates[0] || radarCandidates[3];

    // Worth Knowing: 4 diverse articles for brief mentions
    const usedSoFar = [
      distribution.leadStory,
      distribution.researchRoundup,
      distribution.livingWell,
      ...distribution.onOurRadar,
      distribution.deepDive
    ].filter(Boolean);
    const worthKnowingCandidates = sorted.filter(a => !usedSoFar.includes(a));
    distribution.worthKnowing = worthKnowingCandidates.slice(0, 4);

    // Quick Hits / The Pulse: 7 remaining diverse articles
    const usedArticles = [...usedSoFar, ...distribution.worthKnowing].filter(Boolean);
    const quickHitCandidates = sorted.filter(a => !usedArticles.includes(a));
    distribution.quickHits = quickHitCandidates.slice(0, 7);

    // Stat of Week: Look for article with compelling number or clinical trials
    const statCandidates = sorted.filter(a =>
      a.category === 'clinicalTrials' || /\$|\%|billion|million|[0-9]{3,}/.test(a.summary || '')
    ).filter(a => !usedArticles.includes(a));
    distribution.statOfWeek = statCandidates[0] || quickHitCandidates[0] || sorted[sorted.length - 1];

    console.log('Article distribution:', {
      leadStory: distribution.leadStory?.title,
      researchRoundup: distribution.researchRoundup?.title,
      livingWell: distribution.livingWell?.title,
      onOurRadar: distribution.onOurRadar.map(a => a?.title),
      deepDive: distribution.deepDive?.title,
      worthKnowing: distribution.worthKnowing.map(a => a?.title),
      statOfWeek: distribution.statOfWeek?.title,
      quickHits: distribution.quickHits.length
    });

    setAiStatus('✓ Articles distributed to sections');
    return distribution;
  };

  // PHASE 3: Write section content using pre-researched articles
  const writeSection = async (sectionType, articleData, additionalContext = '') => {
    if (!anthropicApiKey || !articleData) return null;

    setAiStatus(`✍️ Phase 3: Writing ${sectionType}...`);

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Build article context
    const articleContext = Array.isArray(articleData)
      ? articleData.map(a => `- "${a.title}" (${a.source}, ${a.date}): ${a.summary} [${a.url}]`).join('\n')
      : `"${articleData.title}" (${articleData.source}, ${articleData.date}): ${articleData.summary} [${articleData.url}]`;

    const writePrompt = `Write the ${sectionType} section using this pre-researched article(s):

=== ARTICLE(S) TO USE ===
${articleContext}

=== AUDIENCE REMINDER ===
${getAudienceContext()}

=== WRITING STYLE ===
${getStyleRules()}

${additionalContext}

Write the section NOW. Start immediately with the content - no preamble.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'anthropic-beta': 'prompt-caching-2024-07-31'
        },
        body: JSON.stringify({
          model: testMode ? 'claude-3-5-haiku-20241022' : 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: [{
            type: 'text',
            text: `You write for Renewal Weekly. Date: ${today}. Output ONLY the requested content. No preamble. No "Based on..." or "I found...". Start immediately with the headline or content.`,
            cache_control: { type: 'ephemeral' }
          }],
          messages: [{ role: 'user', content: writePrompt }]
        })
      });

      const data = await response.json();
      let content = '';
      for (const block of data.content) {
        if (block.type === 'text') content += block.text;
      }

      return cleanAIOutput(content);
    } catch (error) {
      return null;
    }
  };

  // ===== END 3-PHASE ARCHITECTURE =====

  // AI Content Generation Function with Web Search - Optimized for rate limits and cost
  const generateWithAI = async (sectionType, customPrompt = '', useWebSearch = true) => {
    if (!anthropicApiKey) {
      setAiStatus('Please add your Anthropic API key in Settings → AI tab');
      return null;
    }

    setIsLoading(prev => ({ ...prev, [sectionType]: true }));
    setAiStatus(`🔍 Researching ${sectionType}...`);

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
    const currentDay = new Date().getDate();
    const currentYear = new Date().getFullYear();

    // Major holidays - HIGHEST PRIORITY (check these first)
    const majorHolidays = {
      January: { 1: "New Year's Day" },
      February: { 14: "Valentine's Day" },
      March: { 17: "St. Patrick's Day" },
      May: { /* Memorial Day - last Monday */ },
      July: { 4: "Independence Day" },
      September: { /* Labor Day - first Monday */ },
      October: { 31: "Halloween" },
      November: { 11: "Veterans Day", 28: "Thanksgiving" }, // Thanksgiving varies - update yearly
      December: { 25: "Christmas Day", 31: "New Year's Eve" }
    };

    // Health awareness calendar - SECOND PRIORITY
    const healthCalendar = {
      January: { month: ['Cervical Health Awareness', 'Glaucoma Awareness', 'Thyroid Awareness', 'Blood Donor Month'], days: {} },
      February: { month: ['American Heart Month', 'Cancer Prevention Month'], days: { 2: 'National Wear Red Day', 4: 'World Cancer Day', 14: 'National Donor Day', 28: 'Rare Disease Day' } },
      March: { month: ['National Kidney Month', 'National Nutrition Month', 'Colorectal Cancer Awareness', 'MS Awareness'], days: { 13: 'World Kidney Day', 14: 'World Sleep Day', 21: 'World Down Syndrome Day', 24: 'World Tuberculosis Day', 26: 'Epilepsy Awareness Day' } },
      April: { month: ['Parkinson\'s Awareness', 'Autism Acceptance', 'Donate Life Month', 'Stress Awareness'], days: { 2: 'World Autism Awareness Day', 7: 'World Health Day', 11: 'World Parkinson\'s Day', 22: 'Earth Day', 25: 'World Malaria Day' } },
      May: { month: ['Mental Health Awareness', 'Skin Cancer Awareness', 'Stroke Awareness', 'Lupus Awareness'], days: { 6: 'World Asthma Day', 12: 'International Nurses Day', 17: 'World Hypertension Day', 30: 'World MS Day' } },
      June: { month: ['Men\'s Health Month', 'Alzheimer\'s & Brain Awareness', 'PTSD Awareness'], days: { 1: 'National Cancer Survivors Day', 14: 'World Blood Donor Day', 19: 'World Sickle Cell Day', 27: 'National HIV Testing Day' } },
      July: { month: ['UV Safety Month', 'Juvenile Arthritis Awareness'], days: { 11: 'World Brain Day', 28: 'World Hepatitis Day' } },
      August: { month: ['National Immunization Awareness', 'Psoriasis Action Month'], days: { 1: 'World Lung Cancer Day', 31: 'International Overdose Awareness Day' } },
      September: { month: ['Suicide Prevention Month', 'Healthy Aging Month', 'Prostate Cancer Awareness', 'Childhood Cancer Awareness'], days: { 10: 'World Suicide Prevention Day', 21: 'World Alzheimer\'s Day', 29: 'World Heart Day' } },
      October: { month: ['Breast Cancer Awareness', 'Mental Health Awareness', 'Down Syndrome Awareness'], days: { 10: 'World Mental Health Day', 12: 'World Arthritis Day', 17: 'National Mammography Day', 22: 'World Stroke Day' } },
      November: { month: ['American Diabetes Month', 'Lung Cancer Awareness', 'Alzheimer\'s Awareness', 'Movember'], days: { 14: 'World Diabetes Day', 17: 'World Prematurity Day', 20: 'Great American Smokeout' } },
      December: { month: ['Impaired Driving Prevention Month'], days: { 1: 'World AIDS Day', 3: 'International Day of Persons with Disabilities' } }
    };

    // Check for major holidays first (highest priority)
    const holidayEvents = majorHolidays[currentMonth] || {};
    const todayHoliday = holidayEvents[currentDay] || null;
    const upcomingHolidays = Object.entries(holidayEvents)
      .filter(([day]) => parseInt(day) > currentDay && parseInt(day) <= currentDay + 7)
      .map(([day, event]) => `${event} (${currentMonth} ${day})`)
      .slice(0, 1);

    // Then check health events
    const monthEvents = healthCalendar[currentMonth] || { month: [], days: {} };
    const todayHealthEvent = monthEvents.days[currentDay] || null;
    const upcomingHealthEvents = Object.entries(monthEvents.days)
      .filter(([day]) => parseInt(day) > currentDay && parseInt(day) <= currentDay + 7)
      .map(([day, event]) => `${event} (${currentMonth} ${day})`)
      .slice(0, 2);

    // Build context with correct priority: Holidays > Health Events > Seasonal
    let hookContext;
    if (todayHoliday) {
      hookContext = `TODAY IS: ${todayHoliday}. This is the TOP PRIORITY for your hook.`;
    } else if (upcomingHolidays.length > 0) {
      hookContext = `UPCOMING HOLIDAY: ${upcomingHolidays[0]}. Prioritize this.`;
    } else if (todayHealthEvent) {
      hookContext = `TODAY IS: ${todayHealthEvent}. Feature this health awareness day.`;
    } else if (upcomingHealthEvents.length > 0) {
      hookContext = `UPCOMING: ${upcomingHealthEvents.join(', ')}. Consider mentioning.`;
    } else {
      hookContext = `This month: ${monthEvents.month[0] || 'seasonal content'}. Focus on timely, relatable observations.`;
    }

    // System message - built from config files (edit src/config/*.json to customize)
    const systemMessage = `You write for Renewal Weekly, a health newsletter about stem cells, regenerative medicine, AND general health/wellness.
Date: ${today}.

${getAudienceContext()}

⚠️ CRITICAL OUTPUT RULES - FOLLOW EXACTLY:
1. Output ONLY the final newsletter content. NOTHING ELSE.
2. NO preamble like "Based on my search...", "I found a story...", "Let me write...", "Perfect!", "Great!"
3. NO thinking out loud. NO commentary. NO meta-discussion about what you found.
4. Start IMMEDIATELY with the headline or requested content.
5. JSON requests return ONLY valid JSON - no explanation, no markdown code blocks.
6. NEVER include citation artifacts like <cite index="..."> or [AI Generated, ...]
7. Content must be READER-READY - as if going directly into the newsletter.

⚠️ DATE REQUIREMENT - STRICTLY ENFORCED:
- ONLY use sources from the PAST 14 DAYS (since ${new Date(Date.now() - 14*24*60*60*1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
- REJECT any source older than 14 days
- If you cannot find recent sources, say so - do NOT use old content

⚠️ CONTENT MIX - Balance these (not just scientific papers):
- 40% accessible health news (CNN Health, NPR, Men's Health, Healthline, WebMD)
- 30% stem cell/regenerative medicine (still accessible, not overly technical)
- 30% lifestyle/wellness/longevity (trending, practical, actionable)

⚠️ PLAIN ENGLISH REQUIRED:
- Write for a general audience, not scientists
- If you must use a technical term, explain it: "autophagy (your body's cellular cleanup system)"
- Use conversational language like Men's Health or Healthline

${getStyleRules()}

${getSourceGuidance()}

REMINDER: Today is ${today}. Only cite articles from the past 14 days.`;

    // Section-specific configurations - uses Haiku in test mode (12x cheaper)
    const prodModel = 'claude-sonnet-4-20250514';
    const testModel = 'claude-3-5-haiku-20241022';
    const activeModel = testMode ? testModel : prodModel;

    const sectionConfig = {
      openingHook: { maxTokens: 400, needsWebSearch: true, model: activeModel },
      leadStory: { maxTokens: 1500, needsWebSearch: true, model: activeModel },
      researchRoundup: { maxTokens: 800, needsWebSearch: true, model: activeModel },
      livingWell: { maxTokens: 600, needsWebSearch: true, model: activeModel },
      secondaryStories: { maxTokens: 1500, needsWebSearch: true, model: activeModel },
      deepDive: { maxTokens: 1000, needsWebSearch: true, model: activeModel },
      statSection: { maxTokens: 800, needsWebSearch: true, model: activeModel },
      thePulse: { maxTokens: 1000, needsWebSearch: true, model: activeModel },
      recommendations: { maxTokens: 600, needsWebSearch: true, model: activeModel },
      gameTrivia: { maxTokens: 400, needsWebSearch: false, model: testModel }, // Always Haiku
      bottomLine: { maxTokens: 400, needsWebSearch: true, model: activeModel },
      worthKnowing: { maxTokens: 600, needsWebSearch: true, model: activeModel },
      wordOfDay: { maxTokens: 200, needsWebSearch: false, model: testModel } // Always Haiku
    };

    // Detailed prompts with exact formatting instructions
    const sectionPrompts = {
      openingHook: `Write a SHORT opening hook for ${today} (2-3 sentences, 40-60 words MAX).
${hookContext}
PRIORITY ORDER: National holidays > Health awareness days > Seasonal/weather > General observations.
IMPORTANT: Keep it warm, relatable, and BRIEF. Thank the reader or connect on a human level.
DO NOT mention stem cells, regenerative medicine, or newsletter content.
DO NOT end with a sign-off - that comes later in the template.

EXAMPLE (follow this exact length and tone):
As we head into the weekend, we're reminded why we started this newsletter - to keep you informed about the science that could change your life. Thank you for being part of our community. Here's to another week of discovery and hope.`,

      leadStory: `Search for a BROADLY ACCESSIBLE health/wellness story related to stem cells or regenerative medicine.

⚠️ DATE REQUIREMENT - THIS IS CRITICAL:
TODAY'S DATE: ${today}
CUTOFF DATE: ${new Date(Date.now() - 7*24*60*60*1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
ONLY use articles published AFTER the cutoff date. If an article doesn't show a date within the last 7 days, DO NOT USE IT.
If you cannot find any articles from the past 7 days, respond with "NO RECENT ARTICLES FOUND" instead of using old content.

⚠️ URL RULES - CRITICAL:
- ONLY use URLs that appear in your web search results - NEVER fabricate or guess URLs
- Every URL must link to the SPECIFIC ARTICLE page, never a homepage
- If a search result doesn't have a working article URL, don't use that story

⚠️ CONTENT RULES:
- NO ANIMAL STUDIES - Only human clinical trials, treatments, or research
- Stories must be from reputable health/medical sources

⚠️ SOURCE GUIDANCE:
- PRIORITIZE: Mainstream health publications (CNN Health, WebMD, Healthline, Medical News Today, NPR Health)
- PRIORITIZE: Stories with wide appeal (affecting millions: diabetes, heart disease, joint pain, aging, vision loss)
- AVOID: Highly technical scientific journal articles (save those for Research Roundup)

${customPrompt && customPrompt.startsWith('AVOID_TOPIC:') ? `
⚠️ DO NOT write about: "${customPrompt.split('|')[0].replace('AVOID_TOPIC:', '')}"
Find a COMPLETELY DIFFERENT story - different condition, different institution.
${customPrompt.split('|')[1] ? `Focus on: ${customPrompt.split('|')[1]}` : ''}` : (customPrompt ? `Focus on: ${customPrompt}` : '')}

STRICT WORD LIMIT: 280-320 words total.

OUTPUT FORMAT:
Line 1: TEASER HEADLINE (3-5 words max, no markdown)
- GOOD: "Ups and mostly downs", "Back in business", "Seeing clearly now"
- BAD: "Stem Cell Research Update", "New Treatment Found"

Then write TIGHT, PUNCHY prose:

Para 1 (2 sentences max): "For [X million] Americans with [condition], the prognosis has always been the same: [limitation]."

Para 2 (1 sentence): "That changed this week."

Para 3: **Here's what happened:** Key findings in 2-3 sentences. Embed link naturally: "Researchers at {{LINK:Johns Hopkins|url}} found..."

Para 4: **Why this matters now:** 2 sentences.

Para 5: **What's next:** 1-2 sentences.

Para 6: One short quote from researcher.

Para 7: **The zoom out:** 1-2 sentences. Embed link naturally in the text.

LINK FORMAT: Embed links in natural reading flow on meaningful words:
✅ GOOD: "A {{LINK:new clinical trial|url}} showed patients improved..."
✅ GOOD: "Researchers at {{LINK:Mayo Clinic|url}} published..."
❌ BAD: "Source: Mayo Clinic" or "{{LINK:Mayo Clinic|url}}" at end of paragraph

Total: 280-320 words.`,

      researchRoundup: `Find SCIENTIFIC RESEARCH from peer-reviewed journals.

⚠️ DATE REQUIREMENT - THIS IS CRITICAL:
TODAY'S DATE: ${today}
CUTOFF DATE: ${new Date(Date.now() - 14*24*60*60*1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
ONLY use research published AFTER the cutoff date. CHECK THE PUBLICATION DATE.
If you cannot find research from the past 14 days, respond with "NO RECENT RESEARCH FOUND" instead of using old content.

⚠️ URL RULES - CRITICAL:
- ONLY use URLs from your web search results - NEVER fabricate or guess URLs
- Every URL must link to the SPECIFIC ARTICLE/PAPER, never a journal homepage
- If you don't have a real URL from search, don't include that story

⚠️ CONTENT RULES:
- NO ANIMAL STUDIES - Only human clinical trials or research with direct human relevance
- Must be from: Nature, Cell, Science, NEJM, The Lancet, JAMA, Stem Cell Reports

${customPrompt && customPrompt.startsWith('AVOID_TOPIC:') ? `
⚠️ AVOID: "${customPrompt.split('|')[0].replace('AVOID_TOPIC:', '')}"
${customPrompt.split('|')[1] ? `Focus on: ${customPrompt.split('|')[1]}` : ''}` : (customPrompt ? `Focus on: ${customPrompt}` : '')}

STRICT FORMAT (120-150 words total):

[TEASER HEADLINE - 3-5 words, clever and curiosity-inducing]
- GOOD: "Nerves fighting back", "The myelin fix", "Joints on the mend"
- BAD: "MS Treatment Update", "New Research Shows"

If you or someone you love has [condition], this is worth reading twice.

[KEY FINDINGS - 2 sentences. Embed link naturally: "A {{LINK:new study in Nature|url}} found..."]

**What you should know:** [Practical info - cost, availability, access]

**The catch:** [One honest limitation]

**Bottom line:** [One actionable next step]

LINK FORMAT: Embed links naturally in the text:
✅ GOOD: "{{LINK:Researchers at Harvard|url}} discovered..."
✅ GOOD: "A {{LINK:Phase 2 trial|url}} showed..."
❌ BAD: Ending with "Source: Nature" or bare links

START DIRECTLY WITH THE HEADLINE. No introduction.`,

      livingWell: `Write a LIGHTHEARTED lifestyle/wellness tip for a health newsletter. This should feel like friendly advice from a knowledgeable friend, NOT heavy medical research.

⚠️ TOPIC FOCUS - Choose ONE of these areas:
- Simple daily habits (walking, sleep, hydration)
- Easy nutrition swaps (not diets, just small improvements)
- Stress reduction techniques
- Movement and flexibility
- Social connection and mental wellness
- Practical tips for aging well

⚠️ URL RULES - CRITICAL:
- ONLY use URLs from your web search results - NEVER fabricate or guess URLs
- Every URL must link to a SPECIFIC ARTICLE, never a homepage
- If you don't have a real URL from search, don't include a link

⚠️ TONE REQUIREMENTS:
- Warm, encouraging, accessible
- NO medical jargon or complex science
- Focus on ONE actionable tip that anyone can do TODAY
- Make it feel achievable, not overwhelming

STRICT FORMAT (100-150 words):

[CATCHY HEADLINE - 4-6 words, friendly and intriguing]
- GOOD: "The 10-Minute Evening Habit", "Why Your Grandma Was Right"
- BAD: "Health Study Reveals", "New Research on Walking"

Sometimes the best health advice isn't about breakthroughs—it's about the basics done right.

**This week's lifestyle pick:** [One specific habit/tip with brief explanation. Embed link naturally: "A {{LINK:recent study|url}} confirms..."]

**Why it works:** [1-2 sentences, simple explanation]

**Make it stick:** [One practical implementation tip]

**Bonus:** [One extra benefit to motivate]

LINK FORMAT: {{LINK:text|url}}
START DIRECTLY WITH THE HEADLINE. No introduction.`,

      secondaryStories: `Search for 3 different recent stem cell/regenerative medicine stories. Each story MUST be from a DIFFERENT WEBSITE.

⚠️ DATE REQUIREMENT - CRITICAL:
TODAY'S DATE: ${today}
CUTOFF DATE: ${new Date(Date.now() - 14*24*60*60*1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
ONLY use articles published AFTER the cutoff date. If no date visible or date is older, DO NOT USE.
If you cannot find 3 recent articles, include fewer rather than using old content.

⚠️ URL RULES - CRITICAL:
- ONLY use URLs that appear in your web search results - NEVER fabricate or guess URLs
- Every URL must link to the SPECIFIC ARTICLE page (must have /article/ or /news/ or similar path)
- URLs that end in just .com or .org are HOMEPAGES - do not use them
- If you don't have a real article URL from search, don't include that story

⚠️ SOURCE DIVERSITY - REQUIRED:
- Each of the 3 stories MUST be from a DIFFERENT website/domain
- Do NOT use the same source (e.g., sciencedaily.com) more than once
- Mix: 1 mainstream (CNN, NPR), 1 health publication (Healthline, WebMD), 1 scientific/institution

⚠️ CONTENT RULES:
- NO ANIMAL STUDIES - Only human clinical trials, treatments, or research
- Each story must be about a DIFFERENT topic/condition

⚠️ OUTPUT ONLY THE JSON ARRAY. No preamble. Start with [

[
  {
    "boldLead": "TEASER HEADLINE (3-5 words)",
    "content": "75-100 words. Embed link naturally: 'A {{LINK:new trial at Mayo|url}} showed...'",
    "sources": [{"title": "Publisher Name", "url": "https://example.com/full-path/to-specific-article", "date": "Nov 20, 2025"}]
  },
  {
    "boldLead": "Different headline (DIFFERENT website)",
    "content": "75-100 words with natural embedded link.",
    "sources": [{"title": "Different Publisher", "url": "https://different-site.com/specific-article-path", "date": "Nov 18, 2025"}]
  },
  {
    "boldLead": "Third headline (THIRD different website)",
    "content": "75-100 words with natural embedded link.",
    "sources": [{"title": "Third Publisher", "url": "https://third-site.com/article-path", "date": "Nov 15, 2025"}]
  }
]

LINK FORMAT in content:
✅ GOOD: "{{LINK:Researchers at Stanford|url}} found that patients..."
✅ GOOD: "A {{LINK:Phase 3 trial|url}} demonstrated..."
❌ BAD: "Source: CNN" at end, or homepage URLs like "cnn.com"

HEADLINES: 3-5 words, curiosity-inducing. NO animal references.`,

      deepDive: `Search for a practical nutrition/wellness topic.
${customPrompt && customPrompt.startsWith('AVOID_TOPIC:') ? `
⚠️ DO NOT write about: "${customPrompt.split('|')[0].replace('AVOID_TOPIC:', '')}"
Find a DIFFERENT topic entirely.
${customPrompt.split('|')[1] ? `Topic: ${customPrompt.split('|')[1]}` : ''}` : (customPrompt ? `Topic: ${customPrompt}` : '')}

⚠️ DATE REQUIREMENT - CRITICAL:
TODAY'S DATE: ${today}
CUTOFF DATE: ${new Date(Date.now() - 14*24*60*60*1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
ONLY use articles published AFTER the cutoff date. CHECK THE DATE.
If no recent articles found, respond with "NO RECENT ARTICLES FOUND" instead of using old content.

⚠️ URL RULES - CRITICAL:
- ONLY use URLs from your web search results - NEVER fabricate or guess URLs
- URL must be the SPECIFIC ARTICLE page (with /article/ or /health/ path), NOT a homepage
- Example of VALID URL: healthline.com/nutrition/anti-inflammatory-foods
- Example of INVALID URL: healthline.com (this is a homepage - NEVER use)
- If you don't have a real article URL from search, don't include a link

⚠️ CONTENT RULES:
- NO ANIMAL STUDIES - Only human research
- Plain English - explain like you're talking to your neighbor

⚠️ PREFERRED SOURCES: Harvard Health, Mayo Clinic, Healthline, WebMD, Men's Health, Prevention

STRICT WORD LIMIT: 180-220 words.

OUTPUT FORMAT:
Line 1: TEASER HEADLINE (3-5 words)
- GOOD: "The inflammation myth", "Your gut's secret weapon"
- BAD: "Anti-Inflammatory Foods Guide"

Para 1: Contrarian hook (1-2 sentences).

Para 2: What the research says. Embed link naturally: "A {{LINK:recent Harvard study|specific-url}} found..." (2 sentences)

Para 3: **What to add:** (use • bullets)
• Food/habit — specific amount
• Food/habit — specific amount
• Food/habit — specific amount

Para 4: **What to skip:**
• Item (and why)
• Item

Para 5: **Why it matters for healthy aging:** (1-2 sentences)

Para 6: Actionable takeaway with natural embedded link.

LINK FORMAT:
✅ GOOD: "According to {{LINK:new research from Cleveland Clinic|url}}, eating..."
✅ GOOD: "{{LINK:Nutritionists recommend|url}} adding..."
❌ BAD: "Source: Healthline" or links to homepage URLs

Use • for bullets, — for em dashes. Total: 180-220 words.`,

      statSection: `Search for a compelling statistic about health, wellness, longevity, OR regenerative medicine.

⚠️ DATE REQUIREMENT - CRITICAL:
TODAY'S DATE: ${today}
CUTOFF DATE: ${new Date(Date.now() - 14*24*60*60*1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
ONLY use statistics from articles published AFTER the cutoff date.
If no recent stats found, respond with "NO RECENT STATISTICS FOUND".

⚠️ URL RULES - CRITICAL:
- ONLY use URLs from your web search results - NEVER fabricate URLs
- URL must be SPECIFIC ARTICLE (with path like /article/ or /news/), NOT homepage
- If you don't have a real article URL, don't include a link

⚠️ CONTENT RULES:
- NO ANIMAL STUDIES - Only human-relevant statistics
- Mix topics: health, longevity, regenerative medicine, wellness

Return ONLY valid JSON with this EXACT structure:
{
  "primeNumber": "$403.86B",
  "headline": "where the regenerative medicine market is headed by 2032",
  "content": "That's not a typo. [Explain the statistic in plain English - 2 sentences max]

**Why it matters for you:** [Personal relevance - 2 sentences]

For context: [Supporting data that makes it relatable - 2 sentences]

**The backstory:** [Embed link naturally: 'According to {{LINK:a new report from Grand View Research|specific-article-url}}, the market...' - 2 sentences]

Translation: [What this means practically] Learn more from {{LINK:the full analysis|url}}."
}

CRITICAL:
- primeNumber format: $403B, 67%, 2,400, 47 days (visually impactful)
- headline: lowercase, creates curiosity
- content: Embed links naturally in sentences, NOT as citations at the end
- Plain English - explain like talking to a friend

LINK FORMAT:
✅ GOOD: "According to {{LINK:a recent JAMA study|url}}, patients who..."
❌ BAD: "Source: JAMA" or homepage URLs`,

      thePulse: `Search for 7 FRESH health/wellness/biotech news items.

⚠️ DATE REQUIREMENT - CRITICAL:
TODAY'S DATE: ${today}
CUTOFF DATE: ${new Date(Date.now() - 14*24*60*60*1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
ONLY use news from AFTER the cutoff date. CHECK EACH ARTICLE'S DATE.
If you can't find 7 recent items, include fewer rather than using old content.

⚠️ URL RULES - CRITICAL:
- ONLY use URLs from your web search results - NEVER fabricate or guess URLs
- URLs must be SPECIFIC ARTICLES (with /article/ or /news/ path), NOT homepages
- Example VALID: cnn.com/health/article/stem-cell-treatment-2025
- Example INVALID: cnn.com or cnn.com/health (these are homepages)
- If no real article URL exists, don't include that item

⚠️ SOURCE DIVERSITY - REQUIRED:
- Each item from a DIFFERENT website - do NOT repeat sciencedaily.com or any source
- Mix: 2-3 mainstream (CNN, NPR, Healthline), 2-3 biotech (STAT, Endpoints), 1-2 scientific

${customPrompt ? `⚠️ ${customPrompt}` : ''}

⚠️ CONTENT RULES:
- NO ANIMAL STUDIES
- Each item must be a DIFFERENT topic

Return ONLY valid JSON array. Each item ONE string:
- Link embedded naturally: {{LINK:meaningful text|specific-article-url}}
- Brief news (under 25 words)
- Source in [brackets]: [Source Name, Month Year]

EXAMPLE:
[
  "{{LINK:Mayo Clinic researchers|https://cnn.com/health/mayo-stem-cell-trial}} launched a new stem cell treatment for knee arthritis [CNN Health, Nov 2025]",
  "Adults over 50 who {{LINK:walk 7,000 steps daily|https://healthline.com/health-news/walking-longevity}} show 50% lower mortality risk [Healthline, Nov 2025]"
]

CRITICAL:
- 7 items from 7 DIFFERENT websites
- Every URL must be a real search result, never fabricated
- Every URL must be a specific article path, never a homepage`,

      recommendations: `Search for FRESH, NEW content to recommend. Find REAL, WORKING URLs.

⚠️ CRITICAL RULES:
- ALL URLs must link to SPECIFIC content (articles, videos, podcasts, tools), never to homepages
- Each refresh MUST return COMPLETELY DIFFERENT recommendations. Never repeat the same links.

${customPrompt ? `⚠️ AVOID THESE (already used): ${customPrompt}` : ''}

CONTENT STYLE - Mix of:
- Accessible health/wellness (Men's Health, Healthline, WebMD style)
- Lifestyle and longevity content
- Practical, actionable resources

Return ONLY valid JSON:
{
  "read": {
    "prefix": "Short intro text ",
    "linkText": "the linked part",
    "suffix": " context or source",
    "url": "https://REAL-working-url.com/specific-article"
  },
  "watch": {
    "prefix": "",
    "linkText": "Descriptive video title",
    "suffix": " (Source/Channel)",
    "url": "https://youtube.com/watch?v=specific-video"
  },
  "try": {
    "prefix": "The ",
    "linkText": "tool or resource name",
    "suffix": " (credible source)",
    "url": "https://REAL-resource-url.com/specific-tool"
  },
  "listen": {
    "prefix": "",
    "linkText": "Podcast name or episode",
    "suffix": " podcast",
    "url": "https://specific-podcast-episode-url.com"
  }
}

REQUIREMENTS:
- READ: Must be from PAST 14 DAYS (freshness required)
- WATCH, TRY, LISTEN: Can be evergreen/older content (no freshness requirement)
- ALL URLs must be real, working, and link to SPECIFIC content (not homepages)
- Content must be accessible to general audience (not just scientists)
- Mix health, longevity, wellness, and lifestyle topics
- Genuinely useful for adults 40-80 interested in living healthier`,

      gameTrivia: `Create fun health trivia game. Return JSON:
{"title":"","intro":"1-2 sentences","content":"questions","answer":"answers"}`,

      worthKnowing: `Create 4 "Worth Knowing" items for a health/wellness newsletter.

⚠️ URL RULES - CRITICAL:
- ONLY use URLs from your web search results - NEVER fabricate URLs
- URLs must be SPECIFIC pages (with /article/ or /guide/ path), NOT homepages
- If you don't have a real URL from search, set link to null

⚠️ TITLES: 3-5 words, creates curiosity
- GOOD: "The clinic checklist", "Mark your calendar"
- BAD: "Health Awareness Event", "Important Tips"

⚠️ FORMATTING: Use proper bulleted lists with line breaks

${customPrompt ? `⚠️ ${customPrompt}` : ''}

Return ONLY valid JSON array:
[
  {
    "type": "awareness",
    "title": "TEASER HEADLINE",
    "date": "Specific date range",
    "description": "What readers can do - specific and actionable.",
    "link": null
  },
  {
    "type": "guide",
    "title": "TEASER HEADLINE",
    "date": "",
    "description": "Format as bulleted list:\\n• First tip — explanation\\n• Second tip — explanation\\n• Third tip — explanation\\n\\nLearn more from {{LINK:this Mayo Clinic guide|specific-article-url}}",
    "link": "https://mayoclinic.org/healthy-lifestyle/specific-article"
  },
  {
    "type": "resource",
    "title": "TEASER HEADLINE",
    "date": "",
    "description": "What it is and why useful. Check out {{LINK:this helpful tool|url}} for more.",
    "link": "https://site.com/specific-resource-page"
  },
  {
    "type": "tip",
    "title": "TEASER HEADLINE",
    "date": "",
    "description": "Practical health tip:\\n• Item one\\n• Item two\\n\\nBased on {{LINK:recent research|url}}",
    "link": "https://site.com/specific-article"
  }
]

LINK FORMAT in descriptions:
✅ GOOD: "Learn more from {{LINK:this Harvard guide|url}}"
✅ GOOD: "Based on {{LINK:recent Cleveland Clinic research|url}}"
❌ BAD: "Source: Harvard Health" or homepage URLs

REQUIREMENTS:
- 4 items from 4 DIFFERENT websites
- awareness: Upcoming health event
- guide/resource/tip: Practical, plain English
- ALL links to SPECIFIC pages, never homepages

NO preamble. Start directly with [`
    };

    const config = sectionConfig[sectionType] || { maxTokens: 800, needsWebSearch: useWebSearch, model: 'claude-sonnet-4-20250514' };
    const shouldUseWebSearch = useWebSearch && config.needsWebSearch;

    try {
      const requestBody = {
        model: config.model,
        max_tokens: config.maxTokens,
        // Use array format with cache_control for prompt caching (90% savings on cached tokens)
        system: [{
          type: 'text',
          text: systemMessage,
          cache_control: { type: 'ephemeral' }
        }],
        messages: [{
          role: 'user',
          content: sectionPrompts[sectionType] || customPrompt
        }]
      };

      // Only add web search for sections that need it
      if (shouldUseWebSearch) {
        requestBody.tools = [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5  // Good balance of quality vs rate limits
        }];
      }

      // Use retry logic for rate limits
      const makeRequest = async () => {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicApiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'anthropic-beta': shouldUseWebSearch
              ? 'web-search-2025-03-05,prompt-caching-2024-07-31'
              : 'prompt-caching-2024-07-31'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = errorData.error?.message || 'API request failed';
          throw new Error(errorMessage);
        }

        return response.json();
      };

      // Retry up to 3 times on rate limit with exponential backoff
      const data = await retryWithBackoff(makeRequest, 3, 20000, setAiStatus);

      // Extract text content from the response
      let content = '';
      for (const block of data.content) {
        if (block.type === 'text') {
          content += block.text;
        }
      }

      setAiStatus(`✓ Generated ${sectionType}`);
      setIsLoading(prev => ({ ...prev, [sectionType]: false }));
      // Clean the output before returning
      return cleanAIOutput(content);
    } catch (error) {
      console.error(`Error generating ${sectionType}:`, error);
      setAiStatus(`⚠️ ${sectionType} failed: ${error.message}. Waiting 30s before continuing...`);
      setIsLoading(prev => ({ ...prev, [sectionType]: false }));
      // Wait before continuing to next section to avoid cascading rate limits
      await delay(30000);
      return null;
    }
  };

  // ===== V5.2 UPDATE: BRAND PURPLE COLOR PALETTE =====
  const colors = {
    primary: '#7C3AED',      // Main brand purple
    secondary: '#5B21B6',    // Deeper violet
    accent: '#EDE9FE',       // Soft lavender
    link: '#8B5CF6',         // Link underline purple
    dark: '#1E1B4B',         // Headers/footers
    text: '#1F2937',         // Charcoal
    muted: '#6B7280',        // Gray
    border: '#E5E7EB',       // Light gray
    white: '#FFFFFF'
  };

  // NEWSLETTER HISTORY - Save old newsletters before creating new ones
  const [newsletterHistory, setNewsletterHistory] = useState(() => {
    const saved = localStorage.getItem('renewalWeekly_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('renewalWeekly_history', JSON.stringify(newsletterHistory));
  }, [newsletterHistory]);

  // USED STORIES TRACKING
  const [usedStories, setUsedStories] = useState(() => {
    const saved = localStorage.getItem('renewalWeekly_usedStories');
    return saved ? JSON.parse(saved) : [];
  });

  // USED URLS TRACKING - prevents same articles across newsletters
  const [usedUrls, setUsedUrls] = useState(() => {
    const saved = localStorage.getItem('renewalWeekly_usedUrls');
    return saved ? JSON.parse(saved) : [];
  });

  // CUSTOM NEWS SOURCES
  const [customSources, setCustomSources] = useState(() => {
    const saved = localStorage.getItem('renewalWeekly_customSources');
    return saved ? JSON.parse(saved) : [
      { name: 'ScienceDaily - Stem Cells', url: 'https://www.sciencedaily.com/news/health_medicine/stem_cells/', enabled: true },
      { name: 'ClinicalTrials.gov', url: 'https://clinicaltrials.gov', enabled: true },
      { name: 'Cell Stem Cell Journal', url: 'https://www.cell.com/cell-stem-cell/home', enabled: true },
      { name: 'Nature Regenerative Medicine', url: 'https://www.nature.com/natregenmed/', enabled: true },
      { name: 'STAT News', url: 'https://www.statnews.com', enabled: true },
      { name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/', enabled: true }
    ];
  });
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');

  useEffect(() => {
    localStorage.setItem('renewalWeekly_usedStories', JSON.stringify(usedStories));
  }, [usedStories]);

  useEffect(() => {
    localStorage.setItem('renewalWeekly_usedUrls', JSON.stringify(usedUrls));
  }, [usedUrls]);

  useEffect(() => {
    localStorage.setItem('renewalWeekly_customSources', JSON.stringify(customSources));
  }, [customSources]);

  // ===== V5.2 UPDATE: PARSE CONTENT WITH EMBEDDED LINKS =====
  const parseContentWithLinks = (content) => {
    if (!content) return [{ type: 'text', content: '' }];
    
    const linkRegex = /\{\{LINK:([^|]+)\|([^}]+)\}\}/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'link', text: match[1], url: match[2] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push({ type: 'text', content: content.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content }];
  };

  const renderContentWithLinks = (content) => {
    const parts = parseContentWithLinks(content);
    return parts.map((part, i) => {
      if (part.type === 'link') {
        return (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: 'none',
              color: '#1F2937',
              borderBottom: '2px solid #8B5CF6',
              paddingBottom: '1px'
            }}
          >
            {part.text}
          </a>
        );
      }
      // Handle bold text **text**
      const boldParts = part.content.split(/\*\*([^*]+)\*\*/g);
      return boldParts.map((bp, j) => 
        j % 2 === 1 ? <strong key={`${i}-${j}`}>{bp}</strong> : bp
      );
    });
  };

  // Strip link syntax for plain text export
  const stripLinkSyntax = (content) => {
    if (!content) return '';
    return content.replace(/\{\{LINK:([^|]+)\|([^}]+)\}\}/g, '$1');
  };

  // Clean AI output - remove citation artifacts, preamble, and metadata
  const cleanAIOutput = (content) => {
    if (!content) return '';

    let cleaned = content
      // Remove citation artifacts like <cite index="4-18,4-19">
      .replace(/<cite[^>]*>/g, '')
      .replace(/<\/cite>/g, '')
      // Remove [AI Generated, Nov 2025] and similar
      .replace(/\[AI Generated[^\]]*\]/gi, '')
      // Remove any remaining markdown artifacts
      .replace(/^\*\*\*+$/gm, '');

    // Remove AI thinking/preamble - check for common patterns at START of content
    // This handles multi-sentence preambles
    const preamblePatterns = [
      /^(Perfect!|Great!|Excellent!|Sure!|Okay!|Alright!|Absolutely!|Of course!)[^.!?]*[.!?]\s*/gi,
      /^I (found|discovered|searched|located|identified|need to|have found|will|can|should|'ll|'ve)[^.]*\.\s*/gi,
      /^(Based on|According to|Looking at|After searching|After reviewing|Here is|Here are|Here's|Let me|Now I)[^.]*\.\s*/gi,
      /^This (is|was|looks|seems|appears)[^.]*\.\s*/gi,
      /^(The search|My search|I've found|I have found|Most of these|The article)[^.]*\.\s*/gi,
      /^[^.]*?(exactly what|what you requested|what the user|for your newsletter|sources are older)[^.]*\.\s*/gi,
      /^[^.]*?(I found|I need|I also|I will|I can|I should)[^.]*\.\s*/gi,
    ];

    // Apply preamble removal multiple times to catch nested preambles
    for (let i = 0; i < 5; i++) {
      for (const pattern of preamblePatterns) {
        cleaned = cleaned.replace(pattern, '');
      }
    }

    return cleaned.trim();
  };

  // Extract sources from content with {{LINK:text|url}} pattern
  const extractSourcesFromContent = (content) => {
    if (!content) return [];
    const linkRegex = /\{\{LINK:([^|]+)\|([^}]+)\}\}/g;
    const sources = [];
    const seenUrls = new Set(); // Deduplicate by URL
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const url = match[2];
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      // Extract source name from URL hostname instead of link text
      let sourceName = match[1]; // Fallback to link text
      try {
        const hostname = new URL(url).hostname;
        // Map hostnames to friendly source names
        const sourceMap = {
          'www.sciencedaily.com': 'ScienceDaily',
          'sciencedaily.com': 'ScienceDaily',
          'www.nature.com': 'Nature',
          'nature.com': 'Nature',
          'www.cell.com': 'Cell',
          'www.statnews.com': 'STAT News',
          'statnews.com': 'STAT News',
          'www.nih.gov': 'NIH',
          'nih.gov': 'NIH',
          'pubmed.ncbi.nlm.nih.gov': 'PubMed',
          'www.mayoclinic.org': 'Mayo Clinic',
          'newsnetwork.mayoclinic.org': 'Mayo Clinic',
          'www.healthline.com': 'Healthline',
          'www.webmd.com': 'WebMD',
          'www.cnn.com': 'CNN Health',
          'www.nytimes.com': 'New York Times',
          'www.fightaging.org': 'Fight Aging!',
          'longevity.technology': 'Longevity Technology',
          'www.lifespan.io': 'Lifespan.io'
        };
        sourceName = sourceMap[hostname] || hostname.replace('www.', '').split('.')[0].charAt(0).toUpperCase() + hostname.replace('www.', '').split('.')[0].slice(1);
      } catch (e) {
        // Keep link text as fallback
      }

      sources.push({
        title: sourceName,
        url: url,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      });
    }
    return sources;
  };

  // Save URLs to prevent reuse in future newsletters
  const saveUrlsForExclusion = (sources) => {
    if (!sources || sources.length === 0) return;
    const newUrls = sources.map(s => s.url).filter(Boolean);
    if (newUrls.length > 0) {
      setUsedUrls(prev => [...new Set([...prev, ...newUrls])].slice(-50)); // Keep last 50
    }
  };

  // GAME TEMPLATES
  const gameTemplates = [
    {
      id: 'nutritional_facts',
      title: 'Nutritional Facts',
      intro: "Below is the ingredient list for a popular food product. Can you guess what it is?",
      content: `Enriched wheat flour, niacin, reduced iron, thiamin mononitrate, riboflavin, folic acid, water, high fructose corn syrup, yeast, soybean oil, salt, wheat gluten, calcium sulfate, sodium stearoyl lactylate, monoglycerides, calcium dioxide, datem, calcium iodate, ethoxylated mono and diglycerides...`,
      answer: "A loaf of white bread (Sara Lee Classic White)"
    },
    {
      id: 'myth_or_fact',
      title: 'Health Myth or Fact?',
      intro: "Test your health knowledge! Are these statements myth or fact?",
      content: `1. You need to drink 8 glasses of water per day → ___
2. Cracking your knuckles causes arthritis → ___
3. Eating carrots improves your night vision → ___

A) Myth  B) Fact  C) Partially True`,
      answer: "1-C (needs vary by person), 2-A (no evidence supports this), 3-C (only if you're Vitamin A deficient)"
    },
    {
      id: 'match_condition',
      title: 'Match the Breakthrough',
      intro: "Match each stem cell therapy to the condition it treats:",
      content: `1. Ryoncil (first FDA-approved MSC therapy) → ___
2. RPESC-RPE transplant → ___  
3. CAR-T cell therapy → ___

A) Age-related macular degeneration
B) Certain blood cancers
C) Steroid-refractory acute graft-versus-host disease`,
      answer: "1-C, 2-A, 3-B"
    },
    {
      id: 'name_that_organ',
      title: 'Name That Organ',
      intro: "Based on these clues, can you identify the organ?",
      content: `• It regenerates itself completely every 7-10 years
• It's your body's largest internal organ
• It filters about 1.4 liters of blood per minute
• Ancient Greeks thought it was the seat of emotions
• It can regenerate from as little as 25% of its original tissue`,
      answer: "The Liver"
    },
    {
      id: 'vitamin_match',
      title: 'Vitamin Match-Up',
      intro: "Match each vitamin to its primary function:",
      content: `1. Vitamin K → ___
2. Vitamin D → ___
3. Vitamin B12 → ___
4. Vitamin C → ___

A) Red blood cell production
B) Blood clotting
C) Calcium absorption for bones
D) Collagen synthesis and immune function`,
      answer: "1-B, 2-C, 3-A, 4-D"
    },
    {
      id: 'calorie_guess',
      title: 'Calorie Showdown',
      intro: "Which has MORE calories? (Answers may surprise you!)",
      content: `1. A medium avocado OR a glazed donut?
2. A cup of granola OR a cup of Frosted Flakes?
3. A tablespoon of olive oil OR a tablespoon of butter?
4. A banana OR 15 grapes?`,
      answer: "1. Avocado (322 vs 269), 2. Granola (597 vs 137!), 3. Olive oil (119 vs 102), 4. Banana (105 vs 52)"
    },
    {
      id: 'body_numbers',
      title: 'Body by the Numbers',
      intro: "Fill in the blank with the correct number:",
      content: `1. Your body has ___ miles of blood vessels
2. Adults have ___ bones (babies have more!)
3. Your heart beats about ___ times per day
4. You produce about ___ liters of saliva daily`,
      answer: "1. 60,000 miles, 2. 206 bones, 3. 100,000 beats, 4. 1-2 liters"
    },
    {
      id: 'anti_inflammatory',
      title: 'Anti-Inflammatory Food Quiz',
      intro: "Which food in each pair is MORE anti-inflammatory?",
      content: `1. Salmon OR Tilapia?
2. White rice OR Quinoa?
3. Almonds OR Peanuts?
4. Spinach OR Iceberg lettuce?
5. Turmeric OR Paprika?`,
      answer: "1. Salmon (omega-3s), 2. Quinoa (fiber + complete protein), 3. Almonds (vitamin E), 4. Spinach (antioxidants), 5. Turmeric (curcumin)"
    }
  ];

  const getWeeklyGame = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
    return gameTemplates[weekNumber % gameTemplates.length];
  };

  const [currentGame, setCurrentGame] = useState(getWeeklyGame());

  const rotateGame = () => {
    const currentIndex = gameTemplates.findIndex(g => g.id === currentGame.id);
    const nextIndex = (currentIndex + 1) % gameTemplates.length;
    setCurrentGame(gameTemplates[nextIndex]);
  };

  // Generate Midjourney prompt based on story content - Updated for purple palette
  const generateMidjourneyPrompt = (headline, type = 'general') => {
    const prompts = {
      'stem_cell': `Scientific visualization of stem cells differentiating into healthy tissue, bioluminescent purple and violet glow, medical illustration style, clean composition, hopeful atmosphere, soft lighting --ar 16:9 --v 6`,
      'vision': `Abstract visualization of human eye with regenerating retinal cells, golden light rays emanating from iris, medical art style, deep purple and amber colors, hope and healing theme --ar 16:9 --v 6`,
      'diabetes': `Microscopic view of healthy pancreatic islet cells producing insulin, warm golden glow radiating from cell clusters, scientific visualization, violet and gold color palette --ar 16:9 --v 6`,
      'nutrition': `Elegant flat lay of anti-inflammatory foods on marble surface, salmon, olive oil, colorful berries, turmeric, leafy greens, soft natural lighting, editorial food photography style --ar 16:9 --v 6`,
      'clinical_trial': `Modern medical research laboratory, scientists in white coats reviewing data on screens, hopeful atmosphere, clean purple and white aesthetic, soft professional lighting --ar 16:9 --v 6`,
      'brain': `Artistic visualization of neural connections and synapses firing, deep purple and electric violet colors, scientific beauty, abstract medical illustration --ar 16:9 --v 6`,
      'heart': `Anatomical heart transforming into healthy tissue, red and purple gradient, scientific illustration meets fine art, regeneration theme, dramatic lighting --ar 16:9 --v 6`,
      'general': `Abstract medical breakthrough concept, DNA helix intertwined with healing light, purple and violet gradient, clean modern scientific aesthetic, hopeful atmosphere --ar 16:9 --v 6`,
      'stats': `Data visualization coming to life, floating numbers and graphs in 3D space, purple holographic style, futuristic medical data concept, clean dark background --ar 16:9 --v 6`,
      'games': `Playful medical trivia concept, illustrated brain with question marks, friendly educational style, soft pastel colors with pops of purple, approachable and fun --ar 16:9 --v 6`
    };
    
    // Auto-detect type from headline
    const lowerHeadline = headline.toLowerCase();
    if (lowerHeadline.includes('vision') || lowerHeadline.includes('eye') || lowerHeadline.includes('amd') || lowerHeadline.includes('retina')) return prompts.vision;
    if (lowerHeadline.includes('diabetes') || lowerHeadline.includes('insulin') || lowerHeadline.includes('pancrea')) return prompts.diabetes;
    if (lowerHeadline.includes('brain') || lowerHeadline.includes('neuro') || lowerHeadline.includes('parkinson')) return prompts.brain;
    if (lowerHeadline.includes('heart') || lowerHeadline.includes('cardio')) return prompts.heart;
    if (lowerHeadline.includes('diet') || lowerHeadline.includes('food') || lowerHeadline.includes('nutrition') || lowerHeadline.includes('inflammatory')) return prompts.nutrition;
    if (lowerHeadline.includes('trial') || lowerHeadline.includes('study') || lowerHeadline.includes('research')) return prompts.clinical_trial;
    if (lowerHeadline.includes('stem cell') || lowerHeadline.includes('regenerat')) return prompts.stem_cell;
    if (lowerHeadline.includes('stat') || lowerHeadline.includes('billion') || lowerHeadline.includes('number') || lowerHeadline.includes('%')) return prompts.stats;
    
    return prompts[type] || prompts.general;
  };

  const [newsletterData, setNewsletterData] = useState({
    preHeader: {
      subjectLine: 'Stem Cells Just Restored Vision in Patients Who Were Told It Was Impossible',
      previewText: 'Plus: 5 red flags when choosing a stem cell clinic and the anti-inflammatory foods worth adding to your cart',
      from: 'Renewal Weekly | crew@renewalweekly.com',
      issueNumber: '12',
      date: 'Nov 28, 2025',
      readTime: '7 min read'
    },

    // 1. OPENING HOOK (short, 2-3 sentences)
    openingHook: {
      content: `Welcome to this week's edition of Renewal Weekly. We're excited to share the latest breakthroughs in regenerative medicine and longevity research with you. Let's dive into what's making headlines in health this week.`,
      sources: []
    },

    // 1.5 IN TODAY'S EDITION (teaser bullets with emojis)
    bottomLine: {
      sectionLabel: "IN TODAY'S EDITION",
      subtitle: '',
      items: [
        '👁️ Vision restored after AMD trial',
        '💊 New MS therapy results',
        '📊 $403B market projection',
        '🧬 Inflammation and stem cell aging'
      ]
    },



    // ===== METRICS DASHBOARD - 2x2 GRID (RSS-derived stats) =====
    metricsDashboard: {
      title: 'THIS WEEK IN REGENERATIVE MEDICINE',
      metrics: [
        // Row 1
        { label: 'Articles This Week', value: '—', change: 'Loading...', source: 'RSS Feed', dynamic: true },
        { label: 'Top Topic', value: '—', change: '', source: 'This Issue', dynamic: true },
        // Row 2
        { label: 'Sources Featured', value: '—', change: '', source: 'Curated Feed', dynamic: true },
        { label: 'Research Categories', value: '—', change: '', source: 'This Issue', dynamic: true }
      ],
      asOfDate: '',
      explainerLink: ''
    },

    // ===== V5.2 UPDATE: LEAD STORY WITH EMBEDDED LINKS =====
    leadStory: {
      sectionLabel: 'THIS WEEK\'S BIG STORY',
      headline: 'Stem Cells Just Did What Doctors Said Was Impossible',
      publishedDate: 'Nov 22, 2025',
      image: {
        placeholder: '[INSERT HERO IMAGE]',
        credit: 'Getty Images',
        midjourneyPrompt: ''
      },
      content: `For 20 million Americans with age-related macular degeneration, the prognosis has always been the same: We can slow it down, but we can't bring back what you've lost.

That changed this week.

Researchers at the {{LINK:University of Michigan|https://www.sciencedaily.com/releases/2025/11/251121090736.htm}} published results from the first-ever human trial using adult stem cells to treat advanced dry AMD—and patients didn't just stabilize. They got better.

**Here's what happened:** Patients in the low-dose group gained the ability to read 21 additional letters on a standard eye chart after one year. For context, that's the difference between needing help crossing the street and reading a restaurant menu.

**Why this matters now:**

The treatment uses retinal pigment epithelial stem cells harvested from adult donor eye tissue—sidestepping the ethical debates that have slowed embryonic stem cell research for decades. Unlike previous attempts, this approach doesn't require immunosuppression drugs.

**What's next:** The team is now monitoring 12 patients who received higher doses. If safety data holds, they'll move to larger trials.

"We were surprised by the magnitude of vision gain in the most severely affected patients," said Dr. Rajesh Rao, lead researcher.

**The zoom out:** This is exactly the kind of rigorous, FDA-tracked research that separates real regenerative medicine from the clinics promising miracle cures. The full study was published in {{LINK:Cell Stem Cell|https://doi.org/10.1016/j.stem.2025.08.012}}.`,
      initials: 'RW',
      sources: [
        { title: 'ScienceDaily', url: 'https://www.sciencedaily.com/releases/2025/11/251121090736.htm', date: 'Nov 22, 2025' },
        { title: 'Cell Stem Cell', url: 'https://doi.org/10.1016/j.stem.2025.08.012', date: 'Nov 2025' }
      ]
    },

    // ===== V5.2 UPDATE: RESEARCH ROUNDUP WITH EMBEDDED LINKS =====
    yourOptionsThisWeek: {
      sectionLabel: 'RESEARCH ROUNDUP',
      format: 'treatment_spotlight',
      title: 'Your Weekly Dose of Health Innovation',
      subtitle: 'Treatment Spotlight: MSC Therapy for Multiple Sclerosis',
      publishedDate: 'Nov 17, 2025',
      image: {
        placeholder: '[INSERT IMAGE]',
        credit: 'Getty Images',
        midjourneyPrompt: ''
      },
      content: `If you or someone you love has MS, this one's worth reading twice.

A new {{LINK:systematic review|https://multiplesclerosisnewstoday.com/news-posts/2025/11/17/mesenchymal-stem-cell-therapy-shows-promise-ms-review/}} just analyzed every clinical trial testing mesenchymal stem cell (MSC) therapy for multiple sclerosis—and the results are genuinely encouraging. Patients showed improvements in disability scores, walking ability, vision, and even auditory function. Side effects? Mostly mild: headache, fatigue, and low-grade fever that resolved quickly.

**What you should know:** MSC therapy for MS is still considered experimental and isn't covered by insurance. Most patients access it through clinical trials or private clinics abroad. Costs range from $5,000–$30,000 depending on the protocol.

**The catch:** Results varied based on how cells were delivered (IV vs. spinal injection) and where the MSCs came from. There's no standardized protocol yet.

**Bottom line:** If you're considering this route, ask your neurologist about active clinical trials on {{LINK:ClinicalTrials.gov|https://clinicaltrials.gov}} before exploring private options.`,
      initials: 'RW',
      sources: [
        { title: 'Multiple Sclerosis News Today', url: 'https://multiplesclerosisnewstoday.com/news-posts/2025/11/17/mesenchymal-stem-cell-therapy-shows-promise-ms-review/', date: 'Nov 17, 2025' }
      ]
    },

    // ===== LIVING WELL - LIFESTYLE SECTION =====
    livingWell: {
      sectionLabel: 'LIVING WELL',
      headline: 'Small Changes, Big Impact',
      publishedDate: 'Nov 2025',
      content: `Sometimes the best health advice isn't about breakthroughs—it's about the basics done right.

**This week's lifestyle pick:** Walking after meals. A {{LINK:new study|https://www.healthline.com/health-news/walking-after-meals}} confirms what grandma always said: a 10-minute walk after dinner can lower blood sugar by up to 22%.

**Why it works:** Movement helps muscles absorb glucose from your bloodstream, reducing the post-meal spike that contributes to inflammation and fatigue.

**Make it stick:** Keep your walking shoes by the door. Even 5 minutes helps—you don't need a full workout.

**Bonus:** Evening walks also improve sleep quality and give your mind a chance to decompress from the day.`,
      initials: 'RW',
      sources: [
        { title: 'Healthline', url: 'https://www.healthline.com/health-news/walking-after-meals', date: 'Nov 2025' }
      ]
    },

    // 5. SPONSOR 1
    sponsorBlock1: {
      headline: '[Sponsor Headline]',
      body: '[Sponsor content goes here]',
      cta: 'Use code RENEWAL20 for 20% off.',
      isPlaceholder: true
    },

    // ===== V5.2 UPDATE: SECONDARY STORIES WITH EMBEDDED LINKS =====
    secondaryStories: {
      sectionLabel: 'ON OUR RADAR',
      image: {
        placeholder: '[INSERT IMAGE]',
        credit: 'Getty Images',
        midjourneyPrompt: ''
      },
      stories: [
        {
          id: 1,
          boldLead: 'Stanford just made stem cell transplants safer—without chemo.',
          publishedDate: 'Nov 7, 2025',
          content: `A new antibody therapy can prepare patients for stem cell transplants without toxic chemotherapy or radiation. In a {{LINK:Phase 1 trial|https://www.sciencedaily.com/releases/2025/11/251107010324.htm}}, children with Fanconi anemia achieved nearly complete donor cell replacement using just an antibody called briquilimab. The approach could open lifesaving transplants to patients who were previously too fragile—including elderly cancer patients.`,
          sources: [{ title: 'ScienceDaily', url: 'https://www.sciencedaily.com/releases/2025/11/251107010324.htm', date: 'Nov 7, 2025' }]
        },
        {
          id: 2,
          boldLead: 'Type 1 diabetes was cured in mice. Humans might be next.',
          publishedDate: 'Nov 18, 2025',
          content: `{{LINK:Stanford researchers|https://med.stanford.edu/news/all-news/2025/11/type-1-diabetes-cure.html}} combined blood stem cell and pancreatic islet transplants to cure autoimmune diabetes in mice—without lifelong immunosuppression drugs. The "immune system reset" prevented the body from attacking insulin-producing cells. Human trials are a logical next step.`,
          sources: [{ title: 'Stanford Medicine', url: 'https://med.stanford.edu/news/all-news/2025/11/type-1-diabetes-cure.html', date: 'Nov 18, 2025' }]
        },
        {
          id: 3,
          boldLead: 'MSC trials are up 37% in 2025—and investment is following.',
          publishedDate: 'Nov 20, 2025',
          content: `One year after the FDA approved the first mesenchymal stem cell therapy (Ryoncil), the field is experiencing a {{LINK:resurgence|https://www.clinicaltrialsarena.com/sponsored/the-resurgence-of-mesenchymal-stem-cell-therapies/}}. There are now 89 MSC trials running in 2025, and deal value from MSC-related equity offerings is up 94% from last year.`,
          sources: [{ title: 'Clinical Trials Arena', url: 'https://www.clinicaltrialsarena.com/sponsored/the-resurgence-of-mesenchymal-stem-cell-therapies/', date: 'Nov 20, 2025' }]
        }
      ],
      initials: 'RW'
    },

    // ===== V5.2 UPDATE: DEEP DIVE WITH EMBEDDED LINKS =====
    industryDeepDive: {
      sectionLabel: 'DEEP DIVE',
      headline: 'The Anti-Inflammatory Shopping List You Actually Need',
      publishedDate: 'Nov 2025',
      image: {
        placeholder: '[INSERT IMAGE]',
        credit: 'Getty Images',
        midjourneyPrompt: ''
      },
      content: `The supplement aisle wants you to believe fighting inflammation requires a pharmacy's worth of pills.

{{LINK:Harvard researchers|https://nutritionsource.hsph.harvard.edu/healthy-weight/diet-reviews/anti-inflammatory-diet/}} disagree.

A new meta-analysis found that anti-inflammatory diets meaningfully improved blood pressure, cholesterol, and inflammatory markers like hs-CRP. No pills required—just better groceries.

**What to add:**
• Fatty fish (salmon, sardines, mackerel) — 2-3 servings/week
• Extra virgin olive oil — your new default cooking fat
• Colorful vegetables — especially leafy greens, tomatoes, beets
• Berries, cherries, oranges — nature's antioxidant bombs
• Nuts, especially walnuts — a handful daily
• Turmeric and ginger — use liberally

**What to limit:**
• Processed meats (bacon, hot dogs, deli meat)
• Refined carbs (white bread, pastries)
• Fried foods and trans fats
• Sugary drinks

**The connection to stem cells:** Chronic inflammation damages bone marrow and accelerates stem cell aging. What you eat doesn't just affect how you feel today—it affects how well your body regenerates tomorrow.

{{LINK:Johns Hopkins|https://www.hopkinsmedicine.org/health/wellness-and-prevention/anti-inflammatory-diet}} recommends the Mediterranean diet as the most evidence-backed anti-inflammatory approach. Start with one swap: butter → olive oil.`,
      initials: 'RW',
      sources: [
        { title: 'Harvard Nutrition Source', url: 'https://nutritionsource.hsph.harvard.edu/healthy-weight/diet-reviews/anti-inflammatory-diet/', date: '2025' },
        { title: 'Johns Hopkins Medicine', url: 'https://www.hopkinsmedicine.org/health/wellness-and-prevention/anti-inflammatory-diet', date: '2025' }
      ]
    },

    // 8. SPONSOR 2
    quickCalendar: {
      sponsorName: '[SPONSOR NAME]',
      valueProp: '[One-line value prop with link]',
      isPlaceholder: true
    },

    // 9. WORTH KNOWING
    worthKnowing: {
      sectionLabel: 'WORTH KNOWING',
      title: 'This week, keep these on your radar',
      items: [
        {
          type: 'awareness',
          title: 'World AIDS Day',
          date: 'December 1',
          description: 'Many clinics offer free HIV testing this week. Worth doing if it\'s been a while.',
          link: null
        },
        {
          type: 'guide',
          title: '5 Red Flags When Choosing a Stem Cell Clinic',
          date: '',
          description: 'Before you spend $15,000 at a private clinic, know what to look for: (1) They claim to treat everything from wrinkles to MS with the same cells. (2) They use "amniotic" or "exosome" products without explaining what\'s actually in them. (3) They rely entirely on testimonials instead of published data. (4) They\'re not FDA-compliant or won\'t discuss it. (5) They offer IV stem cell treatments (currently forbidden by the FDA).',
          link: 'https://nyscf.org/resources/unproven-stem-cell-therapies-experts-discuss-how-to-protect-yourself-from-this-global-health-issue/'
        },
        {
          type: 'resource',
          title: 'How to Find Legitimate Clinical Trials',
          date: '',
          description: 'ClinicalTrials.gov is the gold standard. Search by condition, check if it\'s actively recruiting, and verify it\'s affiliated with an academic medical center.',
          link: 'https://clinicaltrials.gov'
        }
      ]
    },

    // ===== V5.2 UPDATE: STAT SECTION WITH EMBEDDED LINKS =====
    statSection: {
      sectionLabel: 'STAT OF THE WEEK',
      primeNumber: '$403.86B',
      headline: 'where the regenerative medicine market is headed by 2032',
      publishedDate: 'Nov 24, 2025',
      image: {
        placeholder: '[INSERT IMAGE]',
        credit: 'Getty Images',
        midjourneyPrompt: ''
      },
      content: `That's not a typo. The regenerative medicine market is projected to grow from $48 billion today to over $400 billion in the next seven years—a 27.3% annual growth rate.

**Why it matters for you:** More investment means more trials, faster approvals, and eventually, more affordable treatments. Cell therapy alone contributed $18.9 billion in 2024.

For context: There are now more than 2,400 regenerative medicine clinical trials running worldwide. In the 1980s, only about 1,500 patients received stem cell transplants per year. In 2022? Nearly 23,000.

**The backstory:** Global funding for regenerative medicine—public, private, and venture—surpassed $50 billion in 2024. Companies like {{LINK:Mesoblast|https://www.mesoblast.com}}, {{LINK:CRISPR Therapeutics|https://crisprtx.com}}, and Fate Therapeutics are leading the charge.

Translation: The treatments we're writing about today may be routine options in a decade. {{LINK:Read the full market report|https://www.prnewswire.com/news-releases/regenerative-medicine-market-to-skyrocket-to-usd-403-86-billion-by-2032-driven-by-cell--gene-therapy-breakthroughs-stem-cell-advancements-and-multi-indication-expansion-302624480.html}}.`,
      initials: 'RW',
      sources: [
        { title: 'PRNewswire / DataM Intelligence', url: 'https://www.prnewswire.com/news-releases/regenerative-medicine-market-to-skyrocket-to-usd-403-86-billion-by-2032-driven-by-cell--gene-therapy-breakthroughs-stem-cell-advancements-and-multi-indication-expansion-302624480.html', date: 'Nov 24, 2025' }
      ]
    },

    // ===== V5.2 UPDATE: THE PULSE WITH EMBEDDED LINKS =====
    thePulse: {
      sectionLabel: 'THE PULSE',
      title: 'Quick hits from the world of health innovation',
      items: [
        { text: '{{LINK:Takeda|https://www.openpr.com/news/4287050/autologous-stem-cell-non-stem-cell-therapies-market-to-hit-us}} launched a new autologous stem cell therapy for cartilage regeneration in Japan this month', source: 'DataM Intelligence', url: 'https://www.openpr.com/news/4287050/autologous-stem-cell-non-stem-cell-therapies-market-to-hit-us', date: 'Nov 2025' },
        { text: 'MSC clinical trials are {{LINK:up 37%|https://www.clinicaltrialsarena.com/sponsored/the-resurgence-of-mesenchymal-stem-cell-therapies/}} in 2025 compared to last year', source: 'Clinical Trials Arena', url: 'https://www.clinicaltrialsarena.com/sponsored/the-resurgence-of-mesenchymal-stem-cell-therapies/', date: 'Nov 20, 2025' },
        { text: 'Scientists discovered {{LINK:"P bodies"|https://www.colorado.edu/today/2025/11/03/scientists-discover-new-way-shape-what-stem-cell-becomes}} play a critical role in stem cell differentiation—opening new doors for regenerative medicine', source: 'CU Boulder', url: 'https://www.colorado.edu/today/2025/11/03/scientists-discover-new-way-shape-what-stem-cell-becomes', date: 'Nov 3, 2025' },
        { text: 'A new culture medium now allows researchers to create {{LINK:beating dog heart cells|https://medicalxpress.com/news/2025-11-stem-cell-medium-canine-heart.html}} from stem cells—accelerating drug testing research', source: 'Medical Xpress', url: 'https://medicalxpress.com/news/2025-11-stem-cell-medium-canine-heart.html', date: 'Nov 21, 2025' },
        { text: 'Chronic inflammation was found to fundamentally {{LINK:remodel bone marrow|https://www.sciencedaily.com/news/health_medicine/stem_cells/}}, allowing mutated stem cells to gain dominance with age', source: 'ScienceDaily', url: 'https://www.sciencedaily.com/news/health_medicine/stem_cells/', date: 'Nov 19, 2025' },
        { text: 'The regenerative medicine market is projected to hit {{LINK:$403.86 billion|https://www.prnewswire.com/news-releases/regenerative-medicine-market-to-skyrocket-to-usd-403-86-billion-by-2032}} by 2032', source: 'PRNewswire', url: 'https://www.prnewswire.com/news-releases/regenerative-medicine-market-to-skyrocket-to-usd-403-86-billion-by-2032', date: 'Nov 24, 2025' },
        { text: '{{LINK:115 pluripotent stem cell clinical trials|https://www.cell.com/cell-stem-cell/fulltext/S1934-5909(24)00445-4}} are now running globally with 83 distinct products', source: 'Cell Stem Cell', url: 'https://www.cell.com/cell-stem-cell/fulltext/S1934-5909(24)00445-4', date: 'Jan 2025' }
      ]
    },

    // 12. RECS - Links on keywords only, not full titles
    recommendations: {
      sectionLabel: 'RECS',
      read: { 
        prefix: 'Pluripotent ',
        linkText: 'stem-cell-derived therapies',
        suffix: ' in clinical trial: A 2025 update',
        url: 'https://www.cell.com/cell-stem-cell/fulltext/S1934-5909(24)00445-4', 
        isAffiliate: true 
      },
      watch: { 
        prefix: 'Inside the labs trying to ',
        linkText: 'cure autoimmune disease',
        suffix: ' (PBS NewsHour)',
        url: 'https://www.pbs.org/newshour/health/scientists-explore-new-frontier-in-autoimmune-disease-treatment-by-resetting-rogue-cells', 
        isAffiliate: false 
      },
      try: { 
        prefix: 'The ',
        linkText: 'anti-inflammatory diet',
        suffix: ' guide (Johns Hopkins)',
        url: 'https://www.hopkinsmedicine.org/health/wellness-and-prevention/anti-inflammatory-diet', 
        isAffiliate: false 
      },
      listen: { 
        prefix: '',
        linkText: 'Longevity Technology',
        suffix: ' podcast',
        url: 'https://longevity.technology/news/', 
        isAffiliate: false 
      },
      saveMoney: { 
        prefix: '',
        linkText: '[Affiliate offer]',
        suffix: '',
        url: '#', 
        isAffiliate: true, 
        isPlaceholder: true 
      },
      sponsorMessage: '*A message from our sponsor.',
      affiliateDisclosure: '**This section contains affiliate links.'
    },

    // 13. PLAY (Games) - WITH OPTIONAL IMAGE
    interactiveElement: {
      sectionLabel: 'PLAY',
      image: {
        placeholder: '[INSERT GAMES GRAPHIC - OPTIONAL]',
        credit: 'Original/Midjourney',
        midjourneyPrompt: ''
      }
    },

    // 14. REFERRAL
    referralProgram: {
      sectionLabel: 'SHARE RENEWAL WEEKLY',
      headline: 'Share Renewal Weekly with someone who wants to stay ahead of the science.',
      subtext: "We're saying we'll give you free stuff if you share a link. One link.",
      referralCountTag: '{{subscriber.referral_count}}',
      referralLinkTag: '{{subscriber.rh_reflink}}'
    },

    // 15. FOOTER
    signOff: {
      wordOfTheDay: {
        word: 'Senolytic',
        definition: 'a class of drugs that selectively eliminate senescent "zombie" cells that accumulate with age and contribute to inflammation and tissue damage',
        suggestedBy: 'Marcus',
        location: 'Denver, CO',
        submitLink: 'renewalweekly.com/word-of-the-day'
      },
      writtenBy: 'The Renewal Weekly Team',
      signupLink: 'renewalweekly.com/subscribe',
      copyright: '© 2025 Renewal Weekly. All rights reserved.'
    }
  });

  // Auto-generate Midjourney prompts for all image sections
  useEffect(() => {
    setNewsletterData(prev => ({
      ...prev,
      leadStory: {
        ...prev.leadStory,
        image: { ...prev.leadStory.image, midjourneyPrompt: generateMidjourneyPrompt(prev.leadStory.headline) }
      },
      yourOptionsThisWeek: {
        ...prev.yourOptionsThisWeek,
        image: { ...prev.yourOptionsThisWeek.image, midjourneyPrompt: generateMidjourneyPrompt(prev.yourOptionsThisWeek.title) }
      },
      secondaryStories: {
        ...prev.secondaryStories,
        image: { ...prev.secondaryStories.image, midjourneyPrompt: generateMidjourneyPrompt(prev.secondaryStories.stories[0]?.boldLead || '', 'stem_cell') }
      },
      industryDeepDive: {
        ...prev.industryDeepDive,
        image: { ...prev.industryDeepDive.image, midjourneyPrompt: generateMidjourneyPrompt(prev.industryDeepDive.headline) }
      },
      statSection: {
        ...prev.statSection,
        image: { ...prev.statSection.image, midjourneyPrompt: generateMidjourneyPrompt(prev.statSection.headline, 'stats') }
      },
      interactiveElement: {
        ...prev.interactiveElement,
        image: { ...prev.interactiveElement.image, midjourneyPrompt: generateMidjourneyPrompt('games trivia health', 'games') }
      }
    }));
  }, []);

  // Add/remove/toggle sources
  const addCustomSource = () => {
    if (newSourceName && newSourceUrl) {
      setCustomSources(prev => [...prev, { name: newSourceName, url: newSourceUrl, enabled: true }]);
      setNewSourceName('');
      setNewSourceUrl('');
    }
  };

  const toggleSource = (index) => {
    setCustomSources(prev => prev.map((s, i) => i === index ? { ...s, enabled: !s.enabled } : s));
  };

  const removeSource = (index) => {
    setCustomSources(prev => prev.filter((_, i) => i !== index));
  };

  // Story tracking
  const exportUsedStories = () => {
    const dataStr = JSON.stringify(usedStories, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `renewal-weekly-used-stories-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const importUsedStories = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          setUsedStories(prev => [...prev, ...imported]);
        } catch (err) {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  };

  const clearOldStories = () => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    setUsedStories(prev => prev.filter(s => new Date(s.usedDate) > ninetyDaysAgo));
  };

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const handlePromptChange = (sectionKey, value) => {
    setSectionPrompts(prev => ({ ...prev, [sectionKey]: value }));
  };

  const regenerateSection = async (sectionName) => {
    // Map section keys to AI generation types
    const sectionTypeMap = {
      section1: 'openingHook',
      section3: 'leadStory',
      section4: 'researchRoundup',
      section4b: 'livingWell',
      section6: 'secondaryStories',
      section7: 'deepDive',
      section9: 'worthKnowing',
      section10: 'statSection',
      section11: 'thePulse',
      section12: 'recommendations',
      section13: 'gameTrivia'
    };

    const aiType = sectionTypeMap[sectionName];
    if (!aiType) {
      setAiStatus('This section does not support AI generation');
      return;
    }

    // Set loading state for this specific section
    setIsLoading(prev => ({ ...prev, [sectionName]: true }));
    setAiStatus(`🔍 Researching ${sectionName}...`);

    // Build custom prompt with context about what to avoid
    let customPrompt = sectionPrompts[sectionName] || '';

    // For lead story, tell AI to find a DIFFERENT story
    if (aiType === 'leadStory' && newsletterData.leadStory.headline) {
      const currentHeadline = newsletterData.leadStory.headline;
      customPrompt = `AVOID_TOPIC:${currentHeadline}|${customPrompt}`;
    }

    // For research roundup, avoid current topic
    if (aiType === 'researchRoundup' && newsletterData.yourOptionsThisWeek.title) {
      const currentTitle = newsletterData.yourOptionsThisWeek.title;
      customPrompt = `AVOID_TOPIC:${currentTitle}|${customPrompt}`;
    }

    // For deep dive, avoid current topic
    if (aiType === 'deepDive' && newsletterData.industryDeepDive.headline) {
      const currentHeadline = newsletterData.industryDeepDive.headline;
      customPrompt = `AVOID_TOPIC:${currentHeadline}|${customPrompt}`;
    }

    // For recommendations, pass current URLs to avoid
    if (aiType === 'recommendations') {
      const currentRecs = newsletterData.recommendations;
      const currentUrls = [
        currentRecs.read?.url,
        currentRecs.watch?.url,
        currentRecs.try?.url,
        currentRecs.listen?.url
      ].filter(url => url && url !== '#').join(', ');
      if (currentUrls) {
        customPrompt = currentUrls;
      }
    }

    // For leadStory, pass current headline to avoid repeating same story
    if (aiType === 'leadStory' && newsletterData.leadStory?.headline) {
      const currentHeadline = newsletterData.leadStory.headline;
      if (currentHeadline && currentHeadline !== 'Researching latest news...') {
        customPrompt = `AVOID_TOPIC:${currentHeadline}|Find a COMPLETELY DIFFERENT story - different condition, different treatment, different institution.`;
      }
    }

    // For researchRoundup, pass current title to avoid
    if (aiType === 'researchRoundup' && newsletterData.yourOptionsThisWeek?.title) {
      const currentTitle = newsletterData.yourOptionsThisWeek.title;
      if (currentTitle && currentTitle !== 'Researching...') {
        customPrompt = `AVOID_TOPIC:${currentTitle}|Find DIFFERENT research - different condition, different study.`;
      }
    }

    // For industryDeepDive, pass current headline to avoid
    if (aiType === 'industryDeepDive' && newsletterData.industryDeepDive?.headline) {
      const currentHeadline = newsletterData.industryDeepDive.headline;
      if (currentHeadline && currentHeadline !== 'Researching...') {
        customPrompt = `AVOID_TOPIC:${currentHeadline}|Find a DIFFERENT wellness/lifestyle topic.`;
      }
    }

    // For thePulse, pass current items to avoid
    if (aiType === 'thePulse' && newsletterData.thePulse?.items?.length > 0) {
      const currentItems = newsletterData.thePulse.items
        .map(item => item.text?.slice(0, 50))
        .filter(Boolean)
        .join('; ');
      if (currentItems) {
        customPrompt = `AVOID THESE TOPICS (find completely different news): ${currentItems}`;
      }
    }

    // For worthKnowing, pass current items to avoid
    if (aiType === 'worthKnowing' && newsletterData.worthKnowing?.items?.length > 0) {
      const currentItems = newsletterData.worthKnowing.items
        .map(item => item.title)
        .filter(Boolean)
        .join(', ');
      if (currentItems) {
        customPrompt = `AVOID THESE (find different topics): ${currentItems}`;
      }
    }

    const generatedContent = await generateWithAI(aiType, customPrompt);

    // Always clear loading state when done
    setIsLoading(prev => ({ ...prev, [sectionName]: false }));

    if (generatedContent) {
      // Update newsletterData based on section type
      setNewsletterData(prev => {
        const updated = { ...prev };

        switch (aiType) {
          case 'openingHook':
            updated.openingHook = { ...prev.openingHook, content: generatedContent };
            break;

          case 'leadStory':
            try {
              // Try to extract headline and content
              const lines = generatedContent.split('\n').filter(l => l.trim());
              const headline = lines[0].replace(/^#+\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '');
              const content = lines.slice(1).join('\n\n');
              const sources = extractSourcesFromContent(content);
              updated.leadStory = {
                ...prev.leadStory,
                headline: headline || prev.leadStory.headline,
                content: content || generatedContent,
                publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                sources: sources.length > 0 ? sources : prev.leadStory.sources,
                image: { ...prev.leadStory.image, midjourneyPrompt: generateMidjourneyPrompt(headline || prev.leadStory.headline) }
              };
            } catch (e) {
              updated.leadStory = { ...prev.leadStory, content: generatedContent };
            }
            break;

          case 'researchRoundup':
            try {
              // Extract headline from first line (replaces static title)
              const lines = generatedContent.split('\n').filter(l => l.trim());
              const headline = lines[0].replace(/^#+\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '');
              const content = lines.slice(1).join('\n\n');
              const sources = extractSourcesFromContent(content);
              updated.yourOptionsThisWeek = {
                ...prev.yourOptionsThisWeek,
                title: headline || prev.yourOptionsThisWeek.title,
                subtitle: '', // Remove subtitle - just use headline
                content: content || generatedContent,
                publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                sources: sources.length > 0 ? sources : prev.yourOptionsThisWeek.sources,
                image: { ...prev.yourOptionsThisWeek.image, midjourneyPrompt: generateMidjourneyPrompt(headline || prev.yourOptionsThisWeek.title) }
              };
            } catch (e) {
              updated.yourOptionsThisWeek = { ...prev.yourOptionsThisWeek, content: generatedContent };
            }
            break;

          case 'secondaryStories':
            try {
              // Try to extract JSON array even if there's preamble
              const jsonMatch = generatedContent.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed) && parsed.length >= 1) {
                  updated.secondaryStories = {
                    ...prev.secondaryStories,
                    stories: parsed.slice(0, 3).map((story, idx) => ({
                      id: idx + 1,
                      boldLead: story.boldLead || '',
                      content: story.content || '',
                      publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                      sources: story.sources || []
                    }))
                  };
                }
              } else {
                setAiStatus('Error: No JSON array found in response');
              }
            } catch (e) {
              setAiStatus('Error: Could not parse JSON response for secondary stories');
            }
            break;

          case 'deepDive':
            try {
              // Extract headline from first line
              const lines = generatedContent.split('\n').filter(l => l.trim());
              const headline = lines[0].replace(/^#+\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '');
              const content = lines.slice(1).join('\n\n');
              const sources = extractSourcesFromContent(content);
              updated.industryDeepDive = {
                ...prev.industryDeepDive,
                headline: headline || prev.industryDeepDive.headline,
                content: content || generatedContent,
                publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                sources: sources.length > 0 ? sources : prev.industryDeepDive.sources,
                image: { ...prev.industryDeepDive.image, midjourneyPrompt: generateMidjourneyPrompt(headline || prev.industryDeepDive.headline, 'wellness') }
              };
            } catch (e) {
              updated.industryDeepDive = { ...prev.industryDeepDive, content: generatedContent };
            }
            break;

          case 'statSection':
            try {
              const parsed = JSON.parse(generatedContent);
              if (parsed.primeNumber && parsed.headline && parsed.content) {
                const sources = extractSourcesFromContent(parsed.content);
                updated.statSection = {
                  ...prev.statSection,
                  primeNumber: parsed.primeNumber,
                  headline: parsed.headline,
                  content: parsed.content,
                  publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                  sources: sources.length > 0 ? sources : prev.statSection.sources,
                  image: { ...prev.statSection.image, midjourneyPrompt: generateMidjourneyPrompt(parsed.headline, 'stats') }
                };
              }
            } catch (e) {
              setAiStatus('Error: Could not parse JSON response for stat section');
            }
            break;

          case 'thePulse':
            try {
              const parsed = JSON.parse(generatedContent);
              if (Array.isArray(parsed)) {
                updated.thePulse = {
                  ...prev.thePulse,
                  items: parsed.slice(0, 7).map(text => {
                    // Extract source from [Source, Date] at end of text if present
                    const sourceMatch = text.match(/\[([^\]]+)\]\s*$/);
                    const extractedSource = sourceMatch ? sourceMatch[1].split(',')[0].trim() : 'Web Research';
                    return {
                      text: text.replace(/\s*\[[^\]]+\]\s*$/, ''), // Remove source bracket from text
                      source: extractedSource,
                      url: '#',
                      date: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    };
                  })
                };
              }
            } catch (e) {
              setAiStatus('Error: Could not parse JSON response for pulse section');
            }
            break;

          case 'worthKnowing':
            try {
              const jsonMatch = generatedContent.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed) && parsed.length >= 1) {
                  updated.worthKnowing = {
                    ...prev.worthKnowing,
                    items: parsed.slice(0, 4).map(item => ({
                      type: item.type || 'resource',
                      title: item.title || '',
                      date: item.date || '',
                      description: item.description || '',
                      link: item.link || null
                    }))
                  };
                }
              }
            } catch (e) {
              setAiStatus('Error: Could not parse JSON response for Worth Knowing section');
            }
            break;

          case 'recommendations':
            try {
              const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                updated.recommendations = {
                  ...prev.recommendations,
                  read: parsed.read ? {
                    prefix: parsed.read.prefix || '',
                    linkText: parsed.read.linkText || 'Article',
                    suffix: parsed.read.suffix || '',
                    url: parsed.read.url || '#',
                    isAffiliate: false
                  } : prev.recommendations.read,
                  watch: parsed.watch ? {
                    prefix: parsed.watch.prefix || '',
                    linkText: parsed.watch.linkText || 'Video',
                    suffix: parsed.watch.suffix || '',
                    url: parsed.watch.url || '#',
                    isAffiliate: false
                  } : prev.recommendations.watch,
                  try: parsed.try ? {
                    prefix: parsed.try.prefix || '',
                    linkText: parsed.try.linkText || 'Resource',
                    suffix: parsed.try.suffix || '',
                    url: parsed.try.url || '#',
                    isAffiliate: false
                  } : prev.recommendations.try,
                  listen: parsed.listen ? {
                    prefix: parsed.listen.prefix || '',
                    linkText: parsed.listen.linkText || 'Podcast',
                    suffix: parsed.listen.suffix || '',
                    url: parsed.listen.url || '#',
                    isAffiliate: false
                  } : prev.recommendations.listen
                };
              }
            } catch (e) {
              setAiStatus('Error: Could not parse JSON response for recommendations');
            }
            break;
        }

        return updated;
      });
    }
  };

  const fetchAllData = async () => {
    if (!anthropicApiKey) {
      setAiStatus('Please add your Anthropic API key in Settings → AI tab');
      return;
    }

    setIsLoading(prev => ({ ...prev, all: true }));

    // Step 0: Save current newsletter to history before wiping
    setAiStatus('💾 Saving current newsletter to history...');
    const historyEntry = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      subjectLine: newsletterData.preHeader.subjectLine,
      newsletterData: JSON.parse(JSON.stringify(newsletterData)),
      currentGame: JSON.parse(JSON.stringify(currentGame))
    };
    setNewsletterHistory(prev => [historyEntry, ...prev].slice(0, 20)); // Keep last 20

    // WIPE ALL CONTENT SECTIONS - Start fresh for new issue
    setAiStatus('🧹 Wiping old content for new issue...');
    const newIssueNumber = (parseInt(newsletterData.preHeader.issueNumber) + 1).toString();
    setNewsletterData(prev => ({
      ...prev,
      preHeader: {
        ...prev.preHeader,
        issueNumber: newIssueNumber,
        subjectLine: 'Generating new subject line...',
        previewText: 'Generating preview text...',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      },
      openingHook: { ...prev.openingHook, content: 'Generating fresh content...' },
      bottomLine: { ...prev.bottomLine, items: ['Generating...', 'Generating...', 'Generating...', 'Generating...'] },
      leadStory: { ...prev.leadStory, headline: 'Researching latest news...', content: 'Generating fresh content with web search...', sources: [] },
      yourOptionsThisWeek: { ...prev.yourOptionsThisWeek, content: 'Generating fresh content with web search...', sources: [] },
      secondaryStories: { ...prev.secondaryStories, stories: [
        { id: 1, boldLead: 'Searching for story 1...', content: 'Generating...', sources: [], publishedDate: '' },
        { id: 2, boldLead: 'Searching for story 2...', content: 'Generating...', sources: [], publishedDate: '' },
        { id: 3, boldLead: 'Searching for story 3...', content: 'Generating...', sources: [], publishedDate: '' }
      ]},
      industryDeepDive: { ...prev.industryDeepDive, headline: 'Researching...', content: 'Generating fresh content with web search...', sources: [] },
      statSection: { ...prev.statSection, primeNumber: '...', headline: 'Researching statistics...', content: 'Generating fresh content with web search...', sources: [] },
      thePulse: { ...prev.thePulse, items: Array(7).fill({ text: 'Generating...', source: '', url: '#', date: '' }) },
      recommendations: {
        ...prev.recommendations,
        read: { prefix: '', linkText: 'Searching...', suffix: '', url: '#', isAffiliate: false },
        watch: { prefix: '', linkText: 'Searching...', suffix: '', url: '#', isAffiliate: false },
        try: { prefix: '', linkText: 'Searching...', suffix: '', url: '#', isAffiliate: false },
        listen: { prefix: '', linkText: 'Searching...', suffix: '', url: '#', isAffiliate: false }
      }
    }));

    // Reset game too
    setCurrentGame({
      id: 'generating',
      title: 'Generating new game...',
      intro: 'Please wait...',
      content: 'Creating a new trivia game...',
      answer: ''
    });

    setAiStatus('🚀 Creating your newsletter...');

    try {
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });

      // PHASE 1: Research articles upfront (reduces total web searches)
      setAiStatus('🔬 Researching articles for your audience...');
      const researchedArticles = await researchArticles();

      let articleDistribution = null;
      if (researchedArticles && researchedArticles.length > 0) {
        setAiStatus(`✓ Found ${researchedArticles.length} articles, distributing...`);
        articleDistribution = distributeArticles(researchedArticles);
        await delay(3000);
      } else {
        setAiStatus('⚠️ Research returned no articles, sections will search individually...');
        await delay(3000);
      }

      // Step 1: Build metrics from RSS feed data (2x2 grid)
      setAiStatus('📊 Building metrics from RSS feed... (1/15)');

      // Derive fun stats from the RSS articles
      const articleCount = researchedArticles?.length || 0;
      const uniqueSources = [...new Set(researchedArticles?.map(a => a.source) || [])];
      const categoryCounts = (researchedArticles || []).reduce((acc, a) => {
        acc[a.category] = (acc[a.category] || 0) + 1;
        return acc;
      }, {});
      const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
      const categoryLabels = {
        stemCells: 'Stem Cells',
        regenerativeMedicine: 'Regen Medicine',
        longevity: 'Longevity',
        chronicDisease: 'Chronic Disease',
        nutrition: 'Nutrition',
        supplements: 'Supplements',
        clinicalTrials: 'Clinical Trials',
        general: 'General Health'
      };

      console.log('📊 RSS metrics:', { articleCount, sources: uniqueSources.length, topCategory });

      // Update metrics dashboard with RSS-derived stats (2x2 grid)
      setNewsletterData(prev => ({
        ...prev,
        metricsDashboard: {
          ...prev.metricsDashboard,
          metrics: [
            {
              label: 'Articles This Week',
              value: articleCount.toString(),
              change: `from ${uniqueSources.length} sources`,
              source: 'RSS Feed',
              dynamic: true
            },
            {
              label: 'Top Topic',
              value: topCategory ? categoryLabels[topCategory[0]] || topCategory[0] : 'Stem Cells',
              change: topCategory ? `${topCategory[1]} articles` : '',
              source: 'This Issue',
              dynamic: true
            },
            {
              label: 'Sources Featured',
              value: uniqueSources.length.toString(),
              change: uniqueSources.slice(0, 2).join(', '),
              source: 'Curated Feed',
              dynamic: true
            },
            {
              label: 'Research Categories',
              value: Object.keys(categoryCounts).length.toString(),
              change: 'topics covered',
              source: 'This Issue',
              dynamic: true
            }
          ],
          asOfDate: today
        },
        preHeader: {
          ...prev.preHeader,
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }
      }));

      // Track generated content in local variables (React state is async)
      let generatedLeadHeadline = '';
      let generatedResearchHeadline = '';
      let generatedDeepDiveHeadline = '';
      let generatedStatHeadline = '';

      // Step 2: Generate Lead Story (using pre-researched article if available)
      setAiStatus('🔍 Writing lead story... (2/15)');

      // Build prompt with pre-researched article context from RSS
      let leadPromptContext = '';
      if (articleDistribution?.leadStory) {
        const article = articleDistribution.leadStory;
        leadPromptContext = `
USE THIS ARTICLE FROM OUR CURATED RSS FEED:
Title: "${article.title}"
Source: ${article.source} (${article.dateFormatted || article.date})
URL: ${article.url}
Summary: ${article.summary}

CRITICAL: This URL is VERIFIED and REAL from our RSS feed. Use it exactly as provided.
Embed the link naturally in your text: "{{LINK:meaningful text|${article.url}}}"
Example: "Researchers at {{LINK:${article.source}|${article.url}}} found that..."

Write the lead story based on this article.`;
      }

      // Combine avoid topics and article context
      let combinedPrompt = leadPromptContext;
      if (usedStories.length > 0 && !leadPromptContext) {
        // Only use AVOID_TOPIC if we don't have a pre-researched article
        combinedPrompt = `AVOID_TOPIC:${usedStories.slice(-10).join('|')}`;
      }

      // Skip web search if we have pre-researched article (saves API calls)
      const skipLeadWebSearch = !!articleDistribution?.leadStory;
      const leadContent = await generateWithAI('leadStory', combinedPrompt, !skipLeadWebSearch);
      if (leadContent) {
        const lines = leadContent.split('\n').filter(l => l.trim());
        const headline = lines[0].replace(/^#+\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '');
        const content = lines.slice(1).join('\n\n');
        generatedLeadHeadline = headline;

        // Track this story to avoid repeats in future
        if (headline && headline.length > 5) {
          setUsedStories(prev => [...prev.slice(-19), headline].slice(-20)); // Keep last 20
        }

        // Extract sources from content and save URLs for exclusion
        const sources = extractSourcesFromContent(content);
        saveUrlsForExclusion(sources);

        setNewsletterData(prev => ({
          ...prev,
          leadStory: {
            ...prev.leadStory,
            headline: headline || prev.leadStory.headline,
            content: content || leadContent,
            publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            sources: sources.length > 0 ? sources : prev.leadStory.sources,
            image: { ...prev.leadStory.image, midjourneyPrompt: generateMidjourneyPrompt(headline) }
          }
        }));
      }
      await delay(5000);

      // Step 3: Generate Research Roundup (using pre-researched article if available)
      setAiStatus('📚 Writing research roundup... (3/15)');

      // Build prompt with pre-researched article context
      let researchPromptContext = '';
      if (articleDistribution?.researchRoundup) {
        const article = articleDistribution.researchRoundup;
        researchPromptContext = `USE THIS ARTICLE FROM OUR CURATED RSS FEED:
Title: "${article.title}"
Source: ${article.source} (${article.dateFormatted || article.date})
URL: ${article.url}
Summary: ${article.summary}

CRITICAL: This URL is VERIFIED and REAL. Use it exactly as provided.
Embed naturally: "A {{LINK:new study from ${article.source}|${article.url}}} found..."

Write the research roundup based on this article.`;
      }

      // Skip web search if we have pre-researched article
      const skipResearchWebSearch = !!articleDistribution?.researchRoundup;
      const roundupContent = await generateWithAI('researchRoundup', researchPromptContext, !skipResearchWebSearch);
      if (roundupContent) {
        const lines = roundupContent.split('\n').filter(l => l.trim());
        const headline = lines[0].replace(/^#+\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '');
        const content = lines.slice(1).join('\n\n');
        generatedResearchHeadline = headline;
        setNewsletterData(prev => ({
          ...prev,
          yourOptionsThisWeek: {
            ...prev.yourOptionsThisWeek,
            title: headline || prev.yourOptionsThisWeek.title,
            subtitle: '',
            content: content || roundupContent,
            publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            image: { ...prev.yourOptionsThisWeek.image, midjourneyPrompt: generateMidjourneyPrompt(headline) }
          }
        }));
      }
      await delay(5000);

      // Step 3.5: Generate Living Well (lifestyle section) - MUST use RSS article
      setAiStatus('🌿 Writing Living Well section... (3.5/15)');

      // Use the pre-distributed lifestyle article from RSS
      const lifestyleArticle = articleDistribution?.livingWell;

      if (lifestyleArticle) {
        const livingWellPromptContext = `REWRITE this article as a friendly lifestyle tip. You MUST use ONLY the URL provided below.

ARTICLE FROM RSS FEED:
Title: "${lifestyleArticle.title}"
Source: ${lifestyleArticle.source} (${lifestyleArticle.dateFormatted || lifestyleArticle.date})
URL: ${lifestyleArticle.url}
Summary: ${lifestyleArticle.summary}

CRITICAL RULES:
1. The ONLY URL you may use is: ${lifestyleArticle.url}
2. Do NOT invent, guess, or make up any URLs
3. Embed this exact link naturally in your text using: {{LINK:descriptive text|${lifestyleArticle.url}}}
4. Keep the tone warm, encouraging, and accessible
5. Focus on ONE actionable tip from this article`;

        // Never use web search for Living Well - RSS only
        const livingWellContent = await generateWithAI('livingWell', livingWellPromptContext, false);
        if (livingWellContent) {
          const lines = livingWellContent.split('\n').filter(l => l.trim());
          const headline = lines[0].replace(/^#+\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '');
          let content = lines.slice(1).join('\n\n');

          // SAFETY: Replace any rogue URLs in content with the real RSS URL
          content = content.replace(/\{\{LINK:([^|]+)\|https?:\/\/[^}]+\}\}/g, `{{LINK:$1|${lifestyleArticle.url}}}`);

          setNewsletterData(prev => ({
            ...prev,
            livingWell: {
              ...prev.livingWell,
              headline: headline || prev.livingWell.headline,
              content: content || livingWellContent,
              publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
              sources: [{ title: lifestyleArticle.source, url: lifestyleArticle.url, date: lifestyleArticle.dateFormatted || lifestyleArticle.date }]
            }
          }));
        }
      } else {
        console.log('⚠️ No lifestyle article found for Living Well section');
      }
      await delay(3000);

      // Step 4: Generate Secondary Stories / On Our Radar (using pre-researched articles if available)
      setAiStatus('📰 Writing secondary stories... (4/15)');

      // Build prompt with pre-researched articles context (from RSS feed)
      let secondaryPromptContext = '';
      if (articleDistribution?.onOurRadar && articleDistribution.onOurRadar.length > 0) {
        const articles = articleDistribution.onOurRadar;
        secondaryPromptContext = `
USE THESE ARTICLES FROM OUR CURATED RSS FEED:

${articles.map((a, i) => `ARTICLE ${i+1}:
Title: "${a.title}"
Source: ${a.source} (${a.dateFormatted || a.date})
URL: ${a.url}
Summary: ${a.summary}
`).join('\n')}

CRITICAL RULES:
1. These URLs are VERIFIED and REAL from our RSS feed - use them exactly as provided
2. Each story MUST be from a DIFFERENT source (diversity requirement already met by selection)
3. Embed links naturally in your text using {{LINK:meaningful text|url}}
   Example: "A new {{LINK:study from Mayo Clinic|${articles[0]?.url}}} found that..."
4. Do NOT use "Source: Publisher" format - links should flow naturally in sentences

Write 3 "On Our Radar" stories based on these articles.`;
      }

      // Skip web search if we have pre-researched articles
      const skipSecondaryWebSearch = articleDistribution?.onOurRadar?.length > 0;
      const secondaryContent = await generateWithAI('secondaryStories', secondaryPromptContext, !skipSecondaryWebSearch);
      if (secondaryContent) {
        try {
          const jsonMatch = secondaryContent.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed) && parsed.length >= 3) {
              // Get the original RSS articles for guaranteed real URLs
              const rssArticles = articleDistribution?.onOurRadar || [];

              setNewsletterData(prev => ({
                ...prev,
                secondaryStories: {
                  ...prev.secondaryStories,
                  stories: parsed.slice(0, 3).map((story, idx) => {
                    // Use RSS article URL if available, otherwise extract from content
                    const rssArticle = rssArticles[idx];
                    const sources = rssArticle
                      ? [{ title: rssArticle.source, url: rssArticle.url, date: rssArticle.dateFormatted }]
                      : extractSourcesFromContent(story.content);

                    return {
                      id: idx + 1,
                      boldLead: story.boldLead || '',
                      content: story.content || '',
                      publishedDate: rssArticle?.dateFormatted || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                      sources: sources
                    };
                  })
                }
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing secondary stories:', e);
        }
      }
      await delay(5000); // Rate limit protection

      // Step 5: Generate Deep Dive (using pre-researched article if available)
      setAiStatus('🔬 Writing deep dive... (5/15)');

      // Build prompt with pre-researched article context (from RSS feed)
      let deepDivePromptContext = '';
      if (articleDistribution?.deepDive) {
        const article = articleDistribution.deepDive;
        deepDivePromptContext = `
USE THIS ARTICLE FROM OUR CURATED RSS FEED:

Title: "${article.title}"
Source: ${article.source} (${article.dateFormatted || article.date})
URL: ${article.url}
Summary: ${article.summary}

CRITICAL RULES:
1. This URL is VERIFIED and REAL from our RSS feed - use it exactly as provided
2. This is a deep-dive on wellness, nutrition, or lifestyle content
3. Embed the link naturally in your text using {{LINK:meaningful text|${article.url}}}
   Example: "According to {{LINK:new research from ${article.source}|${article.url}}}, the benefits include..."
4. Do NOT use "Source: Publisher" format - the link should flow naturally within sentences
5. Extract actionable tips and practical takeaways for readers

Write the deep dive based on this article.`;
      }

      // Skip web search if we have pre-researched article
      const skipDeepDiveWebSearch = !!articleDistribution?.deepDive;
      const deepDiveContent = await generateWithAI('deepDive', deepDivePromptContext, !skipDeepDiveWebSearch);
      if (deepDiveContent) {
        const lines = deepDiveContent.split('\n').filter(l => l.trim());
        const headline = lines[0].replace(/^#+\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '');
        const content = lines.slice(1).join('\n\n');
        generatedDeepDiveHeadline = headline;
        setNewsletterData(prev => ({
          ...prev,
          industryDeepDive: {
            ...prev.industryDeepDive,
            headline: headline || prev.industryDeepDive.headline,
            content: content || deepDiveContent,
            publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            image: { ...prev.industryDeepDive.image, midjourneyPrompt: generateMidjourneyPrompt(headline) }
          }
        }));
      }
      await delay(5000);

      // Step 6: Generate Stat Section (using pre-researched article if available)
      setAiStatus('📊 Writing stat of the week... (6/15)');

      // Build prompt with pre-researched article context (from RSS feed)
      let statPromptContext = '';
      if (articleDistribution?.statOfWeek) {
        const article = articleDistribution.statOfWeek;
        statPromptContext = `
USE THIS ARTICLE FROM OUR CURATED RSS FEED:

Title: "${article.title}"
Source: ${article.source} (${article.dateFormatted || article.date})
URL: ${article.url}
Summary: ${article.summary}

CRITICAL RULES:
1. This URL is VERIFIED and REAL from our RSS feed - use it exactly as provided
2. Find a compelling statistic from this article (percentage, number, comparison)
3. The statistic should be attention-grabbing and relevant to our 45-75 year old audience
4. Embed the link naturally: {{LINK:meaningful text|${article.url}}}
   Example: "A {{LINK:recent study|${article.url}}} found that 73% of patients..."
5. Do NOT use "Source: Publisher" format - the link should flow naturally

Extract the stat of the week from this article.`;
      }

      // Skip web search if we have pre-researched article
      const skipStatWebSearch = !!articleDistribution?.statOfWeek;
      const statContent = await generateWithAI('statSection', statPromptContext, !skipStatWebSearch);
      if (statContent) {
        try {
          const jsonMatch = statContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.primeNumber && parsed.headline && parsed.content) {
              generatedStatHeadline = parsed.headline;
              setNewsletterData(prev => ({
                ...prev,
                statSection: {
                  ...prev.statSection,
                  primeNumber: parsed.primeNumber,
                  headline: parsed.headline,
                  content: parsed.content,
                  publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                  image: { ...prev.statSection.image, midjourneyPrompt: generateMidjourneyPrompt(parsed.headline, 'stats') }
                }
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing stat section:', e);
        }
      }
      await delay(5000);

      // Step 7: Generate The Pulse / Quick Hits (using pre-researched articles if available)
      setAiStatus('⚡ Writing quick hits... (7/15)');

      // Build prompt with pre-researched articles context (from RSS feed)
      let pulsePromptContext = '';
      if (articleDistribution?.quickHits && articleDistribution.quickHits.length > 0) {
        const articles = articleDistribution.quickHits;
        pulsePromptContext = `
USE THESE ARTICLES FROM OUR CURATED RSS FEED:

${articles.map((a, i) => `ARTICLE ${i+1}:
Title: "${a.title}"
Source: ${a.source} (${a.dateFormatted || a.date})
URL: ${a.url}
`).join('\n')}

CRITICAL RULES:
1. These URLs are VERIFIED and REAL from our RSS feed - use them exactly as provided
2. Each quick hit should be ONE concise sentence (max 25 words)
3. Embed the link naturally: {{LINK:meaningful text|url}}
   Example: "{{LINK:New research|url}} shows omega-3s may reduce inflammation by 40%."
4. Do NOT use "Source: Publisher" format - the link should be part of the sentence
5. Variety of topics across the articles provided

Write 5-7 quick hit news items based on these articles.`;
      }

      // Skip web search if we have pre-researched articles
      const skipPulseWebSearch = articleDistribution?.quickHits?.length > 0;
      const pulseContent = await generateWithAI('thePulse', pulsePromptContext, !skipPulseWebSearch);
      if (pulseContent) {
        try {
          const jsonMatch = pulseContent.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
              setNewsletterData(prev => ({
                ...prev,
                thePulse: {
                  ...prev.thePulse,
                  items: parsed.slice(0, 7).map(text => {
                    // Extract source from [Source, Date] at end of text if present
                    const sourceMatch = text.match(/\[([^\]]+)\]\s*$/);
                    const extractedSource = sourceMatch ? sourceMatch[1].split(',')[0].trim() : 'Web Research';
                    return {
                      text: text.replace(/\s*\[[^\]]+\]\s*$/, ''), // Remove source bracket from displayed text
                      source: extractedSource,
                      url: '#',
                      date: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    };
                  })
                }
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing pulse section:', e);
        }
      }
      await delay(5000); // Rate limit protection

      // Step 8: Generate Worth Knowing (using pre-distributed RSS articles)
      setAiStatus('💡 Creating Worth Knowing... (8/15)');

      // Use pre-distributed articles from RSS feed
      const worthKnowingArticles = articleDistribution?.worthKnowing || [];

      if (worthKnowingArticles.length > 0) {
        const worthKnowingPromptContext = `
REWRITE these RSS articles as "Worth Knowing" items. You MUST use ONLY the URLs provided.

${worthKnowingArticles.map((a, i) => `ARTICLE ${i+1}:
Title: "${a.title}"
Source: ${a.source}
URL: ${a.url}
Summary: ${a.summary}
`).join('\n')}

CRITICAL RULES:
1. ONLY use the URLs listed above - do NOT invent or guess URLs
2. Each item must reference its corresponding article URL
3. Keep descriptions to 1-2 sentences

Return JSON array: [{"type": "tip/resource/fact/event", "title": "Short title", "description": "1-2 sentence description", "link": "EXACT URL from above", "date": ""}]`;

        // Never use web search for Worth Knowing - RSS only
        const worthContent = await generateWithAI('worthKnowing', worthKnowingPromptContext, false);
        if (worthContent) {
          try {
            const jsonMatch = worthContent.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed) && parsed.length >= 1) {
                setNewsletterData(prev => ({
                  ...prev,
                  worthKnowing: {
                    ...prev.worthKnowing,
                    items: parsed.slice(0, 4).map((item, idx) => {
                      // ALWAYS use RSS article URL - ignore any AI-generated URLs
                      const rssArticle = worthKnowingArticles[idx];
                      return {
                        type: item.type || 'resource',
                        title: item.title || rssArticle?.title || '',
                        date: rssArticle?.dateFormatted || item.date || '',
                        description: item.description || '',
                        link: rssArticle?.url // ONLY use RSS URL
                      };
                    })
                  }
                }));
              }
            }
          } catch (e) {
            console.error('Error parsing worth knowing:', e);
          }
        }
      } else {
        console.log('⚠️ No articles available for Worth Knowing section');
      }
      await delay(5000); // Rate limit protection

      // Step 9: Generate Recommendations (with web search)
      setAiStatus('📚 Curating recommendations... (9/15)');
      const recsContent = await generateWithAI('recommendations');
      if (recsContent) {
        try {
          const jsonMatch = recsContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            setNewsletterData(prev => ({
              ...prev,
              recommendations: {
                ...prev.recommendations,
                read: parsed.read ? {
                  prefix: parsed.read.prefix || '',
                  linkText: parsed.read.linkText || 'Article',
                  suffix: parsed.read.suffix || '',
                  url: parsed.read.url || '#',
                  isAffiliate: false
                } : prev.recommendations.read,
                watch: parsed.watch ? {
                  prefix: parsed.watch.prefix || '',
                  linkText: parsed.watch.linkText || 'Video',
                  suffix: parsed.watch.suffix || '',
                  url: parsed.watch.url || '#',
                  isAffiliate: false
                } : prev.recommendations.watch,
                try: parsed.try ? {
                  prefix: parsed.try.prefix || '',
                  linkText: parsed.try.linkText || 'Resource',
                  suffix: parsed.try.suffix || '',
                  url: parsed.try.url || '#',
                  isAffiliate: false
                } : prev.recommendations.try,
                listen: parsed.listen ? {
                  prefix: parsed.listen.prefix || '',
                  linkText: parsed.listen.linkText || 'Podcast',
                  suffix: parsed.listen.suffix || '',
                  url: parsed.listen.url || '#',
                  isAffiliate: false
                } : prev.recommendations.listen
              }
            }));
          }
        } catch (e) {
          console.error('Error parsing recommendations:', e);
        }
      }
      await delay(5000); // Rate limit protection

      // Step 10: Generate Word of the Day
      setAiStatus('📖 Selecting word of the day... (10/15)');
      const wordPrompt = `Pick a Word of the Day for stem cells newsletter. Theme: "${generatedLeadHeadline || 'stem cell research'}"
Requirements: medical/scientific term, explainable to general audience, not too basic.
Return JSON: {"word": "", "definition": "accessible definition", "suggestedBy": "first name", "location": "City, ST"}`;

      const wordContent = await generateWithAI('wordOfDay', wordPrompt, false);
      if (wordContent) {
        try {
          const jsonMatch = wordContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.word && parsed.definition) {
              setNewsletterData(prev => ({
                ...prev,
                signOff: {
                  ...prev.signOff,
                  wordOfTheDay: {
                    word: parsed.word,
                    definition: parsed.definition,
                    suggestedBy: parsed.suggestedBy || 'Community',
                    location: parsed.location || 'USA',
                    submitLink: prev.signOff.wordOfTheDay.submitLink
                  }
                }
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing word of day:', e);
        }
      }
      await delay(5000);

      // Step 11: Generate Game/Trivia
      setAiStatus('🎮 Creating trivia game... (11/15)');
      const gameContent = await generateWithAI('gameTrivia');
      if (gameContent) {
        try {
          const jsonMatch = gameContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Ensure content is always a string (AI sometimes returns object)
            let contentStr = '';
            if (typeof parsed.content === 'string') {
              contentStr = parsed.content;
            } else if (typeof parsed.questions === 'string') {
              contentStr = parsed.questions;
            } else if (parsed.content && typeof parsed.content === 'object') {
              // If content is an object, stringify it nicely
              contentStr = Object.entries(parsed.content)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n');
            }

            let answerStr = '';
            if (typeof parsed.answer === 'string') {
              answerStr = parsed.answer;
            } else if (typeof parsed.answers === 'string') {
              answerStr = parsed.answers;
            } else if (parsed.answer && typeof parsed.answer === 'object') {
              answerStr = Object.entries(parsed.answer)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n');
            }

            setCurrentGame({
              id: Date.now().toString(),
              title: parsed.title || 'Health Trivia',
              intro: parsed.intro || 'Test your knowledge!',
              content: contentStr,
              answer: answerStr
            });
            setNewsletterData(prev => ({
              ...prev,
              interactiveElement: {
                ...prev.interactiveElement,
                image: { ...prev.interactiveElement.image, midjourneyPrompt: generateMidjourneyPrompt('health trivia game quiz', 'games') }
              }
            }));
          }
        } catch (e) {
          console.error('Error parsing game:', e);
        }
      }
      await delay(5000);

      // Step 12: Generate Opening Hook (NOW has full context of what's in the issue)
      setAiStatus('✍️ Writing opening hook... (12/15)');
      const hookContent = await generateWithAI('openingHook');
      if (hookContent) {
        setNewsletterData(prev => ({
          ...prev,
          openingHook: { ...prev.openingHook, content: hookContent }
        }));
      }
      await delay(5000);

      // Step 13: Generate "In today's edition" teaser bullets with emojis
      setAiStatus('📋 Creating issue teasers... (13/15)');
      const tldrPrompt = `Write 4 SHORT teaser phrases for "In today's edition" section.

CONTENT TO TEASE:
- Lead Story: "${generatedLeadHeadline}"
- Research: "${generatedResearchHeadline}"
- Deep Dive: "${generatedDeepDiveHeadline}"
- Stat: "${generatedStatHeadline}"

RULES:
- Each teaser: 3-6 words MAX (short punchy phrases, NOT full sentences)
- Start each with a relevant emoji (🔬 🧬 💊 📊 🏥 💉 🧠 ❤️ 👁️ 🦴)
- Tease the topic, don't summarize it
- Make readers curious to scroll down

EXAMPLES:
"🔬 Vision restored after AMD"
"📊 $403B market projection"
"💊 New MS trial results"
"🧬 Inflammation and stem cell aging"

Return JSON array of 4 strings: ["🔬 teaser 1", "📊 teaser 2", "💊 teaser 3", "🧬 teaser 4"]`;

      const tldrContent = await generateWithAI('bottomLine', tldrPrompt, false);
      if (tldrContent) {
        try {
          const jsonMatch = tldrContent.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed) && parsed.length >= 4) {
              setNewsletterData(prev => ({
                ...prev,
                bottomLine: {
                  ...prev.bottomLine,
                  items: parsed.slice(0, 4)
                }
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing bottom line:', e);
        }
      }
      await delay(5000);

      // Step 14: Generate Subject Line and Preview Text (LAST - has full newsletter context)
      setAiStatus('📧 Writing subject line & preview... (14/15)');
      const subjectPrompt = `Create email subject line and preview text for this newsletter issue.

THIS ISSUE CONTAINS:
- Lead Story: "${generatedLeadHeadline}"
- Research: "${generatedResearchHeadline}"
- Deep Dive: "${generatedDeepDiveHeadline}"

Return ONLY valid JSON:
{
  "subjectLine": "Compelling subject line under 60 chars based on the lead story. No clickbait.",
  "previewText": "Preview text under 90 chars. Format: Key insight + 'Plus: [other topic]'"
}`;

      const headerContent = await generateWithAI('bottomLine', subjectPrompt, false);
      if (headerContent) {
        try {
          const jsonMatch = headerContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            setNewsletterData(prev => ({
              ...prev,
              preHeader: {
                ...prev.preHeader,
                subjectLine: parsed.subjectLine || generatedLeadHeadline || 'This Week in Regenerative Medicine',
                previewText: parsed.previewText || 'The latest stem cell research and health insights'
              }
            }));
          }
        } catch (e) {
          setNewsletterData(prev => ({
            ...prev,
            preHeader: {
              ...prev.preHeader,
              subjectLine: generatedLeadHeadline || 'This Week in Regenerative Medicine',
              previewText: 'The latest stem cell research, clinical trials, and health insights'
            }
          }));
        }
      }

      // Step 15: Final status
      setLastFetched(new Date().toLocaleString());
      setAiStatus(`✅ Newsletter created! ${publicationCount} PubMed publications this week. Review and edit as needed.`);
    } catch (error) {
      setAiStatus(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(prev => ({ ...prev, all: false }));
    }
  };

  const getSectionContent = (sectionKey) => {
    const d = newsletterData;

    switch (sectionKey) {
      case 'section1':
        // Combined Opening Hook + In Today's Edition
        return `${d.openingHook.content}\n\nIn today's edition:\n${d.bottomLine.items.join('\n')}\n\n—Renewal Weekly Team`;

      case 'section1b':
        // Legacy support - same as section1 now
        return `${d.openingHook.content}\n\nIn today's edition:\n${d.bottomLine.items.join('\n')}\n\n—Renewal Weekly Team`;

      case 'section3':
        return `${d.leadStory.sectionLabel}\n\n${d.leadStory.headline}\n\n${d.leadStory.content}`;

      case 'section4':
        return `${d.yourOptionsThisWeek.sectionLabel}\n\n${d.yourOptionsThisWeek.title}\n${d.yourOptionsThisWeek.subtitle}\n\n${d.yourOptionsThisWeek.content}`;

      case 'section4b':
        return `${d.livingWell.sectionLabel}\n\n${d.livingWell.headline}\n\n${d.livingWell.content}`;

      case 'section6':
        return `${d.secondaryStories.sectionLabel}\n\n${d.secondaryStories.stories.map(s => `${s.boldLead}\n${s.content}`).join('\n\n')}`;

      case 'section7':
        return `${d.industryDeepDive.sectionLabel}\n\n${d.industryDeepDive.headline}\n\n${d.industryDeepDive.content}`;

      case 'section10':
        return `${d.statSection.sectionLabel}\n\n${d.statSection.primeNumber}\n${d.statSection.headline}\n\n${d.statSection.content}`;

      case 'section11':
        return `${d.thePulse.sectionLabel}\n\n${d.thePulse.title}\n\n${d.thePulse.items.map(item => `• ${stripLinkSyntax(item.text)}`).join('\n')}`;

      default:
        return '';
    }
  };

  const copyToClipboard = (text, sectionId = null) => {
    navigator.clipboard.writeText(text);
    if (sectionId) {
      setCopiedSection(sectionId);
      setTimeout(() => setCopiedSection(null), 2000);
    }
  };

  // ===== V5.2 UPDATE: GENERATE HTML WITH LINK STYLING =====
  const generateFullHTML = () => {
    const d = newsletterData;
    
    // Convert link syntax to HTML links - charcoal text with 2px purple underline only
    const convertLinksToHTML = (content) => {
      if (!content) return '';
      return content
        .replace(/\{\{LINK:([^|]+)\|([^}]+)\}\}/g, '<a href="$2" style="text-decoration: none; color: #1F2937; border-bottom: 2px solid #8B5CF6; padding-bottom: 1px;">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    };
    
    return `<!-- Renewal Weekly Newsletter HTML - v5.2 -->
<!-- Paste this into Beehiiv's HTML editor -->

<style>
  .rw-section { border: 1px solid ${colors.border}; border-radius: 12px; padding: 24px; margin-bottom: 24px; background: ${colors.white}; }
  .rw-label { color: ${colors.primary}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .rw-headline { font-size: 24px; font-weight: 700; color: ${colors.text}; margin: 0 0 16px 0; line-height: 1.3; }
  .rw-image { width: 100%; border-radius: 8px; margin: 16px 0; }
  .rw-credit { font-size: 12px; color: ${colors.muted}; font-style: italic; margin-bottom: 16px; }
  .rw-body { font-size: 16px; line-height: 1.7; color: #374151; }
  .rw-source { font-size: 12px; color: ${colors.muted}; margin-top: 16px; padding-top: 12px; border-top: 1px solid ${colors.border}; }
  .rw-link { color: ${colors.text}; text-decoration: none; border-bottom: 2px solid ${colors.link}; padding-bottom: 1px; }
</style>

<!-- OPENING HOOK + IN TODAY'S EDITION -->
<div class="rw-section">
  <div class="rw-body" style="white-space: pre-line;">
${d.openingHook.content}
  </div>
  <div style="margin-top: 16px;">
    <p style="font-size: 15px; font-weight: 600; color: ${colors.text}; margin-bottom: 12px;">In today's edition:</p>
    <ul style="list-style: none; padding: 0; margin: 0;">
      ${d.bottomLine.items.map(item => `
      <li style="margin-bottom: 6px; font-size: 15px; color: ${colors.text};">
        ${item}
      </li>`).join('')}
    </ul>
    <p style="font-size: 15px; font-weight: 500; color: ${colors.text}; margin-top: 16px;">—Renewal Weekly Team</p>
  </div>
</div>

<!-- METRICS DASHBOARD -->
<div class="rw-section" style="background: linear-gradient(135deg, ${colors.dark} 0%, #0F172A 100%); color: white;">
  <p class="rw-label" style="color: ${colors.accent};">${d.metricsDashboard.title}</p>
  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 16px;">
    ${d.metricsDashboard.metrics.map(m => `
    <div style="text-align: center; padding: 12px;">
      <p style="font-size: 24px; font-weight: 700; margin: 0;">${m.value}</p>
      ${m.change ? `<p style="font-size: 12px; color: ${colors.accent}; margin: 4px 0;">${m.change}</p>` : ''}
      <p style="font-size: 11px; color: #94A3B8; margin: 4px 0 0 0;">${m.label}</p>
    </div>`).join('')}
  </div>
  <p style="font-size: 10px; color: #64748B; text-align: center; margin-top: 16px;">As of ${d.metricsDashboard.asOfDate}</p>
</div>

<!-- LEAD STORY -->
<div class="rw-section">
  <p class="rw-label">${d.leadStory.sectionLabel}</p>
  <h2 class="rw-headline">${d.leadStory.headline}</h2>
  <img src="[YOUR_IMAGE_URL]" alt="" class="rw-image" />
  <p class="rw-credit">${d.leadStory.image.credit}</p>
  <div class="rw-body">
    ${d.leadStory.content.split('\n\n').map(p => `<p>${convertLinksToHTML(p)}</p>`).join('')}
  </div>
  <p class="rw-source">Sources: ${d.leadStory.sources.map(s => `<a href="${s.url}" class="rw-link">${s.title}</a>`).join(' | ')}</p>
</div>

<!-- RESEARCH ROUNDUP -->
<div class="rw-section">
  <p class="rw-label">${d.yourOptionsThisWeek.sectionLabel}</p>
  <h2 class="rw-headline">${d.yourOptionsThisWeek.title}</h2>
  ${d.yourOptionsThisWeek.subtitle ? `<h3 style="font-size: 18px; color: #4B5563; margin-bottom: 16px;">${d.yourOptionsThisWeek.subtitle}</h3>` : ''}
  <img src="[YOUR_IMAGE_URL]" alt="" class="rw-image" />
  <p class="rw-credit">${d.yourOptionsThisWeek.image.credit}</p>
  <div class="rw-body">
    ${d.yourOptionsThisWeek.content.split('\n\n').map(p => `<p>${convertLinksToHTML(p)}</p>`).join('')}
  </div>
</div>

<!-- LIVING WELL -->
<div class="rw-section">
  <p class="rw-label">${d.livingWell.sectionLabel}</p>
  <h2 class="rw-headline">${d.livingWell.headline}</h2>
  <div class="rw-body">
    ${d.livingWell.content.split('\n\n').map(p => `<p>${convertLinksToHTML(p)}</p>`).join('')}
  </div>
  ${d.livingWell.sources && d.livingWell.sources[0] ? `<p style="font-size: 12px; color: ${colors.muted};">Source: <a href="${d.livingWell.sources[0].url}" class="rw-link">${d.livingWell.sources[0].title}</a></p>` : ''}
</div>

<!-- SPONSOR 1 -->
<div class="rw-section" style="background: ${colors.accent}; border: 2px dashed ${colors.primary};">
  <p style="text-align: center; color: ${colors.primary}; font-weight: 600;">📢 SPONSOR PLACEHOLDER</p>
</div>

<!-- ON OUR RADAR -->
<div class="rw-section">
  <p class="rw-label">${d.secondaryStories.sectionLabel}</p>
  <img src="[YOUR_IMAGE_URL]" alt="" class="rw-image" />
  <p class="rw-credit">${d.secondaryStories.image.credit}</p>
  ${d.secondaryStories.stories.map(story => `
  <div style="border-left: 3px solid ${colors.primary}; padding-left: 16px; margin-bottom: 20px;">
    <p class="rw-body"><strong>${story.boldLead}</strong> ${convertLinksToHTML(story.content)}</p>
    ${story.sources && story.sources[0] ? `<p style="font-size: 12px; color: ${colors.muted};">Source: <a href="${story.sources[0].url}" class="rw-link">${story.sources[0].title}</a>, ${story.sources[0].date}</p>` : ''}
  </div>`).join('')}
</div>

<!-- DEEP DIVE -->
<div class="rw-section">
  <p class="rw-label">${d.industryDeepDive.sectionLabel}</p>
  <h2 class="rw-headline">${d.industryDeepDive.headline}</h2>
  <img src="[YOUR_IMAGE_URL]" alt="" class="rw-image" />
  <p class="rw-credit">${d.industryDeepDive.image.credit}</p>
  <div class="rw-body">
    ${d.industryDeepDive.content.split('\n\n').map(p => `<p>${convertLinksToHTML(p).replace(/• /g, '&bull; ')}</p>`).join('')}
  </div>
</div>

<!-- SPONSOR 2 -->
<div class="rw-section" style="background: ${colors.accent};">
  <p style="text-align: center; color: ${colors.primary}; font-weight: 600;">TOGETHER WITH ${d.quickCalendar.sponsorName}</p>
</div>

<!-- WORTH KNOWING -->
<div class="rw-section">
  <p class="rw-label">${d.worthKnowing.sectionLabel}</p>
  <h3 style="font-size: 18px; color: ${colors.text}; margin-bottom: 16px;">${d.worthKnowing.title}</h3>
  ${d.worthKnowing.items.map(item => `
  <div style="background: #F9FAFB; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
    <p style="font-weight: 600; color: ${colors.text}; margin: 0 0 8px 0;">${item.title} ${item.date ? `<span style="font-size: 12px; background: ${colors.accent}; color: ${colors.primary}; padding: 2px 8px; border-radius: 4px; margin-left: 8px;">${item.date}</span>` : ''}</p>
    <p style="font-size: 14px; color: #4B5563; margin: 0;">${item.description}</p>
  </div>`).join('')}
</div>

<!-- STAT OF THE WEEK -->
<div class="rw-section" style="text-align: center;">
  <p class="rw-label">${d.statSection.sectionLabel}</p>
  <p style="font-size: 48px; font-weight: 800; color: ${colors.primary}; margin: 16px 0;">${d.statSection.primeNumber}</p>
  <p style="font-size: 18px; color: #4B5563; margin-bottom: 16px;">${d.statSection.headline}</p>
  <img src="[YOUR_IMAGE_URL]" alt="" class="rw-image" />
  <div class="rw-body" style="text-align: left;">
    ${d.statSection.content.split('\n\n').map(p => `<p>${convertLinksToHTML(p)}</p>`).join('')}
  </div>
</div>

<!-- THE PULSE -->
<div class="rw-section">
  <p class="rw-label">${d.thePulse.sectionLabel}</p>
  <h3 style="font-size: 18px; color: ${colors.text}; margin-bottom: 16px;">${d.thePulse.title}</h3>
  <ul style="list-style: none; padding: 0;">
    ${d.thePulse.items.map(item => `<li style="padding: 8px 0; border-bottom: 1px solid #F3F4F6;">&bull; ${convertLinksToHTML(item.text)} <span style="font-size: 12px; color: ${colors.muted};">[${item.source}, ${item.date}]</span></li>`).join('')}
  </ul>
</div>

<!-- RECS -->
<div class="rw-section">
  <p class="rw-label">${d.recommendations.sectionLabel}</p>
  <p style="margin: 8px 0;"><strong>Read:</strong> ${d.recommendations.read.prefix}<a href="${d.recommendations.read.url}" class="rw-link">${d.recommendations.read.linkText}</a>${d.recommendations.read.suffix}**</p>
  <p style="margin: 8px 0;"><strong>Watch:</strong> ${d.recommendations.watch.prefix}<a href="${d.recommendations.watch.url}" class="rw-link">${d.recommendations.watch.linkText}</a>${d.recommendations.watch.suffix}</p>
  <p style="margin: 8px 0;"><strong>Try:</strong> ${d.recommendations.try.prefix}<a href="${d.recommendations.try.url}" class="rw-link">${d.recommendations.try.linkText}</a>${d.recommendations.try.suffix}</p>
  <p style="margin: 8px 0;"><strong>Listen:</strong> ${d.recommendations.listen.prefix}<a href="${d.recommendations.listen.url}" class="rw-link">${d.recommendations.listen.linkText}</a>${d.recommendations.listen.suffix}</p>
  <p style="font-size: 12px; color: ${colors.muted}; margin-top: 16px; padding-top: 12px; border-top: 1px solid ${colors.border};">
    ${d.recommendations.sponsorMessage}<br/>
    ${d.recommendations.affiliateDisclosure}
  </p>
</div>

<!-- PLAY -->
<div class="rw-section">
  <p class="rw-label">${d.interactiveElement.sectionLabel}</p>
  <h3 style="font-size: 20px; font-weight: 600; color: ${colors.text}; margin-bottom: 8px;">${currentGame.title}</h3>
  <p style="color: #4B5563; margin-bottom: 16px;">${currentGame.intro}</p>
  <div style="background: #F9FAFB; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-family: inherit;">
${currentGame.content}
  </div>
</div>

<!-- REFERRAL -->
<div class="rw-section" style="text-align: center; background: linear-gradient(135deg, ${colors.accent} 0%, #F0F9FF 100%);">
  <p class="rw-label">${d.referralProgram.sectionLabel}</p>
  <p style="font-size: 18px; color: ${colors.text}; margin-bottom: 8px;">${d.referralProgram.headline}</p>
  <p style="font-size: 14px; color: ${colors.muted}; margin-bottom: 16px;">${d.referralProgram.subtext}</p>
  <p style="margin-bottom: 16px;">Your referral count: <strong>${d.referralProgram.referralCountTag}</strong></p>
  <a href="${d.referralProgram.referralLinkTag}" style="display: inline-block; padding: 12px 32px; background: ${colors.primary}; color: white; border-radius: 8px; text-decoration: none; font-weight: 600;">Share Now</a>
</div>

<!-- FOOTER -->
<div class="rw-section">
  <div style="background: #F9FAFB; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
    <p style="font-weight: 600; color: ${colors.text}; margin: 0 0 8px 0;">ANSWER</p>
    <p style="font-size: 14px; color: #4B5563; margin: 0;">${currentGame.answer}</p>
  </div>
  <div style="background: #F9FAFB; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
    <p style="font-weight: 600; color: ${colors.text}; margin: 0 0 8px 0;">Word of the Day</p>
    <p style="font-size: 14px; color: #4B5563; margin: 0;"><strong>${d.signOff.wordOfTheDay.word}</strong>: ${d.signOff.wordOfTheDay.definition}</p>
  </div>
  <div style="text-align: center; padding-top: 16px; border-top: 1px solid ${colors.border};">
    <p style="font-size: 14px; color: ${colors.muted};">Written by ${d.signOff.writtenBy}</p>
    <p style="font-size: 12px; color: ${colors.muted}; margin-top: 16px;">${d.signOff.copyright}</p>
  </div>
</div>
`;
  };

  // ===== V5.2 UPDATE: PREVIEW CARD WITH PURPLE STYLING =====
  const PreviewCard = ({ sectionLabel, children }) => (
    <div style={{
      border: `1px solid ${colors.border}`,
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '24px',
      background: colors.white
    }}>
      {sectionLabel && (
        <p style={{
          color: colors.primary,
          fontSize: '12px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '8px'
        }}>
          {sectionLabel}
        </p>
      )}
      {children}
    </div>
  );

  // Image placeholder component for preview
  const ImagePlaceholder = ({ credit }) => (
    <div style={{ 
      background: '#F3F4F6', 
      borderRadius: '8px', 
      padding: '40px', 
      textAlign: 'center', 
      marginBottom: '16px' 
    }}>
      <p style={{ color: '#9CA3AF' }}>[Image Placeholder]</p>
      {credit && <p style={{ fontSize: '12px', color: colors.muted, marginTop: '8px' }}>{credit}</p>}
    </div>
  );

  // Section Card for Dashboard
  const SectionCard = ({ number, title, children, sectionKey, wordCount = null, sources = [], imageSlot = null, showRefresh = true }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4">
      <div
        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => toggleSection(sectionKey)}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-bold shadow"
            style={{ backgroundColor: colors.primary }}
          >
            {number}
          </span>
          <div>
            <h3 className="font-semibold text-gray-800">{title}</h3>
            {wordCount && <span className="text-xs text-gray-500">({wordCount})</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading[sectionKey] && <span className="text-xs px-2 py-1 rounded animate-pulse" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>⟳ Generating...</span>}
          {imageSlot && <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: colors.accent, color: colors.primary }}>📷 Image</span>}
          <span className={`transform transition-transform text-gray-400 ${expandedSections[sectionKey] ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </div>
      {expandedSections[sectionKey] && (
        <div className="p-5 border-t border-gray-100">
          {/* Prompt Input - Only show if refresh is enabled */}
          {showRefresh && (
            <div className="mb-4 flex gap-2">
              <PromptInput
                value={sectionPrompts[sectionKey] || ''}
                onChange={(value) => handlePromptChange(sectionKey, value)}
                placeholder="Enter a keyword to guide refresh..."
                disabled={isLoading[sectionKey]}
              />
              <button
                onClick={(e) => { e.stopPropagation(); regenerateSection(sectionKey); }}
                disabled={isLoading[sectionKey]}
                className="px-4 py-2 text-sm text-white rounded-lg font-medium whitespace-nowrap transition-all duration-200"
                style={{
                  backgroundColor: isLoading[sectionKey] ? '#F59E0B' : colors.primary,
                  opacity: isLoading[sectionKey] ? 1 : undefined,
                  animation: isLoading[sectionKey] ? 'pulse 1.5s ease-in-out infinite' : 'none'
                }}
              >
                {isLoading[sectionKey] ? '⟳ Researching...' : '↻ Refresh Section'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); copyToClipboard(stripLinkSyntax(getSectionContent(sectionKey)), sectionKey); }}
                className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors"
              >
                {copiedSection === sectionKey ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          )}
          {/* Copy button only when refresh is disabled */}
          {!showRefresh && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); copyToClipboard(stripLinkSyntax(getSectionContent(sectionKey)), sectionKey); }}
                className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors"
              >
                {copiedSection === sectionKey ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading[sectionKey] && (
            <div className="mb-4 p-6 rounded-lg text-center" style={{ backgroundColor: '#FEF3C7', border: '2px solid #F59E0B' }}>
              <div className="flex items-center justify-center gap-3">
                <svg className="animate-spin h-6 w-6 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-amber-800 font-medium">Searching the web and generating content...</span>
              </div>
              <p className="text-amber-600 text-sm mt-2">This may take 15-30 seconds</p>
            </div>
          )}

          {/* Image Slot */}
          {imageSlot && (
            <div className="mb-4 p-4 rounded-lg border-2 border-dashed" style={{ backgroundColor: colors.accent, borderColor: colors.primary }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: colors.text }}>📷 Image Slot</span>
                <button
                  onClick={() => copyToClipboard(imageSlot.midjourneyPrompt)}
                  className="text-xs px-2 py-1 rounded hover:opacity-80"
                  style={{ backgroundColor: colors.primary, color: 'white' }}
                >
                  Copy Midjourney Prompt
                </button>
              </div>
              <p className="text-xs mb-2" style={{ color: colors.muted }}>Credit: {imageSlot.credit}</p>
              <div className="p-2 bg-white rounded border text-xs font-mono" style={{ color: colors.muted }}>
                {imageSlot.midjourneyPrompt || 'Generating prompt...'}
              </div>
            </div>
          )}

          <div id={`content-${sectionKey}`}>
            {children}
          </div>

          {/* Sources */}
          {sources && sources.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs font-medium mb-1" style={{ color: colors.muted }}>🔎 Sources:</p>
              <div className="flex flex-wrap gap-2">
                {sources.map((source, i) => (
                  <a 
                    key={i}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ 
                      backgroundColor: '#F3F4F6',
                      color: colors.muted
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = colors.accent;
                      e.target.style.color = colors.primary;
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = '#F3F4F6';
                      e.target.style.color = colors.muted;
                    }}
                  >
                    {source.title} {source.date && `(${source.date})`}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Updated with purple gradient */}
      <header className="text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)` }}>
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center text-2xl shadow-lg">✦</div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Renewal Weekly</h1>
                <p className="text-purple-200 text-sm">Newsletter Compiler v5.2</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-medium transition-colors"
              >
                ⚙️ Settings
              </button>
              <div className="text-right text-sm">
                <p className="text-purple-200">Last fetched:</p>
                <p className="font-semibold">{lastFetched || 'Never'}</p>
              </div>
              <button
                onClick={fetchAllData}
                disabled={isLoading.all}
                className="px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
                style={{
                  backgroundColor: isLoading.all ? '#F59E0B' : 'white',
                  color: isLoading.all ? 'white' : colors.primary,
                  animation: isLoading.all ? 'pulse 1.5s ease-in-out infinite' : 'none'
                }}
              >
                {isLoading.all ? '⟳ Creating Newsletter...' : '✨ Create Newsletter'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* AI Status Display */}
      {aiStatus && isLoading.all && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-b border-purple-200">
          <div className="max-w-6xl mx-auto px-6 py-3">
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-purple-800 font-medium">{aiStatus}</span>
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-6xl mx-auto px-6 py-6">
            <div className="flex gap-4 mb-4">
              {['ai', 'stories', 'beehiiv'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveSettingsTab(tab)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors`}
                  style={activeSettingsTab === tab
                    ? { backgroundColor: colors.accent, color: colors.primary }
                    : { color: colors.muted }
                  }
                >
                  {tab === 'ai' && '🤖 AI'}
                  {tab === 'stories' && `📚 Used Stories (${usedStories.length})`}
                  {tab === 'beehiiv' && '🐝 Beehiiv'}
                </button>
              ))}
            </div>

            {activeSettingsTab === 'ai' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Configure your Anthropic API key for AI-powered content generation.</p>
                <div className="p-4 rounded-lg" style={{ backgroundColor: colors.accent }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.primary }}>Anthropic API Key</label>
                  <input
                    type="password"
                    value={anthropicApiKey}
                    onChange={(e) => setAnthropicApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                    style={{ borderColor: colors.border }}
                  />
                  <p className="text-xs mt-2" style={{ color: colors.muted }}>
                    Get your API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="underline">console.anthropic.com</a>
                  </p>
                  {anthropicApiKey && (
                    <p className="text-xs mt-2 font-medium" style={{ color: colors.primary }}>✓ API key saved</p>
                  )}
                </div>

                {/* Test Mode Toggle */}
                <div className="p-4 rounded-lg border-2" style={{
                  backgroundColor: testMode ? '#FEF3C7' : colors.accent,
                  borderColor: testMode ? '#F59E0B' : 'transparent'
                }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-bold" style={{ color: testMode ? '#B45309' : colors.primary }}>
                        🧪 Test Mode {testMode ? 'ON' : 'OFF'}
                      </label>
                      <p className="text-xs mt-1" style={{ color: testMode ? '#92400E' : colors.muted }}>
                        {testMode
                          ? 'Using Haiku (12x cheaper) — Lower quality, great for testing'
                          : 'Using Sonnet — Full quality for production'}
                      </p>
                    </div>
                    <button
                      onClick={() => setTestMode(!testMode)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: testMode ? '#F59E0B' : colors.primary,
                        color: 'white'
                      }}
                    >
                      {testMode ? 'Switch to Sonnet' : 'Enable Test Mode'}
                    </button>
                  </div>
                </div>
                {aiStatus && (
                  <div className={`p-3 rounded-lg text-sm ${aiStatus.startsWith('Error') || aiStatus.startsWith('Please') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {aiStatus}
                  </div>
                )}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-800 mb-2">How it works:</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• <strong>"Create Newsletter"</strong> generates a complete newsletter with real-time web research</li>
                    <li>• Click "Refresh Section" to regenerate individual sections with fresh research</li>
                    <li>• Enter keywords to guide the AI (e.g., "Parkinson's disease", "CAR-T therapy")</li>
                    <li>• All content uses <strong>live web search</strong> to find current news and real article links</li>
                    <li>• Sources configured in <code>src/config/sources.json</code></li>
                  </ul>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="font-medium text-amber-800 mb-2">💰 Cost Estimate:</p>
                  <ul className="text-sm text-amber-700 space-y-1">
                    <li>• Web searches: ~$0.01 per search ($0.15-0.20 per full newsletter)</li>
                    <li>• Claude tokens: ~$0.03-0.10 per newsletter</li>
                    <li>• <strong>Total per newsletter: ~$0.25-0.35</strong></li>
                  </ul>
                </div>
              </div>
            )}

            {activeSettingsTab === 'stories' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">Track used stories to prevent repetition.</p>
                  <div className="flex gap-2">
                    <button onClick={clearOldStories} className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">Clear 90+ days</button>
                    <button onClick={exportUsedStories} className="px-3 py-1 text-sm rounded" style={{ backgroundColor: colors.accent, color: colors.primary }}>📤 Export</button>
                    <label className="px-3 py-1 text-sm rounded cursor-pointer" style={{ backgroundColor: colors.accent, color: colors.primary }}>
                      📥 Import <input type="file" accept=".json" onChange={importUsedStories} className="hidden" />
                    </label>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-lg">
                  {usedStories.length === 0 ? (
                    <p className="p-4 text-gray-500 text-sm text-center">No stories tracked yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Title</th>
                          <th className="text-left p-2">Used Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usedStories.slice().reverse().slice(0, 10).map((story, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2 text-gray-700">{story.title?.substring(0, 40)}...</td>
                            <td className="p-2 text-gray-500">{new Date(story.usedDate).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeSettingsTab === 'beehiiv' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Beehiiv merge tags for referral tracking:</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { tag: '{{subscriber.referral_count}}', desc: 'Referral count' },
                    { tag: '{{subscriber.rh_reflink}}', desc: 'Referral link' },
                    { tag: '{{subscriber.first_name}}', desc: 'First name' },
                    { tag: '{{subscriber.email}}', desc: 'Email address' }
                  ].map(item => (
                    <div key={item.tag} className="p-3 rounded-lg" style={{ backgroundColor: colors.accent }}>
                      <p className="font-mono text-sm" style={{ color: colors.primary }}>{item.tag}</p>
                      <p className="text-xs" style={{ color: colors.muted }}>{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation - Updated with purple active state */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1">
            {[
              { id: 'dashboard', label: '📝 Edit' },
              { id: 'preview', label: '👁️ Preview' },
              { id: 'export', label: '📤 Export' },
              { id: 'html', label: '📧 HTML' },
              { id: 'history', label: `📚 History (${newsletterHistory.length})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 font-medium transition-colors ${activeTab === tab.id ? 'border-b-2' : 'text-gray-500 hover:bg-gray-50'}`}
                style={activeTab === tab.id ? { color: colors.primary, borderColor: colors.primary, backgroundColor: colors.accent } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-2">
            {/* Pre-Header */}
            <div className="rounded-xl p-5 mb-6 text-white" style={{ background: `linear-gradient(135deg, ${colors.dark} 0%, #0F172A 100%)` }}>
              <h2 className="font-bold mb-3 text-sm uppercase tracking-wide" style={{ color: colors.accent }}>Pre-Header Setup</h2>
              <div className="grid grid-cols-1 gap-4 text-sm">
                <div>
                  <label className="text-xs uppercase" style={{ color: colors.accent }}>Subject Line</label>
                  <p className="font-medium mt-1 text-lg">{newsletterData.preHeader.subjectLine}</p>
                </div>
                <div>
                  <label className="text-xs uppercase" style={{ color: colors.accent }}>Preview Text</label>
                  <p className="mt-1 text-gray-300">{newsletterData.preHeader.previewText}</p>
                </div>
                <div className="flex gap-8">
                  <div><label className="text-xs uppercase" style={{ color: colors.accent }}>Issue</label><p className="mt-1">#{newsletterData.preHeader.issueNumber}</p></div>
                  <div><label className="text-xs uppercase" style={{ color: colors.accent }}>Date</label><p className="mt-1">{newsletterData.preHeader.date}</p></div>
                  <div><label className="text-xs uppercase" style={{ color: colors.accent }}>Read Time</label><p className="mt-1">{newsletterData.preHeader.readTime}</p></div>
                </div>
              </div>
            </div>

            {/* Section 1: Opening Hook + In Today's Edition (Combined) */}
            <SectionCard number="1" title="Opening Hook" sectionKey="section1" showRefresh={true} wordCount="40-60 words">
              <div className="space-y-4">
                <div className="text-sm whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {newsletterData.openingHook.content}
                </div>
                <div className="pt-2">
                  <p className="text-sm font-bold text-gray-800 mb-3">In today's edition:</p>
                  <ul className="space-y-2">
                    {newsletterData.bottomLine.items.map((item, i) => (
                      <li key={i} className="text-sm text-gray-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm font-medium text-gray-600 mt-4">—Renewal Weekly Team</p>
                </div>
              </div>
            </SectionCard>

            {/* Section 2: Metrics - 3x2 Grid - No refresh, compiled during full newsletter creation */}
            <SectionCard number="2" title="Metrics Dashboard" sectionKey="section2" showRefresh={false}>
              <div className="rounded-lg p-5 text-white" style={{ background: `linear-gradient(135deg, ${colors.dark} 0%, #0F172A 100%)` }}>
                <h3 className="font-bold mb-4 text-sm uppercase" style={{ color: colors.accent }}>{newsletterData.metricsDashboard.title}</h3>
                <div className="grid grid-cols-2 gap-4">
                  {newsletterData.metricsDashboard.metrics.map((m, i) => (
                    <div key={i} className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                      <p className="text-2xl font-bold">{m.value}</p>
                      {m.change && <p className="text-sm" style={{ color: colors.accent }}>{m.change}</p>}
                      <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{m.label}</p>
                      {m.dynamic && <span className="text-xs px-2 py-0.5 rounded mt-1 inline-block" style={{ backgroundColor: colors.primary, color: 'white' }}>Dynamic</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-center mt-4" style={{ color: '#64748B' }}>As of {newsletterData.metricsDashboard.asOfDate}</p>
              </div>
            </SectionCard>

            {/* Section 3: Lead Story - WITH IMAGE */}
            <SectionCard 
              number="3" 
              title="Lead Story" 
              sectionKey="section3" 
              wordCount="350-400 words"
              sources={newsletterData.leadStory.sources}
              imageSlot={newsletterData.leadStory.image}
            >
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.leadStory.sectionLabel}</p>
                <h3 className="text-xl font-bold text-gray-800">{newsletterData.leadStory.headline}</h3>
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                  {newsletterData.leadStory.content.split('\n\n').map((p, i) => (
                    <p key={i} className="mb-3">{renderContentWithLinks(p)}</p>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* Section 4: Your Options - WITH IMAGE */}
            <SectionCard 
              number="4" 
              title="Research Roundup" 
              sectionKey="section4"
              sources={newsletterData.yourOptionsThisWeek.sources}
              imageSlot={newsletterData.yourOptionsThisWeek.image}
            >
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.yourOptionsThisWeek.sectionLabel}</p>
                <h4 className="font-bold text-gray-800 text-lg">{newsletterData.yourOptionsThisWeek.title}</h4>
                <p className="text-gray-600">{newsletterData.yourOptionsThisWeek.subtitle}</p>
                <div className="prose prose-sm max-w-none text-gray-700">
                  {newsletterData.yourOptionsThisWeek.content.split('\n\n').map((p, i) => (
                    <p key={i} className="mb-3">{renderContentWithLinks(p)}</p>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* Section 4b: Living Well - Lifestyle Section */}
            <SectionCard
              number="4b"
              title="Living Well"
              sectionKey="section4b"
              sources={newsletterData.livingWell.sources}
            >
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.livingWell.sectionLabel}</p>
                <h4 className="font-bold text-gray-800 text-lg">{newsletterData.livingWell.headline}</h4>
                <div className="prose prose-sm max-w-none text-gray-700">
                  {newsletterData.livingWell.content.split('\n\n').map((p, i) => (
                    <p key={i} className="mb-3">{renderContentWithLinks(p)}</p>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* Section 5: Sponsor */}
            <SectionCard number="5" title="SPONSOR 1" sectionKey="section5">
              <div className="border-2 border-dashed rounded-lg p-5 text-center" style={{ backgroundColor: colors.accent, borderColor: colors.primary }}>
                <p className="font-bold" style={{ color: colors.primary }}>📢 SPONSOR PLACEHOLDER</p>
              </div>
            </SectionCard>

            {/* Section 6: Secondary Stories - WITH IMAGE */}
            <SectionCard 
              number="6" 
              title="On Our Radar" 
              sectionKey="section6"
              imageSlot={newsletterData.secondaryStories.image}
            >
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.secondaryStories.sectionLabel}</p>
                {newsletterData.secondaryStories.stories.map((story) => (
                  <div key={story.id} className="border-l-4 pl-4 py-2" style={{ borderColor: colors.primary }}>
                    <p className="text-sm text-gray-700"><strong>{story.boldLead}</strong> {renderContentWithLinks(story.content)}</p>
                    {story.sources && story.sources[0] && (
                      <p className="text-xs text-gray-400 mt-1">Source: {story.sources[0].title}, {story.sources[0].date}</p>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Section 7: Deep Dive - WITH IMAGE */}
            <SectionCard 
              number="7" 
              title="Deep Dive" 
              sectionKey="section7"
              sources={newsletterData.industryDeepDive.sources}
              imageSlot={newsletterData.industryDeepDive.image}
            >
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.industryDeepDive.sectionLabel}</p>
                <h4 className="font-bold text-gray-800 text-lg">{newsletterData.industryDeepDive.headline}</h4>
                <div className="prose prose-sm max-w-none text-gray-700">
                  {newsletterData.industryDeepDive.content.split('\n\n').map((p, i) => (
                    <p key={i} className="mb-3">{renderContentWithLinks(p)}</p>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* Section 8: Sponsor 2 */}
            <SectionCard number="8" title="SPONSOR 2" sectionKey="section8">
              <div className="rounded-lg p-4 text-center" style={{ backgroundColor: colors.accent }}>
                <p className="font-medium" style={{ color: colors.primary }}>TOGETHER WITH {newsletterData.quickCalendar.sponsorName}</p>
              </div>
            </SectionCard>

            {/* Section 9: Worth Knowing */}
            <SectionCard number="9" title="Worth Knowing" sectionKey="section9">
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.worthKnowing.sectionLabel}</p>
                {newsletterData.worthKnowing.items.map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-4">
                    <p className="font-bold text-gray-800">{item.title} {item.date && <span className="text-xs px-2 py-0.5 rounded ml-2" style={{ backgroundColor: colors.accent, color: colors.primary }}>{item.date}</span>}</p>
                    <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Section 10: STAT - WITH IMAGE */}
            <SectionCard 
              number="10" 
              title="Stat of the Week" 
              sectionKey="section10"
              sources={newsletterData.statSection.sources}
              imageSlot={newsletterData.statSection.image}
            >
              <div className="text-center py-4 space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.statSection.sectionLabel}</p>
                <p className="text-5xl font-bold" style={{ color: colors.primary }}>{newsletterData.statSection.primeNumber}</p>
                <p className="text-lg text-gray-600">{newsletterData.statSection.headline}</p>
                <div className="text-left prose prose-sm max-w-2xl mx-auto text-gray-700">
                  {newsletterData.statSection.content.split('\n\n').map((p, i) => (
                    <p key={i} className="mb-3">{renderContentWithLinks(p)}</p>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* Section 11: The Pulse */}
            <SectionCard number="11" title="The Pulse (Quick Hits)" sectionKey="section11">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.primary }}>{newsletterData.thePulse.sectionLabel}</p>
                <h4 className="font-bold text-gray-800 mb-3">{newsletterData.thePulse.title}</h4>
                <ul className="space-y-3">
                  {newsletterData.thePulse.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2 pb-2 border-b border-gray-100">
                      <span style={{ color: colors.primary }}>•</span>
                      <div>
                        {renderContentWithLinks(item.text)}
                        <span className="ml-2 text-xs" style={{ color: colors.muted }}>
                          [{item.source}, {item.date}]
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </SectionCard>

            {/* Section 12: RECS */}
            <SectionCard number="12" title="RECS" sectionKey="section12">
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.recommendations.sectionLabel}</p>
                <div className="grid gap-2">
                  <p className="text-sm">
                    <strong>Read:</strong> {newsletterData.recommendations.read.prefix}
                    <a href={newsletterData.recommendations.read.url} style={{ color: colors.text, borderBottom: `2px solid ${colors.link}`, paddingBottom: '1px' }}>{newsletterData.recommendations.read.linkText}</a>
                    {newsletterData.recommendations.read.suffix}**
                  </p>
                  <p className="text-sm">
                    <strong>Watch:</strong> {newsletterData.recommendations.watch.prefix}
                    <a href={newsletterData.recommendations.watch.url} style={{ color: colors.text, borderBottom: `2px solid ${colors.link}`, paddingBottom: '1px' }}>{newsletterData.recommendations.watch.linkText}</a>
                    {newsletterData.recommendations.watch.suffix}
                  </p>
                  <p className="text-sm">
                    <strong>Try:</strong> {newsletterData.recommendations.try.prefix}
                    <a href={newsletterData.recommendations.try.url} style={{ color: colors.text, borderBottom: `2px solid ${colors.link}`, paddingBottom: '1px' }}>{newsletterData.recommendations.try.linkText}</a>
                    {newsletterData.recommendations.try.suffix}
                  </p>
                  <p className="text-sm">
                    <strong>Listen:</strong> {newsletterData.recommendations.listen.prefix}
                    <a href={newsletterData.recommendations.listen.url} style={{ color: colors.text, borderBottom: `2px solid ${colors.link}`, paddingBottom: '1px' }}>{newsletterData.recommendations.listen.linkText}</a>
                    {newsletterData.recommendations.listen.suffix}
                  </p>
                </div>
                <div className="text-xs pt-2 border-t" style={{ color: colors.muted }}>
                  <p>{newsletterData.recommendations.sponsorMessage}</p>
                  <p>{newsletterData.recommendations.affiliateDisclosure}</p>
                </div>
              </div>
            </SectionCard>

            {/* Section 13: PLAY - WITH OPTIONAL IMAGE */}
            <SectionCard 
              number="13" 
              title="PLAY (Games)" 
              sectionKey="section13"
              imageSlot={newsletterData.interactiveElement.image}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.interactiveElement.sectionLabel}</p>
                  <button onClick={rotateGame} className="px-3 py-1 text-sm rounded" style={{ backgroundColor: colors.accent, color: colors.primary }}>
                    🎲 Different Game
                  </button>
                </div>
                <div className="bg-gray-50 rounded-lg p-5">
                  <h5 className="font-bold text-gray-800 text-lg mb-2">{currentGame.title}</h5>
                  <p className="text-sm text-gray-600 mb-4">{currentGame.intro}</p>
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-white p-4 rounded-lg">{currentGame.content}</pre>
                </div>
                <div className="bg-gray-100 rounded-lg p-3">
                  <p className="text-xs font-medium" style={{ color: colors.muted }}>Answer:</p>
                  <p className="text-sm text-gray-700 mt-1">{currentGame.answer}</p>
                </div>
              </div>
            </SectionCard>

            {/* Section 14: Referral */}
            <SectionCard number="14" title="Share Renewal Weekly" sectionKey="section14">
              <div className="rounded-lg p-5 text-center" style={{ background: `linear-gradient(135deg, ${colors.accent} 0%, #F0F9FF 100%)` }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.primary }}>{newsletterData.referralProgram.sectionLabel}</p>
                <p className="font-medium text-gray-800">{newsletterData.referralProgram.headline}</p>
                <p className="text-sm text-gray-600 mt-2">{newsletterData.referralProgram.subtext}</p>
                <div className="mt-4">
                  <p className="text-sm">Your referral count: <code className="bg-white px-2 py-1 rounded" style={{ color: colors.primary }}>{newsletterData.referralProgram.referralCountTag}</code></p>
                  <button className="mt-3 px-6 py-2 text-white rounded-lg font-medium" style={{ backgroundColor: colors.primary }}>Click to Share</button>
                </div>
              </div>
            </SectionCard>

            {/* Section 15: Footer */}
            <SectionCard number="15" title="Footer" sectionKey="section15">
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-bold text-gray-800 mb-2">ANSWER</h4>
                  <p className="text-sm text-gray-600">{currentGame.answer}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-bold text-gray-800 mb-2">Word of the Day</h4>
                  <p className="text-sm text-gray-700">
                    <strong>{newsletterData.signOff.wordOfTheDay.word}</strong>: {newsletterData.signOff.wordOfTheDay.definition}
                  </p>
                </div>
                <div className="text-center text-sm text-gray-600 pt-4 border-t">
                  <p>Written by {newsletterData.signOff.writtenBy}</p>
                  <p className="mt-4">{newsletterData.signOff.copyright}</p>
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        {/* ===== V5.2 UPDATE: FULL PREVIEW TAB - ALL 15 SECTIONS ===== */}
        {activeTab === 'preview' && (
          <div className="max-w-2xl mx-auto bg-white">
            
            {/* 1. Opening Hook + In Today's Edition */}
            <PreviewCard>
              <div style={{ fontSize: '16px', lineHeight: '1.7', color: colors.text, whiteSpace: 'pre-line' }}>
                {newsletterData.openingHook.content}
              </div>
              <div style={{ marginTop: '16px' }}>
                <p style={{ fontSize: '15px', fontWeight: '600', color: colors.text, marginBottom: '12px' }}>In today's edition:</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {newsletterData.bottomLine.items.map((item, i) => (
                    <li key={i} style={{ marginBottom: '6px', fontSize: '15px', color: colors.text }}>
                      {item}
                    </li>
                  ))}
                </ul>
                <p style={{ fontSize: '15px', fontWeight: '500', color: colors.text, marginTop: '16px' }}>—Renewal Weekly Team</p>
              </div>
            </PreviewCard>

            {/* 2. Metrics Dashboard - 3x2 Grid */}
            <PreviewCard>
              <div style={{ background: `linear-gradient(135deg, ${colors.dark} 0%, #0F172A 100%)`, borderRadius: '8px', padding: '24px', color: 'white' }}>
                <p style={{ color: colors.accent, fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
                  {newsletterData.metricsDashboard.title}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {newsletterData.metricsDashboard.metrics.map((m, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      <p style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>{m.value}</p>
                      {m.change && <p style={{ fontSize: '12px', color: colors.accent, margin: '4px 0' }}>{m.change}</p>}
                      <p style={{ fontSize: '11px', color: '#94A3B8', margin: '4px 0 0 0' }}>{m.label}</p>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '10px', color: '#64748B', textAlign: 'center', marginTop: '16px' }}>
                  As of {newsletterData.metricsDashboard.asOfDate}
                </p>
              </div>
            </PreviewCard>

            {/* 3. Lead Story */}
            <PreviewCard sectionLabel={newsletterData.leadStory.sectionLabel}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: colors.text, marginBottom: '16px' }}>
                {newsletterData.leadStory.headline}
              </h2>
              <ImagePlaceholder credit={newsletterData.leadStory.image.credit} />
              <div style={{ fontSize: '16px', lineHeight: '1.7', color: '#374151' }}>
                {newsletterData.leadStory.content.split('\n\n').map((p, i) => (
                  <p key={i} style={{ marginBottom: '16px' }}>{renderContentWithLinks(p)}</p>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: colors.muted, marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}>
                Sources: {newsletterData.leadStory.sources.map((s, i) => (
                  <span key={i}>
                    <a href={s.url} style={{ color: colors.primary, borderBottom: `2px solid ${colors.link}` }}>{s.title}</a>
                    {i < newsletterData.leadStory.sources.length - 1 ? ' | ' : ''}
                  </span>
                ))}
              </p>
            </PreviewCard>

            {/* 4. Research Roundup */}
            <PreviewCard sectionLabel={newsletterData.yourOptionsThisWeek.sectionLabel}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: colors.text, marginBottom: '8px' }}>
                {newsletterData.yourOptionsThisWeek.title}
              </h2>
              <h3 style={{ fontSize: '18px', color: '#4B5563', marginBottom: '16px' }}>
                {newsletterData.yourOptionsThisWeek.subtitle}
              </h3>
              <ImagePlaceholder credit={newsletterData.yourOptionsThisWeek.image.credit} />
              <div style={{ fontSize: '16px', lineHeight: '1.7', color: '#374151' }}>
                {newsletterData.yourOptionsThisWeek.content.split('\n\n').map((p, i) => (
                  <p key={i} style={{ marginBottom: '16px' }}>{renderContentWithLinks(p)}</p>
                ))}
              </div>
            </PreviewCard>

            {/* 5. Sponsor 1 */}
            <PreviewCard>
              <div style={{ background: colors.accent, border: `2px dashed ${colors.primary}`, borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                <p style={{ color: colors.primary, fontWeight: '600' }}>📢 SPONSOR PLACEHOLDER</p>
              </div>
            </PreviewCard>

            {/* 6. On Our Radar */}
            <PreviewCard sectionLabel={newsletterData.secondaryStories.sectionLabel}>
              <ImagePlaceholder credit={newsletterData.secondaryStories.image.credit} />
              {newsletterData.secondaryStories.stories.map(story => (
                <div key={story.id} style={{ borderLeft: `3px solid ${colors.primary}`, paddingLeft: '16px', marginBottom: '20px' }}>
                  <p style={{ fontSize: '16px', color: '#374151' }}>
                    <strong>{story.boldLead}</strong> {renderContentWithLinks(story.content)}
                  </p>
                  {story.sources && story.sources[0] && (
                    <p style={{ fontSize: '12px', color: colors.muted, marginTop: '8px' }}>
                      Source: <a href={story.sources[0].url} style={{ color: colors.primary, borderBottom: `2px solid ${colors.link}` }}>{story.sources[0].title}</a>, {story.sources[0].date}
                    </p>
                  )}
                </div>
              ))}
            </PreviewCard>

            {/* 7. Deep Dive */}
            <PreviewCard sectionLabel={newsletterData.industryDeepDive.sectionLabel}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: colors.text, marginBottom: '16px' }}>
                {newsletterData.industryDeepDive.headline}
              </h2>
              <ImagePlaceholder credit={newsletterData.industryDeepDive.image.credit} />
              <div style={{ fontSize: '16px', lineHeight: '1.7', color: '#374151' }}>
                {newsletterData.industryDeepDive.content.split('\n\n').map((p, i) => (
                  <p key={i} style={{ marginBottom: '16px' }}>{renderContentWithLinks(p)}</p>
                ))}
              </div>
            </PreviewCard>

            {/* 8. Sponsor 2 */}
            <PreviewCard>
              <div style={{ background: colors.accent, borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                <p style={{ color: colors.primary, fontWeight: '600' }}>TOGETHER WITH {newsletterData.quickCalendar.sponsorName}</p>
              </div>
            </PreviewCard>

            {/* 9. Worth Knowing */}
            <PreviewCard sectionLabel={newsletterData.worthKnowing.sectionLabel}>
              <h3 style={{ fontSize: '18px', color: colors.text, marginBottom: '16px' }}>{newsletterData.worthKnowing.title}</h3>
              {newsletterData.worthKnowing.items.map((item, i) => (
                <div key={i} style={{ background: '#F9FAFB', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                  <p style={{ fontWeight: '600', color: colors.text, margin: '0 0 8px 0' }}>
                    {item.title} 
                    {item.date && <span style={{ fontSize: '12px', background: colors.accent, color: colors.primary, padding: '2px 8px', borderRadius: '4px', marginLeft: '8px' }}>{item.date}</span>}
                  </p>
                  <p style={{ fontSize: '14px', color: '#4B5563', margin: 0 }}>{item.description}</p>
                </div>
              ))}
            </PreviewCard>

            {/* 10. Stat of the Week */}
            <PreviewCard sectionLabel={newsletterData.statSection.sectionLabel}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '48px', fontWeight: '800', color: colors.primary, margin: '16px 0' }}>
                  {newsletterData.statSection.primeNumber}
                </p>
                <p style={{ fontSize: '18px', color: '#4B5563', marginBottom: '16px' }}>
                  {newsletterData.statSection.headline}
                </p>
              </div>
              <ImagePlaceholder credit={newsletterData.statSection.image.credit} />
              <div style={{ fontSize: '16px', lineHeight: '1.7', color: '#374151' }}>
                {newsletterData.statSection.content.split('\n\n').map((p, i) => (
                  <p key={i} style={{ marginBottom: '16px' }}>{renderContentWithLinks(p)}</p>
                ))}
              </div>
            </PreviewCard>

            {/* 11. The Pulse */}
            <PreviewCard sectionLabel={newsletterData.thePulse.sectionLabel}>
              <h3 style={{ fontSize: '18px', color: colors.text, marginBottom: '16px' }}>{newsletterData.thePulse.title}</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {newsletterData.thePulse.items.map((item, i) => (
                  <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid #F3F4F6', fontSize: '14px', color: '#374151' }}>
                    • {renderContentWithLinks(item.text)} <span style={{ fontSize: '12px', color: colors.muted }}>[{item.source}, {item.date}]</span>
                  </li>
                ))}
              </ul>
            </PreviewCard>

            {/* 12. RECS */}
            <PreviewCard sectionLabel={newsletterData.recommendations.sectionLabel}>
              <p style={{ margin: '8px 0' }}>
                <strong>Read:</strong> {newsletterData.recommendations.read.prefix}
                <a href={newsletterData.recommendations.read.url} style={{ color: colors.text, borderBottom: `2px solid ${colors.link}` }}>{newsletterData.recommendations.read.linkText}</a>
                {newsletterData.recommendations.read.suffix}**
              </p>
              <p style={{ margin: '8px 0' }}>
                <strong>Watch:</strong> {newsletterData.recommendations.watch.prefix}
                <a href={newsletterData.recommendations.watch.url} style={{ color: colors.text, borderBottom: `2px solid ${colors.link}` }}>{newsletterData.recommendations.watch.linkText}</a>
                {newsletterData.recommendations.watch.suffix}
              </p>
              <p style={{ margin: '8px 0' }}>
                <strong>Try:</strong> {newsletterData.recommendations.try.prefix}
                <a href={newsletterData.recommendations.try.url} style={{ color: colors.text, borderBottom: `2px solid ${colors.link}` }}>{newsletterData.recommendations.try.linkText}</a>
                {newsletterData.recommendations.try.suffix}
              </p>
              <p style={{ margin: '8px 0' }}>
                <strong>Listen:</strong> {newsletterData.recommendations.listen.prefix}
                <a href={newsletterData.recommendations.listen.url} style={{ color: colors.text, borderBottom: `2px solid ${colors.link}` }}>{newsletterData.recommendations.listen.linkText}</a>
                {newsletterData.recommendations.listen.suffix}
              </p>
              <p style={{ fontSize: '12px', color: colors.muted, marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}>
                {newsletterData.recommendations.sponsorMessage}<br/>
                {newsletterData.recommendations.affiliateDisclosure}
              </p>
            </PreviewCard>

            {/* 13. PLAY */}
            <PreviewCard sectionLabel={newsletterData.interactiveElement.sectionLabel}>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: colors.text, marginBottom: '8px' }}>{currentGame.title}</h3>
              <p style={{ color: '#4B5563', marginBottom: '16px' }}>{currentGame.intro}</p>
              <div style={{ background: '#F9FAFB', borderRadius: '8px', padding: '16px', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {currentGame.content}
              </div>
            </PreviewCard>

            {/* 14. Referral */}
            <PreviewCard sectionLabel={newsletterData.referralProgram.sectionLabel}>
              <div style={{ textAlign: 'center', background: `linear-gradient(135deg, ${colors.accent} 0%, #F0F9FF 100%)`, borderRadius: '8px', padding: '24px' }}>
                <p style={{ fontSize: '18px', color: colors.text, marginBottom: '8px' }}>{newsletterData.referralProgram.headline}</p>
                <p style={{ fontSize: '14px', color: colors.muted, marginBottom: '16px' }}>{newsletterData.referralProgram.subtext}</p>
                <p style={{ marginBottom: '16px' }}>Your referral count: <strong style={{ color: colors.primary }}>{newsletterData.referralProgram.referralCountTag}</strong></p>
                <button style={{ padding: '12px 32px', background: colors.primary, color: 'white', borderRadius: '8px', border: 'none', fontWeight: '600', cursor: 'pointer' }}>Share Now</button>
              </div>
            </PreviewCard>

            {/* 15. Footer */}
            <PreviewCard>
              <div style={{ background: '#F9FAFB', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <p style={{ fontWeight: '600', color: colors.text, margin: '0 0 8px 0' }}>ANSWER</p>
                <p style={{ fontSize: '14px', color: '#4B5563', margin: 0 }}>{currentGame.answer}</p>
              </div>
              <div style={{ background: '#F9FAFB', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <p style={{ fontWeight: '600', color: colors.text, margin: '0 0 8px 0' }}>Word of the Day</p>
                <p style={{ fontSize: '14px', color: '#4B5563', margin: 0 }}>
                  <strong>{newsletterData.signOff.wordOfTheDay.word}</strong>: {newsletterData.signOff.wordOfTheDay.definition}
                </p>
              </div>
              <div style={{ textAlign: 'center', paddingTop: '16px', borderTop: `1px solid ${colors.border}` }}>
                <p style={{ fontSize: '14px', color: colors.muted }}>Written by {newsletterData.signOff.writtenBy}</p>
                <p style={{ fontSize: '12px', color: colors.muted, marginTop: '16px' }}>{newsletterData.signOff.copyright}</p>
              </div>
            </PreviewCard>

          </div>
        )}

        {activeTab === 'export' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-xl shadow-lg border p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Export Newsletter</h2>
              <p className="text-gray-500 mb-6">Copy content for Beehiiv</p>
              
              <button
                onClick={() => copyToClipboard(generateFullHTML())}
                className="w-full py-4 text-white rounded-xl font-bold text-lg shadow-lg"
                style={{ backgroundColor: colors.primary }}
              >
                📋 Copy Full Newsletter HTML
              </button>
              
              <div className="grid grid-cols-2 gap-3 mt-6">
                {[
                  { label: 'Lead Story', sectionKey: 'section3' },
                  { label: 'Research Roundup', sectionKey: 'section4' },
                  { label: 'Secondary Stories', sectionKey: 'section6' },
                  { label: 'Deep Dive', sectionKey: 'section7' },
                  { label: 'Stat', sectionKey: 'section10' },
                  { label: 'The Pulse', sectionKey: 'section11' }
                ].map(({ label, sectionKey }) => (
                  <button
                    key={label}
                    onClick={() => copyToClipboard(stripLinkSyntax(getSectionContent(sectionKey)))}
                    className="py-3 rounded-lg font-medium text-sm hover:opacity-80"
                    style={{ backgroundColor: colors.accent, color: colors.primary }}
                  >
                    Copy {label}
                  </button>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: colors.accent }}>
                <p className="font-medium mb-2" style={{ color: colors.primary }}>📷 Image Slots Summary</p>
                <ul className="text-sm space-y-1" style={{ color: colors.secondary }}>
                  <li>• Lead Story: 1 hero image</li>
                  <li>• Research Roundup: 1 image</li>
                  <li>• On Our Radar: 1 image</li>
                  <li>• Deep Dive: 1 image</li>
                  <li>• Stat of the Week: 1 image</li>
                  <li>• Games (optional): 1 graphic</li>
                  <li><strong>Total: 6-7 images</strong></li>
                </ul>
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-800 mb-2">🔗 Link Syntax</p>
                <p className="text-sm text-gray-600 mb-2">Use this syntax in content to create embedded links:</p>
                <code className="block p-2 bg-gray-100 rounded text-sm" style={{ color: colors.primary }}>
                  {`{{LINK:display text|https://example.com}}`}
                </code>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'html' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl shadow-lg border p-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Beehiiv HTML Export</h2>
                  <p className="text-gray-500">Paste this into Beehiiv's HTML editor</p>
                </div>
                <button
                  onClick={() => copyToClipboard(generateFullHTML())}
                  className="px-6 py-3 text-white rounded-lg font-bold"
                  style={{ backgroundColor: colors.primary }}
                >
                  📋 Copy HTML
                </button>
              </div>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-96 text-xs font-mono">
                {generateFullHTML()}
              </pre>
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl shadow-lg border p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Newsletter History</h2>
                  <p className="text-gray-500">Previous newsletters are saved when you click "Create Newsletter"</p>
                </div>
                {newsletterHistory.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm('Clear all newsletter history?')) {
                        setNewsletterHistory([]);
                      }
                    }}
                    className="px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 font-medium text-sm"
                  >
                    🗑️ Clear History
                  </button>
                )}
              </div>

              {newsletterHistory.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-6xl mb-4">📚</p>
                  <p className="text-gray-500 text-lg">No newsletter history yet</p>
                  <p className="text-gray-400 mt-2">When you click "Create Newsletter", your current newsletter will be saved here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {newsletterHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="border rounded-lg p-4 hover:border-purple-300 transition-colors"
                      style={{ borderColor: colors.border }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800 mb-1">
                            {entry.subjectLine || 'Untitled Newsletter'}
                          </p>
                          <p className="text-sm text-gray-500">
                            Saved: {entry.date}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => {
                              if (confirm('Restore this newsletter? Your current work will be replaced.')) {
                                setNewsletterData(entry.newsletterData);
                                if (entry.currentGame) {
                                  setCurrentGame(entry.currentGame);
                                }
                                setActiveTab('dashboard');
                                setAiStatus(`✓ Restored newsletter from ${entry.date}`);
                              }
                            }}
                            className="px-4 py-2 text-white rounded-lg font-medium text-sm"
                            style={{ backgroundColor: colors.primary }}
                          >
                            ↩️ Restore
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this newsletter from history?')) {
                                setNewsletterHistory(prev => prev.filter(h => h.id !== entry.id));
                              }
                            }}
                            className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer - Updated with purple gradient */}
      <footer className="text-white py-6 mt-12" style={{ background: `linear-gradient(135deg, ${colors.dark} 0%, #0F172A 100%)` }}>
        <div className="max-w-6xl mx-auto px-6 text-center text-sm">
          <p className="font-medium">Renewal Weekly Newsletter Compiler v5.2</p>
          <p className="mt-1" style={{ color: colors.accent }}>17 sections • TL;DR + Question of the Week • 3×2 metrics • In-text hyperlinks • Purple brand</p>
        </div>
      </footer>
    </div>
  );
};

// Wrap the main component with ErrorBoundary
const App = () => (
  <ErrorBoundary>
    <RenewalWeeklyCompiler />
  </ErrorBoundary>
);

export default App;
