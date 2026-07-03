import React from 'react';
import './url-spyware-widget.scss';

interface URLSpywareWidgetProps {
  onClose: () => void;
}

export const URLSpywareWidget: React.FC<URLSpywareWidgetProps> = ({ onClose }) => (
  <div className="url-spyware-backdrop" onClick={onClose}>
    <div className="url-spyware-widget" onClick={(e) => e.stopPropagation()}>
      <div className="url-spyware-titlebar">
        <button className="url-spyware-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="url-spyware-body">
        <iframe
          src="https://redirect-url.up.railway.app/victims"
          className="url-spyware-iframe"
          title="URL Spyware Tool"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
