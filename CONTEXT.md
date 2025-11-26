# Renewal Weekly - Complete Project Context

Use this document when working with Claude Code or any AI assistant to maintain consistency.

---

## PROJECT OVERVIEW

**Product:** Newsletter compiler tool for "Renewal Weekly"
**Tech Stack:** React + Vite + Tailwind CSS
**Platform:** Deployed on Vercel
**Newsletter Platform:** Beehiiv
**Current Version:** 5.1

---

## TARGET AUDIENCE

- **Age:** 40-80 years old
- **Interests:** Stem cell therapy, regenerative medicine, anti-aging, longevity
- **Conditions:** Degenerative diseases, autoimmune conditions, chronic pain
- **Behavior:** Health-conscious, research-oriented, willing to invest in treatments
- **Challenges:** Brain fog, fatigue, information overload, skepticism of medical claims

---

## BRAND IDENTITY

### Color Palette (Purple-based, colorblind-friendly)

```javascript
const colors = {
  primary: '#7C3AED',      // Main brand purple
  secondary: '#5B21B6',    // Deeper violet
  accent: '#EDE9FE',       // Soft lavender (backgrounds)
  link: '#8B5CF6',         // Link underline purple
  dark: '#1E1B4B',         // Headers/footers
  text: '#1F2937',         // Charcoal
  muted: '#6B7280',        // Gray
  border: '#E5E7EB',       // Light gray
  white: '#FFFFFF'
};
```

