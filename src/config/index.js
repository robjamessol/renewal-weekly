/**
 * Renewal Weekly Configuration
 *
 * Edit these JSON files to customize AI behavior:
 * - sources.json     → Preferred research domains by topic
 * - style-guide.json → Writing rules, tone, words to use/avoid
 * - audience.json    → Target reader profile and preferences
 * - structure.json   → Section-by-section format templates
 */

import sources from './sources.json';
import styleGuide from './style-guide.json';
import audience from './audience.json';
import structure from './structure.json';

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
  const conditions = a.conditions?.primary || a.conditions || [];
  const mindset = a.psychographics?.mindset || [];
  const concerns = a.psychographics?.concerns || [];
  const want = a.contentPreferences?.want || [];
  const dontWant = a.contentPreferences?.dontWant || [];
  const effectivePhrases = a.messagingGuidance?.effectivePhrases || [];

  return `AUDIENCE PROFILE:
- Demographics: ${a.demographics.ageRange}, ${a.demographics.education || 'educated'}
- Motivations: ${a.healthJourney?.motivations?.slice(0, 3).join('; ') || 'Improve quality of life, stay informed'}
- Common Conditions: ${conditions.slice(0, 4).join('; ')}

WHO THEY ARE:
- ${mindset.slice(0, 4).join('\n- ')}

THEIR CONCERNS:
- ${concerns.slice(0, 3).join('\n- ')}

WHAT THEY WANT FROM CONTENT:
- ${want.slice(0, 5).join('\n- ')}

WHAT THEY DON'T WANT:
- ${dontWant.slice(0, 4).join('\n- ')}

EFFECTIVE PHRASES TO USE:
${effectivePhrases.slice(0, 4).map(p => `"${p}"`).join(', ')}`;
};

// Export raw configs for direct access
export { sources, styleGuide, audience, structure };

// Export word limits helper
export const getWordLimits = (section) => {
  return styleGuide.sectionWordLimits[section] || { min: 100, max: 200 };
};

// Get section structure for prompts
export const getSectionStructure = (sectionName) => {
  return structure.sections[sectionName] || null;
};

// Build structure guidance for a specific section
export const getStructureGuidance = (sectionName) => {
  const section = structure.sections[sectionName];
  if (!section) return '';

  let guidance = `SECTION: ${section.name}\n`;
  guidance += `WORD LIMIT: ${section.wordLimit || section.wordLimitPerStory || 'See structure'}\n`;

  if (section.structure) {
    guidance += `\nSTRUCTURE:\n`;
    if (Array.isArray(section.structure)) {
      guidance += section.structure.map((s, i) => `${i + 1}. ${s}`).join('\n');
    }
  }

  if (section.rules) {
    guidance += `\n\nRULES:\n`;
    guidance += section.rules.map(r => `• ${r}`).join('\n');
  }

  if (section.example) {
    guidance += `\n\nEXAMPLE:\n${typeof section.example === 'string' ? section.example : JSON.stringify(section.example, null, 2)}`;
  }

  return guidance;
};
