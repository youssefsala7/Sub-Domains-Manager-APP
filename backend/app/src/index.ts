import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import clientRoutes from './routes/clients.js';
import statsRoutes from './routes/stats.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import { CoolifyAPI } from './services/coolify.js';
import { CloudflareAPI } from './services/cloudflare.js';

// Load environment variables
config();

const app = express();
const PORT = parseInt(process.env.PORT || '5010', 10);

// API instances that will be initialized
export let coolifyAPI: CoolifyAPI | null = null;
export let cloudflareAPI: CloudflareAPI | null = null;

// Initialize services at startup
function initializeServices() {
	// Check Coolify configuration
	if (!process.env.COOLIFY_API_KEY || !process.env.COOLIFY_API_URL) {
		console.error(
			'Missing Coolify API configuration. Required environment variables:'
		);
		console.error('- COOLIFY_API_KEY');
		console.error('- COOLIFY_API_URL');
	} else {
		try {
			coolifyAPI = new CoolifyAPI(
				process.env.COOLIFY_API_KEY,
				process.env.COOLIFY_API_URL
			);
			console.log('✅ Coolify API initialized successfully');
		} catch (error) {
			console.error('❌ Failed to initialize Coolify API:', error);
		}
	}

	// Check Cloudflare configuration
	if (
		!process.env.CLOUDFLARE_API_TOKEN ||
		!process.env.CLOUDFLARE_ZONE_ID ||
		!process.env.DOMAIN
	) {
		console.error(
			'Missing Cloudflare API configuration. Required environment variables:'
		);
		console.error('- CLOUDFLARE_API_TOKEN');
		console.error('- CLOUDFLARE_ZONE_ID');
		console.error('- DOMAIN');
	} else {
		try {
			cloudflareAPI = new CloudflareAPI(
				process.env.CLOUDFLARE_API_TOKEN,
				process.env.CLOUDFLARE_ZONE_ID,
				process.env.DOMAIN
			);
			console.log('✅ Cloudflare API initialized successfully');
		} catch (error) {
			console.error('❌ Failed to initialize Cloudflare API:', error);
		}
	}
}

// Check required environment variables
if (!process.env.JWT_SECRET) {
	console.error('❌ JWT_SECRET environment variable is required');
	process.exit(1);
}

// Request logging middleware
app.use((req, _res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
	console.log('Headers:', JSON.stringify(req.headers, null, 2));
	next();
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint with detailed response
app.get('/health', (req, res) => {
	console.log('Health check requested');
	res.status(200).json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		headers: req.headers,
		environment: {
			NODE_ENV: process.env.NODE_ENV,
			PORT,
		},
	});
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/users', usersRoutes);

// Error handling middleware
app.use(
	(
		err: any,
		_req: express.Request,
		res: express.Response,
		_next: express.NextFunction
	) => {
		console.error('Error:', err);
		res.status(500).json({
			message: 'Internal server error',
			error: err.message,
		});
	}
);

// Initialize MongoDB connection
mongoose
	.connect(
		process.env.MONGODB_URI || 'mongodb://localhost:27017/subdomain_manager'
	)
	.then(() => {
		console.log('✅ Connected to MongoDB');

		// Initialize services after database connection
		initializeServices();

		// Start server - listen on all interfaces
		app.listen(PORT, () => {
			console.log(`✅ Server is running on port ${PORT}`);
			console.log(
				`✅ Health check available at http://0.0.0.0:${PORT}/health`
			);
			console.log('✅ Request logging is enabled');
		});
	})
	.catch((error) => {
		console.error('❌ Failed to connect to MongoDB:', error);
	});
