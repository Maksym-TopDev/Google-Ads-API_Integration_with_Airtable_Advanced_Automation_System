// Airtable Script: Call API to Pull Data
// This script runs directly in Airtable when the button is clicked
// It calls your deployed API endpoint to pull Google Ads data

// Configuration - Update these values
const API_BASE_URL = "https://google-ads-airtable.vercel.app"; // Your actual Vercel URL

// Function to get status option by name (handles different option names)
function getStatusOption(statusName) {
    const statusField = setDateTable.getField('Status');
    const options = statusField.options.choices;
    
    // Try to find exact match first
    let option = options.find(opt => opt.name === statusName);
    
    // If not found, try common variations
    if (!option) {
        const variations = {
            'Pulling': ['Pulling', 'In Progress', 'Running', 'Processing'],
            'Success': ['Success', 'Completed', 'Done', 'Finished'],
            'Error': ['Error', 'Failed', 'Failed', 'Issue']
        };
        
        const possibleNames = variations[statusName] || [statusName];
        option = options.find(opt => possibleNames.includes(opt.name));
    }
    
    if (!option) {
        output.text(`⚠️ Status option "${statusName}" not found. Available options:`);
        options.forEach(opt => output.text(`   - "${opt.name}"`));
        
        // Use the first available option as fallback
        const fallbackOption = options[0];
        output.text(`🔄 Using fallback option: "${fallbackOption.name}"`);
        return { name: fallbackOption.name };
    }
    
    return { name: option.name };
}

// Get the current record (the one where the button was clicked)
// First, get the "Set Date" table
const setDateTable = base.getTable('Set Date');

// Check and display available Status field options
output.text('🔍 Checking Status field options...');
const statusField = setDateTable.getField('Status');
const statusOptions = statusField.options.choices;
output.text('Available Status options:');
statusOptions.forEach((option, index) => {
    output.text(`   ${index + 1}. "${option.name}"`);
});
output.text('---');

const record = await input.recordAsync('Select a record from the Set Date table:', setDateTable);

if (!record) {
    output.text('No record selected. Exiting...');
    exit();
}

// Get the date values from the current record (same logic as URL formula)
const startDate = record.getCellValue('Master Start Date');
const endDate = record.getCellValue('Master End Date');

// Format dates to YYYY-MM-DD or return "MISSING" (same as URL formula)s
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

// Check for missing dates (same validation as URL formula)
if (startDateStr === "MISSING" || endDateStr === "MISSING") {
    output.text('❌ Error: Master Start Date and Master End Date must be set in this record.');
    exit();
}

output.text(`🚀 Starting data pull for ${startDateStr} to ${endDateStr}...`);

// Update status to "Pulling"
await setDateTable.updateRecordAsync(record.id, {
    'Status': getStatusOption('Pulling'),
    'Last Pull Status': 'Starting data pull...',
    'Last Pull Time': new Date().toISOString(),
    'Records Updated': 0
});

try {
    // Build the API URL (exactly like your URL formula)
    const apiUrl = `${API_BASE_URL}/api/pull-data?recordId=${record.id}&start=${startDateStr}&end=${endDateStr}`;
    
    output.text(`📡 Calling API: ${API_BASE_URL}/api/pull-data`);
    output.text(`📅 Date range: ${startDateStr} to ${endDateStr}`);
    output.text(`🆔 Record ID: ${record.id}`);
    
    // Make the API call
    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
        // Success - update the record with success status
        await setDateTable.updateRecordAsync(record.id, {
            'Status': getStatusOption('Success'),
            'Last Pull Status': `Successfully pulled ${result.totalRecords} records`,
            'Last Pull Time': new Date().toISOString(),
            'Records Updated': result.totalRecords
        });
        
        output.text(`✅ Success! Pulled ${result.totalRecords} records:`);
        output.text(`   - ${result.breakdown.campaigns} campaigns`);
        output.text(`   - ${result.breakdown.adGroups} ad groups`);
        output.text(`   - ${result.breakdown.keywords} keywords`);
        output.text(`   - ${result.breakdown.ads} ads`);
        
    } else {
        // Error - update the record with error status
        const errorMessage = result.error || 'Unknown error occurred';
        await setDateTable.updateRecordAsync(record.id, {
            'Status': getStatusOption('Error'),
            'Last Pull Status': `Error: ${errorMessage}`,
            'Last Pull Time': new Date().toISOString(),
            'Records Updated': 0
        });
        
        output.text(`❌ Error: ${errorMessage}`);
    }
    
} catch (error) {
    // Network or other error
    const errorMessage = error.message || 'Network error occurred';
    await setDateTable.updateRecordAsync(record.id, {
        'Status': getStatusOption('Error'),
        'Last Pull Status': `Error: ${errorMessage}`,
        'Last Pull Time': new Date().toISOString(),
        'Records Updated': 0
    });
    
    output.text(`❌ Network Error: ${errorMessage}`);
}

output.text(' Script completed.');
