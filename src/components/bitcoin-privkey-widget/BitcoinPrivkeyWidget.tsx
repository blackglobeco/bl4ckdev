
import React from 'react';
import './bitcoin-privkey-widget.scss';

interface BitcoinPrivkeyWidgetProps {
  onClose: () => void;
}

export const BitcoinPrivkeyWidget: React.FC<BitcoinPrivkeyWidgetProps> = ({ onClose }) => {
  return (
    <div className="bitcoin-privkey-backdrop" onClick={onClose}>
      <div className="bitcoin-privkey-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="bitcoin-privkey-content">
          <div className="bitcoin-privkey-container">
            <iframe
              src="https://btcprivkeydb.onrender.com/page/"
              className="bitcoin-privkey-iframe"
              title="Bitcoin Private Keys Database"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
