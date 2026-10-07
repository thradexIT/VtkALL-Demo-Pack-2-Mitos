import React, { lazy, Suspense, useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider, Outlet, useLocation, useRouteError } from 'react-router-dom'
import env from '@/config/env.config'
import { NotificationProvider } from '@/context/NotificationContext'
import { UserProvider } from '@/context/UserContext'
import { RecaptchaProvider } from '@/context/RecaptchaContext'
import { PayPalProvider } from '@/context/PayPalContext'
import { SettingProvider } from '@/context/SettingContext'
import { init as initGA } from '@/utils/ga4'
import ScrollToTop from '@/components/ScrollToTop'
import NProgressIndicator from '@/components/NProgressIndicator'
import '@/assets/css/mitos-rental-flow.css'

if (env.GOOGLE_ANALYTICS_ENABLED) {
  initGA()
}

const isChunkLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(message)
}

const lazyWithDeployRecovery = <T extends React.ComponentType<any>>(
  key: string,
  importer: () => Promise<{ default: T }>,
) => lazy(async () => {
  try {
    const module = await importer()
    sessionStorage.removeItem(`mitos:chunk-reload:${key}`)
    return module
  } catch (error) {
    if (isChunkLoadError(error)) {
      const storageKey = `mitos:chunk-reload:${key}`
      const lastReload = Number(sessionStorage.getItem(storageKey) || 0)

      // One automatic refresh per module per minute is enough to move a stale
      // tab onto the latest deployment without creating a reload loop.
      if (!lastReload || Date.now() - lastReload > 60_000) {
        sessionStorage.setItem(storageKey, String(Date.now()))
        window.location.reload()
        return new Promise<never>(() => {})
      }
    }
    throw error
  }
})

const Header = lazyWithDeployRecovery('header', () => import('@/components/MitosHeader'))
const SignIn = lazyWithDeployRecovery('sign-in', () => import('@/pages/SignIn'))
const SignUp = lazyWithDeployRecovery('sign-up', () => import('@/pages/SignUp'))
const Activate = lazyWithDeployRecovery('activate', () => import('@/pages/Activate'))
const ForgotPassword = lazyWithDeployRecovery('forgot-password', () => import('@/pages/ForgotPassword'))
const ResetPassword = lazyWithDeployRecovery('reset-password', () => import('@/pages/ResetPassword'))
const Home = lazyWithDeployRecovery('home', () => import('@/pages/MitosHome'))
const Search = lazyWithDeployRecovery('search', () => import('@/pages/Search'))
const Checkout = lazyWithDeployRecovery('checkout', () => import('@/pages/Checkout'))
const CheckoutSession = lazyWithDeployRecovery('checkout-session', () => import('@/pages/CheckoutSession'))
const Bookings = lazyWithDeployRecovery('bookings', () => import('@/pages/Bookings'))
const Booking = lazyWithDeployRecovery('booking', () => import('@/pages/Booking'))
const Settings = lazyWithDeployRecovery('settings', () => import('@/pages/Settings'))
const Notifications = lazyWithDeployRecovery('notifications', () => import('@/pages/Notifications'))
const ToS = lazyWithDeployRecovery('tos', () => import('@/pages/ToS'))
const Privacy = lazyWithDeployRecovery('privacy', () => import('@/pages/Privacy'))
const About = lazyWithDeployRecovery('about', () => import('@/pages/About'))
const ChangePassword = lazyWithDeployRecovery('change-password', () => import('@/pages/ChangePassword'))
const Contact = lazyWithDeployRecovery('contact', () => import('@/pages/Contact'))
const NoMatch = lazyWithDeployRecovery('no-match', () => import('@/pages/NoMatch'))
const Locations = lazyWithDeployRecovery('locations', () => import('@/pages/Locations'))
const Suppliers = lazyWithDeployRecovery('suppliers', () => import('@/pages/Suppliers'))
const Faq = lazyWithDeployRecovery('faq', () => import('@/pages/Faq'))
const CookiePolicy = lazyWithDeployRecovery('cookie-policy', () => import('@/pages/CookiePolicy'))

const RouteError = () => {
  const error = useRouteError()
  const staleChunk = isChunkLoadError(error)

  return (
    <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1>{staleChunk ? 'Mitos se actualizó' : 'No pudimos cargar esta pantalla'}</h1>
        <p>
          {staleChunk
            ? 'Hay una nueva versión disponible. Actualiza para continuar.'
            : 'Intenta actualizar la página. Si el problema continúa, vuelve al inicio.'}
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Actualizar
        </button>
      </div>
    </div>
  )
}

const AppLayout = () => {
  const location = useLocation()
  const [refreshKey, setRefreshKey] = useState(0) // refreshKey to check user and notifications when navigating between routes
  const routeClass = location.pathname === '/' ? 'mitos-route-home' : 'mitos-route-rental'

  useEffect(() => {
    setRefreshKey((prev) => prev + 1)
  }, [location.pathname])

  return (
    <SettingProvider>
      <UserProvider refreshKey={refreshKey}>
        <NotificationProvider refreshKey={refreshKey}>
          <RecaptchaProvider>
            <PayPalProvider>
              <ScrollToTop />
              <div className={`app mitos-public-app ${routeClass}`}>
                <Suspense fallback={<NProgressIndicator />}>
                  <Header />
                  <Outlet />
                </Suspense>
              </div>
            </PayPalProvider>
          </RecaptchaProvider>
        </NotificationProvider>
      </UserProvider>
    </SettingProvider>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: 'sign-in', element: <SignIn /> },
      { path: 'sign-up', element: <SignUp /> },
      { path: 'activate', element: <Activate /> },
      { path: 'forgot-password', element: <ForgotPassword /> },
      { path: 'reset-password', element: <ResetPassword /> },
      { path: 'search', element: <Search /> },
      { path: 'checkout', element: <Checkout /> },
      { path: 'checkout-session/:sessionId', element: <CheckoutSession /> },
      { path: 'bookings', element: <Bookings /> },
      { path: 'booking', element: <Booking /> },
      { path: 'settings', element: <Settings /> },
      { path: 'notifications', element: <Notifications /> },
      { path: 'change-password', element: <ChangePassword /> },
      { path: 'about', element: <About /> },
      { path: 'tos', element: <ToS /> },
      { path: 'privacy', element: <Privacy /> },
      { path: 'contact', element: <Contact /> },
      { path: 'locations', element: <Locations /> },
      { path: 'faq', element: <Faq /> },
      { path: 'cookie-policy', element: <CookiePolicy /> },
      ...(env.HIDE_SUPPLIERS ? [] : [{ path: 'suppliers', element: <Suppliers /> }]),
      { path: '*', element: <NoMatch /> }
    ]
  }
])

const App = () => <RouterProvider router={router} />

export default App
