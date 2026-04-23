// Script tạo 50 tài khoản test trực tiếp vào database
// Chạy từ thư mục StepCounterBackend: node seed-users.js

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'stepcounter',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
    });

const firstNames = [
  'Minh','Hùng','Lan','Hoa','Tuấn','Linh','Nam','Phương','Đức','Thảo',
  'Khoa','Mai','Bình','Yến','Trung','Ngọc','Hải','Thu','Long','Trang',
  'Việt','Nhung','Quang','Hằng','Dũng','Ly','Tâm','Hiền','Phúc','Loan',
];
const lastNames = [
  'Nguyễn','Trần','Lê','Phạm','Hoàng','Huỳnh','Phan','Vũ','Võ','Đặng',
  'Bùi','Đỗ','Hồ','Ngô','Dương','Lý',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function main() {
  const hash = await bcrypt.hash('Test@123456', 10);
  console.log('Bắt đầu tạo 50 tài khoản test...\n');

  let ok = 0, skip = 0, fail = 0;

  for (let i = 1; i <= 50; i++) {
    const name  = `${pick(lastNames)} ${pick(firstNames)}`;
    const email = `testuser${i}@test.com`;
    const age   = randInt(18, 45);
    const gender = Math.random() > 0.5 ? 'male' : 'female';
    const step_goal = pick([6000, 8000, 10000, 12000, 15000]);

    try {
      await pool.query(
        `INSERT INTO users (name, email, password, age, gender, step_goal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [name, email, hash, age, gender, step_goal]
      );
      console.log(`[${i}/50] OK   - ${email} (${name})`);
      ok++;
    } catch (err) {
      if (err.code === '23505') {
        console.log(`[${i}/50] SKIP - ${email} (đã tồn tại)`);
        skip++;
      } else {
        console.log(`[${i}/50] FAIL - ${email} → ${err.message}`);
        fail++;
      }
    }
  }

  console.log(`\nKết quả: ${ok} tạo mới, ${skip} đã tồn tại, ${fail} lỗi`);
  console.log('Password của tất cả: Test@123456');
  await pool.end();
}

main().catch(err => { console.error('Lỗi kết nối DB:', err.message); process.exit(1); });
