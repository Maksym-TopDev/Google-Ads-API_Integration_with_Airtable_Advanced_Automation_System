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

  async generateAdVariants({ adId, campaignId, adGroupId, campaignName, adGroupName, finalUrl, performanceScore }) {
    try {
      console.log(`Starting ad generation for Ad ID: ${adId}, Performance Score: ${performanceScore}`);

      // 1. Get source ad content for inspiration
      const sourceAd = await this.getSourceAdContent(adId);
      
      // 2. Collect target keywords for context
      const targetKeywords = await this.getTargetKeywords({ campaignId, adGroupId });

      // 3. Generate variants using OpenAI
      const variants = await this.generateWithOpenAI({
        campaignName,
        adGroupName,
        finalUrl,
        performanceScore,
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
        performanceScore,
        finalUrl
      });

      const uploadQueueRecords = await this.createUploadQueueRecords({
        campaignId,
        adGroupId,
        variants: validatedVariants,
        finalUrl
      });

      console.log(`Generated ${validatedVariants.length} variants, created ${adGeneratorRecords.length} Ad Generator records, ${uploadQueueRecords.length} Upload Queue records`);

      return {
        variantsGenerated: validatedVariants.length,
        adGeneratorRecords: adGeneratorRecords.length,
        uploadQueueRecords: uploadQueueRecords.length,
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

  async generateWithOpenAI({ campaignName, adGroupName, finalUrl, performanceScore, sourceAd, targetKeywords }) {
    try {
      const prompt = this.buildPrompt({
        campaignName,
        adGroupName,
        finalUrl,
        performanceScore,
        sourceAd,
        targetKeywords
      });

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert Google Ads copywriter. Generate high-performing ad copy based on successful examples and performance data. Always follow Google Ads character limits: headlines max 30 characters, descriptions max 90 characters.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const content = response.choices[0].message.content;
      return this.parseOpenAIResponse(content);

    } catch (error) {
      console.error('OpenAI generation error:', error);
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
  }

  buildPrompt({ campaignName, adGroupName, finalUrl, performanceScore, sourceAd, targetKeywords }) {
    const sourceHeadlines = sourceAd?.headlines || '';
    const sourceDescriptions = sourceAd?.descriptions || '';
    const sourcePath1 = sourceAd?.path1 || '';
    const sourcePath2 = sourceAd?.path2 || '';
    const keywordsList = (targetKeywords || []).join(', ');

    const prompt = `Generate 3 optimized Google Ads variants based on the high-performing source ad(s), destination URL, and target keywords below.
Return ONLY a single JSON object as the response. Do not include any commentary, markdown, or code fences. The JSON must match the specified schema exactly.

DESTINATION URL ANALYSIS
1) Visit and analyze: ${finalUrl}
2) Detect site type (choose one): E-commerce/Direct Sales; Lead Generation; Review/Comparison; Service Providers; Content/Information.
3) Adapt messaging based on detected site type:
- E-commerce: emphasize product benefits, pricing, promos, guarantees, shipping/returns. Use “Buy/Shop/Save/Get”.
- Lead Gen: emphasize value/expertise/outcomes, “Learn/Discover/Find Out”, free consults/quotes.
- Review: emphasize authority/independence, comparisons, testing methodology, “Best/Top/#1”.
- Services: emphasize expertise, results, certifications, local presence, outcomes.
- Content: emphasize insights, completeness, expert angle, recency.

SOURCE AD ANALYSIS
Use the high-performing source ad(s) below:
- Headlines: ${sourceHeadlines}
- Descriptions: ${sourceDescriptions}
- Paths: ${sourcePath1} / ${sourcePath2}
- Performance Score: ${performanceScore}

ADAPTIVE VARIANT STRATEGIES
Match the detected site type. Create 3 distinct variants:
- E-commerce: 1) Product-focused 2) Offer-focused 3) Urgency-focused
- Lead Gen: 1) Problem-solution 2) Expertise/authority 3) Free value/consult
- Review: 1) Authority 2) Comparison 3) Result/#1 pick
- Services: 1) Experience/credibility 2) Results/outcomes 3) Local/availability
- Content: 1) Educational value 2) Comprehensive resource 3) Expert insight

FORMAT REQUIREMENTS
Technical:
- Exactly 3 headlines per variant (≤30 chars each).
- Exactly 2 descriptions per variant (≤90 chars each).
- Suggest Path1 and Path2 (≤15 chars each) that reflect the URL structure.
- Policy compliant; avoid unverifiable claims; no clickbait.

Content:
- Headlines: front-load primary keywords and value; include specifics (numbers/percentages) where possible; tone fits site type.
- Descriptions: expand headline promise; include trust signals appropriate to site type (shipping/returns, independent testing, certifications, local presence, expert-authored/up-to-date for content); end with a site-appropriate CTA.
- Display paths mirror key URL/category terms and reinforce the message.

QUALITY CHECKLIST
- Correct site type and adapted strategy
- Character limits respected
- No repetitive language across variants
- Clear value propositions and trust signals
- Natural keyword integration
- CTAs match page intent; mobile-friendly

OUTPUT FORMAT
DETECTED SITE TYPE: [Site Type]
ADAPTED STRATEGY: [Brief explanation of the chosen approach]

VARIANT 1: [Strategy description]
Headlines: [H1] | [H2] | [H3]
Descriptions: [D1] | [D2]
Paths: [Path1] / [Path2]

VARIANT 2: [Strategy description]
Headlines: [H1] | [H2] | [H3]
Descriptions: [D1] | [D2]
Paths: [Path1] / [Path2]

VARIANT 3: [Strategy description]
Headlines: [H1] | [H2] | [H3]
Descriptions: [D1] | [D2]
Paths: [Path1] / [Path2]

INPUTS
DESTINATION URL: ${finalUrl}
TARGET KEYWORDS: ${keywordsList}
`;

    return prompt;
  }

  parseOpenAIResponse(content) {
    try {
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

  async createAdGeneratorRecords({ campaignId, adGroupId, variants, campaignName, adGroupName, adId, performanceScore, finalUrl }) {
    try {
      const records = variants.map((variant, index) => ({
        fields: {
          'Campaign ID': campaignId,
          'Ad Group ID': adGroupId,
          'Campaign Name': campaignName || '',
          'Ad Group Name': adGroupName || '',
          'Source Ad ID': adId,
          'Performance Score': performanceScore || 0,
          'Headline 1': variant.headlines[0] || '',
          'Headline 2': variant.headlines[1] || '',
          'Headline 3': variant.headlines[2] || '',
          'Description 1': variant.descriptions[0] || '',
          'Description 2': variant.descriptions[1] || '',
          'Path1': variant.path1 || '',
          'Path2': variant.path2 || '',
          'Final URL': finalUrl || '',
          'Generated By': 'OpenAI GPT',
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

  async createUploadQueueRecords({ campaignId, adGroupId, variants, finalUrl }) {
    try {
      const records = variants.map((variant, index) => ({
        fields: {
          'Campaign ID': campaignId,
          'Ad Group ID': adGroupId,
          'Headlines': variant.headlines.join(' | '),
          'Descriptions': variant.descriptions.join(' | '),
          'Path1': variant.path1 || '',
          'Path2': variant.path2 || '',
          'Final URL': finalUrl,
          'Status': 'Pending',
          'Created At': new Date().toISOString()
        }
      }));

      const createdRecords = await this.airtable.createRecords('Upload Queue', records);
      console.log(`Created ${createdRecords.length} Upload Queue records`);
      return createdRecords;

    } catch (error) {
      console.error('Error creating Upload Queue records:', error);
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
