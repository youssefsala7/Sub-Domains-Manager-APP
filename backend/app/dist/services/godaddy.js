import axios from 'axios';
export class GoDaddyAPIError extends Error {
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
        this.name = 'GoDaddyAPIError';
    }
}
export class GoDaddyAPI {
    baseUrl;
    headers;
    domain;
    constructor(apiKey, apiSecret, domain) {
        if (!apiKey || !apiSecret) {
            throw new GoDaddyAPIError('API key and secret are required', 'INVALID_CREDENTIALS');
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
    handleError(error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error;
            const status = axiosError.response?.status;
            const data = axiosError.response?.data;
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
                    throw new GoDaddyAPIError('Invalid API credentials', 'UNAUTHORIZED', status);
                case 403:
                    throw new GoDaddyAPIError('Access forbidden. Check API permissions', 'FORBIDDEN', status);
                case 404:
                    throw new GoDaddyAPIError('Resource not found', 'NOT_FOUND', status, data);
                case 429:
                    throw new GoDaddyAPIError('Rate limit exceeded', 'RATE_LIMIT', status);
                default:
                    throw new GoDaddyAPIError(data?.message ||
                        'An error occurred with the GoDaddy API', 'API_ERROR', status, data);
            }
        }
        throw new GoDaddyAPIError('An unexpected error occurred', 'UNKNOWN_ERROR', 500);
    }
    async checkSubdomainAvailability(subdomain) {
        if (!subdomain) {
            throw new GoDaddyAPIError('Subdomain is required', 'INVALID_PARAMETER');
        }
        try {
            // Check if the subdomain record exists
            console.log('Checking if subdomain record exists:', `${subdomain}.${this.domain}`);
            try {
                const response = await axios.get(`${this.baseUrl}/v1/domains/${this.domain}/records/CNAME/${subdomain}`, { headers: this.headers });
                console.log('Subdomain check response:', response.data);
                // If we get here, the record exists
                return false;
            }
            catch (error) {
                if (axios.isAxiosError(error)) {
                    console.log('Subdomain check error:', error.response?.data);
                    if (error.response?.status === 404) {
                        // 404 means the record doesn't exist, so the subdomain is available
                        return true;
                    }
                }
                throw error;
            }
        }
        catch (error) {
            this.handleError(error);
        }
    }
    async createSubdomainRecord(subdomain) {
        if (!subdomain) {
            throw new GoDaddyAPIError('Subdomain is required', 'INVALID_PARAMETER');
        }
        try {
            console.log('Creating subdomain record for:', `${subdomain}.${this.domain}`);
            const records = [
                {
                    data: '@', // Point to main domain's IP
                    name: subdomain,
                    ttl: 3600,
                    type: 'CNAME',
                },
            ];
            await axios.patch(`${this.baseUrl}/v1/domains/${this.domain}/records`, records, { headers: this.headers });
        }
        catch (error) {
            this.handleError(error);
        }
    }
    async deleteSubdomainRecord(subdomain) {
        if (!subdomain) {
            throw new GoDaddyAPIError('Subdomain is required', 'INVALID_PARAMETER');
        }
        try {
            console.log('Deleting subdomain record for:', `${subdomain}.${this.domain}`);
            await axios.delete(`${this.baseUrl}/v1/domains/${this.domain}/records/CNAME/${subdomain}`, { headers: this.headers });
        }
        catch (error) {
            this.handleError(error);
        }
    }
}
//# sourceMappingURL=godaddy.js.map