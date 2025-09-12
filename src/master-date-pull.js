const axios = require('axios');
const Airtable = require('airtable');
require('dotenv').config();

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v21';

class MasterDatePullService {
    constructor() {
        this.airtable = new Airtable({ 
            apiKey: process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY 
        }).base(process.env.AIRTABLE_BASE_ID);
        
        this.rateLimiter = {
            requests: 0,
            resetTime: Date.now() + 60000,
            maxRequests: Number(process.env.AIRTABLE_RATE_LIMIT || 5),
        };
    }

    async checkRateLimit() {
        const now = Date.now();
        if (now > this.rateLimiter.resetTime) {
            this.rateLimiter.requests = 0;
            this.rateLimiter.resetTime = now + 60000;
        }
        if (this.rateLimiter.requests >= this.rateLimiter.maxRequests) {
            const waitTime = this.rateLimiter.resetTime - now;
            await new Promise((r) => setTimeout(r, waitTime));
        }
    }

    async getAccessToken() {
        const params = new URLSearchParams();
        params.append('client_id', process.env.GOOGLE_ADS_OAUTH_CLIENT_ID);
        params.append('client_secret', process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET);
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', process.env.GOOGLE_ADS_REFRESH_TOKEN);
        
        const { data } = await axios.post('https://oauth2.googleapis.com/token', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return data.access_token;
    }

    async executeGAQL(customerId, query) {
        const accessToken = await this.getAccessToken();
        const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`;
        
        const resp = await axios.post(url, { query }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
                'login-customer-id': (process.env.GOOGLE_ADS_MCC_ID || '').replace(/-/g, ''),
            },
            timeout: 120000,
        });
        
        const rows = [];
        for (const chunk of resp.data) {
            if (chunk.results) rows.push(...chunk.results);
        }
        return rows;
    }

    async getMasterDateRange() {
        const records = await this.airtable('Set Date').select({
            maxRecords: 1
        }).all();
        
        if (records.length === 0) {
            throw new Error('No date range found in Set Date table');
        }
        
        const record = records[0];
        const startDate = record.get('Master Start Date');
        const endDate = record.get('Master End Date');
        
        if (!startDate || !endDate) {
            throw new Error('Master Start Date and Master End Date must be set');
        }
        
        // Format dates for GAQL
        const formatDate = (date) => {
            const d = new Date(date);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };
        
        return `'${formatDate(startDate)}' AND '${formatDate(endDate)}'`;
    }

    async updateStatus(status, message, recordsUpdated = 0, recordId = null) {
        try {
            let targetRecordId = recordId;
            
            // If no recordId provided, get the first record (backward compatibility)
            if (!targetRecordId) {
                const records = await this.airtable('Set Date').select({
                    maxRecords: 1
                }).all();
                if (records.length > 0) {
                    targetRecordId = records[0].id;
                }
            }
            
            if (targetRecordId) {
                await this.airtable('Set Date').update([{
                    id: targetRecordId,
                    fields: {
                        'Status': status,
                        'Last Pull Status': message,
                        'Last Pull Time': new Date().toISOString(),
                        'Records Updated': recordsUpdated
                    }
                }]);
            }
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    }

    async fetchAllData(customerId, dateRange) {
        console.log(`Fetching data for customer ${customerId} with date range ${dateRange}...`);
        
        const [campaigns, adGroups, keywords, ads] = await Promise.all([
            this.fetchCampaigns(customerId, dateRange),
            this.fetchAdGroups(customerId, dateRange),
            this.fetchKeywords(customerId, dateRange),
            this.fetchAds(customerId, dateRange)
        ]);
        
        return { campaigns, adGroups, keywords, ads };
    }

    async fetchCampaigns(customerId, dateRange) {
        const query = `
        SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            campaign.advertising_channel_type,
            campaign.start_date,
            campaign.end_date,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_from_interactions_rate,
            metrics.conversions_value,
            segments.date
        FROM campaign
        WHERE segments.date BETWEEN ${dateRange}
        `;
        
        const rows = await this.executeGAQL(customerId, query);
        return rows.map((r) => ({
            id: String(r.campaign.id),
            name: r.campaign.name,
            status: r.campaign.status,
            channelType: r.campaign.advertisingChannelType,
            startDate: r.campaign.startDate,
            endDate: r.campaign.endDate,
            impressions: r.metrics.impressions,
            clicks: r.metrics.clicks,
            ctr: r.metrics.ctr,
            cost: r.metrics.costMicros,
            conversions: r.metrics.conversions,
            conversionRate: r.metrics.conversionsFromInteractionsRate,
            roas: r.metrics.conversionsValue,
            lastUpdated: new Date().toISOString(),
        }));
    }

    async fetchAdGroups(customerId, dateRange) {
        const query = `
        SELECT
            ad_group.id,
            ad_group.name,
            ad_group.status,
            ad_group.campaign,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_from_interactions_rate,
            metrics.conversions_value,
            segments.date
        FROM ad_group
        WHERE segments.date BETWEEN ${dateRange}
        `;
        
        const rows = await this.executeGAQL(customerId, query);
        return rows.map((r) => ({
            id: String(r.adGroup.id),
            name: r.adGroup.name,
            status: r.adGroup.status,
            campaignId: r.adGroup.campaign?.split('/').pop(),
            campaignName: '',
            impressions: r.metrics.impressions,
            clicks: r.metrics.clicks,
            ctr: r.metrics.ctr,
            cost: r.metrics.costMicros,
            conversions: r.metrics.conversions,
            conversionRate: r.metrics.conversionsFromInteractionsRate,
            roas: r.metrics.conversionsValue,
            lastUpdated: new Date().toISOString(),
        }));
    }

    async fetchKeywords(customerId, dateRange) {
        const query = `
        SELECT
            ad_group_criterion.criterion_id,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            ad_group_criterion.ad_group,
            ad_group_criterion.quality_info.quality_score,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_from_interactions_rate,
            metrics.conversions_value,
            segments.date
        FROM keyword_view
        WHERE segments.date BETWEEN ${dateRange}
        `;
        
        const rows = await this.executeGAQL(customerId, query);
        return rows.map((r) => ({
            id: String(r.adGroupCriterion.criterionId),
            text: r.adGroupCriterion.keyword?.text,
            matchType: r.adGroupCriterion.keyword?.matchType,
            status: r.adGroupCriterion.status,
            adGroupId: r.adGroupCriterion.adGroup?.split('/').pop(),
            adGroupName: '',
            campaignId: '',
            campaignName: '',
            qualityScore: r.adGroupCriterion.qualityInfo?.qualityScore,
            impressions: r.metrics.impressions,
            clicks: r.metrics.clicks,
            ctr: r.metrics.ctr,
            cost: r.metrics.costMicros,
            conversions: r.metrics.conversions,
            conversionRate: r.metrics.conversionsFromInteractionsRate,
            roas: r.metrics.conversionsValue,
            lastUpdated: new Date().toISOString(),
        }));
    }

    async fetchAds(customerId, dateRange) {
        const query = `
        SELECT
            ad_group_ad.ad.id,
            ad_group_ad.ad.type,
            ad_group_ad.status,
            ad_group_ad.ad.final_urls,
            ad_group_ad.ad.responsive_search_ad.headlines,
            ad_group_ad.ad.responsive_search_ad.descriptions,
            ad_group_ad.ad.responsive_search_ad.path1,
            ad_group_ad.ad.responsive_search_ad.path2,
            ad_group_ad.ad_group,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_from_interactions_rate,
            metrics.conversions_value,
            segments.date
        FROM ad_group_ad
        WHERE segments.date BETWEEN ${dateRange}
        `;
        
        const rows = await this.executeGAQL(customerId, query);
        return rows.map((r) => ({
            id: String(r.adGroupAd.ad.id),
            headlines: r.adGroupAd.ad.responsiveSearchAd?.headlines?.map(h => h.text).join(' | '),
            descriptions: r.adGroupAd.ad.responsiveSearchAd?.descriptions?.map(d => d.text).join(' | '),
            path1: r.adGroupAd.ad.responsiveSearchAd?.path1,
            path2: r.adGroupAd.ad.responsiveSearchAd?.path2,
            finalUrls: r.adGroupAd.ad.finalUrls?.join(', '),
            adGroupId: r.adGroupAd.adGroup?.split('/').pop(),
            adGroupName: '',
            campaignId: '',
            campaignName: '',
            impressions: r.metrics.impressions,
            clicks: r.metrics.clicks,
            ctr: r.metrics.ctr,
            cost: r.metrics.costMicros,
            conversions: r.metrics.conversions,
            conversionRate: r.metrics.conversionsFromInteractionsRate,
            roas: r.metrics.conversionsValue,
            lastUpdated: new Date().toISOString(),
        }));
    }

    async clearExistingData() {
        console.log('Clearing existing data...');
        
        // Clear all existing records from all tables
        const tables = ['Campaigns', 'Ad Groups', 'Keywords', 'Ads'];
        
        for (const tableName of tables) {
            try {
                const records = await this.airtable(tableName).select().all();
                if (records.length > 0) {
                    const recordIds = records.map(r => r.id);
                    // Delete in batches of 10
                    for (let i = 0; i < recordIds.length; i += 10) {
                        const batch = recordIds.slice(i, i + 10);
                        await this.airtable(tableName).destroy(batch);
                        await this.checkRateLimit();
                    }
                    console.log(`Cleared ${records.length} records from ${tableName}`);
                }
            } catch (error) {
                console.error(`Error clearing ${tableName}:`, error);
            }
        }
    }

    async createRecords(campaigns, adGroups, keywords, ads) {
        console.log('Creating new records...');
        
        // Create lookup maps for names
        const campaignMap = new Map(campaigns.map(c => [c.id, c.name]));
        const adGroupMap = new Map(adGroups.map(ag => [ag.id, ag.name]));

        // Fill in missing names
        adGroups.forEach(ag => {
            ag.campaignName = campaignMap.get(ag.campaignId) || '';
        });
        
        keywords.forEach(k => {
            k.adGroupName = adGroupMap.get(k.adGroupId) || '';
            k.campaignId = adGroups.find(ag => ag.id === k.adGroupId)?.campaignId || '';
            k.campaignName = campaignMap.get(k.campaignId) || '';
        });
        
        ads.forEach(ad => {
            ad.adGroupName = adGroupMap.get(ad.adGroupId) || '';
            ad.campaignId = adGroups.find(ag => ag.id === ad.adGroupId)?.campaignId || '';
            ad.campaignName = campaignMap.get(ad.campaignId) || '';
        });

        // Create records in parallel
        const [campaignRecords, adGroupRecords, keywordRecords, adRecords] = await Promise.all([
            this.createCampaigns(campaigns),
            this.createAdGroups(adGroups),
            this.createKeywords(keywords),
            this.createAds(ads)
        ]);

        return {
            campaigns: campaignRecords.length,
            adGroups: adGroupRecords.length,
            keywords: keywordRecords.length,
            ads: adRecords.length
        };
    }

    async createCampaigns(campaigns) {
        if (!campaigns?.length) return [];
        
        const table = this.airtable('Campaigns');
        const toRecords = (items) => items.map(c => ({ fields: {
            'Campaign ID': c.id,
            'Campaign Name': c.name,
            'Status': c.status,
            'Channel Type': c.channelType,
            'Impressions': c.impressions,
            'Clicks': c.clicks,
            'CTR': c.ctr,
            'Cost': c.cost,
            'Conversions': c.conversions,
            'Conversion Rate': c.conversionRate,
            'ROAS': c.roas,
            'Last Updated': c.lastUpdated,
        }}));
        
        const out = [];
        for (let i = 0; i < campaigns.length; i += 10) {
            const batch = toRecords(campaigns.slice(i, i + 10));
            const created = await table.create(batch, { typecast: true });
            out.push(...created);
            this.rateLimiter.requests++;
            await this.checkRateLimit();
        }
        return out;
    }

    async createAdGroups(adGroups) {
        if (!adGroups?.length) return [];
        
        const table = this.airtable('Ad Groups');
        const toRecords = (items) => items.map(ag => ({ fields: {
            'Ad Group ID': ag.id,
            'Ad Group Name': ag.name,
            'Status': ag.status,
            'Campaign ID': ag.campaignId,
            'Campaign Name': ag.campaignName,
            'Impressions': ag.impressions,
            'Clicks': ag.clicks,
            'CTR': ag.ctr,
            'Cost': ag.cost,
            'Conversions': ag.conversions,
            'Conversion Rate': ag.conversionRate,
            'ROAS': ag.roas,
            'Last Updated': ag.lastUpdated,
        }}));
        
        const out = [];
        for (let i = 0; i < adGroups.length; i += 10) {
            const batch = toRecords(adGroups.slice(i, i + 10));
            const created = await table.create(batch, { typecast: true });
            out.push(...created);
            this.rateLimiter.requests++;
            await this.checkRateLimit();
        }
        return out;
    }

    async createKeywords(keywords) {
        if (!keywords?.length) return [];
        
        const table = this.airtable('Keywords');
        const toRecords = (items) => items.map(k => ({ fields: {
            'Keyword ID': k.id,
            'Keyword Text': k.text,
            'Match Type': k.matchType,
            'Status': k.status,
            'Ad Group ID': k.adGroupId,
            'Ad Group Name': k.adGroupName,
            'Campaign ID': k.campaignId,
            'Campaign Name': k.campaignName,
            'Impressions': k.impressions,
            'Clicks': k.clicks,
            'CTR': k.ctr,
            'Cost': k.cost,
            'Conversions': k.conversions,
            'Conversion Rate': k.conversionRate,
            'ROAS': k.roas,
            'Quality Score': k.qualityScore,
            'Last Updated': k.lastUpdated,
        }}));
        
        const out = [];
        for (let i = 0; i < keywords.length; i += 10) {
            const batch = toRecords(keywords.slice(i, i + 10));
            const created = await table.create(batch, { typecast: true });
            out.push(...created);
            this.rateLimiter.requests++;
            await this.checkRateLimit();
        }
        return out;
    }

    async createAds(ads) {
        if (!ads?.length) return [];
        
        const table = this.airtable('Ads');
        const toRecords = (items) => items.map(ad => ({ fields: {
            'Ad ID': ad.id,
            'Headlines': ad.headlines,
            'Descriptions': ad.descriptions,
            'Path1': ad.path1,
            'Path2': ad.path2,
            'Final URLs': ad.finalUrls,
            'Ad Group ID': ad.adGroupId,
            'Ad Group Name': ad.adGroupName,
            'Campaign ID': ad.campaignId,
            'Campaign Name': ad.campaignName,
            'Impressions': ad.impressions,
            'Clicks': ad.clicks,
            'CTR': ad.ctr,
            'Cost': ad.cost,
            'Conversions': ad.conversions,
            'Conversion Rate': ad.conversionRate,
            'ROAS': ad.roas,
            'Last Updated': ad.lastUpdated,
        }}));
        
        const out = [];
        for (let i = 0; i < ads.length; i += 10) {
            const batch = toRecords(ads.slice(i, i + 10));
            const created = await table.create(batch, { typecast: true });
            out.push(...created);
            this.rateLimiter.requests++;
            await this.checkRateLimit();
        }
        return out;
    }

    async pullAllData(recordId = null) {
        try {
            console.log('Starting master date pull...');
            
            // Update status to "Pulling"
            await this.updateStatus('Pulling', 'Starting data pull...', 0, recordId);
            
            // Get master date range
            const dateRange = await this.getMasterDateRange();
            console.log(`Using date range: ${dateRange}`);
            
            // Get customer ID
            const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
            if (!customerId) {
                throw new Error('GOOGLE_ADS_CUSTOMER_ID not set in environment');
            }
            
            // Clear existing data
            await this.clearExistingData();
            
            // Fetch all data
            const { campaigns, adGroups, keywords, ads } = await this.fetchAllData(customerId, dateRange);
            
            // Create new records
            const recordCounts = await this.createRecords(campaigns, adGroups, keywords, ads);
            
            const totalRecords = recordCounts.campaigns + recordCounts.adGroups + recordCounts.keywords + recordCounts.ads;
            
            // Update status to success
            await this.updateStatus('Success', `Successfully pulled ${totalRecords} records`, totalRecords, recordId);
            
            console.log(`✅ Successfully pulled data:`);
            console.log(`   - ${recordCounts.campaigns} campaigns`);
            console.log(`   - ${recordCounts.adGroups} ad groups`);
            console.log(`   - ${recordCounts.keywords} keywords`);
            console.log(`   - ${recordCounts.ads} ads`);
            console.log(`   - Total: ${totalRecords} records`);
            
            return {
                success: true,
                totalRecords,
                breakdown: recordCounts
            };
            
        } catch (error) {
            console.error('❌ Error during data pull:', error);
            await this.updateStatus('Error', `Error: ${error.message}`, 0, recordId);
            throw error;
        }
    }

    // New: pull using explicit start/end dates (strings YYYY-MM-DD)
    async pullWithDateRange(startDateStr, endDateStr, recordId = null) {
        try {
            if (!startDateStr || !endDateStr) {
                throw new Error('start and end dates are required (YYYY-MM-DD)');
            }

            console.log('Starting master date pull with explicit range...');
            await this.updateStatus('Pulling', `Pulling ${startDateStr} to ${endDateStr}...`, 0, recordId);

            const dateRange = `'${startDateStr}' AND '${endDateStr}'`;
            console.log(`Using date range: ${dateRange}`);

            const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
            if (!customerId) {
                throw new Error('GOOGLE_ADS_CUSTOMER_ID not set in environment');
            }

            await this.clearExistingData();

            const { campaigns, adGroups, keywords, ads } = await this.fetchAllData(customerId, dateRange);
            const recordCounts = await this.createRecords(campaigns, adGroups, keywords, ads);
            const totalRecords = recordCounts.campaigns + recordCounts.adGroups + recordCounts.keywords + recordCounts.ads;

            await this.updateStatus('Success', `Successfully pulled ${totalRecords} records`, totalRecords, recordId);

            return {
                success: true,
                totalRecords,
                breakdown: recordCounts,
            };
        } catch (error) {
            console.error('❌ Error during ranged data pull:', error);
            await this.updateStatus('Error', `Error: ${error.message}`, 0, recordId);
            throw error;
        }
    }
}

// Main execution
async function main() {
    const service = new MasterDatePullService();
    await service.pullAllData();
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { MasterDatePullService };
