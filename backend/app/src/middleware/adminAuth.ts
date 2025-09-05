import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types.js';
import User from '../models/User.js';

const adminAuth = async (
	req: AuthRequest,
	res: Response,
	next: NextFunction
) => {
	try {
		const user = await User.findById(req.user?.userId);

		if (!user || user.role !== 'admin') {
			res.status(403).json({ message: 'Access denied. Admin only.' });
			return;
		}

		next();
	} catch (error) {
		res.status(500).json({ message: 'Server error' });
		return;
	}
};

export default adminAuth;
