# Features to Implement in Claude Code

Copy these instructions into Claude Code one at a time to add AI functionality.

---

## FEATURE 1: AI Content Generation

Paste this into Claude Code:

```
Add AI content generation to the newsletter compiler. 

In src/App.jsx:

1. Add state for API key:
const [anthropicApiKey, setAnthropicApiKey] = useState(() => {
  return localStorage.getItem('renewalWeekly_anthropicKey') || '';
});

2. Add AI generation function that calls Claude API:
- Endpoint: https://api.anthropic.com/v1/messages
- Model: claude-sonnet-4-20250514
- Headers need: x-api-key, anthropic-version: '2023-06-01', anthropic-dangerous-direct-browser-access: 'true'

3. Add "AI" tab in Settings panel where user can paste their API key

4. Make each section's "Refresh" button call the AI with section-specific prompts

5. Store generated content in newsletterData state

See CONTEXT.md for section-specific prompt requirements.
```

---

## FEATURE 2: News Fetching

Paste this into Claude Code:

```
Add real-time news fetching to the newsletter compiler.

1. Add PubMed integration (free, no API key):
Endpoint: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=stem+cell&rettype=count&retmode=json&datetype=pdat&reldate=7

2. Update the Metrics Dashboard to show:
- Real PubMed publication count (fetched live)
- Dynamic "as of" date

3. Add a "Fetch All News" button that:
- Gets PubMed count
- Updates lastFetched timestamp
- Shows loading state

4. Cache results in localStorage to avoid excessive API calls
```

---

## FEATURE 3: Section-Specific AI Prompts

Paste this into Claude Code:

```
Add these section-specific prompts for AI content generation:

openingHook prompt:
"Write a friendly, conversational opening hook (50-75 words) for a health newsletter called Renewal Weekly targeting adults 40-80. Make it seasonal for [current month]. Sign off with —The Renewal Weekly Team."

leadStory prompt:
"Write a lead story (350-400 words) about recent stem cell/regenerative medicine news. Use {{LINK:text|url}} syntax. Include: headline, opening hook, 'Here's what happened:', 'Why this matters:', 'What's next:', expert quote."

researchRoundup prompt:
"Write a research roundup (100-150 words) about a treatment being studied. Include costs, availability, what readers should know. Use {{LINK:text|url}} syntax."

deepDive prompt:
"Write a deep dive (200-250 words) about nutrition/lifestyle connected to regenerative health. Include practical bullet points and {{LINK:text|url}} links."

Each prompt should include the custom keyword from the section's input field if provided.
```

---

## FEATURE 4: Export Improvements

Paste this into Claude Code:

```
Improve the HTML export functionality:

1. Add "Copy Section" buttons that copy just that section's HTML

2. Add "Download HTML" button that saves the full newsletter as a .html file

3. Add "Copy for Beehiiv" button that:
- Strips any incompatible CSS
- Ensures all links have target="_blank"
- Preserves merge tags exactly

4. Show character/word count for each section

5. Add validation warnings:
- Story over 7 days old
- Missing images
- Broken link syntax
```

---

## FEATURE 5: Story Duplicate Detection

Paste this into Claude Code:

```
Enhance the story tracking system:

1. When AI generates content, check if similar headlines exist in usedStories

2. Show warning badge if a story title is similar to one used in last 90 days

3. Add "Mark as Used" button on each story that adds it to tracking

4. Show "Previously Used" indicator with date if headline matches

5. Add fuzzy matching (not just exact match) for headline comparison
```

---

## FEATURE 6: Preview Enhancements

Paste this into Claude Code:

```
Enhance the Preview tab:

1. Add "Mobile Preview" toggle that shows newsletter at 375px width

2. Add estimated read time calculator based on word count

3. Add "Send Test Email" placeholder button (for future Beehiiv API integration)

4. Highlight any {{LINK:}} syntax that didn't render (broken links)

5. Show image placeholders with actual dimensions (600x400 for hero, 400x300 for others)
```

---

## TESTING CHECKLIST

After implementing features, test:

- [ ] API key saves to localStorage and persists on reload
- [ ] AI generates content for each section type
- [ ] Loading states show during generation
- [ ] Error messages display if API fails
- [ ] Generated content includes {{LINK:}} syntax correctly
- [ ] Story tracking prevents duplicates
- [ ] HTML export produces valid, styled output
- [ ] All 16 sections render in Preview tab
- [ ] Refresh buttons work on each section
- [ ] Copy buttons work and show confirmation

---

## DEPLOYMENT

After all features work locally:

```
git add .
git commit -m "Add AI content generation and news fetching"
git push origin main
```

Vercel will auto-deploy the changes.
