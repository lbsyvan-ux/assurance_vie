import { useAuth } from '../hooks/useAuth';
import { LogOut, Building2, PieChart, Settings } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useState } from 'react';
import { SettingsModal } from './SettingsModal';

export const Layout = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#ffffff]">
      <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-zinc-50">
        <div className="container mx-auto flex h-20 items-center justify-between px-8">
          <div className="flex items-center gap-12">
            <Link to="/" className="flex items-center space-x-3 group">
              <img
                src="/wealthflow-logo.svg"
                alt="WealthFlow"
                className="h-10 w-10 object-contain group-hover:rotate-3 transition-transform"
              />
              <span className="inline-block font-extrabold text-2xl tracking-tight">Patrimoine Analyse</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link 
                to="/" 
                className={clsx(
                  "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                  location.pathname === '/' || location.pathname.startsWith('/contract') 
                    ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200" 
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                )}
              >
                <PieChart className="h-4 w-4" />
                Assurance Vie
              </Link>
              <Link 
                to="/scpi" 
                className={clsx(
                  "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                  location.pathname === '/scpi'
                    ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200" 
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                )}
              >
                <Building2 className="h-4 w-4" />
                Simulateur SCPI
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50 rounded-full transition-all"
              title="Paramètres API"
            >
              <Settings className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest text-[9px]">Connecté en tant que</span>
              <span className="text-sm font-semibold">{user?.email}</span>
            </div>
            <div className="h-8 w-[1px] bg-zinc-100"></div>
            <button
              onClick={() => signOut()}
              className="p-2.5 text-zinc-400 hover:text-error hover:bg-error/5 rounded-full transition-all"
              title="Déconnexion"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-8 py-10">
        <Outlet />
      </main>

      <footer className="container mx-auto px-8 pb-10 pt-4">
        <div className="flex items-center justify-center gap-2 text-zinc-300">
          <img src="/wealthflow-logo.svg" alt="" className="h-4 w-4 object-contain opacity-50" />
          <span className="text-[11px] font-medium tracking-wide">par WealthFlow</span>
        </div>
      </footer>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};
