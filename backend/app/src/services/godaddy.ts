import axios, { AxiosError } from 'axios';

export class GoDaddyAPIError extends Error {
	constructor(
		public message: string,
		public code: string,
		public status?: number,
		public details?: any
	) {
		super(message);
		this.name = 'GoDaddyAPIError';
	}
}

export class GoDaddyAPI {
	private baseUrl: string;
	private headers: Record<string, string>;
	private domain: string;

	constructor(apiKey: string, apiSecret: string, domain?: string) {
		if (!apiKey || !apiSecret) {
			throw new GoDaddyAPIError(
				'API key and secret are required',
				'INVALID_CREDENTIALS'
			);
		}

		this.baseUrl = 'https://api.godaddy.com';
		this.domain = domain || process.env.DOMAIN || 'theosirislabs.com';
		this.headers = {
			Authorization: `sso-key ${apiKey}:${apiSecret}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		};

		console.log('GoDaddy API initialized for domain:', this.domain);
	}

	private handleError(error: any): never {
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			const status = axiosError.response?.status;
			const data = axiosError.response?.data as any;

			console.error('GoDaddy API Error:', {
				status,
				data,
				headers: axiosError.response?.headers,
				config: {
					url: axiosError.config?.url,
					method: axiosError.config?.method,
					headers: axiosError.config?.headers,
				},
			});

			switch (status) {
				case 401:
					throw new GoDaddyAPIError(
						'Invalid API credentials',
						'UNAUTHORIZED',
						status
					);
				case 403:
					throw new GoDaddyAPIError(
						'Access forbidden. Check API permissions',
						'FORBIDDEN',
						status
					);
				case 404:
					throw new GoDaddyAPIError(
						'Resource not found',
						'NOT_FOUND',
						status,
						data
					);
				case 429:
					throw new GoDaddyAPIError(
						'Rate limit exceeded',
						'RATE_LIMIT',
						status
					);
				default:
					throw new GoDaddyAPIError(
						data?.message ||
							'An error occurred with the GoDaddy API',
						'API_ERROR',
						status,
						data
					);
			}
		}

		throw new GoDaddyAPIError(
			'An unexpected error occurred',
			'UNKNOWN_ERROR',
			500
		);
	}

	async checkSubdomainAvailability(subdomain: string): Promise<boolean> {
		if (!subdomain) {
			throw new GoDaddyAPIError(
				'Subdomain is required',
				'INVALID_PARAMETER'
			);
		}

		try {
			// Check if the subdomain record exists
			console.log(
				'Checking if subdomain record exists:',
				`${subdomain}.${this.domain}`
			);
			try {
				const response = await axios.get(
					`${this.baseUrl}/v1/domains/${this.domain}/records/CNAME/${subdomain}`,
					{ headers: this.headers }
				);
				console.log('Subdomain check response:', response.data);
				// If we get here, the record exists
				return false;
			} catch (error) {
				if (axios.isAxiosError(error)) {
					console.log('Subdomain check error:', error.response?.data);
					if (error.response?.status === 404) {
						// 404 means the record doesn't exist, so the subdomain is available
						return true;
					}
				}
				throw error;
			}
		} catch (error) {
			this.handleError(error);
		}
	}

	async createSubdomainRecord(subdomain: string): Promise<void> {
		if (!subdomain) {
			throw new GoDaddyAPIError(
				'Subdomain is required',
				'INVALID_PARAMETER'
			);
		}

		try {
			console.log(
				'Creating subdomain record for:',
				`${subdomain}.${this.domain}`
			);
			const records = [
				{
					data: '@', // Point to main domain's IP
					name: subdomain,
					ttl: 3600,
					type: 'CNAME',
				},
			];

			await axios.patch(
				`${this.baseUrl}/v1/domains/${this.domain}/records`,
				records,
				{ headers: this.headers }
			);
		} catch (error) {
			this.handleError(error);
		}
	}

	async deleteSubdomainRecord(subdomain: string): Promise<void> {
		if (!subdomain) {
			throw new GoDaddyAPIError(
				'Subdomain is required',
				'INVALID_PARAMETER'
			);
		}

		try {
			console.log(
				'Deleting subdomain record for:',
				`${subdomain}.${this.domain}`
			);
			await axios.delete(
				`${this.baseUrl}/v1/domains/${this.domain}/records/CNAME/${subdomain}`,
				{ headers: this.headers }
			);
		} catch (error) {
			this.handleError(error);
		}
	}
}
