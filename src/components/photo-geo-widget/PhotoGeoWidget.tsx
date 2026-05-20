import React from 'react';
import './photo-geo-widget.scss';

interface PhotoGeoWidgetProps {
  onClose: () => void;
}

export const PhotoGeoWidget: React.FC<PhotoGeoWidgetProps> = ({ onClose }) => {
  return (
    <div className="photo-geo-backdrop" onClick={onClose}>
      <div className="photo-geo-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="photo-geo-content">
          <div className="photo-geo-container">
            <iframe
              src="https://bl4ck-gs.vercel.app/"
              className="photo-geo-iframe"
              title="Photo Geo Location Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
