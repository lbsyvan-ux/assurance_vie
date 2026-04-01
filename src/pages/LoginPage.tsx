import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Mail } from 'lucide-react';

type AuthView = 'login' | 'forgot-password';

export const LoginPage = () => {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success('Connexion réussie');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Lien de réinitialisation envoyé par email !');
      setView('login');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-50 p-6">
      <div className="w-full max-w-md p-10 bg-white border border-zinc-100 rounded-[2.5rem] shadow-xl shadow-zinc-200/50">
        
        {view === 'login' && (
          <>
            <div className="flex flex-col space-y-3 text-center mb-10">
              <h1 className="text-3xl font-black tracking-tight text-zinc-900">Patrimoine Analyse</h1>
              <p className="text-zinc-400 font-medium">Accédez à votre espace sécurisé</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@simulation.fr"
                  required
                  className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none transition-all font-medium focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Mot de passe</label>
                  <button 
                    type="button"
                    onClick={() => setView('forgot-password')}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Oublié ?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none transition-all focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-lg"
              >
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Se connecter'}
              </button>
            </form>
          </>
        )}

        {view === 'forgot-password' && (
          <div className="space-y-8">
            <button onClick={() => setView('login')} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-900 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-bold">Retour</span>
            </button>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-zinc-900">Mot de passe oublié</h2>
              <p className="text-zinc-400 text-sm font-medium">Nous allons vous envoyer un lien de réinitialisation sécurisé.</p>
            </div>

            <form onSubmit={handleResetRequest} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Votre Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none transition-all font-medium focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center py-4 bg-primary text-white rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg flex items-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <Mail className="h-5 w-5" />}
                Envoyer le lien
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
