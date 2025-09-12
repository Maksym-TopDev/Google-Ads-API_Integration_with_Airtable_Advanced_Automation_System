
const API_BASE_URL = "https://google-ads-airtable.vercel.app"; // Your actual Vercel URL


function getStatusOption(statusName) {
    const statusField = setDateTable.getField('Status');
    const options = statusField.options.choices;
    
    let option = options.find(opt => opt.name === statusName);
    
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
        output.text(` Status option "${statusName}" not found. Available options:`);
        options.forEach(opt => output.text(`   - "${opt.name}"`));
        
        // Use the first available option as fallback
        const fallbackOption = options[0];
        output.text(` Using fallback option: "${fallbackOption.name}"`);
        return { name: fallbackOption.name };
    }
    
    return { name: option.name };
}



const setDateTable = base.getTable('Set Date');


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

await setDateTable.updateRecordAsync(record.id, {
    'Status': getStatusOption('Pulling'),
    'Last Pull Status': 'Starting data pull...',
    'Last Pull Time': new Date().toISOString(),
    'Records Updated': 0
});

try {
    const apiUrl = `${API_BASE_URL}/api/pull-data?recordId=${record.id}&start=${startDateStr}&end=${endDateStr}`;
    
    output.text(` Calling API: ${API_BASE_URL}/api/pull-data`);
    output.text(` Date range: ${startDateStr} to ${endDateStr}`);
    output.text(` Record ID: ${record.id}`);
    

    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
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
        const errorMessage = result.error || 'Unknown error occurred';
        await setDateTable.updateRecordAsync(record.id, {
            'Status': getStatusOption('Error'),
            'Last Pull Status': `Error: ${errorMessage}`,
            'Last Pull Time': new Date().toISOString(),
            'Records Updated': 0
        });
        
        output.text(` Error: ${errorMessage}`);
    }
    
} catch (error) {
    // Network or other error
    let errorMessage = error.message || 'Network error occurred';
    
    // Provide more specific error messages
    if (errorMessage.includes('Failed to fetch')) {
        errorMessage = 'Cannot reach API endpoint. Check if Vercel deployment is running.';
    }
    
    await setDateTable.updateRecordAsync(record.id, {
        'Status': getStatusOption('Error'),
        'Last Pull Status': `Error: ${errorMessage}`,
        'Last Pull Time': new Date().toISOString(),
        'Records Updated': 0
    });
    
    output.text(` Network Error: ${errorMessage}`);
    output.text(` Full error: ${error}`);
}

output.text(' Script completed.');
