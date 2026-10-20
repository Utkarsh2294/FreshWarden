import React, { useState } from 'react';
import {
  ArrowRight,
  LockKeyhole,
  ShieldCheck,
  ScanLine,
  Thermometer,
  PackageCheck,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Brand } from '../components/Ui.jsx';
export default function Login({ onLogin }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: Object.fromEntries(data),
      });
      onLogin(result.token);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">
            A LITTLE MORE WATCHFUL. A LOT MORE SAFE.
          </span>
          <h1>
            Every shelf.
            <br />
            Every pack.
            <br />
            <em>Every safeguard.</em>
          </h1>
          <p>
            One workspace to catch the risks, close the loop, and keep unsafe
            food from moving forward.
          </p>
          <div className="gate-row">
            {[ScanLine, Thermometer, ShieldCheck, PackageCheck].map(
              (Icon, i) => (
                <span key={i}>
                  <Icon size={22} />
                  <small>
                    {['INWARD', 'COLD CHAIN', 'SHELF', 'DISPATCH'][i]}
                  </small>
                </span>
              ),
            )}
          </div>
        </div>
        <footer>
          FreshWarden <span>THE GUARDIAN ON EVERY SHELF</span>
        </footer>
      </section>
      <main className="login-main">
        <div className="login-form">
          <div className="tiny-mark">
            <LockKeyhole size={20} />
          </div>
          <span className="eyebrow">YOUR STORE. UNDER WATCH.</span>
          <h2>Welcome back.</h2>
          <p>Sign in to your operations workspace.</p>
          <form onSubmit={submit}>
            <label>
              Phone number
              <input
                name="phone"
                autoComplete="username"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                required
                placeholder="10-digit phone number"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
                placeholder="Enter your password"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Enter workspace'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-note">
            <ShieldCheck size={18} />
            <p>
              Prototype workspace. Use your seeded account.
              <br />
              Demo credentials are stored locally in{' '}
              <code>.local/demo-credentials.json</code>.
            </p>
          </div>
          <small className="muted">
            Safety decisions belong to verified evidence.
          </small>
        </div>
      </main>
    </div>
  );
}
