import React from 'react';
import './url-masker-widget.scss';

interface URLMaskerWidgetProps {
  onClose: () => void;
}

export const URLMaskerWidget: React.FC<URLMaskerWidgetProps> = ({ onClose }) => (
  <div className="url-masker-backdrop" onClick={onClose}>
    <div className="url-masker-widget" onClick={(e) => e.stopPropagation()}>
      <div className="url-masker-titlebar">
        <button className="url-masker-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="url-masker-body">
        <iframe
          src="https://url-masker.vercel.app/"
          className="url-masker-iframe"
          title="URL Masker Tool"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
