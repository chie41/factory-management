// Browser entry point uses the real configured API. No authentication bypass or mock adapter.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../../src/app/App'
import '../../src/index.css'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
