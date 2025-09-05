import { config } from 'dotenv';
import { CoolifyAPI } from '../src/services/coolify';

// Load environment variables
config();

async function getServerInfo() {
	if (!process.env.COOLIFY_API_KEY || !process.env.COOLIFY_API_URL) {
		console.error(
			'Missing required environment variables: COOLIFY_API_KEY or COOLIFY_API_URL'
		);
		process.exit(1);
	}

	const coolify = new CoolifyAPI(
		process.env.COOLIFY_API_KEY,
		process.env.COOLIFY_API_URL
	);

	try {
		const servers = await coolify.getServers();
		console.log('\nAvailable Servers:');
		console.log('=================');

		if (Array.isArray(servers)) {
			servers.forEach((server) => {
				console.log(`\nServer Name: ${server.name}`);
				console.log(`Server ID: ${server.uuid}`);
				console.log(`IP Address: ${server.ip}`);
				console.log(`Status: ${server.status}`);
				console.log('-----------------');
			});
		} else {
			console.log('No servers found or unexpected response format');
		}
	} catch (error) {
		console.error('Failed to fetch server information:', error);
	}
}

getServerInfo();
