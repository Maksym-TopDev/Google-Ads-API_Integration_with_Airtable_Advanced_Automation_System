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
      return this.parseClaudeResponse(content);

    } catch (error) {
      console.error('Claude generation error:', error);
      throw new Error(`Claude generation failed: ${error.message}`);
    }
  }

  buildPrompt({ campaignName, adGroupName, finalUrl, targetKeywords }) {
    const keywords = (targetKeywords || []).join(', ');

    const lines = [];
    lines.push('Generate 3 optimized Google Ads variants based on the destination URL and landing page type.');
    lines.push('DESTINATION URL ANALYSIS');
    lines.push('Step 1: Analyze the destination URL to determine site type:');
    lines.push('Site Types:');
    lines.push('E-commerce/Direct Sales: Product pages, checkout flows, brand websites selling products');
    lines.push('Lead Generation: Contact forms, quote requests, consultation bookings, capture pages');
    lines.push('Review/Comparison Sites: Independent reviews, "best of" lists, product comparisons, ranking sites');
    lines.push('Service Providers: Local businesses, professional services, SaaS platforms');
    lines.push('Content/Information: Blogs, guides, educational resources, informational content');
    lines.push('Step 2: Adapt strategy based on detected site type:');
    lines.push('E-commerce/Direct Sales Strategy:');
    lines.push('Emphasize product benefits, pricing, promotions');
    lines.push('Use action words: "Buy," "Shop," "Save," "Get," "Order"');
    lines.push('Highlight guarantees, shipping, return policies');
    lines.push('Focus on immediate purchase intent');
    lines.push('Lead Generation Strategy:');
    lines.push('Focus on consultation value, expertise, problem-solving');
    lines.push('Use discovery words: "Learn," "Discover," "Find Out," "Get Quote"');
    lines.push('Emphasize free consultations, quotes, assessments');
    lines.push('Build trust before asking for contact info');
    lines.push('Review/Comparison Sites Strategy:');
    lines.push('Lead with authority and independence: "Expert-Tested," "Unbiased Review"');
    lines.push('Highlight comparison value: "We Tested 50+," "#1 Ranked," "Best Choice"');
    lines.push('Use research-oriented language: "Top Rated," "Winner," "Recommended"');
    lines.push('Emphasize credibility and thorough analysis');
    lines.push('Service Providers Strategy:');
    lines.push('Emphasize expertise, local presence, results');
    lines.push('Include trust signals: years in business, certifications');
    lines.push('Focus on outcomes and customer success');
    lines.push('Highlight availability and response time');
    lines.push('Content/Information Strategy:');
    lines.push('Lead with valuable insights or solutions');
    lines.push('Use educational language: "Complete Guide," "Expert Tips"');
    lines.push('Emphasize comprehensiveness and authority');
    lines.push('Focus on learning and discovery');
    lines.push('VARIANT CREATION STRATEGIES');
    lines.push('Generate 3 distinct approaches based on site type:');
    lines.push('For E-commerce/Direct Sales:');
    lines.push('Variant 1: Product-focused (features, benefits, differentiators)');
    lines.push('Variant 2: Offer-focused (deals, promotions, value propositions)');
    lines.push('Variant 3: Urgency-focused (limited time, scarcity, immediate action)');
    lines.push('For Lead Generation:');
    lines.push('Variant 1: Problem-solution focused');
    lines.push('Variant 2: Expertise/authority focused');
    lines.push('Variant 3: Free value/consultation focused');
    lines.push('For Review/Comparison Sites:');
    lines.push('Variant 1: Authority-focused ("Expert Review Reveals...")');
    lines.push('Variant 2: Comparison-focused ("We Tested X Options - This Won")');
    lines.push('Variant 3: Result-focused ("See Our #1 Recommendation")');
    lines.push('For Service Providers:');
    lines.push('Variant 1: Experience/credibility focused');
    lines.push('Variant 2: Results/outcome focused');
    lines.push('Variant 3: Local/availability focused');
    lines.push('For Content/Information:');
    lines.push('Variant 1: Educational value focused');
    lines.push('Variant 2: Comprehensive resource focused');
    lines.push('Variant 3: Expert insight focused');
    lines.push('TECHNICAL REQUIREMENTS');
    lines.push('Character Limits (Strict):');
    lines.push('Headlines: Maximum 30 characters each');
    lines.push('Descriptions: Maximum 90 characters each');
    lines.push('Display Paths: Maximum 15 characters each');
    lines.push('Content Guidelines:');
    lines.push('Headlines: Front-load primary keywords and value props, include numbers when possible');
    lines.push('Descriptions: Elaborate on headline promises with specific details and appropriate CTAs');
    lines.push('Paths: Mirror URL structure and support primary message');
    lines.push('TRUST SIGNALS BY SITE TYPE');
    lines.push('E-commerce: Free shipping, money-back guarantee, secure checkout, customer reviews');
    lines.push('Review Sites: Independent testing, unbiased analysis, expert methodology, sample sizes');
    lines.push('Lead Generation: Free consultation, no obligation, certified experts, local presence');
    lines.push('Service Providers: Licensed/insured, years of experience, satisfaction guarantee');
    lines.push('Content Sites: Expert authored, comprehensive coverage, trusted source');
    lines.push('OUTPUT FORMAT');
    lines.push('DETECTED SITE TYPE: [Site Type] STRATEGY APPROACH: [Brief explanation of approach based on site type]');
    lines.push('VARIANT 1: [Strategy Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 2: [Strategy Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2]');
    lines.push(' Paths: [Path1] / [Path2]');
    lines.push('VARIANT 3: [Strategy Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('REQUIRED INPUTS:');
    lines.push(`DESTINATION URL: ${finalUrl || ''}`);
    lines.push(`TARGET KEYWORDS: ${(targetKeywords || []).join(', ')}`);
    lines.push(`CAMPAIGN FOCUS: ${[campaignName, adGroupName].filter(Boolean).join(' - ')}`);

    return lines.join('\n');
  }

  parseClaudeResponse(content) {
    try {
      if (!content || typeof content !== 'string') {
        throw new Error('Empty response content');
      }
      // Strip common code fences/backticks
      content = content.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '');
      // 1) Try direct JSON parse
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (_) {
        // 2) Fallback: extract the first JSON object or variants array
        const variantsArrayMatch = content.match(/"variants"\s*:\s*(\[[\s\S]*?\])/);
        if (variantsArrayMatch) {
          const variantsOnly = variantsArrayMatch[1];
          const variantsParsed = JSON.parse(variantsOnly);
          if (Array.isArray(variantsParsed)) return variantsParsed;
        }
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (!objectMatch) {
          throw new Error('No JSON found in OpenAI response');
        }
        parsed = JSON.parse(objectMatch[0]);
      }

      // 3) Normalize possible shapes
      if (parsed && Array.isArray(parsed)) {
        // If model returned array at root, treat as variants
        return parsed;
      }
      if (parsed && Array.isArray(parsed.variants)) {
        return parsed.variants;
      }

      // 4) Attempt to reconstruct variants from alternative keys (VARIANT 1/2/3)
      const variantKeys = Object.keys(parsed || {}).filter(k => /variant\s*\d+/i.test(k));
      if (variantKeys.length) {
        const variants = variantKeys
          .sort()
          .map(k => parsed[k])
          .filter(v => v && Array.isArray(v.headlines) && Array.isArray(v.descriptions))
          .map(v => ({
            headlines: v.headlines.slice(0, 3),
            descriptions: v.descriptions.slice(0, 2),
            path1: (v.path1 || '').toString().slice(0, 15),
            path2: (v.path2 || '').toString().slice(0, 15)
          }));
        if (variants.length) return variants;
      }

      throw new Error('Invalid response format: missing variants array');

    } catch (error) {
      console.error('Error parsing OpenAI response:', error);
      throw new Error(`Failed to parse OpenAI response: ${error.message}`);
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
