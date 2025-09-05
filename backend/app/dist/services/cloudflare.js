import axios from 'axios';
export class CloudflareAPIError extends Error {
    message;
    code;
    status;
    details;
    constructor(message, code, status, details) {
        super(message);
        this.message = message;
        this.code = code;
        this.status = status;
        this.details = details;
        this.name = 'CloudflareAPIError';
    }
}
export class CloudflareAPI {
    baseUrl;
    headers;
    zoneId;
    domain;
    serverIp;
    constructor(apiToken, zoneId, domain, serverIp) {
        if (!apiToken || !zoneId) {
            throw new CloudflareAPIError('API token and Zone ID are required', 'INVALID_CREDENTIALS');
        }
        this.baseUrl = 'https://api.cloudflare.com/client/v4';
        this.domain = domain || process.env.DOMAIN || 'theosirislabs.com';
        this.zoneId = zoneId;
        this.serverIp = serverIp || process.env.SERVER_IP || '127.0.0.1';
        this.headers = {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        };
        console.log('Cloudflare API initialized for domain:', this.domain);
    }
    handleError(error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error;
            const status = axiosError.response?.status;
            const data = axiosError.response?.data;
            console.error('Cloudflare API Error:', {
                status,
                data,
                headers: axiosError.response?.headers,
                config: {
                    url: axiosError.config?.url,
                    method: axiosError.config?.method,
                },
            });
            switch (status) {
                case 401:
                    throw new CloudflareAPIError('Invalid API credentials', 'UNAUTHORIZED', status);
                case 403:
                    throw new CloudflareAPIError('Access forbidden. Check API permissions', 'FORBIDDEN', status);
                case 404:
                    throw new CloudflareAPIError('Resource not found', 'NOT_FOUND', status, data);
                case 429:
                    throw new CloudflareAPIError('Rate limit exceeded', 'RATE_LIMIT', status);
                default:
                    throw new CloudflareAPIError(data?.errors?.[0]?.message ||
                        'An error occurred with the Cloudflare API', 'API_ERROR', status, data);
            }
        }
        throw new CloudflareAPIError('An unexpected error occurred', 'UNKNOWN_ERROR', 500);
    }
    async checkSubdomainAvailability(subdomain) {
        if (!subdomain) {
            throw new CloudflareAPIError('Subdomain is required', 'INVALID_PARAMETER');
        }
        try {
            // Check if the DNS record exists
            const response = await axios.get(`${this.baseUrl}/zones/${this.zoneId}/dns_records`, {
                headers: this.headers,
                params: {
                    name: `${subdomain}.${this.domain}`,
                    type: 'A',
                },
            });
            console.log(response.data);
            // If no records found, subdomain is available
            return response.data.result.length === 0;
        }
        catch (error) {
            this.handleError(error);
        }
    }
    async createSubdomainRecord(subdomain) {
        if (!subdomain) {
            throw new CloudflareAPIError('Subdomain is required', 'INVALID_PARAMETER');
        }
        try {
            await axios.post(`${this.baseUrl}/zones/${this.zoneId}/dns_records`, {
                type: 'A',
                name: subdomain,
                content: this.serverIp,
                proxied: true,
            }, { headers: this.headers });
        }
        catch (error) {
            this.handleError(error);
        }
    }
    async deleteSubdomainRecord(subdomain) {
        if (!subdomain) {
            throw new CloudflareAPIError('Subdomain is required', 'INVALID_PARAMETER');
        }
        try {
            // First, find the record ID
            const response = await axios.get(`${this.baseUrl}/zones/${this.zoneId}/dns_records`, {
                headers: this.headers,
                params: {
                    name: `${subdomain}.${this.domain}`,
                    type: 'A',
                },
            });
            if (response.data.result.length > 0) {
                const recordId = response.data.result[0].id;
                // Delete the record
                await axios.delete(`${this.baseUrl}/zones/${this.zoneId}/dns_records/${recordId}`, { headers: this.headers });
            }
        }
        catch (error) {
            this.handleError(error);
        }
    }
}
//# sourceMappingURL=cloudflare.js.map