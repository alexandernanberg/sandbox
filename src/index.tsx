import { createRoot } from 'react-dom/client'
import { Root } from './app'
import './index.css'

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('root')!).render(<Root />)
