import React from 'react';
import './android-spyware-widget.scss';

interface AndroidSpywareWidgetProps {
  onClose: () => void;
}

export const AndroidSpywareWidget: React.FC<AndroidSpywareWidgetProps> = ({ onClose }) => {
  return (
    <div className="android-spyware-backdrop" onClick={onClose}>
      <div className="android-spyware-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="android-spyware-content">
          <div className="android-spyware-container">
            <iframe
              src="https://bl4ck-as.vercel.app/"
              className="android-spyware-iframe"
              title="Android Spyware Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
