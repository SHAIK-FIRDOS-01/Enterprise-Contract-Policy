import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Terminal, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, error: contextError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!email.trim() || !password) {
      setLocalError('Email and password credentials are required.');
      return;
    }

    setIsSubmitting(true);
    const result = await login({ email: email.trim(), password });
    setIsSubmitting(false);

    if (result.success) {
      navigate('/contracts');
    } else {
      setLocalError(result.error || 'Authentication credentials rejected.');
    }
  };

  const displayError = localError || contextError;

  return (
    <div className="min-h-screen w-screen bg-zinc-950 flex flex-col justify-center items-center px-4 select-none">
      <div className="w-full max-w-sm">
        {/* Terminal Header */}
        <div className="flex items-center justify-between mb-3 text-xs font-mono text-zinc-500">
          <div className="flex items-center space-x-1.5">
            <Terminal className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-zinc-300 font-semibold tracking-wide">
              CO-PILOT // CONTRACT INTELLIGENCE
            </span>
          </div>
          <span>AUTH // V2</span>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-2xl space-y-5">
          <div className="space-y-1">
            <h1 className="text-sm font-mono font-semibold text-zinc-100 tracking-wider uppercase">
              OPERATOR AUTHENTICATION
            </h1>
            <p className="text-xs text-zinc-400 font-mono">
              Sign in with institutional credentials to access contract analysis workspaces.
            </p>
          </div>

          {displayError && (
            <div className="p-3 rounded bg-rose-950/40 border border-rose-800/60 flex items-start space-x-2 text-rose-300 text-xs font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label 
                htmlFor="operator-email"
                className="block text-xs font-mono text-zinc-400 uppercase tracking-wider"
              >
                OPERATOR EMAIL
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500 pointer-events-none" />
                <input
                  id="operator-email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@enterprise.internal"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 pl-9 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-700 transition-colors font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label 
                htmlFor="operator-password"
                className="block text-xs font-mono text-zinc-400 uppercase tracking-wider"
              >
                CREDENTIAL / PASSWORD
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500 pointer-events-none" />
                <input
                  id="operator-password"
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 pl-9 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-700 transition-colors font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-9 bg-zinc-100 text-zinc-900 font-mono font-medium text-xs rounded hover:bg-zinc-200 active:bg-zinc-300 transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow uppercase tracking-wider"
            >
              {isSubmitting ? (
                <span className="flex items-center space-x-1.5 font-mono">
                  <span className="w-3 h-3 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                  <span>AUTHENTICATING...</span>
                </span>
              ) : (
                <>
                  <span>AUTHENTICATE WORKSTATION</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-zinc-800/80 text-center text-xs text-zinc-500 font-mono">
            <span>Don't have an enterprise identity? </span>
            <Link
              to="/register"
              className="text-zinc-300 hover:text-zinc-100 underline underline-offset-2 transition-colors"
            >
              Register here
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-4 text-center text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
          PROTECTED UNDER SECURE HTTPONLY COOKIE ROTATION PROTOCOLS
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
