require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get('/generate-story-stream', async (req, res) => {
  const { prompt, numImages, numPages } = req.query;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // 1. Generate story
    const storyCompletion = await openai.chat.completions.create({
      model: "gpt-4o", // Use the best model
      messages: [
        { role: "system", content: `You are a children's story writer. Create a ${numPages}-page story, with each page having 2-3 sentences. Ensure you generate exactly ${numPages} pages. Clearly separate each page with '---PAGE BREAK---'.` },
        { role: "user", content: `Generate a children's story about: ${prompt}` },
      ],
      max_tokens: numPages * 150, // Increased max_tokens for more robust page generation
      stream: true, // Enable streaming
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullStoryContent = "";
    let currentPageText = "";
    let pageCount = 0;
    const storyPages = [];

    for await (const chunk of storyCompletion) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullStoryContent += content;
      currentPageText += content;

      // Send content as it arrives for live generation display
      res.write(`data: ${JSON.stringify({ type: 'text', content: content })}\n\n`);

      if (currentPageText.includes('---PAGE BREAK---')) {
        const parts = currentPageText.split('---PAGE BREAK---');
        for (let i = 0; i < parts.length - 1; i++) {
          const page = parts[i].trim();
          if (page.length > 0 && pageCount < numPages) {
            storyPages.push({ pageText: page, imageUrl: null });
            pageCount++;
            res.write(`data: ${JSON.stringify({ type: 'page_complete', pageNumber: pageCount, pageText: page })}\n\n`);
          }
        }
        currentPageText = parts[parts.length - 1];
      }
    }

    // Add the last page if it exists and hasn't been added
    if (currentPageText.trim().length > 0 && pageCount < numPages) {
      storyPages.push({ pageText: currentPageText.trim(), imageUrl: null });
      pageCount++;
      res.write(`data: ${JSON.stringify({ type: 'page_complete', pageNumber: pageCount, pageText: currentPageText.trim() })}\n\n`);
    }

    // Ensure exactly numPages are generated, padding or trimming as necessary
    while (storyPages.length < numPages) {
      storyPages.push({ pageText: "...", imageUrl: null });
    }
    storyPages.splice(numPages); // Trim if more pages than requested

    // Generate images for each page
    for (let i = 0; i < storyPages.length; i++) {
      if (i < numImages) {
        const imagePrompt = storyPages[i].pageText.split('.')[0] + '.'; // Take the first sentence as image prompt
        const imageResponse = await openai.images.generate({
          model: "dall-e-3", // Use DALL-E 3 for best images
          prompt: `Children's story illustration, no text, high quality: ${imagePrompt}`, // Explicitly request no text
          n: 1,
          size: "1024x1024", // Larger size for better quality
        });
        storyPages[i].imageUrl = imageResponse.data[0].url;
        res.write(`data: ${JSON.stringify({ type: 'image', pageNumber: i + 1, imageUrl: storyPages[i].imageUrl })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'story_complete', story: storyPages })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error generating story or images:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate story or images.' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate story or images.' })}\n\n`);
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
