import axios from 'axios';
import FormData from 'form-data';
export class WordPressAPIError extends Error {
    status;
    code;
    response;
    constructor(message, status, code, response) {
        super(message);
        this.name = 'WordPressAPIError';
        this.status = status;
        this.code = code;
        this.response = response;
    }
}
export class WordPressAPI {
    apiUrl;
    username;
    password;
    constructor(apiUrl, username, password) {
        this.apiUrl = apiUrl.replace(/\/$/, '');
        this.username = username;
        this.password = password;
    }
    async uploadImage(file, filename) {
        try {
            // Create base64 auth string
            const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
            // Create form data
            const formData = new FormData();
            formData.append('file', file, {
                filename,
                contentType: this.getContentType(filename),
            });
            // Upload image to WordPress
            const response = await axios.post(`${this.apiUrl}/wp-json/wp/v2/media`, formData, {
                headers: {
                    Authorization: `Basic ${auth}`,
                    ...formData.getHeaders(),
                },
            });
            if (!response.data?.source_url) {
                throw new WordPressAPIError('Invalid response from WordPress API', response.status, 'INVALID_RESPONSE', response.data);
            }
            return response.data.source_url;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new WordPressAPIError(error.response?.data?.message || 'Failed to upload image', error.response?.status, error.response?.data?.code, error.response?.data);
            }
            throw error;
        }
    }
    getContentType(filename) {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'gif':
                return 'image/gif';
            case 'webp':
                return 'image/webp';
            default:
                return 'application/octet-stream';
        }
    }
}
//# sourceMappingURL=wordpress.js.map