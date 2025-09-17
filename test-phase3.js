// Test script for Phase 3 functionality
const { AdGenerationService } = require('./src/ad-generation');
require('dotenv').config();

async function testPhase3() {
    console.log('🧪 Testing Phase 3 Ad Generation...\n');

    // Test data (replace with actual values from your Airtable)
    const testData = {
        adId: '123456789', // Replace with actual Ad ID
        campaignId: '987654321', // Replace with actual Campaign ID
        adGroupId: '456789123', // Replace with actual Ad Group ID
        campaignName: 'Test Campaign',
        adGroupName: 'Test Ad Group',
        finalUrl: 'https://example.com'
    };

    try {
        const service = new AdGenerationService();
        
        console.log('📊 Test data:');
        console.log(`- Ad ID: ${testData.adId}`);
        console.log(`- Campaign: ${testData.campaignName}`);
        console.log(`- Ad Group: ${testData.adGroupName}`);
        console.log(`- Final URL: ${testData.finalUrl}\n`);

        console.log('🚀 Starting generation...');
        const result = await service.generateAdVariants(testData);

        console.log('\n✅ Generation completed!');
        console.log(`- Variants generated: ${result.variantsGenerated}`);
        console.log(`- Ad Generator records: ${result.adGeneratorRecords}`);
        console.log(`- Upload Queue records: ${result.uploadQueueRecords}`);

        console.log('\n📝 Generated variants:');
        result.variants.forEach((variant, index) => {
            console.log(`\nVariant ${index + 1}:`);
            console.log(`  Headlines: ${JSON.stringify(variant.headlines)}`);
            console.log(`  Descriptions: ${JSON.stringify(variant.descriptions)}`);
            console.log(`  Paths: ${variant.paths?.path1 || 'N/A'}, ${variant.paths?.path2 || 'N/A'}`);
        });

    } catch (error) {
        console.error('\n❌ Test failed:');
        console.error(error.message);
        console.error('\nStack trace:');
        console.error(error.stack);
    }
}

// Run the test
if (require.main === module) {
    testPhase3();
}

module.exports = { testPhase3 };
