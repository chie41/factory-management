
import 'dotenv/config';
import * as argon2 from 'argon2';

async function main() {
  const password = process.env['ADMIN_PASSWORD'];

  if (!password) {
    throw new Error('Thiếu ADMIN_PASSWORD trong file .env');
  }

  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  console.log('Đã tạo password hash thành công.');
  // Không in hash hoặc mật khẩu ra terminal.
  void hash;
}

main().catch((error: unknown) => {
  console.error('Không thể tạo password hash:', error);
  process.exitCode = 1;
});
