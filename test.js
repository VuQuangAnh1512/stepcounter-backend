require('dotenv').config();
const pool = require('./src/db');

async function test() {
  console.log('\n=== KIỂM TRA HỆ THỐNG ===\n');

  // Test DB connection
  try {
    await pool.query('SELECT 1');
    console.log('✓ Kết nối PostgreSQL: OK');
  } catch (e) {
    console.error('✕ Kết nối PostgreSQL THẤT BẠI:', e.message);
    console.error('  → Kiểm tra DB_PASSWORD trong file .env');
    process.exit(1);
  }

  // Test table exists
  try {
    const { rows } = await pool.query("SELECT COUNT(*) FROM users");
    console.log('✓ Bảng users: OK (' + rows[0].count + ' users)');
  } catch (e) {
    console.error('✕ Bảng users KHÔNG TỒN TẠI:', e.message);
    console.error('  → Chạy file schema.sql trong pgAdmin');
    process.exit(1);
  }

  // Test admin account
  try {
    const { rows } = await pool.query("SELECT id, name, email, is_admin FROM users WHERE email='admin@stepcounter.com'");
    if (rows.length === 0) {
      console.error('✕ Tài khoản admin KHÔNG TỒN TẠI');
      console.error('  → Chạy lại file schema.sql để tạo tài khoản admin mặc định');
    } else {
      const u = rows[0];
      console.log('✓ Tài khoản admin: OK');
      console.log('  Email:', u.email);
      console.log('  is_admin:', u.is_admin);
    }
  } catch (e) {
    console.error('✕ Lỗi kiểm tra admin:', e.message);
  }

  console.log('\n=== KẾT QUẢ ===');
  console.log('Nếu tất cả ✓ → chạy: node server.js\n');
  process.exit(0);
}

test();
