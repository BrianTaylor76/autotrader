import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="*" element={<div style={{color:'white',padding:'40px',background:'#111',minHeight:'100vh'}}>
          <h1>App is rendering ✓</h1>
          <p>If you see this, React is working fine.</p>
        </div>} />
      </Routes>
    </Router>
  );
}

export default App;