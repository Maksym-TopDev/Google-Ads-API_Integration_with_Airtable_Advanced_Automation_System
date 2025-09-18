// Airtable Script for Phase 3 Auto-Trigger
// This script runs when "Meets Threshold" checkbox is checked in the Ads table

let table = base.getTable("Ads");


// For automation triggers, we need to get the record from the trigger context
// The record should be available as input.record in automation context
let record = input.config();

if (!record) {
    console.log("No record available from trigger. Exiting.");
    return;
}

// Extract required data from the record
let adId = record.adId;
let campaignId = record.campaignId;
let adGroupId = record.adGroupId;
let campaignName = record.campaignName;
let adGroupName = record.adGroupName;
let finalUrl = record.finalUrl;
let performanceScore = record.performanceScore;

// Validate required fields
if (!adId || !campaignId || !adGroupId) {
    console.log(" Error: Missing required fields (Ad ID, Campaign ID, or Ad Group ID)");
    return;
}

console.log(` Starting Phase 3 generation for Ad ID: ${adId}`);
console.log(`Campaign: ${campaignName || 'N/A'}`);
console.log(`Ad Group: ${adGroupName || 'N/A'}`);

try {
    // Prepare the API request data
    const requestData = {
        adId: adId.toString(),
        campaignId: campaignId.toString(),
        adGroupId: adGroupId.toString(),
        campaignName: campaignName || '',
        adGroupName: adGroupName || '',
        finalUrl: finalUrl || '',
        performanceScore: performanceScore || ''
    };

    console.log(" Calling API endpoint...");

    // Call your project's API endpoint
    const response = await fetch("https://your-project-url.com/api/generate-ad", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestData)
    });

    const result = await response.json();

    if (response.ok && result.success) {
        console.log(" Success! Ad variants generated:");
        console.log(`- Variants generated: ${result.variantsGenerated}`);
        console.log(`- Ad Generator records: ${result.adGeneratorRecords}`);
        console.log(`- Upload Queue records: ${result.uploadQueueRecords}`);
        
        // Update the record with generation status
        await table.updateRecordAsync(record, {
            "Last Generation Status": " Generated",
            "Last Generation Time": new Date().toISOString(),
            "Variants Generated": result.variantsGenerated
        });
        
    } else {
        console.log(" Error generating ad variants:");
        console.log(result.error || "Unknown error");
        
        // Update record with error status
        await table.updateRecordAsync(record, {
            "Last Generation Status": " Failed",
            "Last Generation Time": new Date().toISOString(),
            "Generation Error": result.error || "Unknown error"
        });
    }

} catch (error) {
    console.log(" Script error:");
    console.log(error.message);
    
    // Update record with error status
    try {
        await table.updateRecordAsync(record, {
            "Last Generation Status": " Script Error",
            "Last Generation Time": new Date().toISOString(),
            "Generation Error": error.message
        });
    } catch (updateError) {
        console.log("Failed to update record with error status:", updateError.message);
    }
}

console.log(" Phase 3 script completed.");