// Phase 3: AI Ad Generation Service for Vercel
import { AirtableClient } from './airtableClient.js';
import OpenAI from 'openai';

export class AdGenerationService {
  constructor() {
    this.airtable = new AirtableClient();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateAdVariants({ adId, campaignId, adGroupId, campaignName, adGroupName, finalUrl }) {
    try {
      console.log(`Starting ad generation for Ad ID: ${adId}`);

      // 1. Get source ad content for inspiration
      const sourceAd = await this.getSourceAdContent(adId);
      
      // 2. Collect target keywords for context
      const targetKeywords = await this.getTargetKeywords({ campaignId, adGroupId });

      // 3. Generate variants using OpenAI
      const variants = await this.generateWithOpenAI({
        campaignName,
        adGroupName,
        finalUrl,
        sourceAd,
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

  async generateWithOpenAI({ campaignName, adGroupName, finalUrl, sourceAd, targetKeywords }) {
    try {
      const prompt = this.buildPrompt({
        campaignName,
        adGroupName,
        finalUrl,
        sourceAd,
        targetKeywords
      });

      // First attempt: strict schema-first prompt
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          { role: 'system', content: 'You are an expert Google Ads copywriter specializing in creating distinct, varied ad variants. Return only valid JSON that matches the requested schema.' },
          { role: 'user', content: prompt }
        ],
        temperature: Number(process.env.OPENAI_TEMPERATURE || 0.9),
        max_tokens: Math.min(Number(process.env.OPENAI_MAX_TOKENS || 1500), 1500),
      });

      let content = response.choices?.[0]?.message?.content || '';
      try {
        return this.parseOpenAIResponse(content);
      } catch (parseErr) {
        // Log preview for diagnostics (no PII)
        const preview = content.slice(0, 600);
        console.warn('Initial parse failed. Preview of raw content:', preview);

        // One-shot reformat-only retry
        const reformatPrompt = [
          'Reformat the text below into EXACTLY this JSON schema and return ONLY JSON with no markdown or code fences:',
          '{"variants":[{"headlines":["h1","h2","h3"],"descriptions":["d1","d2"],"path1":"string","path2":"string"}]}',
          'Text to convert:',
          preview
        ].join('\n');

        const retry = await this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4',
          messages: [
            { role: 'system', content: 'Return only valid JSON.' },
            { role: 'user', content: reformatPrompt }
          ],
          temperature: 0.2,
          max_tokens: 400,
        });

        content = retry.choices?.[0]?.message?.content || '';
        return this.parseOpenAIResponse(content);
      }

    } catch (error) {
      console.error('OpenAI generation error:', error);
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
  }

  buildPrompt({ campaignName, adGroupName, finalUrl, sourceAd, targetKeywords }) {
    const src = {
      headlines: sourceAd?.headlines || '',
      descriptions: sourceAd?.descriptions || '',
      path1: sourceAd?.path1 || '',
      path2: sourceAd?.path2 || ''
    };
    const keywords = (targetKeywords || []).join(', ');

    const lines = [];
    lines.push('Generate 3 optimized Google Ads variants based on the high-performing source ad and destination URL provided below.');
    lines.push('');
    lines.push('DESTINATION URL ANALYSIS');
    lines.push('First, analyze the destination URL to determine the site type and adapt strategy accordingly:');
    lines.push('');
    lines.push('Site Type Detection:');
    lines.push('- E-commerce/Direct Sales: Product pages, checkout flows, brand websites');
    lines.push('- Lead Generation: Contact forms, quote requests, consultation bookings');
    lines.push('- Review/Comparison Sites: Independent reviews, "best of" lists, product comparisons');
    lines.push('- Service Providers: Local businesses, professional services, SaaS platforms');
    lines.push('- Content/Information: Blogs, guides, educational resources');
    lines.push('');
    lines.push('URL-Based Strategy Adaptation:');
    lines.push('Based on the detected site type, adjust messaging focus:');
    lines.push('- E-commerce/Direct Sales: Emphasize product benefits, pricing, promotions');
    lines.push('  Use action words: "Buy," "Shop," "Save," "Get"');
    lines.push('  Highlight guarantees, shipping, return policies');
    lines.push('- Lead Generation: Focus on consultation value, expertise, problem-solving');
    lines.push('  Use discovery words: "Learn," "Discover," "Find Out"');
    lines.push('  Emphasize free consultations, quotes, assessments');
    lines.push('- Review/Comparison Sites: Lead with authority and independence: "Expert-Tested," "Unbiased Review"');
    lines.push('  Highlight comparison value: "We Tested 50+," "#1 Ranked"');
    lines.push('  Use research-oriented language: "Best Choice," "Top Rated," "Winner"');
    lines.push('- Service Providers: Emphasize expertise, local presence, results');
    lines.push('  Include trust signals: years in business, certifications');
    lines.push('  Focus on outcomes and customer success');
    lines.push('- Content/Information: Lead with valuable insights or solutions');
    lines.push('  Use educational language: "Complete Guide," "Expert Tips"');
    lines.push('  Emphasize comprehensiveness and authority');
    lines.push('');
    lines.push('SOURCE AD ANALYSIS');
    lines.push('IMPORTANT: Use the source ad ONLY to understand the product/service being advertised.');
    lines.push('DO NOT copy its structure, language, or approach. Create completely fresh variants.');
    lines.push('');
    lines.push('From the source ad, identify:');
    lines.push('- What product/service is being advertised (for context only)');
    lines.push('- Target audience (to understand who you\'re writing for)');
    lines.push('- General topic/keywords (to stay relevant)');
    lines.push('');
    lines.push('Then IGNORE the source ad\'s specific messaging and create 3 completely different approaches.');
    lines.push('');
    lines.push('ADAPTIVE VARIANT STRATEGIES');
    lines.push('The three variants will adapt based on the detected site type:');
    lines.push('');
    lines.push('For E-commerce/Direct Sales:');
    lines.push('- Variant 1: Product-focused (features, benefits, differentiators)');
    lines.push('- Variant 2: Offer-focused (deals, promotions, value propositions)');
    lines.push('- Variant 3: Urgency-focused (limited time, scarcity, immediate action)');
    lines.push('');
    lines.push('For Lead Generation:');
    lines.push('- Variant 1: Problem-solution focused');
    lines.push('- Variant 2: Expertise/authority focused');
    lines.push('- Variant 3: Free value/consultation focused');
    lines.push('');
    lines.push('For Review/Comparison Sites:');
    lines.push('- Variant 1: Authority-focused ("Expert Review Reveals...")');
    lines.push('- Variant 2: Comparison-focused ("We Tested X Options - This Won")');
    lines.push('- Variant 3: Result-focused ("See Our #1 Recommendation")');
    lines.push('');
    lines.push('For Service Providers:');
    lines.push('- Variant 1: Experience/credibility focused');
    lines.push('- Variant 2: Results/outcome focused');
    lines.push('- Variant 3: Local/availability focused');
    lines.push('');
    lines.push('For Content/Information:');
    lines.push('- Variant 1: Educational value focused');
    lines.push('- Variant 2: Comprehensive resource focused');
    lines.push('- Variant 3: Expert insight focused');
    lines.push('');
    lines.push('FORMAT REQUIREMENTS');
    lines.push('Technical Specifications:');
    lines.push('- 3 Headlines per variant (max 30 characters each)');
    lines.push('- 2 Descriptions per variant (max 90 characters each)');
    lines.push('- Path1 & Path2 suggestions (max 15 characters each, should reflect URL structure)');
    lines.push('');
    lines.push('Content Guidelines:');
    lines.push('Headlines:');
    lines.push('- Front-load primary keywords and value props');
    lines.push('- Include numbers, percentages, or specific benefits when possible');
    lines.push('- Adapt tone to site type (authoritative for reviews, action-oriented for e-commerce)');
    lines.push('- Ensure brand/site name fits if space allows');
    lines.push('');
    lines.push('Descriptions:');
    lines.push('- Elaborate on headline promises with specific, relevant details');
    lines.push('- Include appropriate trust signals based on site type:');
    lines.push('  * E-commerce: guarantees, shipping, returns');
    lines.push('  * Reviews: independence, testing methodology, sample size');
    lines.push('  * Services: certifications, experience, local presence');
    lines.push('  * Lead gen: free consultations, no obligation');
    lines.push('- End with compelling, site-appropriate call-to-action');
    lines.push('');
    lines.push('Display Paths:');
    lines.push('- Mirror the destination URL structure when possible');
    lines.push('- Use site-type appropriate categorization');
    lines.push('- Support the ad\'s primary message');
    lines.push('');
    lines.push('SITE-SPECIFIC TRUST SIGNALS');
    lines.push('- E-commerce: Free shipping, money-back guarantee, secure checkout, customer reviews');
    lines.push('- Review Sites: Independent testing, unbiased analysis, expert methodology, sample sizes');
    lines.push('- Lead Generation: Free consultation, no obligation, certified experts, local presence');
    lines.push('- Service Providers: Licensed/insured, years of experience, satisfaction guarantee, local');
    lines.push('- Content Sites: Expert authored, comprehensive coverage, updated information, trusted source');
    lines.push('');
    lines.push('QUALITY CHECKLIST');
    lines.push('- Site type correctly identified and strategy adapted');
    lines.push('- All character limits respected');
    lines.push('- No repetitive language across variants');
    lines.push('- Google Ads policy compliant');
    lines.push('- Clear value proposition matching site purpose');
    lines.push('- Keywords naturally integrated');
    lines.push('- Trust signals appropriate for site type');
    lines.push('- CTAs align with destination page intent');
    lines.push('- Mobile-friendly readability');
    lines.push('');
    lines.push('CRITICAL VARIETY REQUIREMENTS:');
    lines.push('- Each variant must be COMPLETELY DIFFERENT from the source ad');
    lines.push('- Do NOT copy, rephrase, or slightly modify the source ad');
    lines.push('- Create entirely NEW messaging approaches for each variant');
    lines.push('- Use different value propositions, angles, and emotional triggers');
    lines.push('- Each variant should feel like it came from a different advertiser');
    lines.push('- Source ad is for INSPIRATION ONLY - use it to understand the product/service, then create fresh copy');
    lines.push('');
    lines.push('VARIANT DIFFERENTIATION RULES:');
    lines.push('- Variant 1: Focus on a COMPLETELY DIFFERENT benefit or angle than source');
    lines.push('- Variant 2: Use a DIFFERENT emotional trigger or audience segment');
    lines.push('- Variant 3: Try a DIFFERENT approach (problem-focused vs solution-focused vs social proof)');
    lines.push('- Use different keywords, phrases, and messaging tone for each');
    lines.push('- Avoid any repetition of source ad language, structure, or approach');
    lines.push('');
    lines.push('EXAMPLE OF PROPER DIFFERENTIATION:');
    lines.push('If source ad says "Get 50% Off Today" (discount-focused)');
    lines.push('- Variant 1: "Expert-Recommended Solution" (authority-focused)');
    lines.push('- Variant 2: "Solve Your Problem Fast" (problem-solution focused)');
    lines.push('- Variant 3: "Join 10,000+ Happy Customers" (social proof focused)');
    lines.push('Each variant should feel like a completely different advertiser wrote it.');
    lines.push('');
    lines.push('OUTPUT FORMAT');
    lines.push('Return ONLY a single JSON object with this exact schema:');
    lines.push('{"variants":[{"headlines":["h1","h2","h3"],"descriptions":["d1","d2"],"path1":"string","path2":"string"}]}');
    lines.push('');
    lines.push('SOURCE AD TO ANALYZE:');
    lines.push(`Source Ad → headlines: ${src.headlines}`);
    lines.push(`Source Ad → descriptions: ${src.descriptions}`);
    lines.push(`Source Ad → paths: ${src.path1} / ${src.path2}`);
    lines.push('');
    lines.push('DESTINATION URL:');
    lines.push(`${finalUrl || ''}`);
    lines.push('');
    lines.push('TARGET KEYWORDS:');
    lines.push(`${keywords}`);
    lines.push('');
    lines.push('CAMPAIGN CONTEXT:');
    lines.push(`Campaign: ${campaignName || ''}`);
    lines.push(`Ad Group: ${adGroupName || ''}`);

    return lines.join('\n');
  }

  parseOpenAIResponse(content) {
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
