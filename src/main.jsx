import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

window.onerror = (msg, src, line, col, err) => {
  document.body.innerHTML = `<pre style="color:red;padding:32px;background:#0d1117;min-height:100vh;white-space:pre-wrap;font-family:monospace">${msg}\n\n${err?.stack || ''}</pre>`;
};
window.onunhandledrejection = (e) => {
  document.body.innerHTML = `<pre style="color:red;padding:32px;background:#0d1117;min-height:100vh;white-space:pre-wrap;font-family:monospace">Unhandled Promise Rejection:\n${e.reason?.message || e.reason}\n\n${e.reason?.stack || ''}</pre>`;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)