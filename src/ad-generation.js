// Phase 3: AI Ad Generation Service for Vercel
import { AirtableClient } from './airtableClient.js';
import Anthropic from '@anthropic-ai/sdk';

export class AdGenerationService {
  constructor() {
    this.airtable = new AirtableClient();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async generateAdVariants({ adId, campaignId, adGroupId, campaignName, adGroupName, finalUrl }) {
    try {
      console.log(`Starting ad generation for Ad ID: ${adId}`);

      // 1. Collect target keywords for context
      const targetKeywords = await this.getTargetKeywords({ campaignId, adGroupId });

      // 2. Generate variants using Claude (no source ad content)
      const variants = await this.generateWithClaude({
        campaignName,
        adGroupName,
        finalUrl,
        targetKeywords
      });

      // 4. Validate generated content
      const validatedVariants = variants.map(variant => this.validateAdCopy(variant));

      // 5. Create records in Airtable
      const adGeneratorRecords = await this.createAdGeneratorRecords({
        campaignId,
        adGroupId,
        variants: validatedVariants,
        campaignName,
        adGroupName,
        adId,
        finalUrl
      });

      console.log(`Generated ${validatedVariants.length} variants, created ${adGeneratorRecords.length} Ad Generator records`);

      return {
        variantsGenerated: validatedVariants.length,
        adGeneratorRecords: adGeneratorRecords.length,
        variants: validatedVariants
      };

    } catch (error) {
      console.error('Error in generateAdVariants:', error);
      throw error;
    }
  }

  async getTargetKeywords({ campaignId, adGroupId }) {
    try {
      // Try to pull top keywords by Ad Group first, fallback to Campaign
      let records = [];
      if (adGroupId) {
        records = await this.airtable.getRecords('Keywords', {
          filterByFormula: `{Ad Group ID} = "${adGroupId}"`,
          maxRecords: 15
        });
      }
      if ((!records || records.length === 0) && campaignId) {
        records = await this.airtable.getRecords('Keywords', {
          filterByFormula: `{Campaign ID} = "${campaignId}"`,
          maxRecords: 15
        });
      }
      const texts = (records || []).map(r => r.get('Keyword Text')).filter(Boolean);
      // Deduplicate and trim
      const unique = Array.from(new Set(texts.map(t => String(t).trim()))).slice(0, 15);
      return unique;
    } catch (err) {
      console.error('Error fetching target keywords:', err);
      return [];
    }
  }

  async getSourceAdContent(adId) {
    try {
      // Get the source ad record from Airtable
      const records = await this.airtable.getRecords('Ads', {
        filterByFormula: `{Ad ID} = "${adId}"`
      });

      if (records.length === 0) {
        console.log(`No source ad found for ID: ${adId}`);
        return null;
      }

      const record = records[0];
      return {
        headlines: record.get('Headlines') || '',
        descriptions: record.get('Descriptions') || '',
        path1: record.get('Path1') || '',
        path2: record.get('Path2') || ''
      };

    } catch (error) {
      console.error('Error fetching source ad content:', error);
      return null;
    }
  }

  async generateWithClaude({ campaignName, adGroupName, finalUrl, targetKeywords }) {
    try {
      const prompt = this.buildPrompt({
        campaignName,
        adGroupName,
        finalUrl,
        targetKeywords
      });
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
        max_tokens: Math.min(Number(process.env.CLAUDE_MAX_TOKENS || 1200), 4000),
        temperature: Number(process.env.CLAUDE_TEMPERATURE || 0.7),
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      const content = (response?.content || [])
        .map(p => (typeof p === 'string' ? p : (p.text || '')))
        .join('\n');
      try {
        return this.parseClaudeResponse(content);
      } catch (parseErr) {
        const snippet = String(content).slice(0, 600);
        console.warn('Claude output (first 600 chars):\n' + snippet);
        // Ask Claude to reformat strictly into required line format
        const reformatPrompt = [
          'Reformat the following content into EXACTLY this plain-text format with no extra commentary, no markdown, no JSON:',
          'VARIANT 1: [Strategy Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]',
          'VARIANT 2: [Strategy Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]',
          'VARIANT 3: [Strategy Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]',
          'Only output three VARIANT lines exactly as specified. Do not include any other lines.',
          '--- CONTENT TO REFORMAT START ---',
          snippet,
          '--- CONTENT TO REFORMAT END ---'
        ].join('\n');
        const reformatRes = await this.anthropic.messages.create({
          model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
          max_tokens: 800,
          temperature: 0.2,
          messages: [ { role: 'user', content: reformatPrompt } ]
        });
        const reformatted = (reformatRes?.content || [])
          .map(p => (typeof p === 'string' ? p : (p.text || '')))
          .join('\n');
        return this.parseClaudeResponse(reformatted);
      }

    } catch (error) {
      console.error('Claude generation error:', error);
      throw new Error(`Claude generation failed: ${error.message}`);
    }
  }

  buildPrompt({ campaignName, adGroupName, finalUrl, targetKeywords }) {
    const keywords = (targetKeywords || []).join(', ');

    const lines = [];
    lines.push('ABSOLUTE REQUIREMENT: Generate 3 COMPLETELY UNIQUE Google Ads variants. Each variant must be 100% different from the others.');
    lines.push('');
    lines.push('CRITICAL ANTI-SIMILARITY RULES:');
    lines.push('1. NO WORD REPETITION: Each headline must use completely different words (except target keywords)');
    lines.push('2. NO STRUCTURE REPETITION: Each variant must use different sentence patterns');
    lines.push('3. NO PHRASE REPETITION: No similar phrases across variants');
    lines.push('4. NO CONCEPT REPETITION: Each variant must focus on different benefits/angles');
    lines.push('5. NO FORMAT REPETITION: Mix questions, statements, commands, numbers, exclamations');
    lines.push('');
    lines.push('MANDATORY VARIANT DIFFERENTIATION:');
    lines.push('VARIANT 1 - EMOTIONAL PROBLEM FOCUS:');
    lines.push('Headline 1: Question about problem (max 30 chars)');
    lines.push('Headline 2: Emotional benefit/solution (max 30 chars)');
    lines.push('Headline 3: Social proof/authority (max 30 chars)');
    lines.push('Description 1: Problem-focused with empathy (max 90 chars)');
    lines.push('Description 2: Solution-focused with guarantee (max 90 chars)');
    lines.push('Tone: Empathetic, understanding, supportive');
    lines.push('Words to use: "Struggling", "Finally", "Relief", "Support", "Help"');
    lines.push('');
    lines.push('VARIANT 2 - SCIENTIFIC/AUTHORITY FOCUS:');
    lines.push('Headline 1: Scientific/clinical claim (max 30 chars)');
    lines.push('Headline 2: Specific benefit with number (max 30 chars)');
    lines.push('Headline 3: Expert endorsement (max 30 chars)');
    lines.push('Description 1: Research-backed with data (max 90 chars)');
    lines.push('Description 2: Clinical proof with results (max 90 chars)');
    lines.push('Tone: Professional, authoritative, evidence-based');
    lines.push('Words to use: "Clinically", "Proven", "Research", "Study", "Doctor"');
    lines.push('');
    lines.push('VARIANT 3 - URGENCY/ACTION FOCUS:');
    lines.push('Headline 1: Urgent action command (max 30 chars)');
    lines.push('Headline 2: Limited time offer (max 30 chars)');
    lines.push('Headline 3: Immediate benefit (max 30 chars)');
    lines.push('Description 1: Urgency with scarcity (max 90 chars)');
    lines.push('Description 2: Action with immediate result (max 90 chars)');
    lines.push('Tone: Urgent, action-oriented, time-sensitive');
    lines.push('Words to use: "Now", "Today", "Limited", "Act", "Quick"');
    lines.push('');
    lines.push('HEADLINE STRUCTURE REQUIREMENTS:');
    lines.push('Variant 1: Question → Benefit → Proof');
    lines.push('Variant 2: Claim → Number → Authority');
    lines.push('Variant 3: Command → Offer → Result');
    lines.push('');
    lines.push('DESCRIPTION STRUCTURE REQUIREMENTS:');
    lines.push('Variant 1: Problem → Solution → Guarantee');
    lines.push('Variant 2: Research → Results → Proof');
    lines.push('Variant 3: Urgency → Benefit → Action');
    lines.push('');
    lines.push('WORD REPLACEMENT DICTIONARY:');
    lines.push('Instead of "Low" use: "Decreased", "Reduced", "Diminished", "Weakened"');
    lines.push('Instead of "Sex Drive" use: "Libido", "Desire", "Passion", "Intimacy"');
    lines.push('Instead of "Natural" use: "Herbal", "Organic", "Plant-based", "Holistic"');
    lines.push('Instead of "Help" use: "Solution", "Support", "Aid", "Assistance"');
    lines.push('Instead of "Top 5" use: "Best", "Leading", "Proven", "Recommended"');
    lines.push('Instead of "Enhancers" use: "Boosters", "Improvers", "Restorers", "Activators"');
    lines.push('Instead of "2025" use: "This Year", "Now", "Today", "Latest"');
    lines.push('Instead of "Struggling" use: "Battling", "Fighting", "Dealing", "Coping"');
    lines.push('Instead of "Clinically" use: "Scientifically", "Medically", "Research-proven", "Tested"');
    lines.push('Instead of "Desire" use: "Passion", "Intimacy", "Libido", "Drive"');
    lines.push('');
    lines.push('FORBIDDEN SIMILARITIES:');
    lines.push('- Do NOT repeat any words across variants (except target keywords)');
    lines.push('- Do NOT use similar sentence structures');
    lines.push('- Do NOT use similar phrases or patterns');
    lines.push('- Do NOT create variants that differ by only 1-2 words');
    lines.push('- Do NOT use the same approach for multiple variants');
    lines.push('');
    lines.push('DESTINATION URL ANALYSIS:');
    lines.push('Analyze URL to determine site type:');
    lines.push('E-commerce: Product pages, shopping, checkout');
    lines.push('Lead Generation: Contact forms, consultations');
    lines.push('Review Sites: Comparisons, rankings, reviews');
    lines.push('Service Providers: Local businesses, services');
    lines.push('Content/Info: Blogs, guides, educational');
    lines.push('');
    lines.push('TECHNICAL REQUIREMENTS:');
    lines.push('Headlines: Max 30 characters each');
    lines.push('Descriptions: Max 90 characters each');
    lines.push('Display Paths: Max 15 characters each');
    lines.push('');
    lines.push('OUTPUT FORMAT (EXACT):');
    lines.push('DETECTED SITE TYPE: [Site Type]');
    lines.push('VARIANT 1: [Approach Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 2: [Approach Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 3: [Approach Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('');
    lines.push('INPUT DATA:');
    lines.push(`DESTINATION URL: ${finalUrl || ''}`);
    lines.push(`TARGET KEYWORDS: ${(targetKeywords || []).join(', ')}`);
    lines.push(`CAMPAIGN FOCUS: ${[campaignName, adGroupName].filter(Boolean).join(' - ')}`);
    lines.push('');
    lines.push('FINAL REMINDER: Each variant must be 100% unique. No similarities in words, structure, or approach allowed.');

    return lines.join('\n');
  }

  parseClaudeResponse(content) {
    try {
      if (!content || typeof content !== 'string') {
        throw new Error('Empty response content');
      }
      const text = content.trim();

      // Strategy A: Direct VARIANT lines
      const blocks = text.match(/VARIANT\s*\d:[\s\S]*?(?=(\nVARIANT\s*\d:|$))/gi) || [];
      const collectFromBlocks = () => {
        const variants = [];
        for (const block of blocks) {
          const h = (block.match(/Headlines:\s*([^\n]+)/i)?.[1] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0,3);
          const d = (block.match(/Descriptions:\s*([^\n]+)/i)?.[1] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0,2);
          const pLine = block.match(/Paths?:\s*([^\n]+)/i)?.[1] || '';
          const p = pLine.split('/').map(s => s.trim()).filter(Boolean);
          const path1 = (p[0] || '').slice(0,15);
          const path2 = (p[1] || '').slice(0,15);
          if (h.length === 3 && d.length === 2) {
            variants.push({ headlines: h, descriptions: d, path1, path2 });
          }
        }
        return variants;
      };
      let variants = collectFromBlocks();

      // Strategy B: JSON fallback if present
      if (!variants.length) {
        const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const obj = JSON.parse(jsonMatch[0]);
            const arr = Array.isArray(obj) ? obj : (obj.variants || []);
            const mapped = (arr || []).map(v => ({
              headlines: (v.headlines || []).slice(0,3).map(String),
              descriptions: (v.descriptions || []).slice(0,2).map(String),
              path1: String(v.path1 || '').slice(0,15),
              path2: String(v.path2 || '').slice(0,15)
            })).filter(v => v.headlines.length === 3 && v.descriptions.length === 2);
            if (mapped.length) variants = mapped;
          } catch { /* ignore */ }
        }
      }

      // Strategy C: Heuristic lines (Headlines:, Descriptions:, Paths:) anywhere
      if (!variants.length) {
        const variantLike = text.split(/\n\s*\n/).filter(s => /Headlines:/i.test(s) && /Descriptions:/i.test(s));
        const mapped = variantLike.slice(0,3).map(block => {
          const h = (block.match(/Headlines:\s*([^\n]+)/i)?.[1] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0,3);
          const d = (block.match(/Descriptions:\s*([^\n]+)/i)?.[1] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0,2);
          const p = (block.match(/Paths?:\s*([^\n]+)/i)?.[1] || '').split('/').map(s => s.trim()).filter(Boolean);
          const path1 = (p[0] || '').slice(0,15);
          const path2 = (p[1] || '').slice(0,15);
          if (h.length === 3 && d.length === 2) {
            return { headlines: h, descriptions: d, path1, path2 };
          }
          return null;
        }).filter(Boolean);
        if (mapped.length) variants = mapped;
      }

      if (!variants.length) throw new Error('Failed to extract variants');
      return variants;
    } catch (error) {
      console.error('Error parsing Claude response:', error);
      throw new Error(`Failed to parse Claude response: ${error.message}`);
    }
  }

