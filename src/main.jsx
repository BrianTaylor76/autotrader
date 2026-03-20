import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// Test if root element exists
const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<h1 style="color:red">ERROR: no #root element</h1>'
} else {
  try {
    // Lazy import App to catch any import errors
    import('./App').then(({ default: App }) => {
      ReactDOM.createRoot(rootEl).render(<App />)
    }).catch(err => {
      rootEl.innerHTML = `<pre style="color:red;padding:20px;white-space:pre-wrap">IMPORT ERROR:\n${err?.message}\n\n${err?.stack}</pre>`
    })
  } catch(err) {
    rootEl.innerHTML = `<pre style="color:red;padding:20px;white-space:pre-wrap">RENDER ERROR:\n${err?.message}\n\n${err?.stack}</pre>`
  }
}