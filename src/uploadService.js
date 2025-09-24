import { AirtableClient } from './airtableClient.js';

export class UploadService {
  constructor() {
    this.airtable = new AirtableClient();
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

    // TODO: Integrate with Google Ads API. For now, simulate success and return synthetic ID.
    const syntheticGoogleAdsAdId = `gad_${Date.now().toString(36)}`;

    // Update Upload Queue to Uploaded and store ID
    await this.airtable.updateRecords('Upload Queue', [{
      id: uploadQueueRecordId,
      fields: {
        'Status': 'Uploaded',
        'Uploaded At': new Date().toISOString(),
        'Google Ads Ad ID': syntheticGoogleAdsAdId
      }
    }]);

    return { googleAdsAdId: syntheticGoogleAdsAdId };
  }
}


