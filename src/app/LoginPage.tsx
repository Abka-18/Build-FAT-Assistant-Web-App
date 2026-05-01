import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  theme: {
    app: string;
    surface: string;
    border: string;
    text: string;
    textMuted: string;
    primary: string;
    danger: string;
    input: string;
    surfaceMuted: string;
    shadow: string;
  };
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
}

type Mode = 'login' | 'signup' | 'forgot';

export default function LoginPage({ theme, themeMode, onToggleTheme }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const reset = (nextMode: Mode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Check your email to confirm your account!');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage('Password reset link sent! Check your email.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign Up' : 'Reset Password';
  const buttonLabel = loading ? 'Loading...' : title;

  return (
    <div className="size-full flex items-center justify-center relative" style={{ backgroundColor: theme.app }}>
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label="Toggle theme"
        className="absolute top-4 right-4 w-10 h-10 rounded-lg border flex items-center justify-center"
        style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
      >
        {themeMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div
        className="w-full max-w-sm mx-4 p-8 rounded-2xl"
        style={{ backgroundColor: theme.surface, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: theme.primary }}
          >
            FA
          </div>
          <h1 className="text-xl font-semibold" style={{ color: theme.text }}>
            FAT Assistant
          </h1>
          <p className="text-sm" style={{ color: theme.textMuted }}>
            Finance · Accounting · Tax
          </p>
        </div>

        <p className="text-center font-medium mb-4" style={{ color: theme.text }}>
          {title}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: theme.text }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="px-4 py-3 border rounded-lg text-sm outline-none"
              style={{ backgroundColor: theme.input, borderColor: theme.border, color: theme.text }}
            />
          </div>

          {/* Password — hidden in forgot mode */}
          {mode !== 'forgot' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium" style={{ color: theme.text }}>
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => reset('forgot')}
                    className="text-xs"
                    style={{ color: theme.primary }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="px-4 py-3 border rounded-lg text-sm outline-none"
                style={{ backgroundColor: theme.input, borderColor: theme.border, color: theme.text }}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-center" style={{ color: theme.danger }}>
              {error}
            </p>
          )}
          {message && (
            <p className="text-sm text-center" style={{ color: '#10B981' }}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-medium text-sm transition-opacity"
            style={{ backgroundColor: theme.primary, color: 'white', opacity: loading ? 0.7 : 1 }}
          >
            {buttonLabel}
          </button>
        </form>

        {/* Footer links */}
        <div className="flex flex-col items-center gap-2 mt-4">
          {mode === 'forgot' ? (
            <button onClick={() => reset('login')} className="text-sm" style={{ color: theme.primary }}>
              ← Back to Login
            </button>
          ) : (
            <p className="text-sm" style={{ color: theme.textMuted }}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => reset(mode === 'login' ? 'signup' : 'login')}
                className="font-medium"
                style={{ color: theme.primary }}
              >
                {mode === 'login' ? 'Sign Up' : 'Login'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
