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
      
      // 2. Generate variants using OpenAI
      const variants = await this.generateWithOpenAI({
        campaignName,
        adGroupName,
        finalUrl,
        performanceScore,
        sourceAd
      });

      // 3. Validate generated content
      const validatedVariants = variants.map(variant => this.validateAdCopy(variant));

      // 4. Create records in Airtable
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

  async generateWithOpenAI({ campaignName, adGroupName, finalUrl, performanceScore, sourceAd }) {
    try {
      const prompt = this.buildPrompt({
        campaignName,
        adGroupName,
        finalUrl,
        performanceScore,
        sourceAd
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
        max_tokens: 1000
      });

      const content = response.choices[0].message.content;
      return this.parseOpenAIResponse(content);

    } catch (error) {
      console.error('OpenAI generation error:', error);
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
  }

  buildPrompt({ campaignName, adGroupName, finalUrl, performanceScore, sourceAd }) {
    let prompt = `Generate 3 new Google Ads variants based on this high-performing ad:

CAMPAIGN: ${campaignName}
AD GROUP: ${adGroupName}
FINAL URL: ${finalUrl}

PERFORMANCE SCORE: ${performanceScore}`;

    if (sourceAd) {
      prompt += `

SOURCE AD (for inspiration):
Headlines: ${sourceAd.headlines}
Descriptions: ${sourceAd.descriptions}
Path1: ${sourceAd.path1}
Path2: ${sourceAd.path2}`;
    }

    prompt += `

REQUIREMENTS:
- Generate 3 variants (each with 3 headlines + 2 descriptions)
- Headlines: max 30 characters each
- Descriptions: max 90 characters each
- Include Path1 and Path2 suggestions (max 15 characters each)
- Make each variant unique but similar in style to the source
- Focus on the high-performing elements from the source ad
- Ensure all copy is Google Ads policy compliant

FORMAT YOUR RESPONSE AS JSON:
{
  "variants": [
    {
      "headlines": ["headline1", "headline2", "headline3"],
      "descriptions": ["description1", "description2"],
      "path1": "path1",
      "path2": "path2"
    }
  ]
}`;

    return prompt;
  }

  parseOpenAIResponse(content) {
    try {
      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in OpenAI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.variants || !Array.isArray(parsed.variants)) {
        throw new Error('Invalid response format: missing variants array');
      }

      return parsed.variants;

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
