import { useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import AnnotationPage from './pages/AnnotationPage.jsx';
import AdminClaims from './pages/AdminClaims.jsx';
import Download from './pages/Download.jsx';
import ExtensionAuth from './pages/ExtensionAuth.jsx';
import Feed from './pages/Feed.jsx';
import Landing from './pages/Landing.jsx';
import Login, { AuthCallback } from './pages/Login.jsx';
import NewAnnotation from './pages/NewAnnotation.jsx';
import Onboarding from './pages/Onboarding.jsx';
import OnboardingExtension from './pages/OnboardingExtension.jsx';
import OnboardingTutorial from './pages/OnboardingTutorial.jsx';
import Profile from './pages/Profile.jsx';
import { checkAuth } from './lib/api.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/extension-auth" element={<ExtensionAuth />} />
      <Route element={<Layout />}>
        <Route path="/feed" element={<Feed />} />
        <Route path="/download" element={<Download />} />
        <Route path="/a/:id" element={<AnnotationPage />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/new" element={<NewAnnotation />} />
        <Route element={<OnboardingGate />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/onboarding/extension" element={<OnboardingExtension />} />
          <Route path="/onboarding/tutorial" element={<OnboardingTutorial />} />
        </Route>
        <Route path="/admin/claims" element={<AdminClaims />} />
        <Route path="*" element={<Feed />} />
      </Route>
    </Routes>
  );
}

function OnboardingGate() {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, allowed: false, unauthorized: false });

  useEffect(() => {
    let cancelled = false;
    checkAuth().then((result) => {
      if (cancelled) return;
      setState({
        loading: false,
        allowed: !result.error && (!result.onboardingCompleted || location.pathname !== '/onboarding'),
        unauthorized: Boolean(result.error),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) {
    return (
      <div className="page">
        <div className="skeleton-item">
          <div className="skeleton-line short" />
          <div className="skeleton-line headline" />
        </div>
      </div>
    );
  }

  if (state.unauthorized) return <Navigate to="/login" replace />;
  if (!state.allowed) return <Navigate to="/feed" replace />;
  return <Outlet />;
}
