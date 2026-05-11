import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import AnnotationPage from './pages/AnnotationPage.jsx';
import Feed from './pages/Feed.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import NewAnnotation from './pages/NewAnnotation.jsx';
import Profile from './pages/Profile.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/feed" element={<Feed />} />
        <Route path="/a/:id" element={<AnnotationPage />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/new" element={<NewAnnotation />} />
        <Route path="*" element={<Feed />} />
      </Route>
    </Routes>
  );
}
