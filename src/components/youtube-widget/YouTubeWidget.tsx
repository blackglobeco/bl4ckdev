
import React, { useState, useEffect } from 'react';
import './youtube-widget.scss';

interface YouTubeWidgetProps {
  searchQuery: string;
  onClose: () => void;
}

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  publishedAt: string;
  description: string;
}

const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || 'demo-key';

const fetchYouTubeVideos = async (query: string): Promise<YouTubeVideo[]> => {
  try {
    if (YOUTUBE_API_KEY === 'demo-key') {
      // Return mock data for demo purposes
      return [
        {
          id: 'dQw4w9WgXcQ',
          title: `${query} - First Result`,
          thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
          channel: 'Demo Channel',
          publishedAt: new Date().toISOString(),
          description: `This is a demo video result for "${query}". In a real implementation, this would show actual YouTube search results.`
        },
        {
          id: 'oHg5SJYRHA0',
          title: `${query} - Second Result`,
          thumbnail: 'https://img.youtube.com/vi/oHg5SJYRHA0/maxresdefault.jpg',
          channel: 'Another Channel',
          publishedAt: new Date().toISOString(),
          description: `Another demo video result for "${query}".`
        }
      ];
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch YouTube videos');
    }

    const data = await response.json();
    
    return data.items.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      description: item.snippet.description
    }));
  } catch (error) {
    console.error('Error fetching YouTube videos:', error);
    throw error;
  }
};

export const YouTubeWidget: React.FC<YouTubeWidgetProps> = ({ searchQuery, onClose }) => {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);

  useEffect(() => {
    const loadVideos = async () => {
      if (!searchQuery) return;

      setLoading(true);
      setError(null);

      try {
        const videoData = await fetchYouTubeVideos(searchQuery);
        setVideos(videoData);
        // Auto-select the first video
        if (videoData.length > 0) {
          setSelectedVideo(videoData[0]);
        }
      } catch (err) {
        console.error('Failed to fetch YouTube videos:', err);
        setError('Failed to load YouTube videos. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadVideos();
  }, [searchQuery]);

  if (loading) {
    return (
      <div className="youtube-backdrop" onClick={onClose}>
        <div className="youtube-widget loading" onClick={(e) => e.stopPropagation()}>
          <div className="youtube-header">
            <h2>YouTube</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          <div className="loading-spinner">
            Searching YouTube for "{searchQuery}"...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="youtube-backdrop" onClick={onClose}>
        <div className="youtube-widget error" onClick={(e) => e.stopPropagation()}>
          <div className="youtube-header">
            <h2>YouTube</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          <div className="error-message">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="youtube-backdrop" onClick={onClose}>
      <div className="youtube-widget" onClick={(e) => e.stopPropagation()}>
        <div className="youtube-header">
          <div className="youtube-title">
            <h2>YouTube</h2>
            <div className="search-query">
              Results for: "{searchQuery}"
            </div>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="youtube-content">
          {selectedVideo && (
            <div className="video-player">
              <iframe
                width="100%"
                height="315"
                src={`https://www.youtube.com/embed/${selectedVideo.id}`}
                title={selectedVideo.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
              <div className="video-info">
                <h3>{selectedVideo.title}</h3>
                <p className="channel">by {selectedVideo.channel}</p>
                <p className="description">{selectedVideo.description}</p>
              </div>
            </div>
          )}

          <div className="video-list">
            <h4>Related Videos</h4>
            {videos.map((video) => (
              <div
                key={video.id}
                className={`video-item ${selectedVideo?.id === video.id ? 'active' : ''}`}
                onClick={() => setSelectedVideo(video)}
              >
                <img src={video.thumbnail} alt={video.title} className="video-thumbnail" />
                <div className="video-details">
                  <h5>{video.title}</h5>
                  <p>{video.channel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
