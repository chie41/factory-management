import 'dotenv/config';
import { Client } from 'pg';
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
try {
 const users=await c.query('SELECT id,username,employee_id,status,employee_link_exempt,deleted_at FROM users ORDER BY username');
 const employees=await c.query("SELECT id,employee_code,full_name,status FROM employees WHERE deleted_at IS NULL ORDER BY full_name");
 const roles=await c.query('SELECT r.code,count(ur.user_id)::int AS members FROM roles r LEFT JOIN user_roles ur ON ur.role_id=r.id GROUP BY r.code ORDER BY r.code');
 const columns=await c.query("SELECT column_name,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users'");
 console.log(JSON.stringify({users:users.rows,employees:employees.rows,roles:roles.rows,columns:columns.rows},null,2));
} finally {await c.end()}

