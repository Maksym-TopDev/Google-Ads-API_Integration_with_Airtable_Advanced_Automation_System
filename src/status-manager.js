import { AirtableClient } from './airtableClient.js';

export class StatusManager {
  constructor() {
    this.airtable = new AirtableClient();
  }

  // Update Generate Status in Ads table
  async updateGenerateStatus(adId, status) {
    try {
      const records = await this.airtable.getRecords('Ads', {
        filterByFormula: `{Ad ID} = '${adId}'`
      });

      if (records.length > 0) {
        await this.airtable.updateRecords('Ads', [{
          id: records[0].id,
          fields: {
            'Generate Status': status,
            'Meets Threshold': false // Always uncheck the trigger
          }
        }]);
        console.log(`Updated Generate Status to '${status}' for Ad ID: ${adId}`);
      } else {
        console.warn(`Ad not found for Ad ID: ${adId}`);
      }
    } catch (error) {
      console.error('Error updating Generate Status:', error);
      throw error;
    }
  }

  // Update To Upload Status in Ad Generator table
  async updateToUploadStatus(adGeneratorRecordId, status) {
    try {
      const records = await this.airtable.getRecords('Ad Generator', {
        filterByFormula: `RECORD_ID() = '${adGeneratorRecordId}'`
      });

      if (records.length > 0) {
        const fields = {
          'To Upload Status': status
        };

        // If status is successful, uncheck the trigger checkbox
        if (status === 'Sent to Queue') {
          fields['To Upload Table'] = false;
        }

        await this.airtable.updateRecords('Ad Generator', [{
          id: records[0].id,
          fields: fields
        }]);
        console.log(`Updated To Upload Status to '${status}' for Ad Generator ID: ${adGeneratorRecordId}`);
      } else {
        console.warn(`Ad Generator record not found for ID: ${adGeneratorRecordId}`);
      }
    } catch (error) {
      console.error('Error updating To Upload Status:', error);
      throw error;
    }
  }

  // Get all Ad Generator records that have "To Upload Table" checked
  async getPendingUploads() {
    try {
      const records = await this.airtable.getRecords('Ad Generator', {
        filterByFormula: `{To Upload Table} = TRUE()`
      });
      return records;
    } catch (error) {
      console.error('Error fetching pending uploads:', error);
      throw error;
    }
  }

  // Process all pending uploads (batch operation)
  async processPendingUploads() {
    try {
      const pendingRecords = await this.getPendingUploads();
      console.log(`Found ${pendingRecords.length} pending uploads`);

      const results = [];
      for (const record of pendingRecords) {
        try {
          const uploadService = new (await import('./upload-queue-service.js')).UploadQueueService();
          const result = await uploadService.createUploadQueueFromAdGenerator(record.id);
          results.push({ recordId: record.id, success: true, result });
        } catch (error) {
          console.error(`Failed to process upload for record ${record.id}:`, error);
          await this.updateToUploadStatus(record.id, 'Failed');
          results.push({ recordId: record.id, success: false, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('Error processing pending uploads:', error);
      throw error;
    }
  }
}
