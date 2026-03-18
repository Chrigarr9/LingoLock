#!/bin/bash
# Push audio generation branch to GitHub

cd /home/ubuntu/Projects/vokabeltrainer

# Ensure we're on the right branch
git checkout feature/audio-generation

# Push to remote
git push -u origin feature/audio-generation

echo "✅ Branch pushed successfully!"
echo "View on GitHub: https://github.com/ChrigarrAgent/LingoLock/tree/feature/audio-generation"
