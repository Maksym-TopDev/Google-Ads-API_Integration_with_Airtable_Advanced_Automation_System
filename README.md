# Google Ads + Airtable Automation System

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
- **🤖 AI Ad Generation (Claude)**: Claude-powered ad generation from destination URL + keywords
- **🧠 Variety Enforcement**: De-duplication and retry logic to ensure distinct variants
- **⬆️ Google Ads Upload (REST)**: Real RSA uploads via REST with auto-capacity ad group selection
- **🚀 Vercel Deployment**: Serverless deployment with automatic scaling
- **⚡ Real-time Automation**: Airtable triggers for instant ad generation

## Prerequisites

- Node.js 18+
- Google Ads API access
- Airtable account
- Google Cloud Project with OAuth credentials
- Anthropic API key (Claude) for AI ad generation
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
GOOGLE_ADS_NEW_AD_STATUS=PAUSED

# Airtable Configuration
AIRTABLE_PAT=your_airtable_personal_access_token
AIRTABLE_BASE_ID=your_airtable_base_id

# Anthropic (Claude) Configuration
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-3-5-sonnet-20240620

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

#### Operations (Set Date) Control

This system uses an Operations tab (Set Date) for both date control and ad generation:

- Master Start Date / Master End Date
- Quick Range (Last 7/30/90 Days)
- Destination URL, Target Keywords
- Campaign, Ad Group (optional; uploader can auto-select capacity)
- Generate Ads (checkbox) → creates Ad Generator records
- Send to Upload Queue (checkbox) → creates Upload Queue records / triggers upload

#### Required Tables

##### 1. Set Date (Operations)
- Master Start Date (Date)
- Master End Date (Date)
- Quick Range (Single select)
- Destination URL (URL)
- Target Keywords (Long text)
- Campaign (single select or link)
- Ad Group (single select or link)
- Landing Page Source (Existing/New) + Existing Page / New Page URL
- Generate Ads (Checkbox), Generation Status, Generation Error, Generated Record IDs
- Send to Upload Queue (Checkbox), Upload Status

##### 2. Campaigns / Ad Groups / Keywords / Ads (reporting)

##### 3. Ad Generator
- Campaign ID, Ad Group ID, Final URL, Target Keywords
- Headlines "h1 | h2 | h3", Descriptions "d1 | d2", Path1, Path2
- Created At, To Upload Table (optional)

##### 4. Upload Queue
- Campaign ID, Ad Group ID, Final URL
- Headlines "h1 | h2 | h3", Descriptions "d1 | d2", Path1, Path2
- Status (Pending, Processing, Completed, Failed)
- Google Ads Ad ID, Uploaded At, Created At

## Usage

### Master Date Control Workflow

1. Set date range or use Quick Range in Set Date
2. Click Pull Data Button (or run the API) to refresh data across tables

### AI Ad Generation (Claude)

1. In Set Date, fill Destination URL (+ Existing/New), Campaign/Ad Group (optional), Keywords
2. Check Generate Ads to trigger automation
3. Claude generates 3 distinct variants (30/90/15 char limits enforced)
4. Variants are saved in Ad Generator and linked back to Set Date

### Google Ads Upload (REST)

- Uses OAuth access token + REST mutate endpoint
- Auto-selects an Ad Group in the same campaign with RSA capacity (< 3 enabled)
- Creates ads with default status from `GOOGLE_ADS_NEW_AD_STATUS` (PAUSED recommended)
- Stores Google Ads Ad ID and Uploaded At in Airtable

## Project Structure

```
├── api/
│   ├── generate-ad.js
│   ├── create-upload-queue.js
│   ├── pull-data.js
│   └── upload-queue-item.js
├── src/
│   ├── ad-generation.js
│   ├── airtableClient.js
│   ├── fetch.js
│   ├── master-date-pull.js
│   ├── upload-queue-service.js
│   ├── uploadService.js
│   └── server.js
├── airtable-script-phase3-vercel.js
├── airtable-script-quick-range.js
├── vercel.json
├── package.json
└── .env
```

## API Integration

### Google Ads API
- GAQL search + REST mutate
- OAuth 2.0 with refresh token
- v21 API

### Airtable API
- Batch processing with rate limiting
- Idempotent updates and type casting

### Anthropic (Claude) API
- Claude-powered generation with strict prompt and variety enforcement

## Troubleshooting

- RESOURCE_LIMIT on RSA: ads created as PAUSED (or auto-select ad group with capacity)
- Non-JSON Claude output: parser retries with reformat prompt
- Missing Airtable fields: verify table and field names match README

## License

ISC License
