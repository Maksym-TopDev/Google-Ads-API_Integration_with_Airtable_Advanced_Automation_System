// Vercel serverless function: POST /api/upload-queue-item
// Purpose: Accept an Upload Queue record payload, perform server-side processing,
// and update Airtable Status/fields accordingly so Airtable scripts only call this API.
import { UploadService } from '../src/uploadService.js';

export default async function handler(req, res) {
  // Enable CORS for Airtable scripts
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const {
      uploadQueueRecordId,
      campaignId,
      adGroupId,
      headlines,
      descriptions,
      path1,
      path2,
      finalUrl
    } = req.body || {};

    // Basic validation
    const missing = [];
    if (!uploadQueueRecordId) missing.push('uploadQueueRecordId');
    if (!campaignId) missing.push('campaignId');
    if (!adGroupId) missing.push('adGroupId');
    if (!headlines) missing.push('headlines');
    if (!descriptions) missing.push('descriptions');
    if (!finalUrl) missing.push('finalUrl');
    if (missing.length) {
      return res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
    }

    const uploader = new UploadService();
    const result = await uploader.uploadAdFromQueueItem({
      uploadQueueRecordId,
      campaignId,
      adGroupId,
      headlines,
      descriptions,
      path1,
      path2,
      finalUrl
    });

    return res.status(200).json({ success: true, uploadId: result.googleAdsAdId });
  } catch (error) {
    console.error('Upload Queue processing error:', error);
    try {
      const uploadQueueRecordId = req?.body?.uploadQueueRecordId;
      if (uploadQueueRecordId) {
        // Update to Failed best-effort
        const { AirtableClient } = await import('../src/airtableClient.js');
        const airtable = new AirtableClient();
        await airtable.updateRecords('Upload Queue', [{
          id: uploadQueueRecordId,
          fields: {
            'Status': 'Failed',
            // Intentionally not setting an error field per requirements
          }
        }]);
      }
    } catch (inner) {
      // Best-effort; avoid throwing from error handler
      console.error('Failed to update Upload Queue to Failed state:', inner);
    }
    return res.status(500).json({ success: false, error: error?.message || 'Unknown error' });
  }
}


