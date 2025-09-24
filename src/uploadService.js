import { AirtableClient } from './airtableClient.js';
import { GoogleAdsApi } from 'google-ads-api';

export class UploadService {
  constructor() {
    this.airtable = new AirtableClient();
    this.googleAds = this.createGoogleAdsClient();
  }

  async uploadAdFromQueueItem({
    uploadQueueRecordId,
    campaignId,
    adGroupId,
    headlines,
    descriptions,
    path1,
    path2,
    finalUrl
  }) {
    // Parse pipe-separated fields to arrays if needed
    const headlineList = String(headlines || '')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    const descriptionList = String(descriptions || '')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 2);

    if (headlineList.length < 1 || descriptionList.length < 1) {
      throw new Error('Invalid ad copy: missing headlines or descriptions');
    }

    // Create/update RSA in Google Ads
    const googleAdsAdId = await this.createResponsiveSearchAd({
      campaignId,
      adGroupId,
      headlines: headlineList,
      descriptions: descriptionList,
      path1: path1 || '',
      path2: path2 || '',
      finalUrl
    });

    // Update Upload Queue to Uploaded and store ID
    await this.airtable.updateRecords('Upload Queue', [{
      id: uploadQueueRecordId,
      fields: {
        'Status': 'Uploaded',
        'Uploaded At': new Date().toISOString(),
        'Google Ads Ad ID': googleAdsAdId
      }
    }]);

    return { googleAdsAdId };
  }

  createGoogleAdsClient() {
    const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_MCC_ID; // manager account (no hyphens)
    if (!clientId || !clientSecret || !developerToken || !refreshToken) {
      console.warn('Google Ads credentials missing; uploads will fail.');
    }
    return new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    }).Customer({
      customer_account_id: process.env.GOOGLE_ADS_CUSTOMER_ID, // target account (no hyphens)
      login_customer_id: loginCustomerId,
      refresh_token: refreshToken,
    });
  }

  async createResponsiveSearchAd({ campaignId, adGroupId, headlines, descriptions, path1, path2, finalUrl }) {
    // Build RSA asset arrays (textRules per Google Ads: max 30 for headlines; 90 for descriptions)
    const toAssets = (arr) => arr.filter(Boolean).map(t => ({ text_asset: { text: String(t).slice(0, 90) } }));
    const headlineAssets = toAssets(headlines).slice(0, 15); // API allows up to 15
    const descriptionAssets = toAssets(descriptions).slice(0, 4); // API allows up to 4

    // Resource names must be plain IDs (no hyphens). If your Airtable stores with hyphens, strip them.
    const agId = String(adGroupId).replace(/-/g, '');

    const operations = [
      {
        create: {
          ad_group: `customers/${this.googleAds.customer_id}/adGroups/${agId}`,
          status: 'ENABLED',
          ad: {
            final_urls: [finalUrl],
            responsive_search_ad: {
              headlines: headlineAssets.map(a => ({ text: a.text_asset.text.slice(0, 30) })),
              descriptions: descriptionAssets.map(a => ({ text: a.text_asset.text.slice(0, 90) })),
              path1: (path1 || '').slice(0, 15),
              path2: (path2 || '').slice(0, 15)
            }
          }
        }
      }
    ];

    const service = this.googleAds.adGroupAds;
    const response = await service.create(operations);
    // response returns resource_names like customers/xxx/adGroupAds/yyy
    const resourceName = response?.results?.[0]?.resource_name || '';
    const idMatch = resourceName.match(/adGroupAds\/(\d+)/);
    const adId = idMatch ? idMatch[1] : resourceName;
    return adId;
  }
}


