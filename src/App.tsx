import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router'
import CelebrationPage from './pages/CelebrationPage'
import OrganizePage from './pages/OrganizePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/organize" replace />} />
        <Route path="/organize" element={<OrganizePage />} />
        <Route path="/birthday/:id" element={<CelebrationPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

function NotFound() {
  return (
    <main className="theatre-bg grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="font-display text-5xl text-gold">404</p>
        <p className="mt-3 text-cream/80">This stage is empty.</p>
        <Link to="/organize" className="btn-gold mt-6 inline-block">
          Create a birthday show
        </Link>
      </div>
    </main>
  )
}
