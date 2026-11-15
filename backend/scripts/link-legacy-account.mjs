import 'dotenv/config';
import { Client } from 'pg';
const [username,employeeCode]=process.argv.slice(2);
const url=new URL(process.env.DATABASE_URL);
if(!username||!employeeCode||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||process.env.NODE_ENV==='production') throw new Error('Provide username and employee code for a local development database.');
const c=new Client({connectionString:url.toString()}); await c.connect();
try {
 await c.query('BEGIN'); await c.query("SELECT pg_advisory_xact_lock(hashtext('factory:rbac'))");
 const user=(await c.query('SELECT id,employee_id FROM users WHERE username=$1 AND deleted_at IS NULL FOR UPDATE',[username])).rows[0];
 const employee=(await c.query("SELECT id FROM employees WHERE employee_code=$1 AND deleted_at IS NULL AND status='ACTIVE' FOR UPDATE",[employeeCode])).rows[0];
 if(!user||!employee) throw new Error('Account or employee not found.');
 if(user.employee_id&&user.employee_id!==employee.id) throw new Error('Account already linked; refusing to replace its employee.');
 await c.query('UPDATE users SET employee_id=$2,updated_at=clock_timestamp() WHERE id=$1',[user.id,employee.id]);
 await c.query("INSERT INTO security_audit(target_id,action,before_state,after_state) VALUES($1,'maintenance.link_employee',$2::jsonb,$3::jsonb)",[user.id,JSON.stringify({employee_id:user.employee_id}),JSON.stringify({employee_id:employee.id})]);
 await c.query('ALTER TABLE users VALIDATE CONSTRAINT users_employee_required');
 await c.query('ALTER TABLE users VALIDATE CONSTRAINT users_status_rbac');
 await c.query('COMMIT'); console.log('Legacy employee linked; employee and status constraints validated.');
} catch(error) {await c.query('ROLLBACK');throw error} finally {await c.end()}
