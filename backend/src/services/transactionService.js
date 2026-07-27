const crypto = require('crypto');
const pool = require('../db/pool');

const TAX_RATE = 0.11;

/**
 * Memproses satu transaksi secara atomik:
 * - Idempotent lewat client_transaction_id (kalau sudah pernah masuk, tidak
 *   diproses ulang -- ini yang membuat sinkronisasi offline aman diulang).
 * - Mengunci baris stok (FOR UPDATE) supaya aman dari race condition saat
 *   banyak kasir di cabang yang sama transaksi bersamaan.
 * - Validasi harga & stok selalu dari database, tidak pernah dari client.
 */
async function processTransaction({
  branchId,
  cashierId,
  items,
  method,
  cashReceived,
  clientTransactionId,
  occurredAt,
  createdOffline
}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw { status: 400, message: 'Keranjang tidak boleh kosong.' };
  }
  if (!['tunai', 'qris', 'debit'].includes(method)) {
    throw { status: 400, message: 'Metode pembayaran tidak valid.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cti = clientTransactionId || crypto.randomUUID();

    const existing = await client.query(
      'SELECT * FROM transactions WHERE client_transaction_id = $1',
      [cti]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      const items = await pool.query(
        'SELECT * FROM transaction_items WHERE transaction_id = $1',
        [existing.rows[0].id]
      );
      return { duplicate: true, transaction: { ...existing.rows[0], items: items.rows } };
    }

    const lineItems = [];
    let subtotal = 0;

    for (const raw of items) {
      const qty = parseInt(raw.qty, 10);
      if (!raw.product_id || !qty || qty <= 0) {
        throw { status: 400, message: 'Setiap item wajib punya product_id dan qty > 0.' };
      }

      const result = await client.query(
        `SELECT bs.stock, p.price, p.name
         FROM branch_stock bs JOIN products p ON p.id = bs.product_id
         WHERE bs.branch_id = $1 AND bs.product_id = $2
         FOR UPDATE`,
        [branchId, raw.product_id]
      );
      const row = result.rows[0];
      if (!row) {
        throw { status: 404, message: `Produk ${raw.product_id} tidak tersedia di cabang ini.` };
      }
      if (row.stock < qty) {
        throw {
          status: 409,
          message: `Stok ${row.name} tidak cukup di cabang ini (tersisa ${row.stock}).`,
          conflict: 'insufficient_stock',
          product_id: raw.product_id
        };
      }

      const lineTotal = row.price * qty;
      subtotal += lineTotal;
      lineItems.push({ product_id: raw.product_id, name: row.name, price: row.price, qty, lineTotal });
    }

    const tax = Math.round(subtotal * TAX_RATE);
    const total = subtotal + tax;

    let changeDue = 0;
    let cash = null;
    if (method === 'tunai') {
      cash = parseInt(cashReceived, 10) || 0;
      if (cash < total) {
        throw { status: 400, message: 'Uang yang diterima kurang dari total belanja.' };
      }
      changeDue = cash - total;
    }

    const transactionId = 'TRX-' + crypto.randomUUID().slice(0, 8).toUpperCase();

    await client.query(
      `INSERT INTO transactions
        (id, client_transaction_id, branch_id, cashier_id, subtotal, tax, total,
         method, cash_received, change_due, created_offline, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, COALESCE($12, now()))`,
      [
        transactionId, cti, branchId, cashierId, subtotal, tax, total,
        method, cash, changeDue, !!createdOffline, occurredAt || null
      ]
    );

    for (const li of lineItems) {
      await client.query(
        `INSERT INTO transaction_items (transaction_id, product_id, product_name, price, qty, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [transactionId, li.product_id, li.name, li.price, li.qty, li.lineTotal]
      );
      await client.query(
        'UPDATE branch_stock SET stock = stock - $1, updated_at = now() WHERE branch_id=$2 AND product_id=$3',
        [li.qty, branchId, li.product_id]
      );
    }

    await client.query('COMMIT');

    return {
      duplicate: false,
      transaction: {
        id: transactionId,
        client_transaction_id: cti,
        branch_id: branchId,
        cashier_id: cashierId,
        items: lineItems.map((li) => ({
          product_id: li.product_id, name: li.name, price: li.price, qty: li.qty, line_total: li.lineTotal
        })),
        subtotal, tax, total, method, cash_received: cash, change_due: changeDue
      }
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { processTransaction };
