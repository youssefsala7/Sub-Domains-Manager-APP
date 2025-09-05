import { Router, Response } from 'express';
import axios from 'axios';
import auth from '../middleware/auth.js';
import Client from '../models/Client.js';
import { AuthRequest } from '../types.js';

const router = Router();

// GoDaddy API configuration
const GODADDY_API_URL = 'https://api.godaddy.com/v1';
const GODADDY_API_KEY = process.env.GODADDY_API_KEY;
const GODADDY_API_SECRET = process.env.GODADDY_API_SECRET;
const BASE_DOMAIN = process.env.BASE_DOMAIN;

// Coolify API configuration
const COOLIFY_API_URL = process.env.COOLIFY_API_URL;
const COOLIFY_API_KEY = process.env.COOLIFY_API_KEY;

interface GoDaddyRecord {
	data: string;
	ttl: number;
	name: string;
	type: string;
}

// Create subdomain in GoDaddy and deploy to Coolify
router.post(
	'/:clientId/deploy',
	auth,
	async (req: AuthRequest, res: Response) => {
		try {
			const client = await Client.findOne({
				_id: req.params.clientId,
				owner: req.user?.userId,
			});

			if (!client) {
				res.status(404).json({ message: 'Client not found' });
				return;
			}

			// Create subdomain record in GoDaddy
			const record: GoDaddyRecord = {
				data: process.env.SERVER_IP || '',
				ttl: 600,
				name: client.subdomain,
				type: 'A',
			};

			const godaddyResponse = await axios.put(
				`${GODADDY_API_URL}/domains/${BASE_DOMAIN}/records/A/${client.subdomain}`,
				[record],
				{
					headers: {
						Authorization: `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
						'Content-Type': 'application/json',
					},
				}
			);

			if (godaddyResponse.status !== 200) {
				throw new Error('Failed to create subdomain in GoDaddy');
			}

			// Deploy to Coolify
			const coolifyResponse = await axios.post(
				`${COOLIFY_API_URL}/deployments`,
				{
					name: client.subdomain,
					domain: `${client.subdomain}.${BASE_DOMAIN}`,
					repository: process.env.TEMPLATE_REPO,
					environment: {
						CLIENT_DATA: JSON.stringify(client),
					},
				},
				{
					headers: {
						Authorization: `Bearer ${COOLIFY_API_KEY}`,
						'Content-Type': 'application/json',
					},
				}
			);

			if (coolifyResponse.status !== 200) {
				throw new Error('Failed to deploy to Coolify');
			}

			// Update client with deployment information
			client.set('isActive', true);
			await client.save();

			res.json({
				message: 'Subdomain created and deployed successfully',
				domain: `${client.subdomain}.${BASE_DOMAIN}`,
			});
			return;
		} catch (error) {
			console.error('Deployment error:', error);
			res.status(500).json({ message: 'Failed to deploy client page' });
			return;
		}
	}
);

// Remove subdomain from GoDaddy and Coolify
router.delete(
	'/:clientId/deploy',
	auth,
	async (req: AuthRequest, res: Response) => {
		try {
			const client = await Client.findOne({
				_id: req.params.clientId,
				owner: req.user?.userId,
			});

			if (!client) {
				res.status(404).json({ message: 'Client not found' });
				return;
			}

			// Remove subdomain record from GoDaddy
			const godaddyResponse = await axios.delete(
				`${GODADDY_API_URL}/domains/${BASE_DOMAIN}/records/A/${client.subdomain}`,
				{
					headers: {
						Authorization: `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
					},
				}
			);

			if (godaddyResponse.status !== 204) {
				throw new Error('Failed to remove subdomain from GoDaddy');
			}

			// Remove deployment from Coolify
			const coolifyResponse = await axios.delete(
				`${COOLIFY_API_URL}/deployments/${client.subdomain}`,
				{
					headers: {
						Authorization: `Bearer ${COOLIFY_API_KEY}`,
					},
				}
			);

			if (coolifyResponse.status !== 200) {
				throw new Error('Failed to remove deployment from Coolify');
			}

			// Update client status
			client.set('isActive', false);
			await client.save();

			res.json({
				message: 'Subdomain and deployment removed successfully',
			});
			return;
		} catch (error) {
			console.error('Removal error:', error);
			res.status(500).json({
				message: 'Failed to remove client page deployment',
			});
			return;
		}
	}
);

// Check subdomain availability
router.get(
	'/check/:subdomain',
	auth,
	async (req: AuthRequest, res: Response) => {
		try {
			const subdomain = req.params.subdomain.toLowerCase();

			// Check if subdomain exists in our database
			const existingClient = await Client.findOne({
				subdomain,
			});
			if (existingClient) {
				res.json({ available: false });
				return;
			}

			// Check if subdomain exists in GoDaddy
			try {
				// Just check if the request succeeds, we don't need the response
				await axios.get(
					`${GODADDY_API_URL}/domains/${BASE_DOMAIN}/records/A/${subdomain}`,
					{
						headers: {
							Authorization: `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
						},
					}
				);

				// If we get here, the subdomain exists
				res.json({ available: false });
				return;
			} catch (error) {
				// If we get a 404, the subdomain is available
				if (
					axios.isAxiosError(error) &&
					error.response?.status === 404
				) {
					res.json({ available: true });
					return;
				} else {
					throw error;
				}
			}
		} catch (error) {
			console.error('Subdomain check error:', error);
			res.status(500).json({
				message: 'Failed to check subdomain availability',
			});
			return;
		}
	}
);

export default router;
