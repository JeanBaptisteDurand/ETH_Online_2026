import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/instrument-sans'
// DEUX POLICES, pas trois. Archivo portait les titres ; elle est partie avec la refonte :
// le titre est desormais mis dans la police du TABLEAU a douze fois la taille de l'etiquette
// (design/DESIGN.md -> Typography). Un produit qui n'a qu'une mesure n'a qu'une voix, et
// c'est aussi 39 ko de moins sur le fil.
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
