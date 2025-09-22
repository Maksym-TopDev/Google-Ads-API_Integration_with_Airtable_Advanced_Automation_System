// Airtable Script for Upload Queue Creation
// This script runs when "To Upload Table" checkbox is checked in the Ad Generator table

const table = base.getTable('Ad Generator');

// Get inputs from Automation → Run script → Input variables
// Set these in the automation:
// - recordId: {{trigger.record.id}}
// - apiUrl:   https://your-vercel-app.vercel.app/api/create-upload-queue
const { recordId, apiUrl } = input.config();

// Fallback URL if apiUrl is not provided
const fallbackUrl = "https://google-ads-airtable.vercel.app/api/create-upload-queue";
const finalApiUrl = apiUrl || fallbackUrl;

if (!recordId) {
    console.log('Missing input: recordId');
    return;
}

// Load the actual record so we can read fields and update it
const record = await table.selectRecordAsync(recordId);
if (!record) {
    console.log(`Record not found: ${recordId}`);
    return;
}

// Check if "To Upload Table" is actually checked
const toUploadTable = record.getCellValue('To Upload Table');
if (!toUploadTable) {
    console.log('To Upload Table checkbox is not checked. Exiting.');
    return;
}

// Extract required data from the record
const campaignId = record.getCellValue('Campaign ID');
const adGroupId = record.getCellValue('Ad Group ID');
const headline1 = record.getCellValue('Headline 1');
const headline2 = record.getCellValue('Headline 2');
const headline3 = record.getCellValue('Headline 3');
const description1 = record.getCellValue('Description 1');
const description2 = record.getCellValue('Description 2');

console.log(`Starting Upload Queue creation for Ad Generator ID: ${recordId}`);
console.log(`Campaign ID: ${campaignId || 'N/A'}`);
console.log(`Ad Group ID: ${adGroupId || 'N/A'}`);

// Validate required fields
if (!campaignId || !adGroupId) {
    console.log('Error: Missing Campaign ID or Ad Group ID');
    return;
}

if (!headline1 && !headline2 && !headline3) {
    console.log('Error: No headlines found in Ad Generator record');
    return;
}

if (!description1 && !description2) {
    console.log('Error: No descriptions found in Ad Generator record');
    return;
}

try {
    const requestData = {
        adGeneratorRecordId: String(recordId)
    };

    console.log(`Calling Vercel API endpoint: ${finalApiUrl}`);

    const response = await fetch(finalApiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    });

    // Safely parse response: handle non-JSON (e.g., HTML error pages)
    const raw = await response.text();
    let result;
    try {
        result = JSON.parse(raw);
    } catch {
        result = {
            success: false,
            error: `Non-JSON response (status ${response.status}): ${raw.slice(0, 200)}`
        };
    }

    if (response.ok && result.success) {
        console.log('Success! Upload Queue record created:');
        console.log(`- Upload Queue Record ID: ${result.uploadQueueRecordId || 'N/A'}`);
        console.log(`- Message: ${result.message || 'N/A'}`);
        
        // The API will automatically update the Ad Generator record
        // (uncheck "To Upload Table" and set "Upload Status")
        
    } else {
        const errMsg = result?.error || `HTTP ${response.status}`;
        console.log('Error creating Upload Queue record:');
        console.log(errMsg);
        
        // Update record with error status (only if fields exist)
        await safeUpdate(table, recordId, {
            'Generation Status': 'Upload Failed'
        });
    }
} catch (error) {
    console.log('Script error:');
    console.log(error.message);
    
    // Update record with error status (only if fields exist)
    try {
        await safeUpdate(table, recordId, {
            'Generation Status': 'Script Error'
        });
    } catch (updateError) {
        console.log('Failed to update record with error status:', updateError.message);
    }
}

console.log('Upload Queue script completed.');

// Helper function to safely update records (only if fields exist)
async function safeUpdate(table, recordId, fields) {
    try {
        await table.updateRecordAsync(recordId, fields);
    } catch (error) {
        console.log(`Warning: Could not update field(s): ${Object.keys(fields).join(', ')}`);
        console.log(`Update error: ${error.message}`);
    }
}
