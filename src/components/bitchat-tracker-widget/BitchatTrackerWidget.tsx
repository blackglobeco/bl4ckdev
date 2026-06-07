import React from 'react';
import './bitchat-tracker-widget.scss';

interface BitchatTrackerWidgetProps {
  onClose: () => void;
}

export const BitchatTrackerWidget: React.FC<BitchatTrackerWidgetProps> = ({ onClose }) => (
  <div className="bitchat-tracker-backdrop" onClick={onClose}>
    <div className="bitchat-tracker-widget" onClick={(e) => e.stopPropagation()}>
      <div className="bitchat-tracker-titlebar">
        <button className="bitchat-tracker-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="bitchat-tracker-body">
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
);
