const http = require('http');
const url = require('url');
require('dotenv').config();
const { MasterDatePullService } = require('./master-date-pull');

function send(res, status, data) {
  if (res.headersSent) {
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function isValidDateStr(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  if (req.method === 'GET' && parsed.pathname === '/api/pull-data') {
    try {
      const { start, end, token } = parsed.query || {};

      // Optional simple shared-secret check
      const expectedToken = process.env.API_SHARED_SECRET;
      if (expectedToken && token !== expectedToken) {
        return send(res, 401, { success: false, error: 'Unauthorized' });
      }

      if (!start || !end) {
        return send(res, 400, { success: false, error: 'Missing start or end YYYY-MM-DD' });
      }
      if (!isValidDateStr(start) || !isValidDateStr(end)) {
        return send(res, 400, { success: false, error: 'Invalid date format, expected YYYY-MM-DD' });
      }

      const service = new MasterDatePullService();
      const result = await service.pullWithDateRange(start, end);
      return send(res, 200, { success: true, ...result });
    } catch (e) {
      const message = e?.response?.data || e?.message || 'Unknown error';
      return send(res, 500, { success: false, error: message });
    }
  }


  if (req.method === 'GET' && parsed.pathname === '/health') {
    return send(res, 200, { ok: true });
  }

  send(res, 404, { success: false, error: 'Not found' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

module.exports = { server };


