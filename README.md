# Renewal Weekly Newsletter Compiler v5.1

A React-based tool for compiling weekly health newsletters focused on stem cell therapy, regenerative medicine, and longevity.

## 🎯 Target Audience
Adults aged 40-80 with degenerative conditions interested in:
- Stem cell therapy
- Regenerative medicine
- Anti-aging and longevity
- Clinical trials

## 🚀 Quick Start

```bash
npm install
npm run dev
```

## 📋 16-Section Newsletter Structure

| # | Section | Purpose |
|---|---------|---------|
| 1 | Opening Hook | Seasonal, friendly greeting (50-75 words) |
| 1b | The Bottom Line | TL;DR for scanners (4 bullet points) |
| 2 | Metrics Dashboard | 3×2 grid with industry stats |
| 3 | Lead Story | Main article with hero image (350-400 words) |
| 4 | Research Roundup | Treatment spotlight (100-150 words) |
| 5 | Sponsor 1 | Placeholder for sponsor |
| 6 | On Our Radar | 3 secondary stories |
| 7 | Deep Dive | Nutrition/lifestyle article (200-250 words) |
| 8 | Sponsor 2 | Placeholder for sponsor |
| 9 | Worth Knowing | Red flags, guides, resources |
| 10 | Stat of the Week | Big number storytelling (150-200 words) |
| 11 | The Pulse | 7 quick hits with sources |
| 12 | RECS | Read/Watch/Try/Listen recommendations |
| 13 | PLAY | Rotating health trivia game |
| 14 | Referral | Beehiiv referral program |
| 15 | Footer | Game answer + Word of the Day |

## 🎨 Brand Colors

| Role | Hex Code |
|------|----------|
| Primary Purple | `#7C3AED` |
| Secondary Violet | `#5B21B6` |
| Accent Lavender | `#EDE9FE` |
| Link Underline | `#8B5CF6` |
| Dark (headers) | `#1E1B4B` |
| Text | `#1F2937` |

## 🔗 In-Text Link Syntax

Use this syntax in content:
```
{{LINK:display text|https://example.com}}
```

Example:
```
Researchers at {{LINK:Stanford University|https://stanford.edu}} published...
```

Renders as clickable link with purple underline.

## 🤖 AI Integration

Add your Anthropic API key in Settings → AI tab to enable:
- Auto-generate section content
- Search for recent news
- Create Midjourney prompts

## 📤 Beehiiv Export

The HTML tab generates Beehiiv-ready code with:
- Proper styling preserved
- Merge tags: `{{subscriber.referral_count}}`, `{{subscriber.rh_reflink}}`
- Image placeholders marked `[YOUR_IMAGE_URL]`

## 📁 Key Files

- `src/App.jsx` - Main application (1900+ lines)
- `CONTEXT.md` - Full project specifications
- `WEEKLY-PROMPTS.md` - AI prompts for weekly content
- `CHANGELOG.md` - Version history

## 🔄 Weekly Workflow

1. **Wednesday Morning**: Open app, click "Fetch All News"
2. **Generate Content**: Use AI refresh buttons or paste your research
3. **Edit & Refine**: Customize each section
4. **Preview**: Check full newsletter in Preview tab
5. **Export**: Copy HTML to Beehiiv
6. **Add Images**: Use Midjourney prompts provided
7. **Thursday Morning**: Send newsletter

## 📊 Features

- ✅ Story tracking (prevents repeating content)
- ✅ 8 rotating trivia games
- ✅ Custom news sources
- ✅ Image slot management with Midjourney prompts
- ✅ Section-by-section copy buttons
- ✅ Full HTML export
- ✅ localStorage persistence
- ✅ AI content generation (with API key)

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📝 License

Private project for Renewal Weekly newsletter.
