import React from 'react';
import './data-bank-widget.scss';

interface DataBankWidgetProps {
  onClose: () => void;
}

export const DataBankWidget: React.FC<DataBankWidgetProps> = ({ onClose }) => (
  <div className="data-bank-backdrop" onClick={onClose}>
    <div className="data-bank-widget" onClick={(e) => e.stopPropagation()}>
      <div className="data-bank-titlebar">
        <button className="data-bank-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="data-bank-body">
        <iframe
          src="https://bl4ckdb.onrender.com"
          className="data-bank-iframe"
          title="Data Bank"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
