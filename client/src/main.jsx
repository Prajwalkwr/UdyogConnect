import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import store from './store';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './ErrorBoundary';
import './index.css';

const installGlobalErrorHandlers = () => {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    console.error('Global runtime error:', event.error ?? event.message, event.error?.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
  });
};

installGlobalErrorHandlers();

const rootElement = document.getElementById('root');

if (!rootElement) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#FDFBF7;color:#0B1A30;text-align:center;">
      <div>
        <h1 style="margin:0 0 8px;font-size:1.4rem;">UdyogConnect failed to start</h1>
        <p style="margin:0;color:#57657A;">The root mount element was missing. Please reload the page.</p>
      </div>
    </div>
  `;
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Provider store={store}>
        <BrowserRouter>
          <ErrorBoundary>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </Provider>
    </React.StrictMode>
  );
}
