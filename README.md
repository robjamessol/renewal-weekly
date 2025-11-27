# Renewal Weekly Newsletter Compiler v6.0

A React-based AI-powered tool for compiling weekly health newsletters focused on stem cell therapy, regenerative medicine, and longevity.

## What's New in v6.0

- **3-Phase AI Architecture**: Research → Distribute → Write workflow
- **Smart Source Enforcement**: `allowed_domains` ensures articles come from approved sources
- **Config-Driven Content**: Edit JSON files to customize AI behavior
- **Audience-Aware Research**: AI finds articles that match your reader profile
- **Test Mode**: Use Haiku model for cheaper development/testing

## Quick Start

```bash
npm install
npm run dev
```

Add your Anthropic API key in **Settings → AI tab**.

## How It Works: 3-Phase Architecture

### Phase 1: Research
AI searches the web for 15-20 articles that would excite your specific audience, using:
- `sources.json` - Approved domains (enforced at API level)
- `audience.json` - Reader interests, conditions, engagement triggers

### Phase 2: Distribute
Articles are scored and assigned to sections:
- Highest-scoring mainstream → Lead Story
- Scientific/stem cell → Research Roundup
- Wellness/nutrition → Deep Dive
- Remaining → Quick Hits, On Our Radar

### Phase 3: Write
Each section is written using pre-researched articles with:
- `style-guide.json` - Voice, tone, words to avoid
- `structure.json` - Section formats and templates

## Configuration Files

Edit these in `src/config/` to customize AI behavior:

| File | Purpose |
|------|---------|
| `sources.json` | Approved domains by category (stem cell, longevity, wellness, etc.) |
| `audience.json` | Reader demographics, interests, conditions, content preferences |
| `style-guide.json` | Writing voice, tone examples, words to use/avoid |
| `structure.json` | Section-by-section format templates |

### Example: Adding a Source

```json
// src/config/sources.json
{
  "stemCell": {
    "domains": [
      "cell.com",
      "nature.com",
      "your-new-source.com"  // Add here
    ]
  }
}
```

## Target Audience

From `audience.json`:
- **Age**: 45-75 years old (primary: 55-68)
- **Interests**: Stem cell therapy, regenerative medicine, anti-aging, longevity
- **Conditions**: MS, Parkinson's, chronic pain, joint issues, diabetes
- **Mindset**: Research-oriented, proactive about health, want evidence not hype

## 16-Section Newsletter Structure

| # | Section | Purpose |
|---|---------|---------|
| 1 | Opening Hook | Seasonal greeting tied to health calendar |
| 1b | The Bottom Line | TL;DR for scanners (4 bullets) |
| 2 | Metrics Dashboard | 3x2 grid with industry stats |
| 3 | Lead Story | Main article with hero image (280-320 words) |
| 4 | Research Roundup | Treatment spotlight (120-150 words) |
| 5 | Sponsor 1 | Ad placeholder |
| 6 | On Our Radar | 3 secondary stories |
| 7 | Deep Dive | Nutrition/lifestyle article (200-250 words) |
| 8 | Sponsor 2 | Ad placeholder |
| 9 | Worth Knowing | Awareness events, guides, resources |
| 10 | Stat of the Week | Big number storytelling |
| 11 | The Pulse | 7 quick hits with sources |
| 12 | RECS | Read/Watch/Try/Listen recommendations |
| 13 | PLAY | Rotating health trivia game |
| 14 | Referral | Beehiiv referral program |
| 15 | Footer | Game answer + Word of the Day |

## AI Features

### Web Search with Domain Enforcement
```javascript
tools: [{
  type: 'web_search_20250305',
  max_uses: 12,
  allowed_domains: [...sources.json domains]
}]
```

### Prompt Caching
System messages are cached for 90% cost savings on repeated content.

### Test Mode
Toggle in Settings to use Claude Haiku (12x cheaper) during development.

## Brand Colors

| Role | Hex Code |
|------|----------|
| Primary Purple | `#7C3AED` |
| Secondary Violet | `#5B21B6` |
| Accent Lavender | `#EDE9FE` |
| Link Underline | `#8B5CF6` |

## Link Syntax

Use in content:
```
{{LINK:display text|https://example.com}}
```

## Weekly Workflow

1. **Open app** → Click "Create Newsletter"
2. **Phase 1** runs: AI researches 15-20 articles
3. **Phase 2** runs: Articles distributed to sections
4. **Phase 3** runs: Content written for each section
5. **Edit & Refine**: Use refresh buttons for individual sections
6. **Preview**: Check full newsletter
7. **Export**: Copy HTML to Beehiiv
8. **Add Images**: Use generated Midjourney prompts

## Features

- 3-phase AI architecture (Research → Distribute → Write)
- Domain allow lists enforce approved sources
- Audience-aware article discovery
- Config-driven prompts (edit JSON, not code)
- Story tracking (prevents repeat content)
- 8 rotating trivia games
- Midjourney prompt generation
- Prompt caching (90% token savings)
- Test mode with Haiku
- localStorage persistence
- Beehiiv-ready HTML export

## Development

```bash
npm install      # Install dependencies
npm run dev      # Development server
npm run build    # Production build
npm run preview  # Preview production
```

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main application |
| `src/config/sources.json` | Approved source domains |
| `src/config/audience.json` | Reader profile |
| `src/config/style-guide.json` | Writing rules |
| `src/config/structure.json` | Section templates |
| `src/config/index.js` | Config helpers |

## API Costs

| Operation | Cost |
|-----------|------|
| Web search | $10 per 1,000 searches |
| Claude Sonnet input | $3 per 1M tokens |
| Claude Sonnet output | $15 per 1M tokens |
| Cached tokens | 90% discount |
| Claude Haiku (test mode) | ~12x cheaper |

Typical newsletter generation: ~$0.50-1.00

## License

Private project for Renewal Weekly newsletter.
