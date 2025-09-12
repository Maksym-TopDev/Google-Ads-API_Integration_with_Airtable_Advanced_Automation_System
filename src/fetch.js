const axios = require('axios');
require('dotenv').config();

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v21';

async function getAccessToken() {
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

async function executeGAQL(customerId, query) {
	const accessToken = await getAccessToken();
	const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`;
	const resp = await axios.post(
		url,
		{ query },
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
				'login-customer-id': (process.env.GOOGLE_ADS_MCC_ID || '').replace(/-/g, ''),
			},
			timeout: 120000,
		}
	);
	const rows = [];
	for (const chunk of resp.data) if (chunk.results) rows.push(...chunk.results);
	return rows;
}

async function fetchCampaigns(customerId, dateRange = 'LAST_7_DAYS') {
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
	WHERE segments.date DURING ${dateRange}
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
		conversionRate: r.metrics.conversionRate,
		roas: r.metrics.allConversionsValue,
		lastUpdated: new Date().toISOString(),
	}));
}

async function fetchAdGroups(customerId, dateRange = 'LAST_7_DAYS') {
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
	WHERE segments.date DURING ${dateRange}
	`;
	const rows = await executeGAQL(customerId, query);
	return rows.map((r) => ({
		id: String(r.adGroup.id),
		name: r.adGroup.name,
		status: r.adGroup.status,
		campaignId: r.adGroup.campaign?.split('/').pop(),
		campaignName: '', // Will be filled from campaign data
		impressions: r.metrics.impressions,
		clicks: r.metrics.clicks,
		ctr: r.metrics.ctr,
		cost: r.metrics.costMicros,
		conversions: r.metrics.conversions,
		conversionRate: r.metrics.conversionRate,
		roas: r.metrics.allConversionsValue,
		lastUpdated: new Date().toISOString(),
	}));
}

async function fetchKeywords(customerId, dateRange = 'LAST_7_DAYS') {
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
	WHERE segments.date DURING ${dateRange}
	`;
	const rows = await executeGAQL(customerId, query);
	return rows.map((r) => ({
		id: String(r.adGroupCriterion.criterionId),
		text: r.adGroupCriterion.keyword?.text,
		matchType: r.adGroupCriterion.keyword?.matchType,
		status: r.adGroupCriterion.status,
		adGroupId: r.adGroupCriterion.adGroup?.split('/').pop(),
		adGroupName: '', // Will be filled from ad group data
		campaignId: '', // Will be filled from ad group data
		campaignName: '', // Will be filled from ad group data
		qualityScore: r.adGroupCriterion.qualityInfo?.qualityScore,
		impressions: r.metrics.impressions,
		clicks: r.metrics.clicks,
		ctr: r.metrics.ctr,
		cost: r.metrics.costMicros,
		conversions: r.metrics.conversions,
		conversionRate: r.metrics.conversionRate,
		roas: r.metrics.allConversionsValue,
		lastUpdated: new Date().toISOString(),
	}));
}

async function fetchAds(customerId, dateRange = 'LAST_7_DAYS') {
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
	WHERE segments.date DURING ${dateRange}
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
		adGroupName: '', // Will be filled from ad group data
		campaignId: '', // Will be filled from ad group data
		campaignName: '', // Will be filled from ad group data
		impressions: r.metrics.impressions,
		clicks: r.metrics.clicks,
		ctr: r.metrics.ctr,
		cost: r.metrics.costMicros,
		conversions: r.metrics.conversions,
		conversionRate: r.metrics.conversionRate,
		roas: r.metrics.allConversionsValue,
		lastUpdated: new Date().toISOString(),
	}));
}

async function maybePushToAirtable(campaigns, adGroups, keywords, ads) {
	if (!process.env.PUSH_TO_AIRTABLE || process.env.PUSH_TO_AIRTABLE.toLowerCase() !== 'true') return;
	const { AirtableClient } = require('./airtableClient');
	const client = new AirtableClient();
	
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
	
	await client.createCampaigns(campaigns);
	await client.createAdGroups(adGroups);
	await client.createKeywords(keywords);
	await client.createAds(ads);
}

async function main() {
	// Prefer env vars; allow CLI overrides
	const envCustomer = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
	const envDateRange = process.env.GOOGLE_ADS_DATE_RANGE || 'LAST_7_DAYS';
	const argCustomer = (process.argv[2] || '').replace(/-/g, '');
	const argDateRange = process.argv[3];

	const customerId = argCustomer || envCustomer;
	const dateRange = argDateRange || envDateRange;

	if (!customerId) {
		console.error('Missing customer ID. Set GOOGLE_ADS_CUSTOMER_ID in .env or pass as first argument.');
		process.exit(1);
	}
	
	console.log(`Fetching data for customer ${customerId} with date range ${dateRange}...`);
	
	const [campaigns, adGroups, keywords, ads] = await Promise.all([
		fetchCampaigns(customerId, dateRange),
		fetchAdGroups(customerId, dateRange),
		fetchKeywords(customerId, dateRange),
		fetchAds(customerId, dateRange)
	]);
	
	await maybePushToAirtable(campaigns, adGroups, keywords, ads);
	
	console.log(`Fetched: ${campaigns.length} campaigns, ${adGroups.length} ad groups, ${keywords.length} keywords, ${ads.length} ads`);
	console.log(JSON.stringify({ campaigns, adGroups, keywords, ads }, null, 2));
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e?.response?.data || e);
		process.exit(1);
	});
}

module.exports = { fetchCampaigns, fetchAdGroups, fetchKeywords, fetchAds };
