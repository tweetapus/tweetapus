#!/bin/bash

echo "Building C Timeline Algorithm..."

cd "$(dirname "$0")/../src/algo" || exit 1

if ! command -v gcc &> /dev/null; then
    echo "Error: gcc not found. Please install gcc to compile the C algorithm."
    exit 1
fi

make clean
make

if [ $? -eq 0 ]; then
    echo "✓ Algorithm compiled successfully!"
    ls -lh algorithm.*
else
    echo "✗ Compilation failed"
    exit 1
fi
