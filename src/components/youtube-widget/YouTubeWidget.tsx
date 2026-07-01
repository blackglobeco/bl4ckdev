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
  description: string;
}

const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || 'demo-key';

const fetchYouTubeVideos = async (query: string): Promise<YouTubeVideo[]> => {
  if (YOUTUBE_API_KEY === 'demo-key') {
    return [
      {
        id: 'dQw4w9WgXcQ',
        title: `${query} — Top Result`,
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        channel: 'Demo Channel',
        description: `Demo result for "${query}".`,
      },
      {
        id: 'oHg5SJYRHA0',
        title: `${query} — Second Result`,
        thumbnail: 'https://img.youtube.com/vi/oHg5SJYRHA0/maxresdefault.jpg',
        channel: 'Another Channel',
        description: `Another demo result for "${query}".`,
      },
    ];
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`
  );
  if (!res.ok) throw new Error('YouTube fetch failed');
  const data = await res.json();
  return data.items.map((item: any) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.high?.url ?? item.snippet.thumbnails.default.url,
    channel: item.snippet.channelTitle,
    description: item.snippet.description,
  }));
};

export const YouTubeWidget: React.FC<YouTubeWidgetProps> = ({ searchQuery, onClose }) => {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [selected, setSelected] = useState<YouTubeVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchYouTubeVideos(searchQuery)
      .then((data) => {
        setVideos(data);
        setSelected(data[0] ?? null);
      })
      .catch(() => setError('Failed to load videos.'))
      .finally(() => setLoading(false));
  }, [searchQuery]);

  return (
    <div className="youtube-backdrop" onClick={onClose}>
      <div
        className={`youtube-widget${loading ? ' loading' : ''}${error ? ' error' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="youtube-titlebar">
          <span className="youtube-title-text">YouTube · {searchQuery}</span>
          <button className="youtube-close-btn" onClick={onClose} aria-label="Close" />
        </div>

        {loading && <p className="yt-status">Searching…</p>}
        {error   && <p className="yt-status yt-error">{error}</p>}

        {!loading && !error && (
          <div className="youtube-body">
            <div className="youtube-player">
              {selected && (
                <>
                  <iframe
                    height="315"
                    src={`https://www.youtube.com/embed/${selected.id}`}
                    title={selected.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                  <div className="youtube-video-info">
                    <h3>{selected.title}</h3>
                    <p className="yt-channel">{selected.channel}</p>
                    <p className="yt-desc">{selected.description}</p>
                  </div>
                </>
              )}
            </div>

            <div className="youtube-sidebar">
              <h4>Related</h4>
              {videos.map((v) => (
                <div
                  key={v.id}
                  className={`yt-video-item${selected?.id === v.id ? ' active' : ''}`}
                  onClick={() => setSelected(v)}
                >
                  <img src={v.thumbnail} alt={v.title} />
                  <div className="yt-item-info">
                    <h5>{v.title}</h5>
                    <p>{v.channel}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
