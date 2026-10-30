import { getTenantIntegration } from './integrations/credentials-manager';

export interface ExtractedRuleCandidate {
  title: string;
  description: string;
  category: 'general' | 'pacing' | 'accommodation' | 'activities' | 'dining' | 'pricing' | 'transportation' | 'compliance';
  rulePrompt: string;
  condition: string;
  priority: number;
  isActive: boolean;
}

export interface ExtractionResult {
  rules: ExtractedRuleCandidate[];
  source: 'ai_synthesis' | 'deterministic_parser';
  documentTitle?: string;
  totalSectionsFound: number;
}

interface LlmAiConfig {
  deepseekKey?: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  openaiKey?: string;
  openaiModel: string;
}

async function resolveAiConfig(organizationId?: string): Promise<LlmAiConfig> {
  let deepseekKey = process.env.DEEPSEEK_API_KEY;
  let deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  let deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  let openaiKey = process.env.OPENAI_API_KEY;
  let openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (organizationId) {
    const deepseekInteg = await getTenantIntegration(organizationId, 'deepseek');
    if (deepseekInteg?.credentials?.apiKey) {
      deepseekKey = deepseekInteg.credentials.apiKey;
      if (deepseekInteg.metadata?.baseUrl) {
        deepseekBaseUrl = deepseekInteg.metadata.baseUrl.replace(/\/+$/, '');
      }
      if (deepseekInteg.metadata?.model) {
        deepseekModel = deepseekInteg.metadata.model;
      }
    }

    const openaiInteg = await getTenantIntegration(organizationId, 'openai');
    if (openaiInteg?.credentials?.apiKey) {
      openaiKey = openaiInteg.credentials.apiKey;
      if (openaiInteg.metadata?.model) {
        openaiModel = openaiInteg.metadata.model;
      }
    }
  }

  return { deepseekKey, deepseekBaseUrl, deepseekModel, openaiKey, openaiModel };
}

/**
 * Deterministically parses structured sections from plain text documents (e.g. 1. Purpose, 2. Information to extract...).
 */
