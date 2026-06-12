import React from 'react';
import './black-eyes-widget.scss';

interface BlackEyesWidgetProps {
  onClose: () => void;
}

export const BlackEyesWidget: React.FC<BlackEyesWidgetProps> = ({ onClose }) => (
  <div className="black-eyes-backdrop" onClick={onClose}>
    <div className="black-eyes-widget" onClick={(e) => e.stopPropagation()}>
      <div className="black-eyes-titlebar">
        <button className="black-eyes-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="black-eyes-body">
        <iframe
          src="https://bl4ckeyes.onrender.com"
          className="black-eyes-iframe"
          title="Black Eyes IP Camera"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
