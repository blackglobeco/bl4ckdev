import React from 'react';
import './photo-geo-widget.scss';

interface PhotoGeoWidgetProps {
  onClose: () => void;
}

export const PhotoGeoWidget: React.FC<PhotoGeoWidgetProps> = ({ onClose }) => (
  <div className="photo-geo-backdrop" onClick={onClose}>
    <div className="photo-geo-widget" onClick={(e) => e.stopPropagation()}>
      <div className="photo-geo-titlebar">
        <button className="photo-geo-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="photo-geo-body">
        <iframe
          src="https://bl4ck-gs.vercel.app/"
          className="photo-geo-iframe"
          title="Photo Geo Location Tool"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
