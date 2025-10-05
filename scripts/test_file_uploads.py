#!/usr/bin/env python3
"""
Test script for file upload functionality
Tests file size limits and upload handling
"""
import os
import sys
import requests
import tempfile
from pathlib import Path

# ANSI color codes
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def create_test_file(size_mb: int, filename: str) -> str:
    """Create a test file of specified size in MB"""
    print(f"{BLUE}Creating {size_mb}MB test file: {filename}{RESET}")

    filepath = os.path.join(tempfile.gettempdir(), filename)
    size_bytes = size_mb * 1024 * 1024

    # Write in chunks to avoid memory issues
    chunk_size = 1024 * 1024  # 1MB chunks
    with open(filepath, 'wb') as f:
        remaining = size_bytes
        while remaining > 0:
            chunk = min(chunk_size, remaining)
            f.write(b'0' * chunk)
            remaining -= chunk

    actual_size = os.path.getsize(filepath)
    print(f"{GREEN}✓ Created: {filepath} ({actual_size / (1024*1024):.1f}MB){RESET}")
    return filepath

def test_upload(api_url: str, filepath: str, folder_id: str, access_token: str, user_id: str, expected_success: bool = True):
    """Test file upload"""
    filename = os.path.basename(filepath)
    file_size_mb = os.path.getsize(filepath) / (1024 * 1024)

    print(f"\n{BLUE}Testing upload: {filename} ({file_size_mb:.1f}MB){RESET}")
    print(f"Expected: {'SUCCESS' if expected_success else 'FAILURE'}")

    try:
        with open(filepath, 'rb') as f:
            files = {'file': (filename, f, 'application/octet-stream')}
            data = {
                'folder_id': folder_id,
                'title': f'Test Upload {filename}',
                'description': f'Automated test upload of {file_size_mb:.1f}MB file'
            }
            headers = {
                'Authorization': f'Bearer {access_token}',
                'x-user-id': user_id
            }

            print(f"Uploading to: {api_url}/api/v1/files/upload")
            response = requests.post(
                f'{api_url}/api/v1/files/upload',
                files=files,
                data=data,
                headers=headers,
                timeout=300  # 5 minute timeout for large files
            )

            if response.status_code == 200:
                result = response.json()
                if expected_success:
                    print(f"{GREEN}✓ SUCCESS: Upload completed{RESET}")
                    print(f"  Item ID: {result.get('item', {}).get('id', 'N/A')}")
                    print(f"  Status: {result.get('processing_status', 'N/A')}")
                    return True
                else:
                    print(f"{RED}✗ UNEXPECTED SUCCESS: Should have failed{RESET}")
                    return False
            else:
                error_msg = response.json().get('detail', 'Unknown error')
                if not expected_success:
                    print(f"{GREEN}✓ EXPECTED FAILURE: {error_msg}{RESET}")
                    return True
                else:
                    print(f"{RED}✗ FAILURE: {error_msg}{RESET}")
                    print(f"  Status code: {response.status_code}")
                    return False

    except Exception as e:
        if not expected_success:
            print(f"{GREEN}✓ EXPECTED FAILURE: {str(e)}{RESET}")
            return True
        else:
            print(f"{RED}✗ ERROR: {str(e)}{RESET}")
            return False

def cleanup_test_files(filepaths: list):
    """Remove test files"""
    print(f"\n{BLUE}Cleaning up test files...{RESET}")
    for filepath in filepaths:
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                print(f"{GREEN}✓ Removed: {filepath}{RESET}")
        except Exception as e:
            print(f"{YELLOW}⚠ Could not remove {filepath}: {e}{RESET}")

def main():
    """Main test execution"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}File Upload Size Limit Tests{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")

    # Configuration
    api_url = os.getenv('API_URL', 'http://localhost:8000')
    access_token = os.getenv('ACCESS_TOKEN')
    user_id = os.getenv('USER_ID')
    folder_id = os.getenv('FOLDER_ID')

    if not all([access_token, user_id, folder_id]):
        print(f"{RED}ERROR: Missing required environment variables{RESET}")
        print("Please set: ACCESS_TOKEN, USER_ID, FOLDER_ID")
        print("\nExample:")
        print("  export ACCESS_TOKEN='your-token'")
        print("  export USER_ID='your-user-id'")
        print("  export FOLDER_ID='your-folder-id'")
        print("  python scripts/test_file_uploads.py")
        sys.exit(1)

    print(f"API URL: {api_url}")
    print(f"User ID: {user_id[:8]}...")
    print(f"Folder ID: {folder_id[:8]}...")

    # Test cases: (size_mb, should_succeed)
    test_cases = [
        (10, True, "Small file - well under limit"),
        (50, True, "Medium file - under 200MB limit"),
        (100, True, "Large file - under 200MB limit"),
        (150, True, "Very large file - under 200MB limit"),
        (200, True, "Max size file - exactly at 200MB limit"),
        (250, False, "Oversized file - exceeds 200MB limit"),
    ]

    test_files = []
    results = []

    try:
        # Create test files
        print(f"\n{BLUE}Step 1: Creating test files{RESET}")
        for size_mb, _, description in test_cases:
            filename = f"test_{size_mb}mb.dat"
            filepath = create_test_file(size_mb, filename)
            test_files.append(filepath)

        # Run upload tests
        print(f"\n{BLUE}Step 2: Testing uploads{RESET}")
        for (size_mb, should_succeed, description), filepath in zip(test_cases, test_files):
            print(f"\n{YELLOW}Test: {description}{RESET}")
            success = test_upload(api_url, filepath, folder_id, access_token, user_id, should_succeed)
            results.append((description, success))

        # Print summary
        print(f"\n{BLUE}{'='*60}{RESET}")
        print(f"{BLUE}Test Summary{RESET}")
        print(f"{BLUE}{'='*60}{RESET}\n")

        passed = sum(1 for _, success in results if success)
        total = len(results)

        for description, success in results:
            status = f"{GREEN}✓ PASS{RESET}" if success else f"{RED}✗ FAIL{RESET}"
            print(f"{status}: {description}")

        print(f"\n{BLUE}Results: {passed}/{total} tests passed{RESET}")

        if passed == total:
            print(f"{GREEN}All tests passed!{RESET}")
            return 0
        else:
            print(f"{RED}Some tests failed{RESET}")
            return 1

    finally:
        # Cleanup
        cleanup_test_files(test_files)

if __name__ == '__main__':
    sys.exit(main())
