const OpenAI = require('openai');
const { AirtableClient } = require('./airtableClient');
require('dotenv').config();

class AdGenerationService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.airtable = new AirtableClient();
    }

    async generateAdVariants({ adId, campaignId, adGroupId, campaignName, adGroupName, finalUrl }) {
        try {
            console.log(`Starting ad generation for Ad ID: ${adId}, Campaign: ${campaignName}, Ad Group: ${adGroupName}`);

            // 1. Get performance data for the source ad
            const performanceData = await this.getAdPerformance(adId, campaignId, adGroupId);
            
            // 2. Get source ad content for inspiration
            const sourceAd = await this.getSourceAdContent(adId, campaignId, adGroupId);
            
            // 3. Generate new variants using OpenAI
            const variants = await this.generateWithOpenAI({
                performanceData,
                sourceAd,
                campaignName,
                adGroupName,
                finalUrl
            });

            // 4. Create Ad Generator records
            const adGeneratorRecords = await this.createAdGeneratorRecords({
                campaignId,
                adGroupId,
                campaignName,
                adGroupName,
                finalUrl,
                variants,
                sourceAdId: adId,
                performanceScore: performanceData.performanceScore
            });

            // 5. Queue for upload
            const uploadQueueRecords = await this.createUploadQueueRecords({
                campaignId,
                adGroupId,
                variants,
                finalUrl,
                adGeneratorRecords
            });

            console.log(`Generated ${variants.length} variants, created ${adGeneratorRecords.length} Ad Generator records, ${uploadQueueRecords.length} Upload Queue records`);

            return {
                variantsGenerated: variants.length,
                adGeneratorRecords: adGeneratorRecords.length,
                uploadQueueRecords: uploadQueueRecords.length,
                variants: variants.map(v => ({
                    headlines: v.headlines,
                    descriptions: v.descriptions,
                    paths: v.paths
                }))
            };

        } catch (error) {
            console.error('Error in generateAdVariants:', error);
            throw error;
        }
    }

    async getAdPerformance(adId, campaignId, adGroupId) {
        try {
            // Get performance data from Airtable Ads table
            const ads = await this.airtable.getRecords('Ads', {
                filterByFormula: `{Ad ID} = ${adId}`
            });

            if (!ads || ads.length === 0) {
                throw new Error(`Ad with ID ${adId} not found`);
            }

            const ad = ads[0];
            const ctr = parseFloat(ad.fields['CTR'] || 0);
            const roas = parseFloat(ad.fields['ROAS'] || 0);
            const conversionRate = parseFloat(ad.fields['Conversion Rate'] || 0);

            // Calculate performance score (CTR + ROAS + Conversion Rate)
            const performanceScore = ctr + roas + conversionRate;

            return {
                ctr,
                roas,
                conversionRate,
                performanceScore,
                impressions: parseInt(ad.fields['Impressions'] || 0),
                clicks: parseInt(ad.fields['Clicks'] || 0),
                cost: parseFloat(ad.fields['Cost'] || 0),
                conversions: parseInt(ad.fields['Conversions'] || 0)
            };
        } catch (error) {
            console.error('Error getting ad performance:', error);
            throw error;
        }
    }

    async getSourceAdContent(adId, campaignId, adGroupId) {
        try {
            const ads = await this.airtable.getRecords('Ads', {
                filterByFormula: `{Ad ID} = ${adId}`
            });

            if (!ads || ads.length === 0) {
                throw new Error(`Source ad with ID ${adId} not found`);
            }

            const ad = ads[0];
            return {
                headlines: ad.fields['Headlines'] || '',
                descriptions: ad.fields['Descriptions'] || '',
                path1: ad.fields['Path1'] || '',
                path2: ad.fields['Path2'] || '',
                finalUrl: ad.fields['Final URLs'] || ''
            };
        } catch (error) {
            console.error('Error getting source ad content:', error);
            throw error;
        }
    }

    async generateWithOpenAI({ performanceData, sourceAd, campaignName, adGroupName, finalUrl }) {
        try {
            const prompt = this.buildPrompt({
                performanceData,
                sourceAd,
                campaignName,
                adGroupName,
                finalUrl
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
            console.error('Error generating with OpenAI:', error);
            throw error;
        }
    }

    buildPrompt({ performanceData, sourceAd, campaignName, adGroupName, finalUrl }) {
        return `
Generate 3 new Google Ads variants based on this high-performing ad:

CAMPAIGN: ${campaignName}
AD GROUP: ${adGroupName}
FINAL URL: ${finalUrl}

PERFORMANCE DATA:
- CTR: ${performanceData.ctr}%
- ROAS: ${performanceData.roas}
- Conversion Rate: ${performanceData.conversionRate}%
- Performance Score: ${performanceData.performanceScore}

SOURCE AD (for inspiration):
Headlines: ${sourceAd.headlines}
Descriptions: ${sourceAd.descriptions}
Path1: ${sourceAd.path1}
Path2: ${sourceAd.path2}

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
}
`;
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

            // Validate and clean each variant
            return parsed.variants.map((variant, index) => {
                if (!variant.headlines || !variant.descriptions) {
                    throw new Error(`Variant ${index + 1} missing headlines or descriptions`);
                }

                return {
                    headlines: variant.headlines.slice(0, 3), // Ensure max 3 headlines
                    descriptions: variant.descriptions.slice(0, 2), // Ensure max 2 descriptions
                    path1: (variant.path1 || '').substring(0, 15),
                    path2: (variant.path2 || '').substring(0, 15)
                };
            });

        } catch (error) {
            console.error('Error parsing OpenAI response:', error);
            throw new Error(`Failed to parse OpenAI response: ${error.message}`);
        }
    }

    async createAdGeneratorRecords({ campaignId, adGroupId, campaignName, adGroupName, finalUrl, variants, sourceAdId, performanceScore }) {
        try {
            const records = variants.map((variant, index) => ({
                fields: {
                    'Campaign ID': campaignId,
                    'Ad Group ID': adGroupId,
                    'Campaign Name': campaignName,
                    'Ad Group Name': adGroupName,
                    'Source Ad ID': sourceAdId,
                    'Performance Score': performanceScore,
                    'Headline 1': variant.headlines[0] || '',
                    'Headline 2': variant.headlines[1] || '',
                    'Headline 3': variant.headlines[2] || '',
                    'Description 1': variant.descriptions[0] || '',
                    'Description 2': variant.descriptions[1] || '',
                    'Final URL': finalUrl,
                    'Generated By': 'OpenAI GPT',
                    'Validation Status': this.validateAdCopy(variant) ? '✅ Ready' : '❌ Error',
                    'Send to Queue?': true,
                    'Path1': variant.path1 || '',
                    'Path2': variant.path2 || '',
                    'Generation Status': 'Generated',
                    'Approval Status': 'Approved', // Auto-approve as per client requirements
                    'Policy Check': true,
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

    async createUploadQueueRecords({ campaignId, adGroupId, variants, finalUrl, adGeneratorRecords }) {
        try {
            const records = variants.map((variant, index) => ({
                fields: {
                    'Campaign ID': campaignId,
                    'Ad Group ID': adGroupId,
                    'Headlines': JSON.stringify(variant.headlines),
                    'Descriptions': JSON.stringify(variant.descriptions),
                    'Final URL': finalUrl,
                    'Status': 'Pending',
                    'Priority': 1,
                    'Retry Count': 0,
                    'Max Retries': 3,
                    'Path1': variant.path1 || '',
                    'Path2': variant.path2 || '',
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
        const headlines = variant.headlines || [];
        const descriptions = variant.descriptions || [];

        // Check headline length (max 30 chars)
        const headlinesValid = headlines.every(h => h.length <= 30);
        
        // Check description length (max 90 chars)
        const descriptionsValid = descriptions.every(d => d.length <= 90);

        // Check we have required number of headlines and descriptions
        const hasRequiredCount = headlines.length >= 1 && descriptions.length >= 1;

        return headlinesValid && descriptionsValid && hasRequiredCount;
    }
}

module.exports = { AdGenerationService };
