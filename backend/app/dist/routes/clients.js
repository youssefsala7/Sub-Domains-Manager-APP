import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import multer from 'multer';
import Client from '../models/Client.js';
import auth from '../middleware/auth.js';
import { CloudflareAPI, CloudflareAPIError } from '../services/cloudflare.js';
import { CoolifyAPI, CoolifyAPIError } from '../services/coolify.js';
import { WordPressAPI, WordPressAPIError } from '../services/wordpress.js';
const router = Router();
// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    },
});
let cloudflare = null;
let coolify = null;
let wordpress = null;
// Helper function to get or initialize Cloudflare API
const getCloudflareAPI = () => {
    if (cloudflare)
        return cloudflare;
    try {
        if (!process.env.CLOUDFLARE_API_TOKEN ||
            !process.env.CLOUDFLARE_ZONE_ID) {
            console.warn('Warning: Cloudflare API credentials not found in environment variables');
            return null;
        }
        cloudflare = new CloudflareAPI(process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ZONE_ID, process.env.DOMAIN, process.env.SERVER_IP);
        return cloudflare;
    }
    catch (error) {
        console.error('Error initializing Cloudflare API:', error);
        return null;
    }
};
// Helper function to get or initialize Coolify API
const getCoolifyAPI = () => {
    if (coolify)
        return coolify;
    try {
        if (!process.env.COOLIFY_API_KEY || !process.env.COOLIFY_API_URL) {
            console.warn('Warning: Coolify API credentials not found in environment variables');
            return null;
        }
        coolify = new CoolifyAPI(process.env.COOLIFY_API_KEY, process.env.COOLIFY_API_URL);
        return coolify;
    }
    catch (error) {
        console.error('Error initializing Coolify API:', error);
        return null;
    }
};
// Helper function to get or initialize WordPress API
const getWordPressAPI = () => {
    if (wordpress)
        return wordpress;
    try {
        if (!process.env.WORDPRESS_API_URL ||
            !process.env.WORDPRESS_USERNAME ||
            !process.env.WORDPRESS_PASSWORD) {
            console.warn('Warning: WordPress API credentials not found in environment variables');
            return null;
        }
        wordpress = new WordPressAPI(process.env.WORDPRESS_API_URL, process.env.WORDPRESS_USERNAME, process.env.WORDPRESS_PASSWORD);
        return wordpress;
    }
    catch (error) {
        console.error('Error initializing WordPress API:', error);
        return null;
    }
};
// Helper function to check if Cloudflare API is available
const checkCloudflareAPI = (res) => {
    const api = getCloudflareAPI();
    if (!api) {
        res.status(503).json({
            message: 'Domain management service is currently unavailable. Please try again later.',
        });
        return false;
    }
    return true;
};
// Helper function to check if Coolify API is available
const checkCoolifyAPI = (res) => {
    const api = getCoolifyAPI();
    if (!api) {
        res.status(503).json({
            message: 'Deployment service is currently unavailable. Please try again later.',
        });
        return false;
    }
    return true;
};
// Helper function to check if WordPress API is available
const checkWordPressAPI = (res) => {
    const api = getWordPressAPI();
    if (!api) {
        res.status(503).json({
            message: 'Image upload service is currently unavailable. Please try again later.',
        });
        return false;
    }
    return true;
};
// Get recent clients
router.get('/recent', auth, async (req, res) => {
    try {
        const recentClients = await Client.find({ owner: req.user?.userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name subdomain isDeployed links createdAt');
        res.json(recentClients);
        return;
    }
    catch (error) {
        console.error('Error fetching recent clients:', error);
        res.status(500).json({ message: 'Server error' });
        return;
    }
});
router.get('/check-subdomain', auth, async (req, res) => {
    try {
        const { subdomain } = req.query;
        if (!subdomain || typeof subdomain !== 'string') {
            res.status(400).json({ message: 'Subdomain is required' });
            return;
        }
        if (!checkCloudflareAPI(res))
            return;
        // Check subdomain format
        const subdomainRegex = /^[a-z0-9-]+$/;
        if (!subdomainRegex.test(subdomain)) {
            res.status(400).json({
                message: 'Subdomain can only contain lowercase letters, numbers, and hyphens',
            });
            return;
        }
        // Check if subdomain exists in database
        const existingClient = await Client.findOne({ subdomain });
        if (existingClient) {
            res.status(400).json({
                message: 'This subdomain is already taken',
            });
            return;
        }
        // Check subdomain availability in Cloudflare
        try {
            const available = await cloudflare.checkSubdomainAvailability(subdomain);
            res.json({ available });
            return;
        }
        catch (error) {
            if (error instanceof CloudflareAPIError) {
                res.status(error.status || 500).json({
                    message: error.message,
                });
                return;
            }
            throw error;
        }
    }
    catch (error) {
        console.error('Error checking subdomain:', error);
        res.status(500).json({ message: 'Server error' });
        return;
    }
});
// Create new client with logo upload
router.post('/', [
    auth,
    upload.single('logo'),
    body('name').notEmpty().trim().escape(),
    body('subdomain').notEmpty().trim().toLowerCase(),
    body('links').optional(),
    body('links.*.title').optional().trim().escape(),
    body('links.*.url').optional().isURL(),
    body('deploymentType').optional().isIn(['template', 'custom-html']),
    body('htmlCode').optional().trim(),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return;
        }
        // Custom validation for deployment type specific requirements
        const reqDeploymentType = req.body.deploymentType;
        const reqLinks = req.body.links;
        const reqHtmlCode = req.body.htmlCode;
        const parsedLinks = typeof reqLinks === 'string'
            ? JSON.parse(reqLinks || '[]')
            : reqLinks || [];
        if (reqDeploymentType === 'template') {
            // For template deployment, links are required
            if (!parsedLinks || parsedLinks.length === 0) {
                res.status(400).json({
                    message: 'At least one link is required for template deployment',
                });
                return;
            }
            // Validate each link has title and url
            for (let i = 0; i < parsedLinks.length; i++) {
                const link = parsedLinks[i];
                if (!link.title || !link.title.trim()) {
                    res.status(400).json({
                        message: `Link ${i + 1} title is required`,
                    });
                    return;
                }
                if (!link.url || !link.url.trim()) {
                    res.status(400).json({
                        message: `Link ${i + 1} URL is required`,
                    });
                    return;
                }
            }
        }
        else if (reqDeploymentType === 'custom-html') {
            // For custom HTML deployment, HTML code is required
            if (!reqHtmlCode || !reqHtmlCode.trim()) {
                res.status(400).json({
                    message: 'HTML code is required for custom HTML deployment',
                });
                return;
            }
        }
        if (!checkCloudflareAPI(res) || !checkCoolifyAPI(res))
            return;
        const { name, subdomain, description, links, customization, deploymentType, htmlCode, } = req.body;
        // Handle logo upload if provided
        let logoUrl;
        if (req.file) {
            if (!checkWordPressAPI(res))
                return;
            try {
                logoUrl = await wordpress.uploadImage(req.file.buffer, `${subdomain}-logo-${Date.now()}.${req.file.mimetype.split('/')[1]}`);
            }
            catch (error) {
                console.error('Error uploading logo:', error);
                if (error instanceof WordPressAPIError) {
                    res.status(error.status || 500).json({
                        message: 'Failed to upload logo',
                        error: error.message,
                    });
                    return;
                }
                res.status(500).json({
                    message: 'Failed to upload logo',
                });
                return;
            }
        }
        // Check subdomain availability in Cloudflare
        try {
            const available = await cloudflare.checkSubdomainAvailability(subdomain);
            if (!available) {
                res.status(400).json({
                    message: 'This subdomain is not available',
                });
                return;
            }
        }
        catch (error) {
            console.error('Error checking subdomain availability:', error);
            res.status(500).json({
                message: 'Failed to check subdomain availability',
            });
            return;
        }
        // Create client in database
        const client = new Client({
            owner: new mongoose.Types.ObjectId(req.user?.userId),
            name,
            subdomain,
            description,
            links: typeof links === 'string' ? JSON.parse(links) : links,
            customization: typeof customization === 'string'
                ? JSON.parse(customization)
                : customization,
            logo: logoUrl,
            deploymentType: deploymentType || 'template',
            htmlCode,
        });
        await client.save();
        // Create DNS record in Cloudflare
        try {
            await cloudflare.createSubdomainRecord(subdomain);
        }
        catch (error) {
            console.error('Error creating DNS record:', error);
            // Don't fail the request if DNS record creation fails
            // The record can be created later using the deploy endpoint
        }
        // Deploy template to Coolify
        try {
            await coolify.createDeployment({
                subdomain,
                clientData: {
                    name,
                    description,
                    links: typeof links === 'string'
                        ? JSON.parse(links)
                        : links,
                    customization: typeof customization === 'string'
                        ? JSON.parse(customization)
                        : customization,
                    logo: logoUrl,
                    deploymentType: deploymentType || 'template',
                    htmlCode,
                },
            });
            client.isDeployed = true;
            await client.save();
        }
        catch (error) {
            console.error('Error deploying template:', error);
            // Don't fail the request if deployment fails
            // The deployment can be retried later using the deploy endpoint
        }
        res.status(201).json(client);
        return;
    }
    catch (error) {
        console.error('Error creating client:', error);
        res.status(500).json({ message: 'Server error' });
        return;
    }
});
// Get all clients
router.get('/', auth, async (req, res) => {
    try {
        const clients = await Client.find({ owner: req.user?.userId })
            .sort({ createdAt: -1 })
            .select('name subdomain isDeployed links deploymentType');
        res.json(clients);
        return;
    }
    catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ message: 'Server error' });
        return;
    }
});
// Get a single client
router.get('/:id', auth, async (req, res) => {
    try {
        const client = await Client.findOne({
            _id: req.params.id,
            owner: req.user?.userId,
        });
        if (!client) {
            res.status(404).json({ message: 'Client not found' });
            return;
        }
        res.json(client);
        return;
    }
    catch (error) {
        console.error('Error fetching client:', error);
        res.status(500).json({ message: 'Server error' });
        return;
    }
});
// Deploy client
router.post('/:id/deploy', auth, async (req, res) => {
    try {
        const client = await Client.findOne({
            _id: req.params.id,
            owner: req.user?.userId,
        });
        if (!client) {
            res.status(404).json({ error: 'Client not found' });
            return;
        }
        // Check if client is already deployed
        if (client.isDeployed) {
            res.status(400).json({ error: 'Client is already deployed' });
            return;
        }
        // Initialize services
        if (!checkCloudflareAPI(res) || !checkCoolifyAPI(res))
            return;
        console.log('Starting deployment process for client:', {
            id: client._id,
            subdomain: client.subdomain,
            owner: client.owner,
        });
        // Check if DNS record exists in Cloudflare
        try {
            console.log('Checking Cloudflare DNS record for:', client.subdomain);
            const dnsExists = await cloudflare.checkSubdomainAvailability(client.subdomain);
            if (dnsExists) {
                console.log('Creating Cloudflare DNS record for:', client.subdomain);
                await cloudflare.createSubdomainRecord(client.subdomain);
                console.log('Successfully created Cloudflare DNS record');
            }
            else {
                console.log('DNS record already exists for:', client.subdomain);
            }
        }
        catch (error) {
            console.error('Error managing DNS record:', error);
            res.status(500).json({
                error: 'Failed to manage DNS record',
                details: error instanceof Error ? error.message : 'Unknown error',
            });
            return;
        }
        // Create deployment in Coolify
        try {
            console.log('Creating Coolify deployment for:', client.subdomain);
            const clientData = {
                name: client.name,
                description: client.description,
                links: client.links,
                customization: client.customization,
                logo: client.logo,
                deploymentType: client.deploymentType,
                htmlCode: client.htmlCode,
            };
            await coolify.createDeployment({
                subdomain: client.subdomain,
                clientData,
            });
            // Update client status in database
            client.isDeployed = true;
            await client.save();
            console.log('Deployment successful for client:', client._id);
            res.json({
                message: 'Deployment successful',
                client: {
                    ...client.toObject(),
                    isDeployed: true,
                },
            });
            return;
        }
        catch (error) {
            console.error('Deployment failed for client:', {
                id: client._id,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            // Try to clean up DNS record if deployment failed
            try {
                await cloudflare.deleteSubdomainRecord(client.subdomain);
                console.log('Cleaned up DNS record after failed deployment');
            }
            catch (cleanupError) {
                console.error('Failed to clean up DNS record:', cleanupError);
            }
            if (error instanceof CoolifyAPIError) {
                res.status(error.status || 500).json({
                    error: 'Deployment failed',
                    details: error.message,
                    code: error.code,
                    apiResponse: error.response,
                });
                return;
            }
            res.status(500).json({
                error: 'Deployment failed',
                details: error instanceof Error ? error.message : 'Unknown error',
            });
            return;
        }
    }
    catch (error) {
        console.error('Error in deploy route:', error);
        res.status(500).json({
            error: 'Server error',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
        return;
    }
});
// Undeploy client
router.delete('/:id/deploy', auth, async (req, res) => {
    try {
        if (!checkCloudflareAPI(res) || !checkCoolifyAPI(res))
            return;
        const client = await Client.findOne({
            _id: req.params.id,
            owner: req.user?.userId,
        });
        if (!client) {
            res.status(404).json({ message: 'Client not found' });
            return;
        }
        console.log('Starting undeployment for client:', {
            id: client._id,
            subdomain: client.subdomain,
        });
        let errors = [];
        // Delete DNS record from Cloudflare
        try {
            console.log('Deleting Cloudflare DNS record for:', client.subdomain);
            await cloudflare.deleteSubdomainRecord(client.subdomain);
            console.log('Successfully deleted Cloudflare DNS record');
        }
        catch (error) {
            console.error('Error deleting DNS record:', error);
            errors.push('Failed to delete DNS record');
        }
        // Delete deployment from Coolify
        try {
            console.log('Deleting Coolify deployment for:', client.subdomain);
            await coolify.deleteDeployment(client.subdomain);
            console.log('Successfully deleted Coolify deployment');
        }
        catch (error) {
            console.error('Error undeploying from Coolify:', error);
            errors.push('Failed to delete Coolify deployment');
        }
        // Update client status if at least one operation succeeded
        if (errors.length < 2) {
            client.isDeployed = false;
            await client.save();
            console.log('Updated client deployment status to false');
        }
        // Return appropriate response based on errors
        if (errors.length === 0) {
            res.json({ message: 'Client undeployed successfully' });
            return;
        }
        else if (errors.length === 2) {
            res.status(500).json({
                message: 'Failed to undeploy client',
                errors,
            });
            return;
        }
        else {
            res.status(207).json({
                message: 'Client partially undeployed',
                errors,
            });
            return;
        }
    }
    catch (error) {
        console.error('Error in undeploy route:', error);
        res.status(500).json({
            message: 'Server error',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return;
    }
});
// Update client
router.put('/:id', [
    auth,
    upload.single('logo'),
    body('name').optional().trim().escape(),
    body('description').optional().trim().escape(),
    body('links').optional(),
    body('links.*.title').optional().trim().escape(),
    body('links.*.url').optional().isURL(),
    body('deploymentType').optional().isIn(['template', 'custom-html']),
    body('htmlCode').optional().trim(),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return;
        }
        const client = await Client.findOne({
            _id: req.params.id,
            owner: req.user?.userId,
        });
        if (!client) {
            res.status(404).json({ message: 'Client not found' });
            return;
        }
        // Parse form data safely
        const formData = {
            name: req.body.name,
            description: req.body.description,
            links: typeof req.body.links === 'string'
                ? JSON.parse(req.body.links)
                : req.body.links,
            customization: typeof req.body.customization === 'string'
                ? JSON.parse(req.body.customization)
                : req.body.customization,
            deploymentType: req.body.deploymentType,
            htmlCode: req.body.htmlCode,
        };
        console.log('Received update request:', {
            body: req.body,
            file: req.file,
            parsedData: formData,
        });
        // Handle logo upload if provided
        let newLogoUrl = undefined;
        if (req.file) {
            if (!checkWordPressAPI(res))
                return;
            try {
                newLogoUrl = await wordpress.uploadImage(req.file.buffer, `${client.subdomain}-logo-${Date.now()}.${req.file.mimetype.split('/')[1]}`);
                console.log('New logo uploaded:', newLogoUrl);
            }
            catch (error) {
                console.error('Error uploading logo:', error);
                if (error instanceof WordPressAPIError) {
                    res.status(error.status || 500).json({
                        message: 'Failed to upload logo',
                        error: error.message,
                    });
                    return;
                }
                res.status(500).json({
                    message: 'Failed to upload logo',
                });
                return;
            }
        }
        // Update client data
        const updates = {};
        if (formData.name)
            updates.name = formData.name;
        if (formData.description !== undefined)
            updates.description = formData.description;
        if (formData.links)
            updates.links = formData.links;
        if (formData.customization)
            updates.customization = formData.customization;
        if (newLogoUrl !== undefined)
            updates.logo = newLogoUrl;
        if (formData.deploymentType)
            updates.deploymentType = formData.deploymentType;
        if (formData.htmlCode !== undefined)
            updates.htmlCode = formData.htmlCode;
        console.log('Applying updates:', updates);
        // Apply updates
        Object.assign(client, updates);
        await client.save();
        // Update deployment if client is deployed
        if (client.isDeployed && checkCoolifyAPI(res)) {
            try {
                const clientData = {
                    name: client.name,
                    description: client.description,
                    links: client.links,
                    customization: client.customization,
                    logo: client.logo,
                    deploymentType: client.deploymentType,
                    htmlCode: client.htmlCode,
                };
                console.log('Updating deployment with data:', clientData);
                await coolify.updateDeployment({
                    subdomain: client.subdomain,
                    clientData,
                });
            }
            catch (error) {
                console.error('Error updating deployment:', error);
                res.status(500).json({
                    message: 'Failed to update deployment',
                    error: error instanceof Error
                        ? error.message
                        : 'Unknown error',
                });
                return;
            }
        }
        res.json(client);
        return;
    }
    catch (error) {
        console.error('Error updating client:', error);
        if (error instanceof SyntaxError) {
            res.status(400).json({
                message: 'Invalid JSON format in request body',
                details: error.message,
            });
            return;
        }
        res.status(500).json({ message: 'Server error' });
        return;
    }
});
// Test WordPress image upload
router.post('/test-upload', [auth, upload.single('image')], async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No image file provided' });
            return;
        }
        if (!checkWordPressAPI(res))
            return;
        console.log('Testing WordPress upload with file:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
        });
        try {
            const imageUrl = await wordpress.uploadImage(req.file.buffer, `test-upload-${Date.now()}.${req.file.mimetype.split('/')[1]}`);
            console.log('WordPress upload successful:', imageUrl);
            res.json({
                message: 'Upload successful',
                imageUrl: imageUrl,
            });
            return;
        }
        catch (error) {
            console.error('WordPress upload error:', error);
            if (error instanceof WordPressAPIError) {
                res.status(error.status || 500).json({
                    message: 'Failed to upload image',
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                message: 'Failed to upload image',
            });
            return;
        }
    }
    catch (error) {
        console.error('Test upload error:', error);
        res.status(500).json({ message: 'Server error' });
        return;
    }
});
export default router;
//# sourceMappingURL=clients.js.map