// Vercel serverless function: GET /api/pull-data?start=YYYY-MM-DD&end=YYYY-MM-DD&token=... (optional)
const { MasterDatePullService } = require('../src/master-date-pull');

function isValidDateStr(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

module.exports = async (req, res) => {
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
    const message = e?.response?.data || e?.message || 'Unknown error';
    console.error('API Error:', e);
    res.status(500).json({ success: false, error: message });
  }
};


