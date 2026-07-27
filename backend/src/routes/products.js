const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Katalog global -- semua cabang melihat produk & harga yang sama.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE active = true ORDER BY name');
    res.json({ products: rows });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, category, price } = req.body || {};
    if (!name || price === undefined || price < 0) {
      return res.status(400).json({ error: 'Nama dan harga produk wajib diisi dengan benar.' });
    }
    const id = 'p-' + crypto.randomUUID().slice(0, 8);
    const { rows } = await pool.query(
      'INSERT INTO products (id, name, category, price) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, name, category || 'Umum', price]
    );

    // Produk baru otomatis tersedia di semua cabang dengan stok 0
    // (cabang lalu isi stok lewat stock opname atau transfer).
    const { rows: branches } = await pool.query('SELECT id FROM branches WHERE is_active = true');
    for (const b of branches) {
      await pool.query(
        'INSERT INTO branch_stock (branch_id, product_id, stock) VALUES ($1,$2,0) ON CONFLICT DO NOTHING',
        [b.id, id]
      );
    }

    res.status(201).json({ product: rows[0] });
  } catch (err) { next(err); }
});

router.put('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows: existingRows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

    const { name, category, price, active } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE products SET name=$1, category=$2, price=$3, active=$4, updated_at=now()
       WHERE id=$5 RETURNING *`,
      [
        name ?? existing.name,
        category ?? existing.category,
        price ?? existing.price,
        active ?? existing.active,
        req.params.id
      ]
    );
    res.json({ product: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
