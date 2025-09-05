import { Router } from 'express';
import User from '../models/User.js';
import auth from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';
const router = Router();
// Helper function to sanitize user object
const sanitizeUser = (user) => {
    const sanitized = user.toObject();
    const { password, ...rest } = sanitized;
    return rest;
};
// Get all users (admin only)
router.get('/', auth, adminAuth, async (_req, res) => {
    try {
        const users = await User.find({}, { password: 0 });
        res.json(users);
        return;
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
        return;
    }
});
// Get single user
router.get('/:id', auth, async (req, res) => {
    try {
        const user = await User.findById(req.params.id, { password: 0 });
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        res.json(user);
        return;
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching user' });
        return;
    }
});
// Create new user (admin only)
router.post('/', auth, adminAuth, async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            res.status(400).json({ message: 'User already exists' });
            return;
        }
        const user = new User({
            email,
            password,
            name,
            role: role || 'user',
            isEnabled: true,
        });
        await user.save();
        res.status(201).json(sanitizeUser(user));
        return;
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating user' });
        return;
    }
});
// Update user (admin only or self)
router.put('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        // Only admins can update role
        const currentUser = await User.findById(req.user?.userId);
        if (updates.role && (!currentUser || currentUser.role !== 'admin')) {
            delete updates.role;
        }
        // Don't allow password updates through this endpoint
        delete updates.password;
        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        // Check if user has permission to update
        if ((!currentUser || currentUser.role !== 'admin') &&
            req.user?.userId !== id) {
            res.status(403).json({ message: 'Not authorized' });
            return;
        }
        Object.assign(user, updates);
        await user.save();
        res.json(sanitizeUser(user));
        return;
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating user' });
        return;
    }
});
// Delete user (admin only)
router.delete('/:id', auth, adminAuth, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        res.json({ message: 'User deleted successfully' });
        return;
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting user' });
        return;
    }
});
// Disable/Enable user (admin only)
router.patch('/:id/status', auth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { isEnabled } = req.body;
        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        user.isEnabled = isEnabled;
        await user.save();
        res.json(sanitizeUser(user));
        return;
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating user status' });
        return;
    }
});
export default router;
//# sourceMappingURL=users.js.map