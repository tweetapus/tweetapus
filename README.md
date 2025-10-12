# tweetapus

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run start
```

## Development

Start the server: `bun run src/index.js`

## Experimental Features

### C Algorithm

The project includes an experimental timeline ranking algorithm written in C for improved performance.

To compile the C algorithm:

```bash
cd src/algo
make
```

Or use the build script:

```bash
bash scripts/build-algo.sh
```

Enable the C algorithm in Settings > Experiments > "C Algorithm" to use relevancy-based ranking instead of chronological sorting.

See `src/algo/README.md` for detailed information about the algorithm.
