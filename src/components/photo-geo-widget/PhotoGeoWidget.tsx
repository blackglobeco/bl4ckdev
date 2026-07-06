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
          src="https://black74686-436-56228466.vercel.app/"
          className="photo-geo-iframe"
          title="Photo Geo Location"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
