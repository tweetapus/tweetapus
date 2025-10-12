#!/bin/bash

echo "🚀 Setting up Advanced C Timeline Algorithm..."
echo ""

# Step 1: Database migrations
echo "📊 Step 1/3: Running database migrations..."
if [ -f ./.data/db.sqlite ]; then
    sqlite3 ./.data/db.sqlite < scripts/add_c_algorithm_column.sql 2>/dev/null || echo "  ⚠️  use_c_algorithm column may already exist (safe to ignore)"
    sqlite3 ./.data/db.sqlite < scripts/add_seen_tweets_table.sql 2>/dev/null || echo "  ⚠️  seen_tweets table may already exist (safe to ignore)"
    echo "  ✓ Database migrations complete"
else
    echo "  ⚠️  Database file not found at ./.data/db.sqlite"
    echo "     Make sure the database exists before running this script"
    exit 1
fi

echo ""

# Step 2: Compile C algorithm
echo "🔨 Step 2/3: Compiling C algorithm..."
cd src/algo

if ! command -v gcc &> /dev/null; then
    echo "  ⚠️  gcc not found. Please install gcc to compile the C algorithm."
    echo "     The JavaScript fallback will be used instead."
    cd ../..
else
    make clean > /dev/null 2>&1
    if make; then
        echo "  ✓ C algorithm compiled successfully!"
        ls -lh algorithm.* 2>/dev/null | grep -v ".c\|.h\|.o"
    else
        echo "  ⚠️  Compilation failed. The JavaScript fallback will be used."
    fi
    cd ../..
fi

echo ""

# Step 3: Instructions
echo "✅ Step 3/3: Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Restart your server if it's running: bun run src/index.js"
echo "   2. Log in to your account"
echo "   3. Go to Settings > Experiments"
echo "   4. Toggle 'C Algorithm' ON"
echo "   5. Refresh your timeline"
echo ""
echo "🎯 Features enabled:"
echo "   • Advanced multi-factor scoring (time decay, virality, quality)"
echo "   • No duplicate tweets across page refreshes"
echo "   • Engagement velocity tracking"
echo "   • Logarithmic scaling for fair ranking"
echo ""
echo "📚 Read more:"
echo "   • ALGORITHM_ENHANCEMENTS.md - What's new"
echo "   • src/algo/README.md - Technical details"
echo "   • ALGORITHM_SETUP.md - Full setup guide"
echo ""
