import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import CaptureController from './components/CaptureController.jsx';
import './styles/global.css';

const params = new URLSearchParams(window.location.search);
const RootComponent = params.get('window') === 'capture' ? CaptureController : App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
