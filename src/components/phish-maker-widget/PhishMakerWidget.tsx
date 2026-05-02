
import React from 'react';
import './phish-maker-widget.scss';

interface PhishMakerWidgetProps {
  onClose: () => void;
}

export const PhishMakerWidget: React.FC<PhishMakerWidgetProps> = ({ onClose }) => {
  return (
    <div className="phish-maker-backdrop" onClick={onClose}>
      <div className="phish-maker-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="phish-maker-content">
          <div className="phish-maker-container">
            <iframe
              src="https://cs245z-5000.csb.app"
              className="phish-maker-iframe"
              title="Phish Maker Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
