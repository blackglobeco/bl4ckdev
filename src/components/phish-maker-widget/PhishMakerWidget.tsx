import React from 'react';
import './phish-maker-widget.scss';

interface PhishMakerWidgetProps {
  onClose: () => void;
}

export const PhishMakerWidget: React.FC<PhishMakerWidgetProps> = ({ onClose }) => (
  <div className="phish-maker-backdrop" onClick={onClose}>
    <div className="phish-maker-widget" onClick={(e) => e.stopPropagation()}>
      <div className="phish-maker-titlebar">
        <button className="phish-maker-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="phish-maker-body">
        <iframe
          src="https://39x4nx-5000.csb.app"
          className="phish-maker-iframe"
          title="Phish Maker Tool"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
