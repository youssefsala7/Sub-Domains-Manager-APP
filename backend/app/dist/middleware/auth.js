import jwt from 'jsonwebtoken';
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            throw new Error();
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { userId: decoded.userId };
        next();
    }
    catch (error) {
        res.status(401).json({ message: 'Please authenticate' });
    }
};
export default auth;
//# sourceMappingURL=auth.js.map