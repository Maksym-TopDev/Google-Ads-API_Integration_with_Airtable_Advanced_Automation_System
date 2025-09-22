// Vercel API endpoint for Phase 3: AI Ad Generation
import { AdGenerationService } from '../src/ad-generation.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    const { 
      adId, 
      campaignId, 
      adGroupId, 
      campaignName, 
      adGroupName, 
      finalUrl 
    } = req.body;

    // Validate required fields
    if (!adId || !campaignId || !adGroupId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: adId, campaignId, adGroupId'
      });
    }

    // Initialize the ad generation service
    const service = new AdGenerationService();
    
    // Generate ad variants
    const result = await service.generateAdVariants({
      adId,
      campaignId,
      adGroupId,
      campaignName: campaignName || '',
      adGroupName: adGroupName || '',
      finalUrl: finalUrl || ''
    });

    // Return success response
    return res.status(200).json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Phase 3 generation error:', error);
    
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error occurred'
    });
  }
}
