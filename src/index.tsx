import './index.css'
import {createRoot} from 'react-dom/client'
import {Root} from './app'

const root = createRoot(document.getElementById('root')!)
root.render(<Root />)
