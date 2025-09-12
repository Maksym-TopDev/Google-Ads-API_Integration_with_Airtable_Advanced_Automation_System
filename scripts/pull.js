const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { runPull } = require('../src/pull/pullRunner');

async function main() {
	const argv = yargs(hideBin(process.argv))
		.option('from', { type: 'string', describe: 'Start date YYYY-MM-DD' })
		.option('to', { type: 'string', describe: 'End date YYYY-MM-DD' })
		.option('dateRange', { type: 'string', describe: 'Preset range, e.g., LAST_7_DAYS' })
		.strict(false)
		.parse();

	await runPull({ from: argv.from, to: argv.to, dateRange: argv.dateRange });
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
