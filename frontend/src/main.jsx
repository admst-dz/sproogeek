import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { YandexOAuthCallback } from './components/auth/YandexOAuthCallback.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {window.location.pathname === '/auth/yandex/callback' ? (
      <YandexOAuthCallback />
    ) : (
      <GoogleOAuthProvider clientId="676254181092-tuo565l0o1ucu5e5f3cnh9o3ehvk3f8c.apps.googleusercontent.com">
        <App />
      </GoogleOAuthProvider>
    )}
  </StrictMode>,
)
