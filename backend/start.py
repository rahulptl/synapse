#!/usr/bin/env python3
"""
Simple startup script for Synapse API.
"""
import os
import sys
import subprocess
from pathlib import Path

def main():
    """Start the Synapse API server."""
    # Check if virtual environment is activated
    if not hasattr(sys, 'real_prefix') and not (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("⚠️  Virtual environment not detected. Please activate your virtual environment first:")
        print("   source venv/bin/activate  # On Linux/Mac")
        print("   venv\\Scripts\\activate     # On Windows")
        sys.exit(1)

    # Check if .env file exists
    if not Path('.env').exists():
        print("⚠️  .env file not found. Please copy .env.example to .env and configure it:")
        print("   cp .env.example .env")
        sys.exit(1)

    # Check if requirements are installed
    try:
        import fastapi
        import uvicorn
    except ImportError:
        print("⚠️  Required packages not installed. Please install requirements:")
        print("   pip install -r requirements.txt")
        sys.exit(1)

    # Start the server
    print("🚀 Starting Synapse API server...")
    print("📖 API documentation will be available at: http://localhost:8000/docs")

    # Use subprocess to run uvicorn
    cmd = [
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--reload"
    ]

    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\n👋 Shutting down Synapse API server...")

if __name__ == "__main__":
    main()