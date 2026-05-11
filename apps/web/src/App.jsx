import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import AnnotationPage from './pages/AnnotationPage.jsx';
import AdminClaims from './pages/AdminClaims.jsx';
import ExtensionAuth from './pages/ExtensionAuth.jsx';
import Feed from './pages/Feed.jsx';
import Landing from './pages/Landing.jsx';
import Login, { AuthCallback } from './pages/Login.jsx';
import NewAnnotation from './pages/NewAnnotation.jsx';
import Onboarding from './pages/Onboarding.jsx';
import OnboardingTutorial from './pages/OnboardingTutorial.jsx';
import Profile from './pages/Profile.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/extension-auth" element={<ExtensionAuth />} />
      <Route element={<Layout />}>
        <Route path="/feed" element={<Feed />} />
        <Route path="/a/:id" element={<AnnotationPage />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/new" element={<NewAnnotation />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/onboarding/tutorial" element={<OnboardingTutorial />} />
        <Route path="/admin/claims" element={<AdminClaims />} />
        <Route path="*" element={<Feed />} />
      </Route>
    </Routes>
  );
}
