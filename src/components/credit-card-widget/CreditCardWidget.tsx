import React from 'react';
import './credit-card-widget.scss';

interface CreditCardWidgetProps {
  onClose: () => void;
}

const CC_URL = 'https://itaishek.github.io/CC_Generator/';

export const CreditCardWidget: React.FC<CreditCardWidgetProps> = ({ onClose }) => {
  const openInNewTab = () => window.open(CC_URL, '_blank', 'noopener,noreferrer');

  return (
    <div className="credit-card-backdrop" onClick={onClose}>
      <div className="credit-card-widget" onClick={(e) => e.stopPropagation()}>
        <div className="credit-card-titlebar">
          <button className="credit-card-close-btn" onClick={onClose} aria-label="Close" />
        </div>
        <div className="credit-card-body">
          <iframe
            src={CC_URL}
            className="credit-card-iframe"
            title="Credit Card Generator Tool"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
};
