import React, { useState } from 'react';
import './lockscreen.scss';

interface LockscreenProps {
  onUnlock: () => void;
}

export const Lockscreen: React.FC<LockscreenProps> = ({ onUnlock }) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      if (res.ok) {
        onUnlock();
      } else {
        setError('Invalid passcode. Access denied.');
        setPasscode('');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lockscreen-overlay">
      <div className="lockscreen-container">
        <div className="lockscreen-content">
          <h1>BlackAI ⚛︎ GO</h1>
          <p>Enter passcode to access the system</p>

          <form onSubmit={handleSubmit} className="passcode-form">
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="passcode-input"
              autoFocus
              disabled={loading}
            />
            <button type="submit" className="unlock-button" disabled={loading}>
              {loading ? 'Verifying...' : 'Access'}
            </button>
          </form>

          {error && <div className="error-message">{error}</div>}

          <a
            href="https://t.me/evablackglobeonbot"
            target="_blank"
            rel="noopener noreferrer"
            className="subscribe-link"
          >
            Subscribe BlackAI GO
          </a>
        </div>
      </div>
    </div>
  );
};
