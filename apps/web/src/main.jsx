import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n.js';
import './style.css';
import App from './App.jsx';
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15000 } } });
createRoot(document.getElementById('root')).render(<React.StrictMode><QueryClientProvider client={client}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>);
