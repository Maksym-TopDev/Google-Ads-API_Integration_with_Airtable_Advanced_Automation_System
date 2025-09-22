// Airtable Script: Create Upload Queue when "To Upload Table" is checked
// Usage: Automation → Trigger: When record updated (Ads) where To Upload Table is checked
// Action: Run script with inputs: recordId ({{trigger.record.id}}), apiUrl (your Vercel /api/generate-ad)

const table = base.getTable('Ads');

const { recordId, apiUrl } = input.config();

const fallbackUrl = "https://your-vercel-deployment.vercel.app/api/generate-ad"; // optional fallback
const finalApiUrl = apiUrl || fallbackUrl;

if (!recordId) {
	console.log('Missing input: recordId');
	return;
}

const record = await table.selectRecordAsync(recordId);
if (!record) {
	console.log(`Record not found: ${recordId}`);
	return;
}

// Require the checkbox to be checked
const toUpload = !!record.getCellValue('To Upload Table');
if (!toUpload) {
	console.log('To Upload Table is not checked. Skipping.');
	return;
}

// Extract required data
const adId = record.getCellValue('Ad ID');
const campaignId = record.getCellValue('Campaign ID');
const adGroupId = record.getCellValue('Ad Group ID');
const campaignName = record.getCellValue('Campaign Name') || '';
const adGroupName = record.getCellValue('Ad Group Name') || '';
const finalUrl = record.getCellValue('Final URLs') || '';

if (!adId || !campaignId || !adGroupId) {
	console.log('Error: Missing Ad ID, Campaign ID, or Ad Group ID');
	return;
}

console.log(`To Upload → Creating Upload Queue for Ad ID: ${adId}`);
console.log(`API: ${finalApiUrl}`);

try {
	const requestData = {
		adId: String(adId),
		campaignId: String(campaignId),
		adGroupId: String(adGroupId),
		campaignName,
		adGroupName,
		finalUrl,
		toUpload: true
	};

	const response = await fetch(finalApiUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(requestData)
	});

	const raw = await response.text();
	let result;
	try {
		result = JSON.parse(raw);
	} catch {
		result = { success: false, error: `Non-JSON response (status ${response.status}): ${raw.slice(0, 200)}` };
	}

	if (response.ok && result.success) {
		console.log('Success creating Upload Queue records');
		console.log(`- Upload Queue records: ${result.uploadQueueRecords || 0}`);
		
        console.log("Going well");
	} else {
		const errMsg = result?.error || `HTTP ${response.status}`;
		console.log('Error creating Upload Queue records:');
		console.log(errMsg);
		
        console.log("Going well");
	}
} catch (error) {
	console.log('Script error:');
	console.log(error.message);
	try {
		
        console.log("Going well");
	} catch (uErr) {
		console.log('Failed to update error status:', uErr.message);
	}
}

async function safeUpdate(table, recordId, fields) {
	try {
		const existingFields = table.fields.map(f => f.name);
		const filtered = Object.fromEntries(Object.entries(fields).filter(([k]) => existingFields.includes(k)));
		if (Object.keys(filtered).length) {
			await table.updateRecordAsync(recordId, filtered);
			console.log(`Updated fields: ${Object.keys(filtered).join(', ')}`);
		} else {
			console.log('No matching fields found to update');
		}
	} catch (e) {
		console.log('Error updating record:', e.message);
	}
}


