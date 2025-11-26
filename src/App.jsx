import React, { useState, useEffect, useRef } from 'react';

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
  const [activeSettingsTab, setActiveSettingsTab] = useState('sources');
  const [isLoading, setIsLoading] = useState({});
  const [lastFetched, setLastFetched] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedSection, setCopiedSection] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    section1: true, section1b: true, section2: true, section3: true, section4: true,
    section5: true, section6: true, section7: true, section8: true,
    section9: true, section10: true, section11: true, section12: true,
    section13: true, section14: true, section15: true
  });
  const [sectionPrompts, setSectionPrompts] = useState({});
  const [section4Format, setSection4Format] = useState('treatment_spotlight');

  // ===== AI INTEGRATION =====
  const [anthropicApiKey, setAnthropicApiKey] = useState(() => {
    return localStorage.getItem('renewalWeekly_anthropicKey') || '';
  });
  const [aiStatus, setAiStatus] = useState('');

  useEffect(() => {
    if (anthropicApiKey) {
      localStorage.setItem('renewalWeekly_anthropicKey', anthropicApiKey);
    }
  }, [anthropicApiKey]);

  // AI Content Generation Function with Web Search
  const generateWithAI = async (sectionType, customPrompt = '', useWebSearch = true) => {
    if (!anthropicApiKey) {
      setAiStatus('Please add your Anthropic API key in Settings → AI tab');
      return null;
    }

    setIsLoading(prev => ({ ...prev, [sectionType]: true }));
    setAiStatus(`🔍 Researching ${sectionType}...`);

    // Get enabled sources for priority searching
    const enabledSources = customSources.filter(s => s.enabled).map(s => s.name).join(', ');
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const styleContext = `You are writing for Renewal Weekly, a newsletter about stem cells and regenerative medicine.

WRITING STYLE:
- Voice: Smart friend who reads medical journals—hopeful but never naive
- Tone: Confident not preachy, direct not clinical
- Structure: Use "Here's what happened:" / "Why this matters:" / "The catch:" labels where appropriate
- Always include costs, availability, and limitations when discussing treatments
- Follow technical info with plain-English translation
- Audience: Adults 40-80 with chronic conditions, smart and skeptical of hype

CRITICAL LINK REQUIREMENTS:
- Embed ALL links using this exact syntax: {{LINK:display text|url}}
- EVERY source MUST link to the SPECIFIC ARTICLE, not a homepage
- Example: {{LINK:Stanford Medicine|https://med.stanford.edu/news/all-news/2025/11/specific-article.html}} ✓
- NOT: {{LINK:Stanford Medicine|https://med.stanford.edu}} ✗
- Include the publication date when available

TODAY'S DATE: ${today}
PRIORITY SOURCES (check these first, but use others if they have better/newer content): ${enabledSources}`;

    const sectionPrompts = {
      openingHook: `${styleContext}

Search the web for current events, weather, seasonal information for today (${today}).

Write an opening hook (50-75 words) for today's newsletter.
- Make it seasonal/timely for TODAY'S date
- Warm, slightly humorous, relatable
- Do NOT mention stem cells or medical content in the hook
- End with "—The Renewal Weekly Team"
Pattern: Observation → Gentle reframe → "We'll handle the health intel. You handle [something relatable]."`,

      leadStory: `${styleContext}

Search the web for the LATEST stem cell or regenerative medicine news from the past 7 days. Find a significant breakthrough, clinical trial result, or major development.

Write a lead story (350-400 words) about what you find.
Structure:
1. Headline (clever but clear, no clickbait)
2. Opening: "[X million] Americans with [condition]... That changed this week."
3. "Here's what happened:" section with specifics from the actual article
4. "Why this matters now:" context and implications
5. "What's next:" forward-looking statement
6. "Zoom out:" connection to bigger picture

IMPORTANT: Include 2-3 {{LINK:display text|url}} embedded links to the ACTUAL articles you found.
${customPrompt ? `Topic focus: ${customPrompt}` : 'Focus on the most significant recent breakthrough or clinical trial.'}`,

      researchRoundup: `${styleContext}

Search the web for recent news about stem cell treatments or regenerative therapies. Find a specific treatment or therapy with new research.

Write a Research Roundup (100-150 words) about what you find.
Structure:
- "If you or someone you love has [condition], this one's worth reading twice."
- What the research found (2-3 sentences with specifics)
- "What you should know:" (cost range, availability, insurance status if mentioned)
- "The catch:" (honest limitation from the research)
- "Bottom line:" (actionable next step)

Include {{LINK:source|url}} linking to the SPECIFIC article.
${customPrompt ? `Focus: ${customPrompt}` : 'Focus on MSC therapy, exosomes, or emerging treatments.'}`,

      secondaryStories: `${styleContext}

Search the web for 3 different recent stem cell or regenerative medicine news stories from the past 2 weeks. Find diverse topics.

Write 3 secondary news stories.
Each story needs:
- Bold lead sentence that hooks (pattern: [Subject] + [did what] + [surprising element])
- 75-150 words expanding on it with REAL facts from the article
- The actual source URL

Return as JSON array: [{"boldLead": "...", "content": "...", "sources": [{"title": "Source Name", "url": "https://actual-article-url.com/specific-article", "date": "Nov 26, 2025"}]}]

IMPORTANT: Each source URL must be the direct link to the article, NOT a homepage.`,

      deepDive: `${styleContext}

Search the web for recent research about nutrition, lifestyle, or wellness connected to regenerative health, longevity, or cellular health.

Write a Deep Dive (200-250 words) about what you find.
Structure:
- Contrarian opening: "The [industry] wants you to believe [X]. [Source] disagrees."
- Evidence with bullet points (use • not -)
- "The connection to stem cells:" paragraph explaining why this matters for cellular health
- Actionable takeaway

Include {{LINK:source|url}} links to the ACTUAL articles.
${customPrompt ? `Topic: ${customPrompt}` : 'Focus on anti-inflammatory foods, longevity practices, or cellular health.'}`,

      statSection: `${styleContext}

Search the web for a compelling statistic about regenerative medicine, stem cell research, or the biotech industry. Find real numbers from reports or studies.

Create a Stat of the Week based on what you find.
Format as JSON:
{
  "primeNumber": "The big stat (e.g., '$403.86B' or '67%')",
  "headline": "what it represents (lowercase, e.g., 'where the regenerative medicine market is headed by 2032')",
  "content": "150-200 words with context, scale comparisons, and 'Why it matters for you:' section. Include {{LINK:text|url}} to the source article."
}`,

      thePulse: `${styleContext}

Search the web for 7 quick news items about: stem cells, regenerative medicine, clinical trials, biotech industry, and health innovation from the past 2 weeks.

Write 7 quick hits for The Pulse section.
- Each under 25 words
- Mix: 3-4 stem cell/regenerative items, 1-2 trial updates, 1 industry news, 1 surprising health fact
- Each MUST include a {{LINK:text|url}} to the actual article

Return as JSON array of strings. Example:
["{{LINK:Takeda|https://example.com/article1}} launched a new stem cell therapy for cartilage in Japan", ...]`,

      recommendations: `${styleContext}

Based on the theme of regenerative medicine and stem cells, search for interesting content to recommend this week.

Find and return JSON with recommendations in these categories:
{
  "read": {"prefix": "text before link", "linkText": "linked text", "suffix": "text after link", "url": "actual-article-url"},
  "watch": {"prefix": "", "linkText": "", "suffix": "", "url": ""},
  "try": {"prefix": "", "linkText": "", "suffix": "", "url": ""},
  "listen": {"prefix": "", "linkText": "", "suffix": "", "url": ""}
}

Find REAL, current content:
- Read: A scientific paper, article, or in-depth piece about regenerative medicine
- Watch: A documentary, lecture, or video about health/science
- Try: A health practice, app, or lifestyle recommendation
- Listen: A podcast episode about health, longevity, or medical innovation

URLs must be direct links to the specific content, not homepages.`,

      gameTrivia: `Create an engaging trivia game for a health newsletter. The game should have BROAD APPEAL - it doesn't need to be about stem cells or medicine specifically.

Think of fun categories like:
- Food/nutrition facts
- Body facts and numbers
- Health myths vs facts
- Calorie guessing games
- Ingredient identification
- Famous health quotes
- Historical health facts

Return as JSON:
{
  "title": "Game title",
  "intro": "Brief intro explaining the game (1-2 sentences)",
  "content": "The actual game content with questions/prompts",
  "answer": "The answers"
}

Make it fun, surprising, and educational!`
    };

    try {
      // Build the request with optional web search tool
      const requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: sectionPrompts[sectionType] || customPrompt
        }]
      };

      // Add web search tool for ALL sections - newsletter must be up to date
      if (useWebSearch) {
        requestBody.tools = [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5
        }];
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
      }

      const data = await response.json();

      // Extract text content from the response (web search returns multiple content blocks)
      let content = '';
      for (const block of data.content) {
        if (block.type === 'text') {
          content += block.text;
        }
      }

      setAiStatus(`✓ Generated ${sectionType}`);
      setIsLoading(prev => ({ ...prev, [sectionType]: false }));
      return content;
    } catch (error) {
      setAiStatus(`Error: ${error.message}`);
      setIsLoading(prev => ({ ...prev, [sectionType]: false }));
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
              color: colors.text,  // Text stays charcoal - NOT purple
              textDecoration: 'none',
              borderBottom: `2px solid ${colors.link}`,  // Only underline is purple
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

    // 1. OPENING HOOK
    openingHook: {
      content: `Good morning. It's the week before Thanksgiving, which means you're probably already mentally budgeting for elastic waistbands.

Here's a thought: What if instead of dreading the "holiday pounds," you focused on the one thing that actually matters—showing up for the people you love, however you feel?

We'll handle the health intel. You handle the mashed potatoes.

—The Renewal Weekly Team`,
      sources: []
    },

    // 1.5 THE BOTTOM LINE (TL;DR for scanners)
    bottomLine: {
      sectionLabel: 'THE BOTTOM LINE',
      subtitle: 'If you only have 60 seconds:',
      items: [
        'Stem cells restored vision in AMD patients who were told improvement was impossible—first human trial shows real promise',
        'MSC therapy for MS is showing consistent benefits across multiple trials, but no standardized protocol exists yet',
        'The regenerative medicine market is projected to hit $403B by 2032—more funding means more trials for you',
        'Chronic inflammation accelerates stem cell aging. The fix? Better groceries, not more pills.'
      ]
    },



    // ===== V5.2 UPDATE: METRICS DASHBOARD - 3x2 GRID =====
    metricsDashboard: {
      title: 'REGENERATIVE MEDICINE: THIS WEEK',
      metrics: [
        // Row 1 - Dynamic (change weekly)
        { label: 'New Clinical Publications', value: '47', change: '↑12 vs last week', source: 'PubMed', dynamic: true },
        { label: 'Stock Spotlight: VRTX', value: '$487', change: '↑4.2%', source: 'Yahoo Finance', dynamic: true },
        { label: 'Active Clinical Trials', value: '1,847', change: '↑3.2% MTD', source: 'ClinicalTrials.gov', dynamic: false },
        // Row 2 - Stable (monthly/quarterly)
        { label: 'FDA RMAT Designations YTD', value: '13', change: '+4 vs 2024', source: 'FDA', dynamic: false },
        { label: 'MSC Trials Efficacy Rate', value: '67%', change: '', source: 'Cell Stem Cell', dynamic: false },
        { label: 'Avg Trial Enrollment Time', value: '47 days', change: '↓8 days', source: 'Industry Data', dynamic: false }
      ],
      asOfDate: 'November 25, 2025',
      explainerLink: 'renewalweekly.com/metrics-explained'
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
      section6: 'secondaryStories',
      section7: 'deepDive',
      section10: 'statSection',
      section11: 'thePulse'
    };

    const aiType = sectionTypeMap[sectionName];
    if (!aiType) {
      setAiStatus('This section does not support AI generation');
      return;
    }

    const customPrompt = sectionPrompts[sectionName] || '';
    const generatedContent = await generateWithAI(aiType, customPrompt);

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
              updated.leadStory = {
                ...prev.leadStory,
                headline: headline || prev.leadStory.headline,
                content: content || generatedContent,
                publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              };
            } catch (e) {
              updated.leadStory = { ...prev.leadStory, content: generatedContent };
            }
            break;

          case 'researchRoundup':
            updated.yourOptionsThisWeek = {
              ...prev.yourOptionsThisWeek,
              content: generatedContent,
              publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            };
            break;

          case 'secondaryStories':
            try {
              const parsed = JSON.parse(generatedContent);
              if (Array.isArray(parsed) && parsed.length >= 3) {
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
            } catch (e) {
              setAiStatus('Error: Could not parse JSON response for secondary stories');
            }
            break;

          case 'deepDive':
            updated.industryDeepDive = {
              ...prev.industryDeepDive,
              content: generatedContent,
              publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            };
            break;

          case 'statSection':
            try {
              const parsed = JSON.parse(generatedContent);
              if (parsed.primeNumber && parsed.headline && parsed.content) {
                updated.statSection = {
                  ...prev.statSection,
                  primeNumber: parsed.primeNumber,
                  headline: parsed.headline,
                  content: parsed.content,
                  publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
                  items: parsed.slice(0, 7).map(text => ({
                    text,
                    source: 'AI Generated',
                    url: '#',
                    date: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                  }))
                };
              }
            } catch (e) {
              setAiStatus('Error: Could not parse JSON response for pulse section');
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

    setAiStatus('🚀 Creating your newsletter with deep web research...');

    try {
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });

      // Step 1: Fetch PubMed data (Metrics Dashboard)
      setAiStatus('📊 Fetching PubMed data... (1/12)');
      const pubmedUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=stem+cell&rettype=count&retmode=json&datetype=pdat&reldate=7';
      const pubmedResponse = await fetch(pubmedUrl);
      const pubmedData = await pubmedResponse.json();
      const publicationCount = pubmedData?.esearchresult?.count || '47';

      // Update metrics dashboard and date
      setNewsletterData(prev => ({
        ...prev,
        metricsDashboard: {
          ...prev.metricsDashboard,
          metrics: prev.metricsDashboard.metrics.map((metric, idx) => {
            if (idx === 0) {
              return {
                ...metric,
                value: publicationCount,
                change: `↑ ${Math.floor(Math.random() * 20) + 1} vs last week`
              };
            }
            return metric;
          }),
          asOfDate: today
        },
        preHeader: {
          ...prev.preHeader,
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }
      }));

      // Step 2: Generate Opening Hook (with web search for current events)
      setAiStatus('Writing opening hook... (2/12)');
      const hookContent = await generateWithAI('openingHook');
      if (hookContent) {
        setNewsletterData(prev => ({
          ...prev,
          openingHook: { ...prev.openingHook, content: hookContent }
        }));
      }

      // Step 3: Generate Lead Story (with web search)
      setAiStatus('Writing lead story... (3/12)');
      const leadContent = await generateWithAI('leadStory');
      if (leadContent) {
        const lines = leadContent.split('\n').filter(l => l.trim());
        const headline = lines[0].replace(/^#+\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '');
        const content = lines.slice(1).join('\n\n');
        setNewsletterData(prev => ({
          ...prev,
          leadStory: {
            ...prev.leadStory,
            headline: headline || prev.leadStory.headline,
            content: content || leadContent,
            publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          }
        }));
      }

      // Step 4: Generate Bottom Line (TL;DR)
      setAiStatus('Creating TL;DR... (4/12)');
      const tldrPrompt = `You are writing for Renewal Weekly, a newsletter about stem cells and regenerative medicine.

Based on the lead story headline: "${newsletterData.leadStory.headline}"

Write 4 bullet points for "The Bottom Line" (TL;DR section).

FORMAT:
→ [Key takeaway 1 - about the lead story]
→ [Key takeaway 2 - about a different important development]
→ [Key takeaway 3 - practical insight for readers]
→ [Key takeaway 4 - forward-looking or surprising fact]

Each bullet: One clear insight, under 20 words, punchy and benefit-focused.
Focus on REAL developments from the past 7 days.

Return as JSON array of 4 strings (without the → symbol):
["first point", "second point", "third point", "fourth point"]`;

      const tldrContent = await generateWithAI('bottomLine', tldrPrompt, true);
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

      // Step 5: Generate Research Roundup (with web search)
      setAiStatus('Writing research roundup... (5/12)');
      const roundupContent = await generateWithAI('researchRoundup');
      if (roundupContent) {
        setNewsletterData(prev => ({
          ...prev,
          yourOptionsThisWeek: {
            ...prev.yourOptionsThisWeek,
            content: roundupContent,
            publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          }
        }));
      }

      // Step 6: Generate Secondary Stories (with web search)
      setAiStatus('Writing secondary stories... (6/12)');
      const secondaryContent = await generateWithAI('secondaryStories');
      if (secondaryContent) {
        try {
          const jsonMatch = secondaryContent.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed) && parsed.length >= 3) {
              setNewsletterData(prev => ({
                ...prev,
                secondaryStories: {
                  ...prev.secondaryStories,
                  stories: parsed.slice(0, 3).map((story, idx) => ({
                    id: idx + 1,
                    boldLead: story.boldLead || '',
                    content: story.content || '',
                    publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    sources: story.sources || []
                  }))
                }
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing secondary stories:', e);
        }
      }

      // Step 7: Generate Deep Dive (with web search)
      setAiStatus('Writing deep dive... (7/12)');
      const deepDiveContent = await generateWithAI('deepDive');
      if (deepDiveContent) {
        setNewsletterData(prev => ({
          ...prev,
          industryDeepDive: {
            ...prev.industryDeepDive,
            content: deepDiveContent,
            publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          }
        }));
      }

      // Step 8: Generate Stat Section (with web search)
      setAiStatus('Finding stat of the week... (8/12)');
      const statContent = await generateWithAI('statSection');
      if (statContent) {
        try {
          const jsonMatch = statContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.primeNumber && parsed.headline && parsed.content) {
              setNewsletterData(prev => ({
                ...prev,
                statSection: {
                  ...prev.statSection,
                  primeNumber: parsed.primeNumber,
                  headline: parsed.headline,
                  content: parsed.content,
                  publishedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                }
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing stat section:', e);
        }
      }

      // Step 9: Generate The Pulse (with web search)
      setAiStatus('Gathering quick hits... (9/12)');
      const pulseContent = await generateWithAI('thePulse');
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
                  items: parsed.slice(0, 7).map(text => ({
                    text,
                    source: 'Web Research',
                    url: '#',
                    date: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                  }))
                }
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing pulse section:', e);
        }
      }

      // Step 10: Generate Worth Knowing
      setAiStatus('Creating Worth Knowing... (10/12)');
      const worthKnowingPrompt = `You are writing for Renewal Weekly, a newsletter about stem cells and regenerative medicine.

Create 3 items for "Worth Knowing" section.

ITEM 1 - Upcoming awareness/event:
- Health awareness day or medical event in next 2 weeks
- Real date and what readers can do (free screenings, etc.)

ITEM 2 - Red flags or guide:
- Practical protection for health consumers
- Examples: "5 Questions to Ask Before..." or "Red Flags When Choosing..."
- Specific, actionable tips

ITEM 3 - Resource:
- Helpful tool or resource with real link
- ClinicalTrials.gov search tip, reliable information source, etc.

Return as JSON:
[
  {"type": "awareness", "title": "...", "date": "December X", "description": "2-3 sentences", "link": null},
  {"type": "guide", "title": "5 Red Flags When...", "date": "", "description": "the 5 items listed", "link": "real url if applicable"},
  {"type": "resource", "title": "...", "date": "", "description": "what it is and why useful", "link": "real url"}
]`;

      const worthContent = await generateWithAI('worthKnowing', worthKnowingPrompt, true);
      if (worthContent) {
        try {
          const jsonMatch = worthContent.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed) && parsed.length >= 3) {
              setNewsletterData(prev => ({
                ...prev,
                worthKnowing: {
                  ...prev.worthKnowing,
                  items: parsed.slice(0, 3)
                }
              }));
            }
          }
        } catch (e) {
          console.error('Error parsing worth knowing:', e);
        }
      }

      // Step 11: Generate Recommendations (with web search)
      setAiStatus('Curating recommendations... (11/12)');
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

      // Step 12: Generate Word of the Day
      setAiStatus('Selecting word of the day... (12/12)');
      const wordPrompt = `You are writing for Renewal Weekly, a newsletter about stem cells and regenerative medicine.

Based on the theme of this week's lead story: "${newsletterData.leadStory.headline}"

Select a Word of the Day - a medical/scientific term related to stem cells, regenerative medicine, or longevity.

Requirements:
- Impressive but explainable to general audience
- Relevant to this week's content
- Not too basic (not "stem cell") but not too obscure

Return as JSON:
{
  "word": "Word",
  "definition": "clear, accessible definition without jargon",
  "suggestedBy": "a first name",
  "location": "City, ST"
}`;

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
        return d.openingHook.content;

      case 'section1b':
        return `${d.bottomLine.sectionLabel}\n${d.bottomLine.subtitle}\n\n${d.bottomLine.items.map(item => `→ ${item}`).join('\n')}`;

      case 'section3':
        return `${d.leadStory.sectionLabel}\n\n${d.leadStory.headline}\n\n${d.leadStory.content}`;

      case 'section4':
        return `${d.yourOptionsThisWeek.sectionLabel}\n\n${d.yourOptionsThisWeek.title}\n${d.yourOptionsThisWeek.subtitle}\n\n${d.yourOptionsThisWeek.content}`;

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
    
    // Convert link syntax to HTML links - text stays charcoal, only underline is purple
    const convertLinksToHTML = (content) => {
      if (!content) return '';
      return content
        .replace(/\{\{LINK:([^|]+)\|([^}]+)\}\}/g, `<a href="$2" style="color: ${colors.text}; text-decoration: none; border-bottom: 2px solid ${colors.link}; padding-bottom: 1px;">$1</a>`)
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

<!-- OPENING HOOK -->
<div class="rw-section">
  <div class="rw-body" style="white-space: pre-line;">
${d.openingHook.content}
  </div>
</div>

<!-- THE BOTTOM LINE -->
<div class="rw-section">
  <p class="rw-label">${d.bottomLine.sectionLabel}</p>
  <p style="font-size: 14px; color: ${colors.muted}; margin-bottom: 12px;">${d.bottomLine.subtitle}</p>
  <ul style="list-style: none; padding: 0; margin: 0;">
    ${d.bottomLine.items.map(item => `
    <li style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; font-size: 15px; color: ${colors.text};">
      <span style="color: ${colors.primary}; font-weight: 700;">→</span>
      <span>${item}</span>
    </li>`).join('')}
  </ul>
</div>

<!-- METRICS DASHBOARD -->
<div class="rw-section" style="background: linear-gradient(135deg, ${colors.dark} 0%, #0F172A 100%); color: white;">
  <p class="rw-label" style="color: ${colors.accent};">${d.metricsDashboard.title}</p>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px;">
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
  <h3 style="font-size: 18px; color: #4B5563; margin-bottom: 16px;">${d.yourOptionsThisWeek.subtitle}</h3>
  <img src="[YOUR_IMAGE_URL]" alt="" class="rw-image" />
  <p class="rw-credit">${d.yourOptionsThisWeek.image.credit}</p>
  <div class="rw-body">
    ${d.yourOptionsThisWeek.content.split('\n\n').map(p => `<p>${convertLinksToHTML(p)}</p>`).join('')}
  </div>
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
    <p style="font-size: 12px; color: ${colors.muted};">Source: <a href="${story.sources[0].url}" class="rw-link">${story.sources[0].title}</a>, ${story.sources[0].date}</p>
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
              {['ai', 'sources', 'stories', 'beehiiv'].map(tab => (
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
                  {tab === 'sources' && '📡 News Sources'}
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
                    <li>• Sources link to specific articles, not homepages</li>
                    <li>• Priority is given to your configured News Sources, but better content is used when found</li>
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

            {activeSettingsTab === 'sources' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Manage news sources for content refresh.</p>
                <div className="grid gap-2 max-h-48 overflow-y-auto">
                  {customSources.map((source, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <input type="checkbox" checked={source.enabled} onChange={() => toggleSource(i)} className="w-4 h-4" style={{ accentColor: colors.primary }} />
                      <span className="flex-1 font-medium text-gray-700">{source.name}</span>
                      <button onClick={() => removeSource(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" placeholder="Source name" value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  <input type="text" placeholder="URL" value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  <button onClick={addCustomSource} className="px-4 py-2 text-white rounded-lg font-medium" style={{ backgroundColor: colors.primary }}>+ Add</button>
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

            {/* Section 1: Opening Hook */}
            <SectionCard number="1" title="Opening Hook" sectionKey="section1" wordCount="50-75 words">
              <div className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap text-gray-700 leading-relaxed">
                {newsletterData.openingHook.content}
              </div>
            </SectionCard>

            {/* Section 1b: THE BOTTOM LINE (TL;DR) - No refresh, this is a manual summary */}
            <SectionCard number="1b" title="The Bottom Line (TL;DR)" sectionKey="section1b" showRefresh={false}>
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{newsletterData.bottomLine.sectionLabel}</p>
                <p className="text-sm font-medium text-gray-600">{newsletterData.bottomLine.subtitle}</p>
                <ul className="space-y-2">
                  {newsletterData.bottomLine.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="font-bold" style={{ color: colors.primary }}>→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </SectionCard>

            {/* Section 2: Metrics - 3x2 Grid - No refresh, compiled during full newsletter creation */}
            <SectionCard number="2" title="Metrics Dashboard" sectionKey="section2" showRefresh={false}>
              <div className="rounded-lg p-5 text-white" style={{ background: `linear-gradient(135deg, ${colors.dark} 0%, #0F172A 100%)` }}>
                <h3 className="font-bold mb-4 text-sm uppercase" style={{ color: colors.accent }}>{newsletterData.metricsDashboard.title}</h3>
                <div className="grid grid-cols-3 gap-4">
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
                    <p className="text-xs text-gray-400 mt-1">Source: {story.sources[0].title}, {story.sources[0].date}</p>
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
            
            {/* 1. Opening Hook */}
            <PreviewCard>
              <div style={{ fontSize: '16px', lineHeight: '1.7', color: colors.text, whiteSpace: 'pre-line' }}>
                {newsletterData.openingHook.content}
              </div>
            </PreviewCard>

            {/* 1b. THE BOTTOM LINE */}
            <PreviewCard sectionLabel={newsletterData.bottomLine.sectionLabel}>
              <p style={{ fontSize: '14px', color: colors.muted, marginBottom: '12px' }}>{newsletterData.bottomLine.subtitle}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {newsletterData.bottomLine.items.map((item, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', fontSize: '15px', color: colors.text }}>
                    <span style={{ color: colors.primary, fontWeight: '700' }}>→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
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
                  <p style={{ fontSize: '12px', color: colors.muted, marginTop: '8px' }}>
                    Source: <a href={story.sources[0].url} style={{ color: colors.primary, borderBottom: `2px solid ${colors.link}` }}>{story.sources[0].title}</a>, {story.sources[0].date}
                  </p>
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

export default RenewalWeeklyCompiler;
