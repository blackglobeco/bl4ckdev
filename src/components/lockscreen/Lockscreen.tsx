import React, { useState } from 'react';
import './lockscreen.scss';
import { VALID_PASSCODES } from '../../passcodes';

interface LockscreenProps {
  onUnlock: () => void;
}

export const Lockscreen: React.FC<LockscreenProps> = ({ onUnlock }) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!VALID_PASSCODES.includes(passcode)) {
      setError('Invalid passcode. Access denied.');
      setPasscode('');
      return;
    }

    onUnlock();
  };

  return (
    <div className="lockscreen-overlay">
      <div className="lockscreen-container">
        <div className="lockscreen-content">
          <h1>BlackAI ⚛ GO</h1>
          <p>Enter passcode to access the system</p>

          <form onSubmit={handleSubmit} className="passcode-form">
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="passcode-input"
              autoFocus
            />
            <button type="submit" className="unlock-button">
              Access
            </button>
          </form>

          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    </div>
  );
};
