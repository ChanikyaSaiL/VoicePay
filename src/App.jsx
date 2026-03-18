import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Enrollment from './pages/Enrollment';
import Setup from './pages/Setup';
import Auth from './pages/Auth';
import Analytics from './pages/Analytics';
import PaymentAuth from './pages/PaymentAuth';
import { useAuth } from './context/AuthContext';

function App() {
  const { user, isLoading } = useAuth();

  const isAuthenticated = !!user;
  // Use the server-provided boolean flag — the raw voiceEmbedding array is never
  // sent to the client (too large), so checking its length always returned false.
  const isEnrolled = !!(user?.hasVoiceEnrolled || user?.hasEnrolled);

  // Show nothing while session is being restored to avoid flash-redirect
  if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <Router>
      <Routes>
        <Route path="/auth" element={!isAuthenticated ? <Auth /> : <Navigate to={isEnrolled ? "/" : "/enroll"} />} />

        {/* Protected routes wrapped in Layout */}
        <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/auth" />}>
          <Route index element={isEnrolled ? <Home /> : <Navigate to="/enroll" />} />
          <Route path="enroll" element={!isEnrolled ? <Enrollment /> : <Navigate to="/" />} />
          <Route path="setup" element={isEnrolled ? <Setup /> : <Navigate to="/enroll" />} />
          <Route path="analytics" element={isEnrolled ? <Analytics /> : <Navigate to="/enroll" />} />
        </Route>

        <Route path="/payment-auth" element={isAuthenticated && isEnrolled ? <PaymentAuth /> : <Navigate to="/auth" />} />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to={isAuthenticated ? (isEnrolled ? "/" : "/enroll") : "/auth"} />} />
      </Routes>
    </Router>
  );
}

export default App;
