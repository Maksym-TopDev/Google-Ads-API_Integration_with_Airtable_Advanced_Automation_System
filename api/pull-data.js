// Vercel serverless function: GET /api/pull-data?start=YYYY-MM-DD&end=YYYY-MM-DD&token=... (optional)
const { MasterDatePullService } = require('../src/master-date-pull');

function isValidDateStr(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

module.exports = async (req, res) => {
  // Enable CORS for Airtable scripts
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { start, end, recordId } = req.query || {};
    
    console.log('API Request:', { start, end, recordId });

    // Handle MISSING values from Airtable formula
    if (!start || !end || start === 'MISSING' || end === 'MISSING') {
      res.status(400).json({ 
        success: false, 
        error: 'Please set both Master Start Date and Master End Date in your Airtable record' 
      });
      return;
    }
    
    if (!isValidDateStr(start) || !isValidDateStr(end)) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid date format. Please ensure dates are in YYYY-MM-DD format' 
      });
      return;
    }

    console.log(`Starting data pull for ${start} to ${end}, recordId: ${recordId}`);
    
    const service = new MasterDatePullService();
    const result = await service.pullWithDateRange(start, end, recordId);
    
    console.log('Data pull completed successfully:', result);
    res.status(200).json({ success: true, ...result });
    
  } catch (e) {
    console.error('API Error:', e);
    
    let errorMessage = 'Unknown error';
    
    if (e?.response?.data) {
      // Google Ads API error
      if (typeof e.response.data === 'object') {
        errorMessage = JSON.stringify(e.response.data, null, 2);
      } else {
        errorMessage = e.response.data;
      }
    } else if (e?.message) {
      errorMessage = e.message;
    } else if (typeof e === 'string') {
      errorMessage = e;
    }
    
    console.error('Error details:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
};


