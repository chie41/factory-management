import fs from 'node:fs';
for (const [name,feature,type] of [['Employees','employees','Employee'],['Customers','customers','Customer']]) {
const p=`src/features/${feature}/hooks/use${name}.ts`;
let s=fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
s=s.replace('    setLoading(true)','    let cancelled = false').replace(/    api.get\([^\n]+\)\n      .then\([^\n]+\)/,`    fetch${name}()\n      .then((next) => { if (!cancelled) setRows(next) })`);
fs.writeFileSync(p,s);
}
const p='src/pages/LoginPage.tsx';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/import \{ UserOutlined \} from '@ant-design\/icons'\r?\n/,''));
