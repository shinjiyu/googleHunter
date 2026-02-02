import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import KeywordDetail from './pages/KeywordDetail';
import Keywords from './pages/Keywords';
import Opportunities from './pages/Opportunities';
import Trends from './pages/Trends';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="keywords" element={<Keywords />} />
          <Route path="keywords/:id" element={<KeywordDetail />} />
          <Route path="opportunities" element={<Opportunities />} />
          <Route path="trends" element={<Trends />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
