import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './round-time.css'
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)
