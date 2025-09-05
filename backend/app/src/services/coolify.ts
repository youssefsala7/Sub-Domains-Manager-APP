import axios, { AxiosError } from 'axios';

export class CoolifyAPIError extends Error {
	constructor(
		public message: string,
		public code: string,
		public status?: number,
		public response?: any
	) {
		super(message);
		this.name = 'CoolifyAPIError';
	}
}

export class CoolifyAPI {
	private baseUrl: string;
	private headers: Record<string, string>;

	constructor(apiKey: string, baseUrl: string) {
		if (!apiKey || !baseUrl) {
			throw new CoolifyAPIError(
				'API key and base URL are required',
				'INVALID_CREDENTIALS'
			);
		}

		this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash if present
		this.headers = {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		};

		console.log('Coolify API initialized with base URL:', this.baseUrl);
	}

	private handleError(error: any, context: string): never {
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			const status = axiosError.response?.status;
			const data = axiosError.response?.data as any;

			console.error(`Coolify API Error (${context}):`, {
				status,
				data,
				headers: axiosError.response?.headers,
				config: {
					url: axiosError.config?.url,
					method: axiosError.config?.method,
					data: axiosError.config?.data,
				},
				message: error.message,
			});
			console.log(data.errors);

			throw new CoolifyAPIError(
				`${context}: ${
					data?.message ||
					error.message ||
					'An error occurred with the Coolify API'
				}`,
				'API_ERROR',
				status,
				data
			);
		}
		console.error(`Coolify API Error (${context}):`, error);
		throw new CoolifyAPIError(
			`${context}: ${error.message || 'An unexpected error occurred'}`,
			'UNKNOWN_ERROR',
			500
		);
	}

	private async getApplications(): Promise<any[]> {
		try {
			const response = await axios.get(
				`${this.baseUrl}/api/v1/applications`,
				{
					headers: this.headers,
				}
			);
			return response.data || [];
		} catch (error) {
			this.handleError(error, 'Failed to get applications');
		}
	}

	private async findApplicationByName(name: string): Promise<any | null> {
		try {
			const applications = await this.getApplications();
			return applications.find((app: any) => app.name === name) || null;
		} catch (error) {
			console.error('Error finding application:', error);
			return null;
		}
	}

	async createDeployment(params: {
		subdomain: string;
		clientData: any;
	}): Promise<void> {
		const { subdomain, clientData } = params;

		try {
			// Validate required environment variables
			if (!process.env.TEMPLATE_REPO) {
				throw new CoolifyAPIError(
					'GitHub repository URL is required',
					'INVALID_PARAMETER'
				);
			}

			if (
				!process.env.COOLIFY_PROJECT_ID ||
				!process.env.COOLIFY_ENVIRONMENT_ID ||
				!process.env.COOLIFY_SERVER_ID
			) {
				throw new CoolifyAPIError(
					'Coolify project ID, environment ID, and server ID are required but not provided',
					'INVALID_PARAMETER'
				);
			}

			// Check if application already exists
			const existingApp = await this.findApplicationByName(subdomain);
			let applicationId: string;

			if (existingApp) {
				console.log('Found existing application:', existingApp.uuid);
				applicationId = existingApp.uuid;
			} else {
				// Always use template-based deployment (docker-compose)
				console.log(
					'Creating template-based deployment with',
					clientData.deploymentType === 'custom-html'
						? 'custom HTML'
						: 'link tree'
				);

				const createPayload = {
					project_uuid: process.env.COOLIFY_PROJECT_ID,
					server_uuid: process.env.COOLIFY_SERVER_ID,
					environment_uuid: process.env.COOLIFY_ENVIRONMENT_ID,
					environment_name: 'production',
					git_repository: process.env.TEMPLATE_REPO,
					git_branch: 'master',
					build_pack: 'dockercompose',
					name: subdomain,
					description: clientData.description || '',
					domains: `https://${subdomain}.${process.env.DOMAIN}`,
					docker_compose_domains: [
						{
							name: 'web',
							domain: `https://${subdomain}.${process.env.DOMAIN}`,
						},
					],
					base_directory: '/',
					ports_exposes: 3000,
					docker_compose_location: 'docker-compose.yml',
					health_check_enabled: true,
					health_check_path: '/api/health',
					health_check_port: '3000',
					health_check_scheme: 'http',
					health_check_interval: 10,
					health_check_timeout: 3,
					health_check_retries: 3,
					health_check_start_period: 30,
					instant_deploy: false,
				};

				const createResponse = await axios.post(
					`${this.baseUrl}/api/v1/applications/public`,
					createPayload,
					{
						headers: {
							...this.headers,
							Accept: 'application/json',
						},
					}
				);

				console.log('Create application response:', {
					status: createResponse.status,
					data: createResponse.data,
				});

				applicationId = createResponse.data?.uuid;
				if (!applicationId) {
					throw new CoolifyAPIError(
						'Application created but no ID returned',
						'INVALID_RESPONSE'
					);
				}
			}

			// Set environment variables
			console.log(
				'Setting environment variables for application:',
				applicationId
			);

			const clientDataWithLogo = {
				...clientData,
				logo: clientData.logo || null,
			};

			// Remove htmlCode from the client data to avoid .env parsing issues
			// (we pass it separately as Base64 encoded)
			const { htmlCode, ...clientDataForEnv } = clientDataWithLogo;

			const envVariables = [
				{
					key: 'CLIENT_DATA',
					value: JSON.stringify(clientDataForEnv),
					is_literal: true,
				},
				{
					key: 'NODE_ENV',
					value: 'production',
					is_literal: true,
				},
				{
					key: 'NEXT_PUBLIC_CLIENT_DATA',
					value: JSON.stringify(clientDataForEnv),
					is_literal: true,
				},
			];

			// Add HTML code as environment variable if provided (for Next.js client-side access)
			if (clientData.htmlCode && clientData.htmlCode.trim()) {
				// Base64 encode the HTML to avoid special character issues in .env files
				const encodedHTML = Buffer.from(
					clientData.htmlCode,
					'utf8'
				).toString('base64');
				envVariables.push({
					key: 'NEXT_PUBLIC_CUSTOM_HTML_BASE64',
					value: encodedHTML,
					is_literal: true,
				});
			}

			await axios.patch(
				`${this.baseUrl}/api/v1/applications/${applicationId}/envs/bulk`,
				{
					data: envVariables,
				},
				{
					headers: this.headers,
				}
			);

			// Deploy application
			console.log('Deploying application:', applicationId);
			await axios.get(
				`${this.baseUrl}/api/v1/deploy?uuid=${applicationId}`,

				{
					headers: this.headers,
				}
			);

			console.log('Deployment completed successfully');
		} catch (error) {
			this.handleError(error, 'Failed to create deployment');
		}
	}

	async deleteDeployment(subdomain: string): Promise<void> {
		try {
			const app = await this.findApplicationByName(subdomain);
			if (!app) {
				throw new CoolifyAPIError(
					'Application not found',
					'NOT_FOUND',
					404
				);
			}

			console.log('Deleting application:', app.uuid);
			await axios.delete(
				`${this.baseUrl}/api/v1/applications/${app.uuid}`,
				{
					headers: this.headers,
				}
			);

			console.log('Application deleted successfully');
		} catch (error) {
			this.handleError(error, 'Failed to delete deployment');
		}
	}

	async getServers(): Promise<any> {
		try {
			const response = await axios.get(`${this.baseUrl}/api/v1/servers`, {
				headers: this.headers,
			});

			console.log('Servers response:', {
				status: response.status,
				data: response.data,
			});

			return response.data;
		} catch (error) {
			this.handleError(error, 'Get Servers');
		}
	}

	async updateDeployment(params: {
		subdomain: string;
		clientData: any;
	}): Promise<void> {
		const { subdomain, clientData } = params;

		try {
			const app = await this.findApplicationByName(subdomain);

			// If application doesn't exist, create it instead of throwing an error
			if (!app) {
				console.log(
					'Application not found, creating new deployment...'
				);
				await this.createDeployment(params);
				return;
			}

			console.log('Updating existing application:', app.uuid);

			// Update environment variables
			const clientDataWithLogo = {
				...clientData,
				logo: clientData.logo || null,
			};

			// Remove htmlCode from the client data to avoid .env parsing issues
			// (we pass it separately as Base64 encoded)
			const { htmlCode, ...clientDataForEnv } = clientDataWithLogo;

			const envVariables = [
				{
					key: 'CLIENT_DATA',
					value: JSON.stringify(clientDataForEnv),
					is_literal: true,
				},
				{
					key: 'NODE_ENV',
					value: 'production',
					is_literal: true,
				},
				{
					key: 'NEXT_PUBLIC_CLIENT_DATA',
					value: JSON.stringify(clientDataForEnv),
					is_literal: true,
				},
			];

			// Add HTML code as environment variable if provided (for Next.js client-side access)
			if (clientData.htmlCode && clientData.htmlCode.trim()) {
				// Base64 encode the HTML to avoid special character issues in .env files
				const encodedHTML = Buffer.from(
					clientData.htmlCode,
					'utf8'
				).toString('base64');
				envVariables.push({
					key: 'NEXT_PUBLIC_CUSTOM_HTML_BASE64',
					value: encodedHTML,
					is_literal: true,
				});
			}

			await axios.patch(
				`${this.baseUrl}/api/v1/applications/${app.uuid}/envs/bulk`,
				{
					data: envVariables,
				},
				{
					headers: this.headers,
				}
			);

			// Redeploy application
			await axios.get(`${this.baseUrl}/api/v1/deploy?uuid=${app.uuid}`, {
				headers: this.headers,
			});

			console.log('Update completed successfully');
		} catch (error) {
			this.handleError(error, 'Failed to update deployment');
		}
	}
}
