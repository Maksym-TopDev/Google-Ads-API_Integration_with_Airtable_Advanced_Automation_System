# Google Ads Airtable Automation System

A Node.js application that automates Google Ads data pulling and performance analysis using Airtable as the data management platform.

## Features

- **Master Date Control**: Single date range controls ALL campaigns, ad groups, keywords, and ads
- **On-Demand Data Sync**: Pulls campaign, ad group, keyword, and ad performance data from Google Ads
- **Airtable Integration**: Stores and manages data in a relational database structure with status tracking
- **Performance Analysis**: Calculates KPIs and performance metrics for consistent time periods
- **MCC Support**: Works with Google Ads Manager (MCC) accounts
- **Batch Processing**: Handles large datasets with proper rate limiting
- **Button Automation**: One-click data pull via Airtable button interface
- **Status Tracking**: Real-time status updates and error reporting in Airtable
- **🤖 AI Ad Generation**: OpenAI-powered ad variant generation based on high-performing ads
- **🚀 Vercel Deployment**: Serverless deployment with automatic scaling
- **⚡ Real-time Automation**: Airtable triggers for instant ad generation

## Prerequisites

- Node.js 18+
- Google Ads API access
- Airtable account
- Google Cloud Project with OAuth credentials
- OpenAI API key (for AI ad generation)
- Vercel account (for deployment)

## Installation

1. Clone the repository
```bash
git clone <repository-url>
cd google-ads-automation
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your credentials
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Google Ads API Configuration
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
GOOGLE_ADS_OAUTH_CLIENT_ID=your_client_id
GOOGLE_ADS_OAUTH_CLIENT_SECRET=your_client_secret
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token
GOOGLE_ADS_CUSTOMER_ID=your_customer_id
GOOGLE_ADS_MCC_CUSTOMER_ID=your_mcc_customer_id
GOOGLE_ADS_API_VERSION=v21

# Airtable Configuration
AIRTABLE_PAT=your_airtable_personal_access_token
AIRTABLE_BASE_ID=your_airtable_base_id

# OpenAI Configuration (for AI ad generation)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4

# Application Configuration
PUSH_TO_AIRTABLE=true
YESTERDAY=true
```

### Google Ads API Setup

1. Create a Google Cloud Project
2. Enable the Google Ads API
3. Create OAuth 2.0 credentials
4. Get your developer token from Google Ads
5. Obtain refresh token using the authorization flow

### Airtable Setup

#### Master Date Control Approach

This system uses a **master date control** where one date range controls ALL data across all tables. This provides:

- ✅ **Consistent Reporting**: All campaigns show performance for the same time period
- ✅ **Easy Comparison**: Compare campaign performance across the same timeframe
- ✅ **Simplified UI**: One date range controls everything
- ✅ **Single Action**: One button updates entire dashboard

#### Required Tables

Create the following tables in your Airtable base:

#### 1. Set Date Table (Master Control)
- **Master Start Date** (Date) - Start date for all data pulls
- **Master End Date** (Date) - End date for all data pulls  
- **Pull Data Button** (Button) - Triggers data pull for all campaigns
- **Last Pull Status** (Single line text) - Shows last pull status
- **Last Pull Time** (Date & time) - When last data pull was executed
- **Records Updated** (Number) - How many total records were updated
- **Status** (Single select: Ready, Pulling, Success, Error)

#### 2. Data Tables

#### Campaigns Table
- Campaign ID (Number)
- Campaign Name (Single line text)
- Status (Single select: ENABLED, PAUSED, REMOVED)
- Channel Type (Single select: SEARCH, DISPLAY, VIDEO, etc.)
- Start Date (Date)
- End Date (Date)
- Impressions (Number)
- Clicks (Number)
- CTR (Number)
- Cost (Currency)
- Conversions (Number)
- Conversion Rate (Number)
- CPA (Currency)
- ROAS (Number)
- Last Updated (Date)

#### Ad Groups Table
- Ad Group ID (Number)
- Ad Group Name (Single line text)
- Status (Single select)
- Campaign ID (Number)
- Campaign Name (Single line text)
- Impressions (Number)
- Clicks (Number)
- CTR (Number)
- Cost (Currency)
- Conversions (Number)
- Conversion Rate (Number)
- CPA (Currency)
- ROAS (Number)
- Last Updated (Date)

#### Keywords Table
- Keyword ID (Number)
- Keyword Text (Single line text)
- Match Type (Single select: EXACT, PHRASE, BROAD)
- Status (Single select)
- Ad Group ID (Number)
- Ad Group Name (Single line text)
- Campaign ID (Number)
- Campaign Name (Single line text)
- Impressions (Number)
- Clicks (Number)
- CTR (Number)
- Cost (Currency)
- Conversions (Number)
- Conversion Rate (Number)
- CPA (Currency)
- ROAS (Number)
- Quality Score (Number)
- Last Updated (Date)

