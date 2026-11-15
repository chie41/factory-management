import 'dotenv/config';
const base=process.env.RBAC_API_URL??'http://127.0.0.1:3001/api/v1';
const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.ADMIN_PASSWORD})});
console.log('POST /auth/login:',response.status);
if(response.ok) {
 const {data}=await response.json();
 for(const path of ['/auth/me/permissions','/users','/groups','/roles','/permissions/catalog','/users/eligible-employees','/employees','/customers','/customer-ledger/summary']) {
  const result=await fetch(base+path,{headers:{Authorization:'Bearer '+data.access_token}});
  const body=await result.json();
  console.log(path,result.status,Array.isArray(body.data)?'rows='+body.data.length:body.message??'object');
 }
}
