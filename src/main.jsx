import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { preloadVoices } from './utils/tts.js'

// Warm up the browser voice list early so TTS is ready by the time the user
// starts interacting (some browsers populate voices asynchronously)
preloadVoices();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
