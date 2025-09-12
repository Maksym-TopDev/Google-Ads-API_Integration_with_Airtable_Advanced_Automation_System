
const API_BASE_URL = "https://google-ads-airtable.vercel.app"; // Your actual Vercel URL


// Status updates are handled by the API endpoint (master-date-pull.js)
// No need for status control function in this script



const setDateTable = base.getTable('Set Date');


// Status field checking removed - handled by API endpoint

const record = await input.recordAsync('Select a record from the Set Date table:', setDateTable);

if (!record) {
    output.text('No record selected. Exiting...');
    exit();
}

const startDate = record.getCellValue('Master Start Date');
const endDate = record.getCellValue('Master End Date');


function formatDateOrMissing(date) {
    if (!date) {
        return "MISSING";
    }
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const startDateStr = formatDateOrMissing(startDate);
const endDateStr = formatDateOrMissing(endDate);

if (startDateStr === "MISSING" || endDateStr === "MISSING") {
    output.text(' Error: Master Start Date and Master End Date must be set in this record.');
    exit();
}

output.text(` Starting data pull for ${startDateStr} to ${endDateStr}...`);
output.text(' Status updates will be handled by the API endpoint...');

try {
    const apiUrl = `${API_BASE_URL}/api/pull-data?recordId=${record.id}&start=${startDateStr}&end=${endDateStr}`;
    
    output.text(` Calling API: ${API_BASE_URL}/api/pull-data`);
    output.text(` Full URL: ${apiUrl}`);
    output.text(` Date range: ${startDateStr} to ${endDateStr}`);
    output.text(` Record ID: ${record.id}`);
    
    // Test basic connectivity first
    output.text(' Testing basic connectivity...');
    const testResponse = await fetch(API_BASE_URL, { method: 'GET' });
    output.text(` Basic connectivity test: ${testResponse.status} ${testResponse.statusText}`);

    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
        output.text(`✅ Success! Pulled ${result.totalRecords} records:`);
        output.text(`   - ${result.breakdown.campaigns} campaigns`);
        output.text(`   - ${result.breakdown.adGroups} ad groups`);
        output.text(`   - ${result.breakdown.keywords} keywords`);
        output.text(`   - ${result.breakdown.ads} ads`);
        output.text(' Status has been updated in the record by the API endpoint.');
        
    } else {
        const errorMessage = result.error || 'Unknown error occurred';
        output.text(` Error: ${errorMessage}`);
        output.text(' Error status has been updated in the record by the API endpoint.');
    }
    
} catch (error) {
    // Network or other error
    let errorMessage = error.message || 'Network error occurred';
    
    // Provide more specific error messages
    if (errorMessage.includes('Failed to fetch')) {
        errorMessage = 'Cannot reach API endpoint. Check if Vercel deployment is running.';
    }
    
    output.text(` Network Error: ${errorMessage}`);
    output.text(` Full error: ${error}`);
    output.text(' Note: Status updates are handled by the API endpoint.');
}

output.text(' Script completed.');
