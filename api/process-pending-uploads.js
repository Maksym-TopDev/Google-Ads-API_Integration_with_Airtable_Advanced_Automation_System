// Vercel serverless function: POST /api/process-pending-uploads
// This endpoint processes all Ad Generator records with "To Upload Table" checked
import { StatusManager } from '../src/status-manager.js';

export default async function handler(req, res) {
  // Enable CORS for direct API calls
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
    console.log('API Request - Process Pending Uploads');

    const statusManager = new StatusManager();
    const results = await statusManager.processPendingUploads();
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log(`Processed ${results.length} uploads: ${successCount} successful, ${failureCount} failed`);
    
    res.status(200).json({ 
      success: true, 
      processed: results.length,
      successful: successCount,
      failed: failureCount,
      results: results
    });
    
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
