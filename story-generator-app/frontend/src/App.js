import React, { useState } from 'react';
import './App.css';

function App() { // Story Generator App Component
  const [prompt, setPrompt] = useState('');
  const [numImages, setNumImages] = useState(1); // Default to 1 image
  const [numPages, setNumPages] = useState(5); // Default to 5 pages
  const [story, setStory] = useState(null); // Final story with all pages and images
  const [liveStoryPages, setLiveStoryPages] = useState([]); // Story pages as they are generated
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(0); // For page navigation
  const [currentGeneratingPage, setCurrentGeneratingPage] = useState(0); // To track which page is currently being generated

  const generateStory = async () => {
    setLoading(true);
    setStory(null);
    setLiveStoryPages([]);
    setError('');
    setCurrentPage(0); // Reset to first page on new generation
    setCurrentGeneratingPage(0);

    try {
      const eventSource = new EventSource(`http://localhost:3001/generate-story-stream?prompt=${encodeURIComponent(prompt)}&numImages=${numImages}&numPages=${numPages}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'text') {
          setLiveStoryPages(prevPages => {
            const newPages = [...prevPages];
            if (newPages.length === 0 || newPages[newPages.length - 1].pageText.includes('---PAGE BREAK---')) {
              newPages.push({ pageText: data.content, imageUrl: null });
              setCurrentGeneratingPage(newPages.length - 1);
            } else {
              newPages[newPages.length - 1].pageText += data.content;
            }
            return newPages;
          });
        } else if (data.type === 'page_complete') {
          setLiveStoryPages(prevPages => {
            const newPages = [...prevPages];
            if (newPages[data.pageNumber - 1]) {
              newPages[data.pageNumber - 1].pageText = data.pageText;
            } else {
              newPages.push({ pageText: data.pageText, imageUrl: null });
            }
            return newPages;
          });
        } else if (data.type === 'image') {
          setLiveStoryPages(prevPages => {
            const newPages = [...prevPages];
            if (newPages[data.pageNumber - 1]) {
              newPages[data.pageNumber - 1].imageUrl = data.imageUrl;
            }
            return newPages;
          });
        } else if (data.type === 'story_complete') {
          setStory(data.story);
          setLoading(false);
          eventSource.close();
        } else if (data.type === 'error') {
          setError(data.message);
          setLoading(false);
          eventSource.close();
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        setError('Failed to connect to story generation stream.');
        setLoading(false);
        eventSource.close();
      };

    } catch (err) {
      setError(err.message);
      console.error('Error:', err);
      setLoading(false);
    }
  };


  return (
    <div className="App">
      <header className="App-header">
        <h1>Children's Story Generator</h1>
      </header>
      <main>
        <div className="input-section">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a story idea (e.g., 'a brave knight and a dragon')"
            disabled={loading}
          />
          <label>
            Number of Images:
            <select value={numImages} onChange={(e) => setNumImages(Number(e.target.value))} disabled={loading}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
            </select>
          </label>
          <label>
            Number of Pages:
            <input
              type="number"
              value={numPages}
              onChange={(e) => setNumPages(Math.max(1, Math.min(10, Number(e.target.value))))} // Limit pages between 1 and 10
              min="1"
              max="10"
              disabled={loading}
            />
          </label>
          <button onClick={generateStory} disabled={loading || !prompt}>
            {loading ? 'Generating...' : 'Generate Story'}
          </button>
        </div>

        {error && <p className="error-message">{error}</p>}

        {loading && (
          <div className="progress-bar-container">
            <div className="progress-bar"></div>
            <p>Generating your magical story... Page {currentGeneratingPage + 1}</p>
          </div>
        )}

        {(story || liveStoryPages.length > 0) && (
          <div className="story-container">
            <div className="story-page">
              <p>{(story ? story[currentPage]?.pageText : liveStoryPages[currentPage]?.pageText) || 'Generating...'}</p>
              {(story ? story[currentPage]?.imageUrl : liveStoryPages[currentPage]?.imageUrl) && (
                <img src={(story ? story[currentPage].imageUrl : liveStoryPages[currentPage].imageUrl)} alt={`Illustration for page ${currentPage + 1}`} />
              )}
            </div>
            <div className="navigation-buttons">
              <button onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} disabled={currentPage === 0}>
                Previous Page
              </button>
              <span>Page {currentPage + 1} of {(story || liveStoryPages).length}</span>
              <button onClick={() => setCurrentPage(prev => Math.min((story || liveStoryPages).length - 1, prev + 1))} disabled={currentPage === (story || liveStoryPages).length - 1}>
                Next Page
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
