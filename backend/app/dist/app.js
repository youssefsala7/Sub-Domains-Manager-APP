import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import usersRouter from './routes/users.js';
import authRouter from './routes/auth.js';
import clientsRouter from './routes/clients.js';
import statsRouter from './routes/stats.js';
// Load environment variables from .env file in the backend directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
// Initialize Express app
const app = express();
// Middleware
app.use(cors());
app.use(express.json());
// Routes
app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/stats', statsRouter);
export default app;
//# sourceMappingURL=app.js.map