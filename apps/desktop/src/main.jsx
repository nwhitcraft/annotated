import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import CaptureController from './components/CaptureController.jsx';
import QuickClipWindow from './components/QuickClipWindow.jsx';
import './styles/global.css';

const params = new URLSearchParams(window.location.search);
const windowKind = params.get('window');
const RootComponent = windowKind === 'capture'
  ? CaptureController
  : windowKind === 'quick'
    ? QuickClipWindow
    : App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
