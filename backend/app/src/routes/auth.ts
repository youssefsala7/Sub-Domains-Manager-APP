import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import auth from '../middleware/auth.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// Register a new user
router.post(
	'/register',
	[
		body('email').isEmail().normalizeEmail(),
		body('password').isLength({ min: 6 }),
		body('name').trim().notEmpty(),
		body('role').optional().isIn(['admin', 'user']),
	],
	async (req: Request, res: Response) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				res.status(400).json({ errors: errors.array() });
				return;
			}

			// Check if an admin user already exists
			const adminExists = await User.findOne({ role: 'admin' });
			if (adminExists) {
				res.status(403).json({
					message:
						'Registration is disabled. Please contact an administrator.',
				});
				return;
			}

			const { email, password, name, role } = req.body;

			// Check if user already exists
			let user = await User.findOne({ email });
			if (user) {
				res.status(400).json({ message: 'User already exists' });
				return;
			}

			// Create new user
			user = new User({
				email,
				password,
				name,
				role: role || 'user', // Use provided role or default to 'user'
			});

			await user.save();

			// Generate JWT
			const token = jwt.sign(
				{ userId: user._id },
				process.env.JWT_SECRET!,
				{ expiresIn: '24h' }
			);

			res.status(201).json({
				token,
				user: {
					id: user._id,
					email: user.email,
					name: user.name,
					role: user.role,
				},
			});
			return;
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: 'Server error' });
			return;
		}
	}
);

// Login user
router.post(
	'/login',
	[body('email').isEmail().normalizeEmail(), body('password').exists()],
	async (req: Request, res: Response) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				res.status(400).json({ errors: errors.array() });
				return;
			}

			const { email, password } = req.body;

			// Check if user exists
			const user = await User.findOne({ email });
			if (!user) {
				res.status(400).json({ message: 'Invalid credentials' });
				return;
			}

			// Verify password
			const isMatch = await user.comparePassword(password);
			if (!isMatch) {
				res.status(400).json({ message: 'Invalid credentials' });
				return;
			}

			// Generate JWT
			const token = jwt.sign(
				{ userId: user._id },
				process.env.JWT_SECRET!,
				{ expiresIn: '24h' }
			);

			res.json({
				token,
				user: {
					id: user._id,
					email: user.email,
					name: user.name,
					role: user.role,
				},
			});
			return;
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: 'Server error' });
			return;
		}
	}
);

// Get current user
router.get('/me', auth, async (req: AuthRequest, res: Response) => {
	try {
		const user = await User.findById(req.user?.userId).select('-password');
		if (!user) {
			res.status(404).json({ message: 'User not found' });
			return;
		}
		res.json(user);
		return;
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Server error' });
		return;
	}
});

export default router;
