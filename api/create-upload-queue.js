// Vercel serverless function: POST /api/create-upload-queue
import { UploadQueueService } from '../src/upload-queue-service.js';

export default async function handler(req, res) {
  // Enable CORS for Airtable scripts
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { adGeneratorRecordId } = req.body;
    
    console.log('API Request - Create Upload Queue:', { adGeneratorRecordId });

    if (!adGeneratorRecordId) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing required field: adGeneratorRecordId' 
      });
      return;
    }

    const service = new UploadQueueService();
    const result = await service.createUploadQueueFromAdGenerator(adGeneratorRecordId);
    
    console.log('Upload Queue creation completed successfully:', result);
    res.status(200).json({ success: true, ...result });
    
  } catch (error) {
    console.error('API Error:', error);
    
    let errorMessage = 'Unknown error';
    
    if (error?.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    console.error('Error details:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
}
