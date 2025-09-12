const readline = require('readline');
const { exchangeRefreshTokenForAccessToken } = require('../src/googleAds/auth');

async function main() {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	const ask = (q) => new Promise((res) => rl.question(q, (ans) => res(ans)));
	console.log('\nPaste your GOOGLE_ADS_REFRESH_TOKEN (from OAuth consent flow)');
	const token = await ask('Refresh Token: ');
	rl.close();

	if (!token) {
		console.error('No token provided.');
		process.exit(1);
	}
	const data = await exchangeRefreshTokenForAccessToken(token);
	console.log('Access token obtained. Save this refresh token in your .env as GOOGLE_ADS_REFRESH_TOKEN');
	console.log(`access_token_expires_in_sec=${data.expires_in}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
