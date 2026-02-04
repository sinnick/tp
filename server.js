#!/usr/bin/env node
// Thread Pocket - Simple API server
// Allows saving threads from the web UI

const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3004;
const THREADS_DIR = path.join(__dirname, 'threads');

// Load env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // GET /threads - list saved threads
    if (req.method === 'GET' && req.url === '/threads') {
        try {
            const files = fs.readdirSync(THREADS_DIR)
                .filter(f => f.endsWith('.md'))
                .map(f => {
                    const content = fs.readFileSync(path.join(THREADS_DIR, f), 'utf-8');
                    const meta = parseFrontmatter(content);
                    return {
                        filename: f,
                        ...meta.meta,
                        content: meta.content
                    };
                })
                .sort((a, b) => (b.saved_at || '').localeCompare(a.saved_at || ''));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // POST /save - save a new thread
    if (req.method === 'POST' && req.url === '/save') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { url } = JSON.parse(body);
                if (!url) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'URL required' }));
                    return;
                }

                // Extract tweet ID
                const match = url.match(/(\d{15,})/);
                if (!match) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid Twitter URL' }));
                    return;
                }

                const tweetId = match[1];
                
                // Run bird to fetch - first try single read to detect article
                const env = {
                    ...process.env,
                    AUTH_TOKEN: process.env.AUTH_TOKEN,
                    CT0: process.env.CT0
                };

                const singleResult = execSync(`bird read ${tweetId} --json`, { 
                    env,
                    encoding: 'utf-8',
                    timeout: 30000
                });

                const singleTweet = JSON.parse(singleResult);
                if (!singleTweet) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Tweet not found' }));
                    return;
                }

                const isArticle = !!singleTweet.article;
                let tweets;
                
                if (isArticle) {
                    // For articles, just use the single tweet
                    tweets = [singleTweet];
                } else {
                    // For threads, fetch the full thread
                    const threadResult = execSync(`bird thread ${tweetId} --json`, { 
                        env,
                        encoding: 'utf-8',
                        timeout: 30000
                    });
                    tweets = JSON.parse(threadResult);
                    
                    // Filter to only author's tweets (exclude replies from others)
                    const authorId = tweets[0]?.authorId;
                    tweets = tweets.filter(t => t.authorId === authorId);
                }

                // Generate markdown
                const author = tweets[0].author?.username || 'unknown';
                const authorName = tweets[0].author?.name || 'Unknown';
                const createdAt = tweets[0].createdAt || '';
                const dateMatch = createdAt.match(/(\w{3}) (\d+) .* (\d{4})/);
                const dateStr = dateMatch ? `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}` : new Date().toISOString().split('T')[0];
                const articleTitle = singleTweet.article?.title;

                const filename = `${dateStr}_${author}_${tweetId}.md`;
                const filepath = path.join(THREADS_DIR, filename);

                let md = `---
author: "@${author}"
author_name: "${authorName}"
tweet_id: "${tweetId}"
url: "https://x.com/${author}/status/${tweetId}"
type: "${isArticle ? 'article' : 'thread'}"
${articleTitle ? `title: "${articleTitle.replace(/"/g, '\\"')}"` : ''}
saved_at: "${new Date().toISOString()}"
---

`;
                if (isArticle && articleTitle) {
                    md += `# ${articleTitle}\n\n`;
                    md += `*${authorName}* · [${dateStr}](https://x.com/${author}/status/${tweetId})\n\n---\n\n`;
                    md += `${tweets[0].text || ''}\n`;
                } else {
                    md += `# Thread by @${author}\n\n`;
                    md += `*${authorName}* · [${dateStr}](https://x.com/${author}/status/${tweetId})\n\n---\n\n`;
                    for (const tweet of tweets) {
                        md += `${tweet.text || ''}\n\n---\n\n`;
                    }
                }

                fs.writeFileSync(filepath, md);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    filename,
                    author,
                    authorName,
                    tweetCount: tweets.length
                }));

            } catch (err) {
                console.error('Error saving thread:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // DELETE /threads/:filename - delete a thread
    if (req.method === 'DELETE' && req.url.startsWith('/threads/')) {
        const filename = decodeURIComponent(req.url.replace('/threads/', ''));
        const filepath = path.join(THREADS_DIR, filename);
        
        if (!filename.endsWith('.md') || filename.includes('..')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid filename' }));
            return;
        }

        try {
            fs.unlinkSync(filepath);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (err) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
        }
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { meta: {}, content };
    
    const meta = {};
    match[1].split('\n').forEach(line => {
        const [key, ...rest] = line.split(':');
        if (key && rest.length) {
            meta[key.trim()] = rest.join(':').trim().replace(/^"|"$/g, '');
        }
    });
    
    return { meta, content: match[2] };
}

server.listen(PORT, () => {
    console.log(`🧵 Thread Pocket API running on port ${PORT}`);
});
