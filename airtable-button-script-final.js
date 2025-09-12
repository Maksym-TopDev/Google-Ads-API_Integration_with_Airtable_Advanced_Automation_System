// Airtable Button Script for Master Date Pull
// This script runs directly in Airtable's scripting environment

// Configuration - Replace with your actual values
const config = {
    AIRTABLE_PAT: 'YOUR_AIRTABLE_PAT',
    AIRTABLE_BASE_ID: 'YOUR_AIRTABLE_BASE_ID',
    GOOGLE_ADS_CUSTOMER_ID: 'YOUR_GOOGLE_ADS_CUSTOMER_ID',
    GOOGLE_ADS_OAUTH_CLIENT_ID: 'YOUR_GOOGLE_ADS_OAUTH_CLIENT_ID',
    GOOGLE_ADS_OAUTH_CLIENT_SECRET: 'YOUR_GOOGLE_ADS_OAUTH_CLIENT_SECRET',
    GOOGLE_ADS_REFRESH_TOKEN: 'YOUR_GOOGLE_ADS_REFRESH_TOKEN',
    GOOGLE_ADS_DEVELOPER_TOKEN: 'YOUR_GOOGLE_ADS_DEVELOPER_TOKEN',
    GOOGLE_ADS_MCC_ID: 'YOUR_GOOGLE_ADS_MCC_ID',
    GOOGLE_ADS_API_VERSION: 'v21',
    AIRTABLE_RATE_LIMIT: 5
};

// Rate limiter for API calls
let rateLimiter = {
    requests: 0,
    resetTime: Date.now() + 60000,
    maxRequests: config.AIRTABLE_RATE_LIMIT
};

// Helper function to check rate limit
async function checkRateLimit() {
    const now = Date.now();
    if (now > rateLimiter.resetTime) {
        rateLimiter.requests = 0;
        rateLimiter.resetTime = now + 60000;
    }
    if (rateLimiter.requests >= rateLimiter.maxRequests) {
        const waitTime = rateLimiter.resetTime - now;
        await new Promise((r) => setTimeout(r, waitTime));
    }
}

// Helper function to make HTTP requests
async function makeRequest(url, options = {}) {
    const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
}

// Get access token from Google OAuth
async function getAccessToken() {
    const params = new URLSearchParams();
    params.append('client_id', config.GOOGLE_ADS_OAUTH_CLIENT_ID);
    params.append('client_secret', config.GOOGLE_ADS_OAUTH_CLIENT_SECRET);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', config.GOOGLE_ADS_REFRESH_TOKEN);
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
    });
    
    if (!response.ok) {
        throw new Error(`OAuth error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.access_token;
}

// Execute GAQL query
async function executeGAQL(customerId, query) {
    const accessToken = await getAccessToken();
    const url = `https://googleads.googleapis.com/${config.GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'developer-token': config.GOOGLE_ADS_DEVELOPER_TOKEN,
            'login-customer-id': config.GOOGLE_ADS_MCC_ID.replace(/-/g, '')
        },
        body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
        throw new Error(`Google Ads API error: ${response.status}`);
    }
    
    const data = await response.json();
    const rows = [];
    for (const chunk of data) {
        if (chunk.results) rows.push(...chunk.results);
    }
    return rows;
}

// Get master date range from Airtable
async function getMasterDateRange() {
    const records = await base('Set Date').select({
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

// Update status in Airtable
async function updateStatus(status, message, recordsUpdated = 0) {
    try {
        const records = await base('Set Date').select({
            maxRecords: 1
        }).all();
        
        if (records.length > 0) {
            await base('Set Date').update([{
                id: records[0].id,
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

// Fetch campaigns data
async function fetchCampaigns(customerId, dateRange) {
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
    
    const rows = await executeGAQL(customerId, query);
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
        lastUpdated: new Date().toISOString()
    }));
}

// Fetch ad groups data
async function fetchAdGroups(customerId, dateRange) {
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
    
    const rows = await executeGAQL(customerId, query);
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
        lastUpdated: new Date().toISOString()
    }));
}

// Fetch keywords data
async function fetchKeywords(customerId, dateRange) {
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
    
    const rows = await executeGAQL(customerId, query);
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
        lastUpdated: new Date().toISOString()
    }));
}

// Fetch ads data
async function fetchAds(customerId, dateRange) {
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
    
    const rows = await executeGAQL(customerId, query);
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
        lastUpdated: new Date().toISOString()
    }));
}