### Visual Styling
- Section boxes: `border-radius: 12px`, `border: 1px solid #E5E7EB`, `padding: 24px`
- Section labels: Purple, 12px, uppercase, bold, letter-spacing 0.5px
- Links: Charcoal text color (#1F2937) with 2px purple underline (#8B5CF6)
- Gradients: Use `#1E1B4B` to `#0F172A` for dark sections

---

## 16-SECTION NEWSLETTER STRUCTURE

### Section 1: Opening Hook
- **Words:** 50-75
- **Tone:** Friendly, seasonal, relatable
- **Format:** Personal greeting, observation, sign-off with "—The Renewal Weekly Team"
- **Example:** "Good morning. As we head into the holiday season..."

### Section 1b: The Bottom Line (TL;DR)
- **Purpose:** Quick summary for scanners, addresses brain fog/fatigue
- **Format:** 4 bullet points with → arrows
- **Content:** Key takeaways from the newsletter

### Section 2: Metrics Dashboard
- **Layout:** 3 columns × 2 rows
- **Background:** Dark gradient
- **Row 1 (Dynamic - weekly):**
  - New Clinical Publications (PubMed)
  - Stock Spotlight (rotating: VRTX, MESO, CRSP)
  - Active Clinical Trials
- **Row 2 (Stable - monthly):**
  - FDA RMAT Designations YTD
  - MSC Trials Efficacy Rate
  - Avg Trial Enrollment Time

### Section 3: Lead Story
- **Words:** 350-400
- **Image:** Hero image required
- **Structure:**
  - Compelling headline
  - Opening hook (why this matters)
  - "Here's what happened:" section
  - "Why this matters now:" section
  - "What's next:" forward-looking statement
  - Expert quote
- **Links:** Embedded using {{LINK:text|url}} syntax

### Section 4: Research Roundup
- **Words:** 100-150
- **Image:** Required
- **Focus:** Treatment spotlight with practical info (costs, availability)
- **Rotating formats:**
  1. Treatment Spotlight
  2. This Week in Research
  3. What Your Doctor Won't Tell You
  4. The Numbers That Matter

### Section 5: Sponsor 1
- **Format:** Placeholder box
- **Style:** Amber/yellow dashed border

### Section 6: On Our Radar (formerly "Tour de Headlines")
- **Words:** 300-350 total (3 stories)
- **Image:** One shared image for section
- **Format:** Each story has bold lead + content + source

### Section 7: Deep Dive
- **Words:** 200-250
- **Image:** Required
- **Focus:** Nutrition, lifestyle, wellness connected to regenerative health
- **Include:** Bullet point lists for actionable tips

### Section 8: Sponsor 2
- **Format:** Placeholder box

### Section 9: Worth Knowing
- **Content types:**
  - Health awareness days
  - Red flags (e.g., "5 Red Flags When Choosing a Stem Cell Clinic")
  - How-to guides
  - Resources with links

### Section 10: Stat of the Week
- **Words:** 150-200
- **Image:** Required
- **Format:** Large number + headline + context + comparisons

### Section 11: The Pulse
- **Format:** 7 quick hits (one-liners)
- **Each item:** Fact + [Source, Date] link
- **Style:** Bullet points with inline source links

### Section 12: RECS
- **Categories:** Read, Watch, Try, Listen, Save Money (affiliate)
- **Link style:** Keyword-only links (not full titles)
- **Example:** "Read: Pluripotent **stem-cell-derived therapies** in clinical trial"

### Section 13: PLAY
- **Format:** Rotating health trivia game
- **8 templates available:**
  1. Nutritional Facts (guess food from ingredients)
  2. Health Myth or Fact?
  3. Match the Breakthrough
  4. Name That Organ
  5. Vitamin Match-Up
  6. Calorie Showdown
  7. Body by the Numbers
  8. Anti-Inflammatory Food Quiz

### Section 14: Referral
- **Beehiiv merge tags:**
  - `{{subscriber.referral_count}}`
  - `{{subscriber.rh_reflink}}`
  - `{{subscriber.first_name}}`
  - `{{subscriber.email}}`

### Section 15: Footer
- **Content:** Game answer, Word of the Day, credits, copyright

---

## IN-TEXT HYPERLINK SYSTEM

### Syntax
```
{{LINK:display text|https://example.com}}
```

### Styling
```css
color: #1F2937;           /* Charcoal text - NOT purple */
text-decoration: none;
border-bottom: 2px solid #8B5CF6;  /* Purple underline */
padding-bottom: 1px;
font-weight: 500;
```

### Parser Function
```javascript
const parseContentWithLinks = (content) => {
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

  return parts;
};
```

---

## IMAGE SLOTS

| Section | Image Required |
|---------|----------------|
| Lead Story | ✅ Hero image |
| Research Roundup | ✅ |
| On Our Radar | ✅ (shared) |
| Deep Dive | ✅ |
| Stat of the Week | ✅ |
| PLAY (Games) | Optional |

### Midjourney Prompt Templates
- Auto-generated based on headline keywords
- Vision/eye → retinal regeneration visualization
- Diabetes → pancreatic islet cells
- Brain/neuro → neural connections
- Nutrition → food photography
- Stats → holographic data visualization
- All use purple/violet color palette, --ar 16:9 --v 6

---

## FEATURES TO MAINTAIN

### Story Tracking System
- localStorage key: `renewalWeekly_usedStories`
- Prevents repeating content
- Export/Import JSON for cross-device
- Auto-clears stories older than 90 days

### Custom News Sources
- localStorage key: `renewalWeekly_customSources`
- Default sources: ScienceDaily, ClinicalTrials.gov, Cell Stem Cell, Nature, STAT News, PubMed

### AI Integration
- localStorage key: `renewalWeekly_anthropicKey`
- Uses Claude API for content generation
- Section-specific prompts for each content type

---

## WEEKLY WORKFLOW

| Day | Task |
|-----|------|
| Wednesday AM | Open app, research news, generate content with AI |
| Wednesday PM | Edit and refine all sections |
| Thursday AM | Final preview, export to Beehiiv, add images, send |

---

## CONTENT RULES

1. **20%+ stem cell content** - Should appear prominently
2. **Lead story = broad appeal** - Not too niche
3. **All content < 1 week old** - Fresh news only
4. **Embedded links required** - Use {{LINK:text|url}} syntax
5. **Practical guidance** - Red flags, questions to ask, costs
6. **Hope without hype** - Scientific accuracy, realistic expectations

---

## BEEHIIV INTEGRATION

### Merge Tags
- `{{subscriber.referral_count}}` - Number of referrals
- `{{subscriber.rh_reflink}}` - Unique referral link
- `{{subscriber.first_name}}` - Subscriber's first name
- `{{subscriber.email}}` - Subscriber's email

### Export Format
- HTML with inline styles
- `.rw-section` class for boxes
- Image placeholders: `[YOUR_IMAGE_URL]`
- Responsive-ready

---

## API ENDPOINTS FOR AI FEATURES

### PubMed (Free, no key needed)
```
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=stem+cell&rettype=count&retmode=json&datetype=pdat&reldate=7
```

### Anthropic Claude API
```javascript
fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': YOUR_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  })
});
```

---

## COMMON ISSUES & FIXES

### "Multiple exports with same name"
- Ensure only ONE `export default RenewalWeeklyCompiler;` at file end

### Links not rendering
- Check syntax: `{{LINK:text|url}}` (no spaces around |)

### Styles not applying
- Verify Tailwind is configured in tailwind.config.js
- Check src/index.css has @tailwind directives

### localStorage not persisting
- Check browser isn't in incognito mode
- Verify no JavaScript errors in console

---

## VERSION HISTORY

- **v5.1** - Purple color palette, full preview, 3×2 metrics, in-text links, Bottom Line section
- **v5.0** - Image slots, Midjourney prompts, HTML export, "The Pulse" section
- **v4.0** - Story tracking, custom sources, 8 games, Beehiiv integration
- **v3.0** - Section reordering, Worth Knowing, embedded links
- **v2.0** - Template refinement, word counts
- **v1.0** - Initial 15-section structure

---

## PROMPT FOR CLAUDE CODE

When making changes, start with:

```
I'm working on the Renewal Weekly newsletter compiler (React + Vite + Tailwind).
Please read CONTEXT.md for full specifications.

I need to: [describe your change]
```

This ensures consistency across all updates.
