
import React from 'react';
import './url-masker-widget.scss';

interface URLMaskerWidgetProps {
  onClose: () => void;
}

export const URLMaskerWidget: React.FC<URLMaskerWidgetProps> = ({ onClose }) => {
  return (
    <div className="url-masker-backdrop" onClick={onClose}>
      <div className="url-masker-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="url-masker-content">
          <div className="url-masker-container">
            <iframe
              src="https://url-masker.vercel.app/"
              className="url-masker-iframe"
              title="URL Masker Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