// Clear existing data from all tables
async function clearExistingData() {
    console.log('Clearing existing data...');
    
    const tables = ['Campaigns', 'Ad Groups', 'Keywords', 'Ads'];
    
    for (const tableName of tables) {
        try {
            const records = await base(tableName).select().all();
            if (records.length > 0) {
                const recordIds = records.map(r => r.id);
                // Delete in batches of 10
                for (let i = 0; i < recordIds.length; i += 10) {
                    const batch = recordIds.slice(i, i + 10);
                    await base(tableName).destroy(batch);
                    await checkRateLimit();
                }
                console.log(`Cleared ${records.length} records from ${tableName}`);
            }
        } catch (error) {
            console.error(`Error clearing ${tableName}:`, error);
        }
    }
}

// Create records in Airtable
async function createRecords(campaigns, adGroups, keywords, ads) {
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
        createCampaigns(campaigns),
        createAdGroups(adGroups),
        createKeywords(keywords),
        createAds(ads)
    ]);

    return {
        campaigns: campaignRecords,
        adGroups: adGroupRecords,
        keywords: keywordRecords,
        ads: adRecords
    };
}

// Create campaigns in Airtable
async function createCampaigns(campaigns) {
    if (!campaigns?.length) return 0;
    
    const table = base('Campaigns');
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
        'Last Updated': c.lastUpdated
    }}));
    
    let totalCreated = 0;
    for (let i = 0; i < campaigns.length; i += 10) {
        const batch = toRecords(campaigns.slice(i, i + 10));
        const created = await table.create(batch, { typecast: true });
        totalCreated += created.length;
        rateLimiter.requests++;
        await checkRateLimit();
    }
    return totalCreated;
}

// Create ad groups in Airtable
async function createAdGroups(adGroups) {
    if (!adGroups?.length) return 0;
    
    const table = base('Ad Groups');
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
        'Last Updated': ag.lastUpdated
    }}));
    
    let totalCreated = 0;
    for (let i = 0; i < adGroups.length; i += 10) {
        const batch = toRecords(adGroups.slice(i, i + 10));
        const created = await table.create(batch, { typecast: true });
        totalCreated += created.length;
        rateLimiter.requests++;
        await checkRateLimit();
    }
    return totalCreated;
}

// Create keywords in Airtable
async function createKeywords(keywords) {
    if (!keywords?.length) return 0;
    
    const table = base('Keywords');
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
        'Last Updated': k.lastUpdated
    }}));
    
    let totalCreated = 0;
    for (let i = 0; i < keywords.length; i += 10) {
        const batch = toRecords(keywords.slice(i, i + 10));
        const created = await table.create(batch, { typecast: true });
        totalCreated += created.length;
        rateLimiter.requests++;
        await checkRateLimit();
    }
    return totalCreated;
}

// Create ads in Airtable
async function createAds(ads) {
    if (!ads?.length) return 0;
    
    const table = base('Ads');
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
        'Last Updated': ad.lastUpdated
    }}));
    
    let totalCreated = 0;
    for (let i = 0; i < ads.length; i += 10) {
        const batch = toRecords(ads.slice(i, i + 10));
        const created = await table.create(batch, { typecast: true });
        totalCreated += created.length;
        rateLimiter.requests++;
        await checkRateLimit();
    }
    return totalCreated;
}

// Main function to pull all data
async function pullAllData() {
    try {
        console.log('🚀 Starting master date pull...');
        
        // Update status to "Pulling"
        await updateStatus('Pulling', 'Starting data pull...', 0);
        
        // Get master date range
        const dateRange = await getMasterDateRange();
        console.log(`Using date range: ${dateRange}`);
        
        // Get customer ID
        const customerId = config.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');
        if (!customerId) {
            throw new Error('GOOGLE_ADS_CUSTOMER_ID not set in configuration');
        }
        
        // Clear existing data
        await clearExistingData();
        
        // Fetch all data
        console.log('Fetching data from Google Ads...');
        const [campaigns, adGroups, keywords, ads] = await Promise.all([
            fetchCampaigns(customerId, dateRange),
            fetchAdGroups(customerId, dateRange),
            fetchKeywords(customerId, dateRange),
            fetchAds(customerId, dateRange)
        ]);
        
        console.log(`Fetched: ${campaigns.length} campaigns, ${adGroups.length} ad groups, ${keywords.length} keywords, ${ads.length} ads`);
        
        // Create new records
        const recordCounts = await createRecords(campaigns, adGroups, keywords, ads);
        
        const totalRecords = recordCounts.campaigns + recordCounts.adGroups + recordCounts.keywords + recordCounts.ads;
        
        // Update status to success
        await updateStatus('Success', `Successfully pulled ${totalRecords} records`, totalRecords);
        
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
        await updateStatus('Error', `Error: ${error.message}`, 0);
        throw error;
    }
}

// Execute the main function
pullAllData();
