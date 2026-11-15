import { db } from './db.js';
import { varchar } from './varchar.js';

async function check() {
  return db.orm.public.Role.upsert({
    create: {
      code: varchar('ADMIN', 50),
      name: varchar('Quản trị hệ thống', 120),
    },
    update: {
      name: varchar('Quản trị hệ thống', 120),
    },
    conflictOn: {
      code: varchar('ADMIN', 50),
    },
  });
}

// Chưa gọi check(), nên chưa ghi dữ liệu.
void check;