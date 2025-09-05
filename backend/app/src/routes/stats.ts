import { Router } from 'express';
import auth from '../middleware/auth.js';
import Client from '../models/Client.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// @route   GET /api/stats
// @desc    Get system statistics
// @access  Private
router.get('/', auth, async (req: AuthRequest, res) => {
	try {
		if (!req.user) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const totalClients = await Client.countDocuments({
			owner: req.user.userId,
		});
		const deployedClients = await Client.countDocuments({
			owner: req.user.userId,
			isDeployed: true,
		});
		const totalLinks = await Client.aggregate([
			{ $match: { owner: req.user.userId } },
			{ $project: { linkCount: { $size: '$links' } } },
			{ $group: { _id: null, total: { $sum: '$linkCount' } } },
		]);

		res.json({
			totalClients,
			deployedClients,
			totalLinks: totalLinks.length > 0 ? totalLinks[0].total : 0,
			deploymentRate:
				totalClients > 0 ? (deployedClients / totalClients) * 100 : 0,
		});
		return;
	} catch (error) {
		console.error('Error fetching stats:', error);
		res.status(500).json({ message: 'Server error' });
		return;
	}
});

export default router;
