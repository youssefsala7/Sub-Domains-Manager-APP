import User from '../models/User.js';
const adminAuth = async (req, res, next) => {
    try {
        const user = await User.findById(req.user?.userId);
        if (!user || user.role !== 'admin') {
            res.status(403).json({ message: 'Access denied. Admin only.' });
            return;
        }
        next();
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
        return;
    }
};
export default adminAuth;
//# sourceMappingURL=adminAuth.js.map