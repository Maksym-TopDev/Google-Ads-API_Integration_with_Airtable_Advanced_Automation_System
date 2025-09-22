import { AirtableClient } from './airtableClient.js';

export class UploadQueueService {
  constructor() {
    this.airtable = new AirtableClient();
  }

  async createUploadQueueFromAdGenerator(adGeneratorRecordId) {
    try {
      console.log(`Creating Upload Queue record from Ad Generator ID: ${adGeneratorRecordId}`);

      // Get the Ad Generator record
      const adGeneratorRecord = await this.getAdGeneratorRecord(adGeneratorRecordId);
      if (!adGeneratorRecord) {
        throw new Error(`Ad Generator record not found: ${adGeneratorRecordId}`);
      }

      // Extract data from Ad Generator record
      const campaignId = adGeneratorRecord.get('Campaign ID');
      const adGroupId = adGeneratorRecord.get('Ad Group ID');
      const headline1 = adGeneratorRecord.get('Headline 1') || '';
      const headline2 = adGeneratorRecord.get('Headline 2') || '';
      const headline3 = adGeneratorRecord.get('Headline 3') || '';
      const description1 = adGeneratorRecord.get('Description 1') || '';
      const description2 = adGeneratorRecord.get('Description 2') || '';
      const path1 = adGeneratorRecord.get('Path1') || '';
      const path2 = adGeneratorRecord.get('Path2') || '';
      const finalUrl = adGeneratorRecord.get('Final URL') || '';

      // Create headlines and descriptions arrays
      const headlines = [headline1, headline2, headline3].filter(h => h.trim());
      const descriptions = [description1, description2].filter(d => d.trim());

      if (headlines.length === 0 || descriptions.length === 0) {
        throw new Error('Ad Generator record missing required headlines or descriptions');
      }

      // Create Upload Queue record
      const uploadQueueRecord = {
        fields: {
          'Campaign ID': campaignId,
          'Ad Group ID': adGroupId,
          'Headlines': headlines.join(' | '),
          'Descriptions': descriptions.join(' | '),
          'Path1': path1,
          'Path2': path2,
          'Final URL': finalUrl,
          'Status': 'Pending',
          'Created At': new Date().toISOString()
        }
      };

      const createdRecords = await this.airtable.createRecords('Upload Queue', [uploadQueueRecord]);
      console.log(`Created Upload Queue record: ${createdRecords[0].id}`);

      // Update the Ad Generator record to mark it as sent to queue
      await this.updateAdGeneratorRecord(adGeneratorRecordId, {
        'To Upload Table': false // Uncheck the checkbox
      });

      return {
        success: true,
        uploadQueueRecordId: createdRecords[0].id,
        message: 'Successfully created Upload Queue record'
      };

    } catch (error) {
      console.error('Error creating Upload Queue record:', error);
      throw error;
    }
  }

  async getAdGeneratorRecord(recordId) {
    try {
      const records = await this.airtable.getRecords('Ad Generator', {
        filterByFormula: `RECORD_ID() = '${recordId}'`
      });
      return records.length > 0 ? records[0] : null;
    } catch (error) {
      console.error('Error fetching Ad Generator record:', error);
      throw error;
    }
  }

  async updateAdGeneratorRecord(recordId, fields) {
    try {
      await this.airtable.updateRecords('Ad Generator', [{
        id: recordId,
        fields: fields
      }]);
    } catch (error) {
      console.error('Error updating Ad Generator record:', error);
      throw error;
    }
  }
}
