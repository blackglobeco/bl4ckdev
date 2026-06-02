
import React from 'react';
import './data-bank-widget.scss';

interface DataBankWidgetProps {
  onClose: () => void;
}

export const DataBankWidget: React.FC<DataBankWidgetProps> = ({ onClose }) => {
  return (
    <div className="data-bank-backdrop" onClick={onClose}>
      <div className="data-bank-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="data-bank-content">
          <div className="data-bank-container">
            <iframe
              src="https://bl4ckdb.onrender.com"
              className="data-bank-iframe"
              title="Data Bank Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
