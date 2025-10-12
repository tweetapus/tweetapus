# Timeline Algorithm in C

This directory contains a C-based timeline ranking algorithm that can be used as an experimental feature.

## Overview

The algorithm ranks tweets by relevancy rather than chronological order. It considers:

- **Recency**: Tweets created within the last 48 hours get boosted
- **Engagement**: Likes and retweets boost a tweet's score
- **Boost Tiers**:
  - 10 likes: 1.5x boost
  - 50 likes: 2.0x boost
  - 200 likes: 3.0x boost
  - Every 50 likes after 200: +0.5x boost
- **Old tweets** (>48 hours) with low engagement (<10 likes, no retweets) are filtered out
- **Duplicate prevention**: Tweets are deduplicated before ranking

## Building

To compile the C library:

```bash
cd src/algo
make
```

This will create `algorithm.so` (or `algorithm.dylib` on macOS, `algorithm.dll` on Windows).

To clean build artifacts:

```bash
make clean
```

## Usage

The algorithm is integrated into the timeline API and can be enabled per-user through the "Experiments" settings page.

### Fallback

If the C library fails to load, the JavaScript implementation automatically falls back to a pure JS version of the same algorithm.

## Enabling in Settings

1. Navigate to Settings > Experiments
2. Toggle "C Algorithm" on
3. Refresh the timeline

## Files

- `algorithm.h` - Header file with function declarations
- `algorithm.c` - C implementation of the ranking algorithm
- `algorithm.js` - JavaScript FFI bridge and fallback implementation
- `Makefile` - Build configuration

```
score = (like_count + 1) × boost × retweet_boost × recency_factor

where:
  boost = tier-based multiplier (1.0, 1.5, 2.0, 3.0+)
  retweet_boost = 1.0 + (retweet_count × 0.3)
  recency_factor = 1.0 + ((48 - age_hours) / 48) × 2.0 (for tweets < 48h old)
                 = 0.5 (for older tweets)
```

Tweets with score = 0 are filtered out (too old with minimal engagement).