#### Ads Table
- Ad ID (Number)
- Headlines (Long text)
- Descriptions (Long text)
- Path1 (Single line text)
- Path2 (Single line text)
- Final URLs (Long text)
- Ad Group ID (Number)
- Ad Group Name (Single line text)
- Campaign ID (Number)
- Campaign Name (Single line text)
- Impressions (Number)
- Clicks (Number)
- CTR (Number)
- Cost (Currency)
- Conversions (Number)
- Conversion Rate (Number)
- CPA (Currency)
- ROAS (Number)
- Performance Score (Number) - **For AI generation triggers**
- Meets Threshold (Checkbox) - **Triggers AI ad generation**
- Last Generation Status (Single line text)
- Last Generation Time (Date)
- Variants Generated (Number)
- Generation Error (Long text)
- Last Updated (Date)

#### Ad Generator Table (Phase 3)
- Campaign ID (Number)
- Ad Group ID (Number)
- Headlines (Long text) - Format: "headline1 | headline2 | headline3"
- Descriptions (Long text) - Format: "desc1 | desc2"
- Path1 (Single line text)
- Path2 (Single line text)
- Created At (Date)

#### Upload Queue Table (Phase 3)
- Campaign ID (Number)
- Ad Group ID (Number)
- Headlines (Long text) - Format: "headline1 | headline2 | headline3"
- Descriptions (Long text) - Format: "desc1 | desc2"
- Final URL (Single line text)
- Status (Single select: Pending, Processing, Completed, Failed)
- Path1 (Single line text)
- Path2 (Single line text)
- Created At (Date)

## Usage

### Master Date Control Workflow

1. **Set Date Range in Airtable:**
   - Open your Airtable base
   - Go to the "Set Date" table
   - Set your desired "Master Start Date" and "Master End Date"
   - Click the "Pull Data Button"

2. **Automatic Data Pull:**
   - The system will fetch data for ALL campaigns, ad groups, keywords, and ads
   - All data will be for the same date range (consistent reporting)
   - Status will be updated in real-time in the "Set Date" table

### Phase 3: AI Ad Generation Workflow

1. **Trigger AI Generation:**
   - In the Ads table, check the "Meets Threshold" checkbox for any high-performing ad
   - This automatically triggers the AI ad generation process

2. **AI Processing:**
   - The system analyzes the source ad's performance and content
   - OpenAI GPT-4 generates 3 new ad variants based on the high-performing ad
   - Variants are optimized for Google Ads character limits and policy compliance

3. **Automatic Storage:**
   - Generated variants are saved to the "Ad Generator" table
   - Ready-to-upload ads are queued in the "Upload Queue" table
   - Status is updated in the original Ads record

### Running the Application

#### Local Development

1. **Start lightweight HTTP server (for Airtable Button URL):**
```bash
npm run start
```

Endpoint: `GET /api/pull-data?start=YYYY-MM-DD&end=YYYY-MM-DD[&token=YOUR_SECRET]`

2. **Manual data pull (command line):**
```bash
npm run master-pull
```

3. **Test the setup:**
```bash
npm test
```

#### Vercel Deployment (Phase 3)

1. **Deploy to Vercel:**
```bash
# Install Vercel CLI
npm install -g vercel

# Login and deploy
vercel login
vercel

# Deploy to production
vercel --prod
```

2. **Set Environment Variables in Vercel:**
   - Go to your Vercel project dashboard
   - Navigate to Settings → Environment Variables
   - Add: `OPENAI_API_KEY`, `AIRTABLE_PAT`, `AIRTABLE_BASE_ID`

3. **Configure Airtable Automation:**
   - Use the provided `airtable-script-phase3-vercel.js`
   - Set `apiUrl` to your Vercel deployment URL
   - Create automation: When "Meets Threshold" is checked → Run script

## Phase 3: AI Ad Generation Setup

### Quick Start

1. **Deploy to Vercel:**
   ```bash
   vercel --prod
   ```

2. **Set Environment Variables:**
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `AIRTABLE_PAT`: Your Airtable personal access token
   - `AIRTABLE_BASE_ID`: Your Airtable base ID

3. **Create Airtable Tables:**
   - **Ad Generator**: Stores AI-generated ad variants
   - **Upload Queue**: Ready-to-upload ads
   - **Update Ads Table**: Add Phase 3 fields (Performance Score, Meets Threshold, etc.)

4. **Set Up Automation:**
   - Create automation in Airtable
   - Trigger: When "Meets Threshold" is checked
   - Action: Run script with `airtable-script-phase3-vercel.js`
   - Set `apiUrl` to your Vercel deployment URL

### API Endpoints

#### POST /api/generate-ad

Generates AI-powered ad variants based on high-performing ads.

