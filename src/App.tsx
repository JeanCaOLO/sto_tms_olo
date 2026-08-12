import { BrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { Suspense } from 'react';
import { AppRoutes } from './router';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { SidebarProvider, useSidebar } from './hooks/useSidebar';
import Sidebar from './components/feature/Sidebar';
import Header from './components/feature/Header';

function AppLayout() {
  const { session, loading } = useAuth();
  const { collapsed } = useSidebar();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 flex items-center justify-center bg-teal-600 rounded-xl shadow-lg">
            <i className="ri-truck-line text-2xl text-white"></i>
          </div>
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <i className="ri-loader-4-line animate-spin text-teal-600 text-lg"></i>
            <span>Cargando sistema...</span>
          </div>
        </div>
      </div>
    );
  }

  const isLoginPage = location.pathname === '/login';

  if (!session && !isLoginPage) {
    return <Navigate to="/login" replace />;
  }

  if (session && isLoginPage) {
    return <Navigate to="/" replace />;
  }

  if (!session) {
    return (
      <Suspense fallback={null}>
        <AppRoutes />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <Header />
      <main className={`${collapsed ? 'lg:ml-20' : 'lg:ml-64'} mt-16 p-4 lg:p-6 min-w-0 transition-all duration-300`}>
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
          </div>
        }>
          <AppRoutes />
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={__BASE_PATH__}>
      <AuthProvider>
        <SidebarProvider>
          <AppLayout />
        </SidebarProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
