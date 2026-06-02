
import React from 'react';
import './black-eyes-widget.scss';

interface BlackEyesWidgetProps {
  onClose: () => void;
}

export const BlackEyesWidget: React.FC<BlackEyesWidgetProps> = ({ onClose }) => {
  return (
    <div className="black-eyes-backdrop" onClick={onClose}>
      <div className="black-eyes-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="black-eyes-content">
          <div className="black-eyes-container">
            <iframe
              src="https://bl4ckeye.onrender.com"
              className="black-eyes-iframe"
              title="Black Eyes IP Camera Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
