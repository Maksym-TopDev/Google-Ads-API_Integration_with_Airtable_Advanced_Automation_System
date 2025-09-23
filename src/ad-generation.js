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
    lines.push('Generate 3 RADICALLY DIFFERENT Google Ads variants. Each must be UNIQUE in structure, words, and approach.');
    lines.push('CRITICAL: Think of 3 completely different customer personas and messaging strategies.');
    lines.push('Return ONLY plain text in the required Output Format. No JSON. No markdown. No extra commentary.');
    
    lines.push('RADICAL DIFFERENTIATION REQUIREMENTS:');
    lines.push('VARIANT 1 - SCIENTIFIC/MEDICAL APPROACH:');
    lines.push('Target: Health-conscious, research-oriented customers');
    lines.push('Tone: Clinical, authoritative, evidence-based');
    lines.push('Structure: Fact-based statements, medical terminology, research focus');
    lines.push('Headline Examples: "Clinical Study Results", "FDA-Approved Solution", "Medical Research Shows"');
    lines.push('NO words like: natural, discover, help, guide, top, best');
    
    lines.push('VARIANT 2 - LIFESTYLE/WELLNESS APPROACH:');
    lines.push('Target: Wellness enthusiasts, lifestyle-focused customers');
    lines.push('Tone: Warm, personal, holistic');
    lines.push('Structure: Personal stories, lifestyle benefits, emotional connection');
    lines.push('Headline Examples: "Transform Your Life", "Feel Amazing Again", "Your Journey Starts"');
    lines.push('NO words like: clinical, medical, study, research, approved');
    
    lines.push('VARIANT 3 - RESULTS/PERFORMANCE APPROACH:');
    lines.push('Target: Results-driven, performance-focused customers');
    lines.push('Tone: Confident, direct, outcome-focused');
    lines.push('Structure: Bold claims, specific results, performance metrics');
    lines.push('Headline Examples: "Guaranteed Results", "Proven Formula", "Maximum Performance"');
    lines.push('NO words like: wellness, journey, feel, transform, lifestyle');
    
    lines.push('MANDATORY STRUCTURAL DIFFERENCES:');
    lines.push('Variant 1: Use numbers, percentages, scientific terms, clinical language');
    lines.push('Variant 2: Use emotional words, personal pronouns, lifestyle benefits');
    lines.push('Variant 3: Use power words, guarantees, performance metrics, bold claims');
    
    lines.push('WORD EXCLUSION RULES:');
    lines.push('Each variant must avoid the primary vocabulary of the other two variants');
    lines.push('If Variant 1 uses "clinical," Variants 2&3 cannot use "clinical" or similar');
    lines.push('If Variant 2 uses "wellness," Variants 1&3 cannot use "wellness" or similar');
    lines.push('If Variant 3 uses "guaranteed," Variants 1&2 cannot use "guaranteed" or similar');
    
    lines.push('TECHNICAL REQUIREMENTS');
    lines.push('Character Limits (Strict):');
    lines.push('Headlines: Maximum 30 characters each');
    lines.push('Descriptions: Maximum 90 characters each');
    lines.push('Display Paths: Maximum 15 characters each');
    
    lines.push('OUTPUT FORMAT');
    lines.push('DETECTED SITE TYPE: [Site Type] STRATEGY APPROACH: [Brief explanation of approach based on site type]');
    lines.push('VARIANT 1: [Scientific/Medical Strategy] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 2: [Lifestyle/Wellness Strategy] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 3: [Results/Performance Strategy] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('Do not output markdown code fences or JSON. Only the lines above.');
    
    lines.push('REQUIRED INPUTS:');
    lines.push(`DESTINATION URL: ${finalUrl || ''}`);
    lines.push(`TARGET KEYWORDS: ${(targetKeywords || []).join(', ')}`);
    lines.push(`CAMPAIGN FOCUS: ${[campaignName, adGroupName].filter(Boolean).join(' - ')}`);
    
    lines.push('FINAL REMINDER: Each variant must sound like it was written by a completely different person for a completely different audience. NO overlapping vocabulary, structure, or approach.');

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
