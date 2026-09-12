import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/instrument-sans'
// Archivo porte les titres : une grotesque plus large et plus affirmee qu'Instrument Sans,
// qui donne au titre de route la presence que la charte demande (design/DESIGN.md).
import '@fontsource-variable/archivo'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
