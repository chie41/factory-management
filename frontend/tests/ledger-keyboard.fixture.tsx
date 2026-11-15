import { createRoot } from 'react-dom/client';
import { FixtureApp } from './ledger-keyboard.fixture-app';
const root=createRoot(document.getElementById('root')!);
root.render(<FixtureApp/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
