import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Feed from './pages/Feed.jsx';
import AnnotationPage from './pages/AnnotationPage.jsx';
import Profile from './pages/Profile.jsx';
import NewAnnotation from './pages/NewAnnotation.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Feed />} />
        <Route path="/a/:id" element={<AnnotationPage />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/new" element={<NewAnnotation />} />
      </Route>
    </Routes>
  );
}