**Request:**
```json
{
  "adId": "747836975928",
  "campaignId": "22475792074", 
  "adGroupId": "177122875614",
  "campaignName": "Test Campaign",
  "adGroupName": "Test Ad Group",
  "finalUrl": "https://example.com",
  "performanceScore": 5
}
```

**Response:**
```json
{
  "success": true,
  "variantsGenerated": 3,
  "adGeneratorRecords": 3,
  "uploadQueueRecords": 3,
  "variants": [...]
}
```

### Testing

Test your deployment:
```bash
curl -X POST https://your-vercel-url.vercel.app/api/generate-ad \
  -H "Content-Type: application/json" \
  -d '{"adId":"747836975928","campaignId":"22475792074","adGroupId":"177122875614","campaignName":"Test","adGroupName":"Test","finalUrl":"https://example.com","performanceScore":5}'
```

### Data Fetching

The application fetches data for the following entities using the master date range:
- **Campaigns**: Campaign-level performance metrics
- **Ad Groups**: Ad group performance within campaigns  
- **Keywords**: Keyword performance within ad groups
- **Ads**: Ad performance within ad groups

### Benefits of Master Date Control

- ✅ **Consistent Time Periods**: All data shows performance for the same date range
- ✅ **Easy Comparison**: Compare campaigns, ad groups, keywords, and ads for the same period
- ✅ **Single Action**: One button updates entire dashboard
- ✅ **Simplified Management**: No need to manage individual date ranges per campaign

## Project Structure

```
├── api/
│   └── generate-ad.js          # Vercel API endpoint for AI ad generation
├── src/
│   ├── fetch.js                # Original data fetching script
│   ├── master-date-pull.js     # Master date control script
│   ├── airtableClient.js       # Airtable API client with batching
│   ├── ad-generation.js        # AI ad generation service
│   └── server.js               # HTTP server for local development
├── airtable-script-phase3-vercel.js  # Airtable automation script
├── vercel.json                 # Vercel deployment configuration
├── package.json                # Dependencies and scripts
└── .env                        # Environment variables
```

## API Integration

### Google Ads API
- Uses GAQL (Google Ads Query Language) for data extraction
- Supports v21 API version
- Handles OAuth 2.0 authentication
- Includes rate limiting and error handling

### Airtable API
- Batch processing (10 records per request)
- Rate limiting compliance
- Automatic retry logic
- Data validation and type casting

### OpenAI API (Phase 3)
- GPT-4 powered ad copy generation
- Performance-based prompting
- Character limit validation (30 chars headlines, 90 chars descriptions)
- Policy-compliant content generation

## Error Handling

The application includes comprehensive error handling for:
- Google Ads API rate limits
- Airtable API limits
- OpenAI API rate limits and errors
- Network connectivity issues
- Data validation errors
- OAuth token expiration
- Vercel deployment protection
- Airtable automation failures

## Troubleshooting

### Common Issues

1. **Google Ads API 404 Error**
   - Check `GOOGLE_ADS_API_VERSION` in `.env`
   - Ensure you're using a supported API version

2. **Airtable 422 Error**
   - Verify table names match exactly
   - Check field names and types
   - Ensure batch size doesn't exceed 10 records

3. **OAuth Token Issues**
   - Refresh your OAuth tokens
   - Verify client ID and secret
   - Check token expiration

4. **Rate Limiting**
   - The application includes built-in rate limiting
   - Check logs for rate limit warnings
   - Consider reducing batch sizes if needed

5. **Vercel Deployment Issues**
   - Check deployment protection settings
   - Verify environment variables are set correctly
   - Check Vercel function logs for errors
   - Ensure API endpoint URL is correct in Airtable script

6. **AI Generation Issues**
   - Verify OpenAI API key is valid
   - Check character limits in generated content
   - Ensure source ad data exists in Airtable
   - Check Airtable table structure matches requirements

### Debug Mode

Enable debug logging by setting:
```env
LOG_LEVEL=debug
```

## Development

### Adding New Data Types

1. Create a new fetch function in `src/fetch.js`
2. Add corresponding Airtable table structure
3. Update `airtableClient.js` with new create method
4. Add to main execution flow

### Testing

```bash
# Run tests
npm test

# Test specific functionality
node src/fetch.js
```

## Future Enhancements

### Phase 2: Performance Analysis
- [x] Performance scoring algorithms
- [x] Threshold detection
- [x] KPI calculations
- [x] Automated analysis

### Phase 3: AI Ad Generation ✅ COMPLETED
- [x] OpenAI GPT-4 integration
- [x] AI ad generation system
- [x] Vercel serverless deployment
- [x] Airtable automation triggers
- [x] Character limit validation
- [x] Performance-based prompting
- [x] Error handling and logging

### Phase 4: Google Ads Upload (Future)
- [ ] Direct Google Ads API integration
- [ ] Automated ad upload from queue
- [ ] Campaign management automation
- [ ] Performance monitoring

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the logs
3. Create an issue with detailed error information
