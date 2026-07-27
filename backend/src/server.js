require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const branchRoutes = require('./routes/branches');
const productRoutes = require('./routes/products');
const branchStockRoutes = require('./routes/branch-stock');
const orderRoutes = require('./routes/orders');
const syncRoutes = require('./routes/sync');
const transferRoutes = require('./routes/transfers');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/branches', branchRoutes);
app.use('/products', productRoutes);
app.use('/branch-stock', branchStockRoutes);
app.use('/orders', orderRoutes);
app.use('/sync', syncRoutes);
app.use('/transfers', transferRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`Sistem kasir backend v2 (multi-cabang) berjalan di http://localhost:${PORT}`);
});
