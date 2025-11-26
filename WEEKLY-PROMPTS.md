# Weekly Content Generation Prompts

Use these prompts with Claude (or in the app's AI feature) to generate fresh content each week.

---

## 🔍 RESEARCH PHASE (Wednesday Morning)

### Prompt 1: Find This Week's News
```
Search for stem cell therapy and regenerative medicine news from the past 7 days. Focus on:
- Clinical trial results
- FDA approvals or RMAT designations
- University research breakthroughs
- Treatment accessibility updates
- Industry funding/investment news

Provide 10 stories with:
- Headline
- 2-sentence summary
- Source URL
- Publication date

Prioritize peer-reviewed sources: Nature, Cell Stem Cell, ScienceDaily, STAT News, Stanford/Harvard/MIT announcements.
```

### Prompt 2: Get PubMed Stats
```
How many new stem cell-related publications appeared on PubMed in the last 7 days?

Also find:
- Top 3 most-cited stem cell papers this month
- Any new clinical trial registrations on ClinicalTrials.gov
- Current count of active regenerative medicine trials
```

---

## ✍️ CONTENT GENERATION

### Opening Hook
```
Write a friendly opening hook (50-75 words) for Renewal Weekly, a health newsletter for adults 40-80 interested in regenerative medicine.

Today's date: [INSERT DATE]
Season/timing: [e.g., "week before Thanksgiving", "first week of spring"]

Make it:
- Warm and relatable
- Slightly humorous but not cheesy
- Connected to health/wellness theme
- End with "—The Renewal Weekly Team"

Do NOT mention stem cells directly - save that for the content.
```

### Lead Story
```
Write the lead story (350-400 words) for Renewal Weekly about:

[PASTE YOUR CHOSEN NEWS STORY HERE]

Structure:
1. Compelling headline (clever, not clickbait)
2. Opening paragraph: Why this matters to someone with a chronic condition
3. "Here's what happened:" - The specific news/findings
4. "Why this matters now:" - Context and implications
5. "What's next:" - Forward-looking statement
6. Include an expert quote if available

Use {{LINK:display text|url}} syntax for 2-3 embedded links.

Tone: Hopeful but scientifically accurate. No hype. Our readers are smart.
```

### Research Roundup
```
Write a Research Roundup (100-150 words) about:

[PASTE TREATMENT/THERAPY TO SPOTLIGHT]

Include:
- What it is and how it works (simple terms)
- Current status (FDA approved? In trials? Experimental?)
- Estimated costs and availability
- Who might benefit
- One key caveat or consideration

Use {{LINK:source name|url}} for the source.

Format as "Treatment Spotlight: [Name]"
```

### Secondary Stories (On Our Radar)
```
Write 3 secondary stories for the "On Our Radar" section.

Topics:
1. [STORY 1 TOPIC]
2. [STORY 2 TOPIC]  
3. [STORY 3 TOPIC]

For each story provide:
- Bold lead sentence (the hook - make it punchy)
- 75-150 words of content
- Embedded {{LINK:text|url}} links
- Source with date

These should feel like quick, scannable updates - not deep dives.
```

### Deep Dive
```
Write a Deep Dive article (200-250 words) about:

[TOPIC: e.g., "anti-inflammatory foods", "sleep and cellular repair", "exercise for joint health"]

Connect it to regenerative health and stem cell function where relevant.

Include:
- Surprising opening angle
- Practical tips with bullet points
- Scientific backing (cite sources with {{LINK:text|url}})
- One actionable takeaway

Audience: 40-80 year olds managing chronic conditions. Be practical, not preachy.
```

### Stat of the Week
```
Create a "Stat of the Week" about this number:

[INSERT STATISTIC, e.g., "$403.86 billion - projected regenerative medicine market by 2032"]

Write 150-200 words including:
- The big number as headline
- What it represents
- Context to help readers understand scale
- Comparisons (e.g., "That's more than...")
- Why it matters for someone considering treatment
- Source with {{LINK:text|url}}
```

### The Pulse (Quick Hits)
```
Write 7 quick hits for "The Pulse" section based on this week's regenerative medicine news.

Format for each:
"[One-sentence news item] [Source, Date]"

Mix of:
- 3-4 stem cell/regenerative medicine items
- 1-2 clinical trial updates
- 1 industry/investment news
- 1 lighter/surprising health fact

Keep each under 25 words. Include variety.
```

### Worth Knowing
```
Create 3 items for the "Worth Knowing" section:

1. An upcoming health awareness day or event (next 2 weeks)
2. A practical guide or red flag list (e.g., "5 Questions to Ask Before...")
3. A helpful resource with link

For each, include:
- Title
- Date (if applicable)
- 2-3 sentence description
- Link (if applicable)

Focus on actionable, protective information for health consumers.
```

---

## 🎮 GAMES

### Generate New Trivia
```
Create a health trivia game for Renewal Weekly in ONE of these formats:

1. NUTRITIONAL FACTS - Ingredient list guessing game
2. HEALTH MYTH OR FACT - 3 statements to evaluate
3. MATCH THE BREAKTHROUGH - Connect therapy to condition
4. NAME THAT ORGAN - Clue-based identification
5. VITAMIN MATCH-UP - Match vitamins to functions
6. CALORIE SHOWDOWN - Compare calories (surprising pairs)
7. BODY BY THE NUMBERS - Fill in body statistics
8. ANTI-INFLAMMATORY FOOD QUIZ - Compare food properties

Format:
- Intro text
- The game content
- Answer key

Make it educational but fun. Our audience is 40-80 years old.
```

---

## 📧 SUBJECT LINES

### Generate Subject Line Options
```
Write 5 subject line options for this week's Renewal Weekly newsletter.

Lead story: [BRIEF DESCRIPTION]
Other highlights: [2-3 OTHER TOPICS]

Requirements:
- Under 50 characters ideal
- Create curiosity without clickbait
- At least one should reference stem cells/regenerative medicine
- Include one that's more playful/unexpected

Format:
1. [Subject line] - [why it works]
2. ...
```

---

## 🖼️ IMAGE PROMPTS

### Generate Midjourney Prompts
```
Create a Midjourney prompt for an image to accompany this article:

Headline: [INSERT HEADLINE]
Topic: [BRIEF DESCRIPTION]

Requirements:
- Medical/scientific aesthetic
- Purple and violet color palette (brand colors: #7C3AED, #5B21B6)
- Hopeful, not clinical
- No text in image
- Aspect ratio 16:9
- Midjourney v6

Provide prompt in format:
[description], purple and violet tones, medical illustration style, hopeful atmosphere, clean composition --ar 16:9 --v 6
```

---

## 📝 WORD OF THE DAY

### Generate Word of the Day
```
Suggest a "Word of the Day" for Renewal Weekly - a medical/scientific term related to:
- Stem cells
- Regenerative medicine
- Cellular biology
- Longevity science
- Anti-aging

Format:
Word: [WORD]
Definition: [Clear, accessible definition]
Why it matters: [One sentence on relevance to readers]

The word should be impressive but explainable to a general audience.
```

---

## ✅ WEEKLY CHECKLIST

Before sending, verify:

- [ ] All links work (test {{LINK:}} syntax rendered correctly)
- [ ] No stories repeated from previous weeks (check story tracker)
- [ ] Lead story is < 7 days old
- [ ] At least 20% stem cell content
- [ ] All image slots have images or placeholders
- [ ] Beehiiv merge tags in referral section
- [ ] Subject line under 50 characters
- [ ] Preview text complements (doesn't repeat) subject line
- [ ] Game answer included in footer
- [ ] Word of the Day included

---

## 🚀 QUICK START PROMPT

Paste this into Claude at the start of each week:

```
I'm creating this week's Renewal Weekly newsletter (health newsletter for adults 40-80 interested in stem cell therapy and regenerative medicine).

Today's date: [DATE]
Newsletter issue: #[NUMBER]

Please help me:
1. Find the top 5 stem cell/regenerative medicine news stories from the past 7 days
2. Recommend which should be the lead story (broad appeal)
3. Suggest a seasonal opening hook
4. Draft the lead story with embedded {{LINK:text|url}} links

My brand uses purple colors (#7C3AED primary) and a hopeful but scientifically accurate tone.
```
