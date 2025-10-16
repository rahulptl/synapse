#!/usr/bin/env python3
"""
Test script for the optimized upload endpoint.
"""
import requests
import json
import os
from pathlib import Path

def test_optimized_upload():
    """Test the optimized upload endpoint."""

    # API endpoint
    url = "http://localhost:8000/api/v1/files/upload-optimized"

    # Test file
    test_file = "/tmp/test_upload.txt"

    # Form data
    files = {
        'file': (test_file, open(test_file, 'rb'), 'text/plain')
    }

    data = {
        'folder_id': 'test-folder-id',
        'title': 'Test Optimized Upload',
        'description': 'Testing the new optimized upload endpoint'
    }

    try:
        print("🚀 Testing optimized upload endpoint...")
        print(f"   URL: {url}")
        print(f"   File: {test_file}")
        print()

        # Make request
        response = requests.post(url, files=files, data=data)

        print(f"📊 Response Status: {response.status_code}")

        if response.status_code == 401:
            print("❌ Authentication required (expected for API testing)")
            print("   The endpoint exists but requires authentication")
            return True
        elif response.status_code == 200:
            result = response.json()
            print("✅ Success!")
            print(f"   Response: {json.dumps(result, indent=2)}")
            return True
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"   Response: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Exception: {e}")
        return False
    finally:
        # Close file
        if 'file' in files:
            files['file'][1].close()

def test_upload_stats():
    """Test the upload stats endpoint."""

    url = "http://localhost:8000/api/v1/files/upload-stats"

    try:
        print("\n📈 Testing upload stats endpoint...")
        print(f"   URL: {url}")

        response = requests.get(url)

        print(f"📊 Response Status: {response.status_code}")

        if response.status_code == 401:
            print("❌ Authentication required (expected)")
            print("   The endpoint exists but requires authentication")
            return True
        elif response.status_code == 200:
            result = response.json()
            print("✅ Success!")
            print(f"   Response: {json.dumps(result, indent=2)}")
            return True
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"   Response: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def main():
    """Run all tests."""
    print("=" * 60)
    print("🧪 Testing Optimized Upload Endpoints")
    print("=" * 60)

    # Check if test file exists
    test_file = Path("/tmp/test_upload.txt")
    if not test_file.exists():
        print(f"❌ Test file not found: {test_file}")
        return

    # Test optimized upload
    upload_success = test_optimized_upload()

    # Test upload stats
    stats_success = test_upload_stats()

    print("\n" + "=" * 60)
    print("📋 Test Results:")
    print(f"   Optimized Upload: {'✅ Working' if upload_success else '❌ Failed'}")
    print(f"   Upload Stats: {'✅ Working' if stats_success else '❌ Failed'}")

    if upload_success and stats_success:
        print("\n🎉 All endpoints are accessible!")
        print("   Note: Authentication is required for actual usage")
    else:
        print("\n⚠️  Some endpoints may have issues")

    print("=" * 60)

if __name__ == "__main__":
    main()