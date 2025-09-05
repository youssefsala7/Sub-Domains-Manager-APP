import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../types.js';

const auth = async (req: AuthRequest, res: Response, next: NextFunction) => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '');

		if (!token) {
			throw new Error();
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
			userId: string;
		};
		req.user = { userId: decoded.userId };
		next();
	} catch (error) {
		res.status(401).json({ message: 'Please authenticate' });
	}
};

export default auth;
