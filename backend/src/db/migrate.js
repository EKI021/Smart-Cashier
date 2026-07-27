const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Skema berhasil dibuat / sudah ada.');

  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM branches');
  if (rows[0].c > 0) {
    console.log('Data sudah ada, lewati seeding.');
    return;
  }

  await pool.query(
    `INSERT INTO branches (id, name, address) VALUES
      ('br-jkt-01', 'Cabang Kelapa Gading', 'Jl. Boulevard Raya, Jakarta Utara'),
      ('br-jkt-02', 'Cabang Kemang', 'Jl. Kemang Raya, Jakarta Selatan')`
  );

  const users = [
    ['usr-admin', 'admin', 'admin123', 'Siti Rahma', 'admin', null],
    ['usr-mgr1', 'manager1', 'manager123', 'Andi Wijaya', 'manager', 'br-jkt-01'],
    ['usr-kasir1', 'kasir1', 'kasir123', 'Budi Santoso', 'kasir', 'br-jkt-01'],
    ['usr-kasir2', 'kasir2', 'kasir123', 'Dewi Lestari', 'kasir', 'br-jkt-02']
  ];
  for (const [id, username, password, name, role, branchId] of users) {
    await pool.query(
      `INSERT INTO users (id, username, password_hash, name, role, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, username, bcrypt.hashSync(password, 10), name, role, branchId]
    );
  }

  const products = [
    ['p1', 'Nasi Goreng', 'Makanan', 15000],
    ['p2', 'Ayam Bakar', 'Makanan', 20000],
    ['p3', 'Es Teh Manis', 'Minuman', 5000],
    ['p4', 'Kopi Hitam', 'Minuman', 8000],
    ['p5', 'Kerupuk', 'Snack', 2000]
  ];
  for (const [id, name, category, price] of products) {
    await pool.query(
      'INSERT INTO products (id, name, category, price) VALUES ($1,$2,$3,$4)',
      [id, name, category, price]
    );
  }

  // Stok awal berbeda tiap cabang -- menunjukkan stok memang independen per cabang.
  const stockByBranch = {
    'br-jkt-01': { p1: 20, p2: 15, p3: 50, p4: 30, p5: 100 },
    'br-jkt-02': { p1: 10, p2: 8, p3: 40, p4: 25, p5: 60 }
  };
  for (const branchId of Object.keys(stockByBranch)) {
    for (const [productId, stock] of Object.entries(stockByBranch[branchId])) {
      await pool.query(
        'INSERT INTO branch_stock (branch_id, product_id, stock) VALUES ($1,$2,$3)',
        [branchId, productId, stock]
      );
    }
  }

  console.log('Seed data 2 cabang, 4 user, 5 produk berhasil dibuat.');
}

migrate()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Migrasi gagal:', err);
    pool.end();
    process.exit(1);
  });
