import 'dotenv/config';
import 'reflect-metadata';
import { RbacService } from '../src/auth/rbac.service.js';
import { REQUIRED_ADMIN_PERMISSIONS } from '../src/auth/permission-catalog.js';
const url=new URL(process.env.DATABASE_URL!);
if(!process.argv.includes('--local')||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||process.env.NODE_ENV==='production')throw new Error('Local database only.');
const rbac=new RbacService();
try {
 const targets=(await rbac.pool.query<{id:string}>('SELECT DISTINCT u.id FROM users u JOIN user_groups ug ON ug.user_id=u.id WHERE u.employee_link_exempt=true')).rows;
 if(!targets.length)console.log('System admin has no group membership.');
 else {
  let actor:string|undefined;
  for(const row of (await rbac.pool.query<{id:string}>("SELECT id FROM users WHERE status='ACTIVE' AND deleted_at IS NULL")).rows) {
   const codes=new Set((await rbac.effective(row.id)).map(p=>p.code));
   if(REQUIRED_ADMIN_PERMISSIONS.every(code=>codes.has(code))){actor=row.id;break;}
  }
  if(!actor)throw new Error('No valid admin; no membership changed.');
  for(const target of targets)await rbac.mutate(actor,['users.groups.manage'],'users.group.remove_system_admin',target.id,async c=>{await c.query('DELETE FROM user_groups WHERE user_id=$1',[target.id]);});
  console.log('Removed system admin group membership with audit and administrator safeguards.');
 }
} finally {await rbac.onModuleDestroy()}