  async createAdGeneratorRecords({ campaignId, adGroupId, variants, campaignName, adGroupName, adId, finalUrl }) {
    try {
      const records = variants.map((variant, index) => ({
        fields: {
          'Campaign ID': campaignId,
          'Ad Group ID': adGroupId,
          'Campaign Name': campaignName || '',
          'Ad Group Name': adGroupName || '',
          'Source Ad ID': adId,
          'Headline 1': variant.headlines[0] || '',
          'Headline 2': variant.headlines[1] || '',
          'Headline 3': variant.headlines[2] || '',
          'Description 1': variant.descriptions[0] || '',
          'Description 2': variant.descriptions[1] || '',
          'Path1': variant.path1 || '',
          'Path2': variant.path2 || '',
          'Final URL': finalUrl || '',
          'To Upload Table': false,
          'Validation Status': '✅ Ready',
          'Generation Status': 'Generated',
          'Created At': new Date().toISOString()
        }
      }));

      const createdRecords = await this.airtable.createRecords('Ad Generator', records);
      console.log(`Created ${createdRecords.length} Ad Generator records`);
      return createdRecords;

    } catch (error) {
      console.error('Error creating Ad Generator records:', error);
      throw error;
    }
  }


  validateAdCopy(variant) {
    // Validate headlines (max 30 characters each)
    const validatedHeadlines = variant.headlines.map(headline => {
      if (headline.length > 30) {
        console.warn(`Headline too long (${headline.length} chars): ${headline}`);
        return headline.substring(0, 30);
      }
      return headline;
    });

    // Validate descriptions (max 90 characters each)
    const validatedDescriptions = variant.descriptions.map(description => {
      if (description.length > 90) {
        console.warn(`Description too long (${description.length} chars): ${description}`);
        return description.substring(0, 90);
      }
      return description;
    });

    return {
      ...variant,
      headlines: validatedHeadlines,
      descriptions: validatedDescriptions
    };
  }
}