export function parseSectionsDeterministically(rawText: string): ExtractedRuleCandidate[] {
  const text = rawText.trim();
  if (!text) return [];

  // Split into lines
  const lines = text.split(/\r?\n/);
  const sections: { rawTitle: string; contentLines: string[] }[] = [];

  // Regex to detect section headers:
  // Examples: "1. Purpose", "1) Purpose", "Section 1: Purpose", "## 1. Purpose", "### Information to extract"
  const sectionHeaderRegex = /^\s*(?:(?:Section\s+)?(\d+|[A-Z]|[IVXLCDM]+)[\.\:\)]|\#{1,4})\s+([^\r\n]+)$/i;

  let currentTitle: string | null = null;
  let currentContent: string[] = [];
  let preamble: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(sectionHeaderRegex);

    if (match) {
      if (currentTitle) {
        sections.push({
          rawTitle: currentTitle,
          contentLines: currentContent,
        });
        currentContent = [];
      } else if (preamble.length > 0) {
        // Collect any pre-document title if present
        currentContent = [];
      }
      currentTitle = match[2].trim();
    } else {
      if (currentTitle) {
        currentContent.push(line);
      } else {
        preamble.push(line);
      }
    }
  }

  if (currentTitle && currentContent.length > 0) {
    sections.push({
      rawTitle: currentTitle,
      contentLines: currentContent,
    });
  }

  // If section header regex didn't find multiple sections, fall back to paragraph block parsing
  if (sections.length < 2) {
    const blocks = text.split(/\n\s*\n+/);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      if (block.length < 15) continue;

      const firstLineBreak = block.indexOf('\n');
      let title = `Rule Section ${i + 1}`;
      let body = block;

      if (firstLineBreak > 0 && firstLineBreak < 80) {
        title = block.slice(0, firstLineBreak).replace(/^[\#\*\-\s\d\.\:\)]+/, '').trim();
        body = block.slice(firstLineBreak).trim();
      }

      sections.push({
        rawTitle: title,
        contentLines: [body],
      });
    }
  }

  // Map each parsed section to an ExtractedRuleCandidate
  return sections
    .map((s, idx) => {
      const rawTitle = s.rawTitle
        .replace(/^[\#\*\-\s\d\.\:\)]+/, '')
        .replace(/\s*\(sample\s*i\s*have\s*added\)/gi, '')
        .trim();

      const title = rawTitle.length > 2
        ? rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1)
        : `Rule Directive ${idx + 1}`;

      const content = s.contentLines.join('\n').trim();
      if (!content || content.length < 10) return null;

      // Category detection: Title keywords have highest precedence, followed by body content
      const titleLower = title.toLowerCase();
      const contentLower = content.toLowerCase();
      const combined = `${titleLower} ${contentLower}`;
      let category: ExtractedRuleCandidate['category'] = 'general';

      if (
        titleLower.includes('check') ||
        titleLower.includes('compliance') ||
        titleLower.includes('source') ||
        titleLower.includes('company') ||
        titleLower.includes('term') ||
        titleLower.includes('content flow')
      ) {
        category = 'compliance';
      } else if (
        titleLower.includes('pricing') ||
        titleLower.includes('price') ||
        titleLower.includes('rate') ||
        titleLower.includes('quotation') ||
        titleLower.includes('inclusion') ||
        titleLower.includes('exclusion')
      ) {
        category = 'pricing';
      } else if (
        titleLower.includes('pacing') ||
        titleLower.includes('daily') ||
        titleLower.includes('schedule') ||
        titleLower.includes('date') ||
        titleLower.includes('time') ||
        titleLower.includes('planning') ||
        titleLower.includes('duration')
      ) {
        category = 'pacing';
      } else if (
        titleLower.includes('accommodation') ||
        titleLower.includes('hotel') ||
        titleLower.includes('room') ||
        titleLower.includes('resort')
      ) {
        category = 'accommodation';
      } else if (
        titleLower.includes('dining') ||
        titleLower.includes('meal') ||
        titleLower.includes('diet') ||
        titleLower.includes('food') ||
        titleLower.includes('cuisine')
      ) {
        category = 'dining';
      } else if (
        titleLower.includes('transport') ||
        titleLower.includes('transfer') ||
        titleLower.includes('flight') ||
        titleLower.includes('chauffeur')
      ) {
        category = 'transportation';
      } else if (
        titleLower.includes('activit') ||
        titleLower.includes('experience') ||
        titleLower.includes('attraction') ||
        titleLower.includes('sightseeing') ||
        titleLower.includes('tour')
      ) {
        category = 'activities';
      } else {
        // Fallback to body scan
        if (
          contentLower.includes('pricing') ||
          contentLower.includes('quotation') ||
          contentLower.includes('package price') ||
          contentLower.includes('inclusions and exclusions')
        ) {
          category = 'pricing';
        } else if (
          contentLower.includes('pacing') ||
          contentLower.includes('daily itinerary') ||
          contentLower.includes('flight timings') ||
          contentLower.includes('transit buffer')
        ) {
          category = 'pacing';
        } else if (
          contentLower.includes('compliance') ||
          contentLower.includes('sources of truth') ||
          contentLower.includes('gstin') ||
          contentLower.includes('company profile')
        ) {
          category = 'compliance';
        } else if (contentLower.includes('hotel category') || contentLower.includes('accommodation')) {
          category = 'accommodation';
        } else if (contentLower.includes('airport transfer') || contentLower.includes('chauffeur')) {
          category = 'transportation';
        } else if (contentLower.includes('attractions') || contentLower.includes('excursions')) {
          category = 'activities';
        } else if (contentLower.includes('breakfast') || contentLower.includes('dietary')) {
          category = 'dining';
        }
      }

      // Priority detection (1 to 3)
      let priority = 2; // Default High
      if (
        combined.includes('must') ||
        combined.includes('strictly') ||
        combined.includes('mandatory') ||
        combined.includes('never') ||
        combined.includes('checks before') ||
        combined.includes('required content flow') ||
        combined.includes('pricing rules') ||
        combined.includes('sources of information')
      ) {
        priority = 3; // Strict / Mandatory
      } else if (combined.includes('optional') || combined.includes('informative') || combined.includes('suggest')) {
        priority = 1; // Standard
      }

      // Condition detection
      let condition = 'all';
      if (combined.includes('child') || combined.includes('family') || combined.includes('kids')) {
        condition = 'has_children';
      } else if (combined.includes('luxury') || combined.includes('5-star') || combined.includes('5star')) {
        condition = 'luxury_5star';
      }

      // Generate a clean 1-sentence description
      const firstSentence = content.split(/[\.\r\n]/)[0]?.trim();
      const description = firstSentence && firstSentence.length > 15 && firstSentence.length < 150
        ? firstSentence
        : `Enforces standard operational directives for ${title.toLowerCase()}.`;

      return {
        title: title.slice(0, 140),
        description: description.slice(0, 450),
        category,
        rulePrompt: content.slice(0, 8000),
        condition,
        priority,
        isActive: true,
      };
    })
    .filter((r): r is ExtractedRuleCandidate => r !== null && r.rulePrompt.length >= 10);
}

/**
 * Extracts and structures rules from plain text using AI LLM if available, with deterministic fallback.
 */
export async function extractRulesFromPlainText(
  plainText: string,
  organizationId?: string
): Promise<ExtractionResult> {
  const cleanInput = plainText.trim();
  if (!cleanInput) {
    return { rules: [], source: 'deterministic_parser', totalSectionsFound: 0 };
  }

  // 1. Attempt AI LLM Extraction if tenant has AI keys configured (skipped during unit testing)
  const aiConfig = await resolveAiConfig(organizationId);

  if (process.env.NODE_ENV !== 'test' && (aiConfig.deepseekKey || aiConfig.openaiKey)) {
    const systemPrompt = `You are an elite Travel Operations and AI Itinerary Systems Architect.
Analyze the user's provided travel agency rules, standard operating procedures (SOPs), or guideline document, and extract every operational rule and formatting directive into discrete, structured itinerary preparation rules.

For each rule, produce a JSON object with:
- "title": Concise, descriptive name (e.g. "Information Extraction Protocol", "Missing Information Defaults", "Itinerary Planning & Geographic Sequencing", "Pricing Rules & Rate Authorisation", "Daily Itinerary Format & Sequence", "Inclusions & Exclusions Governance").
- "category": Must be one of exactly: "general", "pacing", "accommodation", "activities", "dining", "pricing", "transportation", "compliance".
- "description": 1 concise sentence summarizing the objective.
- "rulePrompt": Detailed, explicit operational directive containing the exact instructions, required behaviors, bullet points, tables, and constraints for the AI concierge.
- "condition": Condition where this rule triggers (e.g. "all", "has_children", "luxury_5star", or "all"). Default to "all".
- "priority": Integer from 1 to 3 (3 = Strict/Mandatory, 2 = High Priority, 1 = Standard). Assign 3 to mandatory checks, pricing, content order, and data integrity.
- "isActive": true

Output format MUST be strictly a JSON object:
{
  "documentTitle": "Title of the document if identified",
  "rules": [
    {
      "title": "...",
      "category": "...",
      "description": "...",
      "rulePrompt": "...",
      "condition": "all",
      "priority": 3,
      "isActive": true
    }
  ]
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Please parse and structure all the rules from the following agency document into discrete operational rules:\n\n${cleanInput.slice(0, 45000)}`,
      },
    ];

    try {
      // Try DeepSeek first
      if (aiConfig.deepseekKey) {
        const isTestEnv = (process.env.NODE_ENV as string) === 'test' || Boolean(process.env.VITEST);
        const timeoutMs = isTestEnv ? 4000 : 35000;
        const res = await fetch(`${aiConfig.deepseekBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiConfig.deepseekKey}`,
          },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model: aiConfig.deepseekModel,
            response_format: { type: 'json_object' },
            messages,
            temperature: 0.2,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
          if (Array.isArray(parsed.rules) && parsed.rules.length > 0) {
            const validRules: ExtractedRuleCandidate[] = parsed.rules.map((r: any) => ({
              title: String(r.title || 'Itinerary Rule').slice(0, 140),
              description: String(r.description || '').slice(0, 450),
              category: [
                'general',
                'pacing',
                'accommodation',
                'activities',
                'dining',
                'pricing',
                'transportation',
                'compliance',
              ].includes(r.category)
                ? r.category
                : 'general',
              rulePrompt: String(r.rulePrompt || r.prompt || r.instruction || '').slice(0, 8000),
              condition: String(r.condition || 'all').slice(0, 50),
              priority: Number(r.priority) >= 1 && Number(r.priority) <= 3 ? Number(r.priority) : 2,
              isActive: r.isActive !== false,
            }));

            if (validRules.length > 0) {
              return {
                rules: validRules,
                source: 'ai_synthesis',
                documentTitle: parsed.documentTitle,
                totalSectionsFound: validRules.length,
              };
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[ItineraryRulesExtractor] AI LLM extraction warning, falling back to deterministic parser:', err?.message || err);
    }
  }

  // 2. High-Fidelity Deterministic Section Parser
  const deterministicRules = parseSectionsDeterministically(cleanInput);

  return {
    rules: deterministicRules,
    source: 'deterministic_parser',
    totalSectionsFound: deterministicRules.length,
  };
}
