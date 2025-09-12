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
    const { start, end, token, recordId } = req.query || {};

    const expected = process.env.API_SHARED_SECRET;
    if (expected && token !== expected) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!start || !end) {
      res.status(400).json({ success: false, error: 'Missing start or end (YYYY-MM-DD)' });
      return;
    }
    if (!isValidDateStr(start) || !isValidDateStr(end)) {
      res.status(400).json({ success: false, error: 'Invalid date format, expected YYYY-MM-DD' });
      return;
    }

    const service = new MasterDatePullService();
    const result = await service.pullWithDateRange(start, end, recordId);
    res.status(200).json({ success: true, ...result });
  } catch (e) {
    const message = e?.response?.data || e?.message || 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
};


