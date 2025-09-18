const Airtable = require('airtable');
require('dotenv').config();

class AirtableClient {
	constructor() {
		const apiKey = process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY;
		const baseId = process.env.AIRTABLE_BASE_ID;
		if (!apiKey || !baseId) throw new Error('Missing AIRTABLE_PAT (or AIRTABLE_API_KEY) or AIRTABLE_BASE_ID');
		this.base = new Airtable({ apiKey }).base(baseId);
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

	async createCampaigns(campaigns) {
		await this.checkRateLimit();
		if (!campaigns?.length) return [];
		const table = this.base('Campaigns');
		const toRecords = (items) => items.map(c => ({ fields: {
			'Campaign ID': c.id,
			'Campaign Name': c.name,
			'Status': c.status,
			'Channel Type': c.channelType,
			'Start Date': c.startDate,
			'End Date': c.endDate,
			'Impressions': c.impressions,
			'Clicks': c.clicks,
			'CTR': c.ctr,
			'Cost': c.cost,
			'Conversions': c.conversions,
			'Conversion Rate': c.conversionRate,
			'CPA': c.cpa,
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
		await this.checkRateLimit();
		if (!adGroups?.length) return [];
		const table = this.base('Ad Groups');
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
			'CPA': ag.cpa,
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
		await this.checkRateLimit();
		if (!keywords?.length) return [];
		const table = this.base('Keywords');
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
			'CPA': k.cpa,
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
		await this.checkRateLimit();
		if (!ads?.length) return [];
		const table = this.base('Ads');
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
			'CPA': ad.cpa,
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

	async getRecords(tableName, options = {}) {
		await this.checkRateLimit();
		const table = this.base(tableName);
		const records = [];
		
		await table.select(options).eachPage((pageRecords, fetchNextPage) => {
			records.push(...pageRecords);
			fetchNextPage();
		});
		
		this.rateLimiter.requests++;
		return records;
	}

	async createRecords(tableName, records) {
		await this.checkRateLimit();
		if (!records?.length) return [];
		const table = this.base(tableName);
		const out = [];
		
		for (let i = 0; i < records.length; i += 10) {
			const batch = records.slice(i, i + 10);
			const created = await table.create(batch, { typecast: true });
			out.push(...created);
			this.rateLimiter.requests++;
			await this.checkRateLimit();
		}
		return out;
	}
}

module.exports = { AirtableClient };
