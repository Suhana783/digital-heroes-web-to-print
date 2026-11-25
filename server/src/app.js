import cors from 'cors';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/healthRoutes.js';
import catalogueRoutes from './routes/catalogueRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import accountRoutes from './routes/accountRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import artworkRoutes from './routes/artworkRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import designerRoutes from './routes/designerRoutes.js';
import variableDataRoutes from './routes/variableDataRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';

const app = express();
const allowedOrigins = [...new Set([
  'http://localhost:5173',
  ...(process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim()),
].filter(Boolean))];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use('/api/health', healthRoutes);
app.use('/api/catalogue', catalogueRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/artwork', artworkRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/designer', designerRoutes);
app.use('/api/variable-data', variableDataRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
