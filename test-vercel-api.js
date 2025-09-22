// Test Vercel API endpoint
import https from 'https';

// Your actual Vercel deployment base URL (no path)
const VERCEL_BASE = 'https://google-ads-airtable.vercel.app';
const VERCEL_PATH = '/api/generate-ad';
const endpoint = new URL(VERCEL_PATH, VERCEL_BASE);

const testData = {
    adId: '747836975928',
    campaignId: '22475792074',
    adGroupId: '177122875614',
    campaignName: 'Honest Healthwise Low Sex Drive',
    adGroupName: 'Low Sex Drive',
    finalUrl: 'https://www.honesthealthwise.com/article/the-5-best-libido-boosters-of-2025',
    toUpload: true
};

const postData = JSON.stringify(testData);

const options = {
    hostname: endpoint.hostname,
    port: 443,
    path: endpoint.pathname,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('🧪 Testing Vercel API Endpoint...');
console.log(`🌐 URL: ${endpoint.toString()}`);
console.log('📊 Test data:', testData);
console.log('');

const req = https.request(options, (res) => {
    console.log(`📡 Status: ${res.statusCode}`);
    console.log('📋 Headers:', res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('\n📄 Response received:');
        try {
            const parsed = JSON.parse(data);
            console.log(JSON.stringify(parsed, null, 2));
            
            if (parsed.success) {
                console.log('\n✅ Test successful!');
                console.log(`- Variants generated: ${parsed.variantsGenerated || 'N/A'}`);
                console.log(`- Ad Generator records: ${parsed.adGeneratorRecords || 'N/A'}`);
                console.log(`- Upload Queue records: ${parsed.uploadQueueRecords || 'N/A'}`);
            } else {
                console.log('\n❌ Test failed:', parsed.error);
            }
        } catch (e) {
            console.log('❌ Invalid JSON response:');
            console.log('Raw response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request error:', error.message);
});

req.on('timeout', () => {
    console.error('❌ Request timeout');
    req.destroy();
});

req.setTimeout(60000); // 60 second timeout for OpenAI/Airtable calls

req.write(postData);
req.end();
