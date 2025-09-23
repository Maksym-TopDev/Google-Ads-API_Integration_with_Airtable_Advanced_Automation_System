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
        temperature: Number(process.env.CLAUDE_TEMPERATURE || 0.9),
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
    lines.push('Generate 3 COMPLETELY DIFFERENT Google Ads variants. Each variant must be UNIQUE and DISTINCT.');
    lines.push('CRITICAL: Each variant must use DIFFERENT angles, tones, and approaches. NO SIMILARITY between variants.');
    lines.push('Return ONLY plain text in the required Output Format. No JSON. No markdown. No extra commentary.');
    
    lines.push('MANDATORY VARIETY REQUIREMENTS:');
    lines.push('1. DIFFERENT TONE: Variant 1 = Direct/Bold, Variant 2 = Friendly/Conversational, Variant 3 = Professional/Authoritative');
    lines.push('2. DIFFERENT ANGLES: Variant 1 = Problem-focused, Variant 2 = Solution-focused, Variant 3 = Benefit-focused');
    lines.push('3. DIFFERENT CTAs: Variant 1 = Action words (Buy/Get/Order), Variant 2 = Discovery words (Learn/Discover/Find), Variant 3 = Urgency words (Now/Today/Limited)');
    lines.push('4. DIFFERENT KEYWORDS: Use different primary keywords in each variant headline');
    lines.push('5. DIFFERENT MESSAGING: Each variant must tell a completely different story');
    
    lines.push('DESTINATION URL ANALYSIS');
    lines.push('Step 1: Analyze the destination URL to determine site type:');
    lines.push('Site Types:');
    lines.push('E-commerce/Direct Sales: Product pages, checkout flows, brand websites selling products');
    lines.push('Lead Generation: Contact forms, quote requests, consultation bookings, capture pages');
    lines.push('Review/Comparison Sites: Independent reviews, "best of" lists, product comparisons, ranking sites');
    lines.push('Service Providers: Local businesses, professional services, SaaS platforms');
    lines.push('Content/Information: Blogs, guides, educational resources, informational content');
    
    lines.push('VARIANT DIFFERENTIATION STRATEGIES:');
    lines.push('VARIANT 1 - PROBLEM/SOLUTION ANGLE:');
    lines.push('Focus on pain points, frustrations, or challenges the audience faces');
    lines.push('Use direct, bold language that addresses the problem head-on');
    lines.push('Headlines should highlight the problem or solution');
    lines.push('Examples: "Tired of [Problem]?", "Stop [Problem] Now", "Fix [Problem] Today"');
    
    lines.push('VARIANT 2 - BENEFIT/VALUE ANGLE:');
    lines.push('Focus on positive outcomes, benefits, and value propositions');
    lines.push('Use friendly, conversational tone that builds trust');
    lines.push('Headlines should emphasize benefits and results');
    lines.push('Examples: "Get [Benefit] Fast", "Enjoy [Benefit] Today", "Discover [Benefit]"');
    
    lines.push('VARIANT 3 - URGENCY/SCARCITY ANGLE:');
    lines.push('Focus on limited time, exclusive offers, or immediate action needed');
    lines.push('Use professional, authoritative tone that creates urgency');
    lines.push('Headlines should create FOMO or time pressure');
    lines.push('Examples: "Limited Time Offer", "Only [X] Left", "Ends Today"');
    
    lines.push('TECHNICAL REQUIREMENTS');
    lines.push('Character Limits (Strict):');
    lines.push('Headlines: Maximum 30 characters each');
    lines.push('Descriptions: Maximum 90 characters each');
    lines.push('Display Paths: Maximum 15 characters each');
    
    lines.push('CONTENT DIFFERENTIATION RULES:');
    lines.push('1. NO SHARED WORDS: Each variant must use completely different primary words');
    lines.push('2. DIFFERENT STRUCTURE: Variant 1 = Question/Problem, Variant 2 = Statement/Benefit, Variant 3 = Command/Urgency');
    lines.push('3. DIFFERENT EMOTIONS: Variant 1 = Frustration/Relief, Variant 2 = Hope/Excitement, Variant 3 = Urgency/Fear of Missing Out');
    lines.push('4. DIFFERENT NUMBERS: Use different numbers, percentages, or quantities in each variant');
    lines.push('5. DIFFERENT PATHS: Each variant must have unique display paths that support its message');
    
    lines.push('OUTPUT FORMAT');
    lines.push('DETECTED SITE TYPE: [Site Type] STRATEGY APPROACH: [Brief explanation of approach based on site type]');
    lines.push('VARIANT 1: [Problem/Solution Strategy] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 2: [Benefit/Value Strategy] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 3: [Urgency/Scarcity Strategy] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('Do not output markdown code fences or JSON. Only the lines above.');
    
    lines.push('REQUIRED INPUTS:');
    lines.push(`DESTINATION URL: ${finalUrl || ''}`);
    lines.push(`TARGET KEYWORDS: ${(targetKeywords || []).join(', ')}`);
    lines.push(`CAMPAIGN FOCUS: ${[campaignName, adGroupName].filter(Boolean).join(' - ')}`);
    
    lines.push('REMEMBER: Each variant must be COMPLETELY DIFFERENT. No similar words, tones, or approaches between variants.');

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
