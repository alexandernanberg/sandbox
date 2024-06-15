/// <reference types="react/canary" />
/// <reference types="react-dom/canary" />

import './index.css'
import { createRoot } from 'react-dom/client'
import { Root } from './app'

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const root = createRoot(document.getElementById('root')!)
root.render(<Root />)
