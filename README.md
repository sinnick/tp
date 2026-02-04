# Thread Pocket 🧵

Save Twitter/X threads and articles for distraction-free reading.

## Features

- 📥 Save threads & articles from URL
- 📖 Clean reader interface (no ads, no clutter)
- 🌙 Light / Sepia / Dark themes
- 💾 Stored as Markdown files
- 🗑️ Delete threads you've finished

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Install bird CLI

```bash
npm install -g @steipete/bird
```

### 3. Configure Twitter credentials

Copy `.env.example` to `.env` and add your tokens:

```bash
cp .env.example .env
```

Get your tokens from Twitter:
1. Open x.com in browser (logged in)
2. F12 → Application → Cookies → x.com
3. Copy `auth_token` and `ct0` values

### 4. Run

```bash
npm start
```

Or use the CLI directly:

```bash
./save-thread.sh https://x.com/user/status/123456789
```

## Deployment (nginx)

Add to your nginx config:

```nginx
# API
location /tp/api/ {
    proxy_pass http://127.0.0.1:3004/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_read_timeout 60s;
}

# Static files
location /tp/ {
    alias /path/to/thread-pocket/;
    index index.html;
}
```

## Systemd service

```ini
[Unit]
Description=Thread Pocket API
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/thread-pocket
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## API

- `GET /threads` - List saved threads
- `POST /save` - Save a thread (`{"url": "..."}`)
- `DELETE /threads/:filename` - Delete a thread

## License

MIT
