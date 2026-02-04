#!/bin/bash
# Thread Pocket - Save Twitter threads as clean markdown
# Usage: ./save-thread.sh <twitter-url>

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
THREADS_DIR="$SCRIPT_DIR/threads"

# Load credentials from .env if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi
mkdir -p "$THREADS_DIR"

if [ -z "$1" ]; then
    echo "Usage: $0 <twitter-url-or-id>"
    exit 1
fi

URL="$1"

# Extract tweet ID from URL
TWEET_ID=$(echo "$URL" | grep -oE '[0-9]{15,}' | head -1)

if [ -z "$TWEET_ID" ]; then
    echo "❌ Could not extract tweet ID from: $URL"
    exit 1
fi

echo "🧵 Fetching thread $TWEET_ID..."

# Get thread content
THREAD_JSON=$(bird thread "$TWEET_ID" --json 2>/dev/null)

if [ -z "$THREAD_JSON" ]; then
    echo "❌ Failed to fetch thread"
    exit 1
fi

# Extract metadata
AUTHOR=$(echo "$THREAD_JSON" | jq -r '.[0].author.username // "unknown"')
AUTHOR_NAME=$(echo "$THREAD_JSON" | jq -r '.[0].author.name // "Unknown"')
DATE=$(echo "$THREAD_JSON" | jq -r '.[0].createdAt // empty' | sed 's/.*\([A-Z][a-z][a-z]\) \([0-9]*\) .* \([0-9]\{4\}\)/\3-\1-\2/' | head -1)
FIRST_TEXT=$(echo "$THREAD_JSON" | jq -r '.[0].text // ""' | head -c 50)

# Create filename
FILENAME="${DATE:-$(date +%Y-%m-%d)}_${AUTHOR}_${TWEET_ID}.md"
FILEPATH="$THREADS_DIR/$FILENAME"

# Generate markdown
{
    echo "---"
    echo "author: \"@$AUTHOR\""
    echo "author_name: \"$AUTHOR_NAME\""
    echo "tweet_id: \"$TWEET_ID\""
    echo "url: \"https://x.com/$AUTHOR/status/$TWEET_ID\""
    echo "saved_at: \"$(date -Iseconds)\""
    echo "---"
    echo ""
    echo "# Thread by @$AUTHOR"
    echo ""
    echo "*$AUTHOR_NAME* · [$DATE](https://x.com/$AUTHOR/status/$TWEET_ID)"
    echo ""
    echo "---"
    echo ""
    
    # Process each tweet in thread
    echo "$THREAD_JSON" | jq -r '.[] | "**\(.author.name)** @\(.author.username)\n\n\(.text)\n\n---\n"'
    
} > "$FILEPATH"

echo "✅ Saved to: $FILEPATH"
echo "📖 $(echo "$THREAD_JSON" | jq '. | length') tweets in thread"
