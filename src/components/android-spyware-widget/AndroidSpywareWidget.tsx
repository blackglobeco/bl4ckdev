import React from 'react';
import './android-spyware-widget.scss';

interface AndroidSpywareWidgetProps {
  onClose: () => void;
}

export const AndroidSpywareWidget: React.FC<AndroidSpywareWidgetProps> = ({ onClose }) => (
  <div className="android-spyware-backdrop" onClick={onClose}>
    <div className="android-spyware-widget" onClick={(e) => e.stopPropagation()}>
      <div className="android-spyware-titlebar">
        <button className="android-spyware-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="android-spyware-body">
        <iframe
          src="https://black2637643-7799273.vercel.app/"
          className="android-spyware-iframe"
          title="Android Spyware"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
