import { AirtableClient } from './airtableClient.js';
import axios from 'axios';

export class UploadService {
  constructor() {
    this.airtable = new AirtableClient();
    this.googleAdsCfg = this.readGoogleAdsEnv();
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

    // Create/update RSA in Google Ads via REST (avoid gRPC issues on Vercel)
    const googleAdsAdId = await this.createResponsiveSearchAdRest({
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

  readGoogleAdsEnv() {
    const cfg = {
      clientId: process.env.GOOGLE_ADS_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET,
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      loginCustomerId: (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, ''),
      customerId: (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, ''),
      apiVersion: process.env.GOOGLE_ADS_API_VERSION || 'v18'
    };
    const missing = Object.entries(cfg)
      .filter(([k, v]) => !v && !['loginCustomerId'].includes(k))
      .map(([k]) => k);
    if (missing.length) {
      console.warn(`Missing Google Ads env: ${missing.join(', ')}`);
    }
    return cfg;
  }

  async getAccessToken() {
    const { clientId, clientSecret, refreshToken } = this.googleAdsCfg;
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    const res = await axios.post('https://oauth2.googleapis.com/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data.access_token;
  }

  async createResponsiveSearchAdRest({ campaignId, adGroupId, headlines, descriptions, path1, path2, finalUrl }) {
    const { developerToken, loginCustomerId, customerId, apiVersion } = this.googleAdsCfg;
    const accessToken = await this.getAccessToken();

    const cust = String(customerId);
    const agId = String(adGroupId).replace(/-/g, '');

    const toH = (arr) => arr.filter(Boolean).slice(0, 15).map(t => ({ text: String(t).slice(0, 30) }));
    const toD = (arr) => arr.filter(Boolean).slice(0, 4).map(t => ({ text: String(t).slice(0, 90) }));

    const body = {
      mutateOperations: [
        {
          adGroupAdOperation: {
            create: {
              adGroup: `customers/${cust}/adGroups/${agId}`,
              status: 'ENABLED',
              ad: {
                finalUrls: [finalUrl],
                responsiveSearchAd: {
                  headlines: toH(headlines),
                  descriptions: toD(descriptions),
                  ...(path1 ? { path1: String(path1).slice(0, 15) } : {}),
                  ...(path2 ? { path2: String(path2).slice(0, 15) } : {})
                }
              }
            }
          }
        }
      ],
      responseContentType: 'RESOURCE_NAME'
    };

    const url = `https://googleads.googleapis.com/${apiVersion}/customers/${cust}/googleAds:mutate`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
      ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {})
    };

    const res = await axios.post(url, body, { headers });
    const resourceName = res?.data?.mutateOperationResponses?.[0]?.adGroupAdResult?.resourceName
      || res?.data?.results?.[0]?.resourceName
      || '';
    const idMatch = String(resourceName).match(/adGroupAds\/(\d+)/);
    return idMatch ? idMatch[1] : resourceName;
  }
}


