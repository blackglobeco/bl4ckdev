
import React from 'react';
import './bitchat-tracker-widget.scss';

interface BitchatTrackerWidgetProps {
  onClose: () => void;
}

export const BitchatTrackerWidget: React.FC<BitchatTrackerWidgetProps> = ({ onClose }) => {
  return (
    <div className="bitchat-tracker-backdrop" onClick={onClose}>
      <div className="bitchat-tracker-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="bitchat-tracker-content">
          <div className="bitchat-tracker-container">
            <iframe
              src="https://b1tch4t-tracker.vercel.app/"
              className="bitchat-tracker-iframe"
              title="BitChat Tracker Tool"
              allow="bluetooth; camera; microphone; geolocation; usb; serial; hid"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
