import React, { useState, useEffect } from 'react';
import './lockscreen.scss';
import { VALID_PASSCODES } from '../../passcodes'; // Import passcodes from a TypeScript file

interface LockscreenProps {
  onUnlock: () => void;
}

export const Lockscreen: React.FC<LockscreenProps> = ({ onUnlock }) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  // Passcodes are now directly imported, no need to fetch or manage loading state for them
  const validPasscodes = VALID_PASSCODES;
  const [loading] = useState(false); // Keep loading state for initial UI if needed, though passcodes are available immediately
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random()}`);

  // Removed the useEffect hook that fetched passcodes from /Passcodes.txt

  useEffect(() => {
    // Cleanup session on page unload
    const handleBeforeUnload = () => {
      const activePasscode = sessionStorage.getItem('activePasscode');
      if (activePasscode) {
        releasePasscode(activePasscode);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Monitor localStorage for session conflicts
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'activeSessions') {
        const activePasscode = sessionStorage.getItem('activePasscode');
        if (activePasscode) {
          const sessions = getActiveSessions();
          const mySession = sessions[activePasscode];

          // Check if our session was invalidated
          if (!mySession || mySession !== sessionId) {
            alert('Your session has been terminated because this passcode is being used elsewhere.');
            window.location.reload();
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [sessionId]);

  // Get all active sessions from localStorage
  const getActiveSessions = (): Record<string, string> => {
    try {
      const sessions = localStorage.getItem('activeSessions');
      return sessions ? JSON.parse(sessions) : {};
    } catch {
      return {};
    }
  };

  // Set active sessions in localStorage
  const setActiveSessions = (sessions: Record<string, string>) => {
    localStorage.setItem('activeSessions', JSON.stringify(sessions));
  };

  // Check if a passcode is currently in use
  const isPasscodeInUse = (code: string): boolean => {
    const sessions = getActiveSessions();
    return code in sessions;
  };

  // Claim a passcode for this session
  const claimPasscode = (code: string): boolean => {
    const sessions = getActiveSessions();

    // Check if already in use by another session
    if (sessions[code] && sessions[code] !== sessionId) {
      return false;
    }

    // Claim the passcode
    sessions[code] = sessionId;
    setActiveSessions(sessions);
    sessionStorage.setItem('activePasscode', code);
    return true;
  };

  // Release a passcode when logging out or closing
  const releasePasscode = (code: string) => {
    const sessions = getActiveSessions();

    // Only release if this session owns it
    if (sessions[code] === sessionId) {
      delete sessions[code];
      setActiveSessions(sessions);
    }

    sessionStorage.removeItem('activePasscode');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validPasscodes.includes(passcode)) {
      setError('Invalid passcode. Access denied.');
      setPasscode('');
      return;
    }

    // Check if passcode is already in use
    if (isPasscodeInUse(passcode)) {
      setError('This passcode is currently in use. Please try again later.');
      setPasscode('');
      return;
    }

    // Try to claim the passcode
    if (!claimPasscode(passcode)) {
      setError('This passcode is currently in use. Please try again later.');
      setPasscode('');
      return;
    }

    // Successfully claimed, proceed with unlock
    onUnlock();
  };

  // Removed the loading state check as passcodes are available immediately
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
