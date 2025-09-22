// Airtable Script for Phase 3 Auto-Trigger (Vercel Version)
// This script runs when "Meets Threshold" checkbox is checked in the Ads table

const table = base.getTable('Ads');

// Get inputs from Automation → Run script → Input variables
// Set these in the automation:
// - recordId: {{trigger.record.id}}
// - apiUrl:   https://google-bfxm3xffd-seo7077s-projects.vercel.app/api/generate-ad
const { recordId, apiUrl } = input.config();

// Fallback URL if apiUrl is not provided
const fallbackUrl = "https://google-bfxm3xffd-seo7077s-projects.vercel.app/api/generate-ad";
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

// Extract required data from the record
const adId = record.getCellValue('Ad ID');
const campaignId = record.getCellValue('Campaign ID');
const adGroupId = record.getCellValue('Ad Group ID');
const campaignName = record.getCellValue('Campaign Name') || '';
const adGroupName = record.getCellValue('Ad Group Name') || '';
const finalUrl = record.getCellValue('Final URLs') || '';
const performanceScore = record.getCellValue('Performance Score') || 0;

// Validate required fields
if (!adId || !campaignId || !adGroupId) {
    console.log('Error: Missing Ad ID, Campaign ID, or Ad Group ID');
    return;
}

console.log(`Starting Phase 3 generation for Ad ID: ${adId}`);
console.log(`Campaign: ${campaignName || 'N/A'}`);
console.log(`Ad Group: ${adGroupName || 'N/A'}`);

try {
    const requestData = {
        adId: String(adId),
        campaignId: String(campaignId),
        adGroupId: String(adGroupId),
        campaignName,
        adGroupName,
        finalUrl,
        performanceScore
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
        console.log('Success! Ad variants generated:');
        console.log(`- Variants generated: ${result.variantsGenerated || 'N/A'}`);
        console.log(`- Ad Generator records: ${result.adGeneratorRecords || 'N/A'}`);
        
        // Update the record with generation status (only if fields exist)
        await safeUpdate(table, recordId, {
            'Generate Status': 'Generated',
            'Meets Threshold': false, // Uncheck the trigger checkbox
            'Last Generation Status': 'Generated',
            'Last Generation Time': new Date().toISOString(),
            'Variants Generated': result.variantsGenerated || 0
        });
        
        console.log("Going well");
        
    } else {
        const errMsg = result?.error || `HTTP ${response.status}`;
        console.log('Error generating ad variants:');
        console.log(errMsg);
        
        // Update record with error status (only if fields exist)
        await safeUpdate(table, recordId, {
            'Generate Status': 'Failed',
            'Meets Threshold': false, // Uncheck the trigger checkbox
            'Last Generation Status': 'Failed',
            'Last Generation Time': new Date().toISOString(),
            'Generation Error': errMsg
        });
        
        console.log("Going Error");
    }
} catch (error) {
    console.log('Script error:');
    console.log(error.message);
    
    // Update record with error status (only if fields exist)
    try {
        await safeUpdate(table, recordId, {
            'Generate Status': 'Failed',
            'Meets Threshold': false, // Uncheck the trigger checkbox
            'Last Generation Status': 'Script Error',
            'Last Generation Time': new Date().toISOString(),
            'Generation Error': error.message
        });
        console.log("Going Error");
    } catch (updateError) {
        console.log('Failed to update record with error status:', updateError.message);
    }
}

console.log('Phase 3 script completed.');

// Helper function to safely update only existing fields
async function safeUpdate(table, recordId, fields) {
    try {
        // Get the table schema to check which fields exist
        const existingFields = table.fields.map(f => f.name);
        const filteredFields = Object.fromEntries(
            Object.entries(fields).filter(([key]) => existingFields.includes(key))
        );
        
        if (Object.keys(filteredFields).length > 0) {
            await table.updateRecordAsync(recordId, filteredFields);
            console.log(`Updated fields: ${Object.keys(filteredFields).join(', ')}`);
        } else {
            console.log('No matching fields found to update');
        }
    } catch (error) {
        console.log('Error updating record:', error.message);
    }
}
