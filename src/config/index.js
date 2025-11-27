/**
 * Renewal Weekly Configuration
 *
 * Edit these JSON files to customize AI behavior:
 * - sources.json     → Preferred research domains by topic
 * - style-guide.json → Writing rules, tone, words to use/avoid
 * - audience.json    → Target reader profile and preferences
 */

import sources from './sources.json';
import styleGuide from './style-guide.json';
import audience from './audience.json';

// Build preferred domains list for AI prompts
export const getPreferredDomains = (categories = ['stemCell', 'longevity', 'wellness']) => {
  const domains = new Set();
  categories.forEach(cat => {
    if (sources[cat]?.domains) {
      sources[cat].domains.forEach(d => domains.add(d));
    }
  });
  return Array.from(domains);
};

// Build source guidance string for prompts
export const getSourceGuidance = () => {
  const topDomains = getPreferredDomains(['stemCell', 'longevity', 'antiAging']);
  return `PREFERRED SOURCES (prioritize these domains):
${topDomains.slice(0, 15).map(d => `- ${d}`).join('\n')}`;
};

// Build style rules string for system message
export const getStyleRules = () => {
  const s = styleGuide;
  return `VOICE: ${s.voice.summary}

TONE EXAMPLES:
Good: "${s.tone.good.slice(0, 3).join('", "')}"
Bad: "${s.tone.bad.slice(0, 3).join('", "')}"

WORDS TO AVOID: ${s.wordsToAvoid.join(', ')}

FORMATTING:
${s.formatting.rules.join('\n')}`;
};

// Build audience context string
export const getAudienceContext = () => {
  const a = audience;
  return `AUDIENCE: ${a.demographics.ageRange} with ${a.conditions.slice(0, 3).join(', ')}, and similar conditions.
They are: ${a.psychographics.mindset.slice(0, 3).join(', ')}.
They want: ${a.contentPreferences.want.slice(0, 3).join(', ')}.
They don't want: ${a.contentPreferences.dontWant.slice(0, 3).join(', ')}.`;
};

// Export raw configs for direct access
export { sources, styleGuide, audience };

// Export word limits helper
export const getWordLimits = (section) => {
  return styleGuide.sectionWordLimits[section] || { min: 100, max: 200 };
};
