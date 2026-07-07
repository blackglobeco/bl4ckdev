import React from 'react';
import './bitcoin-privkey-widget.scss';

interface BitcoinPrivkeyWidgetProps {
  onClose: () => void;
}

export const BitcoinPrivkeyWidget: React.FC<BitcoinPrivkeyWidgetProps> = ({ onClose }) => (
  <div className="bitcoin-privkey-backdrop" onClick={onClose}>
    <div className="bitcoin-privkey-widget" onClick={(e) => e.stopPropagation()}>
      <div className="bitcoin-privkey-titlebar">
        <button className="bitcoin-privkey-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="bitcoin-privkey-body">
        <iframe
          src="https://btcprivkeydb.onrender.com/page/"
          className="bitcoin-privkey-iframe"
          title="Bitcoin Private Keys Database"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
