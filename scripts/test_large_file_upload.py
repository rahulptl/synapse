#!/usr/bin/env python3
"""
Test script for large file upload via signed URLs.

This script tests the signed URL upload flow for files >32MB.
"""
import os
import sys
import requests
import argparse
from pathlib import Path
import time


def create_test_file(size_mb: int, output_path: str) -> str:
    """Create a test file of specified size."""
    print(f"Creating {size_mb}MB test file...")

    file_path = Path(output_path)
    file_path.parent.mkdir(parents=True, exist_ok=True)

    # Write random data
    chunk_size = 1024 * 1024  # 1MB chunks
    with open(file_path, 'wb') as f:
        for _ in range(size_mb):
            f.write(os.urandom(chunk_size))

    print(f"✓ Created test file: {file_path} ({size_mb}MB)")
    return str(file_path)


def test_signed_url_upload(
    backend_url: str,
    access_token: str,
    user_id: str,
    folder_id: str,
    file_path: str,
    title: str
):
    """Test the complete signed URL upload flow."""

    print("\n" + "="*60)
    print("Testing Large File Upload (Signed URL Flow)")
    print("="*60)

    headers = {
        "Authorization": f"Bearer {access_token}",
        "x-user-id": user_id,
        "Content-Type": "application/json"
    }

    file_path = Path(file_path)
    file_size = file_path.stat().st_size
    file_size_mb = file_size / (1024 * 1024)

    print(f"\nFile: {file_path.name}")
    print(f"Size: {file_size_mb:.2f}MB")
    print(f"Folder ID: {folder_id}")
    print(f"Title: {title}")

    # Step 1: Request signed URL
    print("\n[Step 1] Requesting signed URL from backend...")
    signed_url_response = requests.post(
        f"{backend_url}/api/v1/files/upload/signed-url",
        headers=headers,
        json={
            "filename": file_path.name,
            "content_type": "application/pdf",
            "folder_id": folder_id,
            "title": title,
            "description": "Test upload via signed URL",
            "file_size": file_size
        }
    )

    if signed_url_response.status_code != 200:
        print(f"✗ Failed to get signed URL: {signed_url_response.status_code}")
        print(f"  Response: {signed_url_response.text}")
        return False

    signed_url_data = signed_url_response.json()
    upload_url = signed_url_data["upload_url"]
    storage_path = signed_url_data["storage_path"]
    expires_in = signed_url_data["expires_in"]

    print(f"✓ Received signed URL (expires in {expires_in}s)")
    print(f"  Storage path: {storage_path}")

    # Step 2: Upload to GCS
    print("\n[Step 2] Uploading to Google Cloud Storage...")
    start_time = time.time()

    with open(file_path, 'rb') as f:
        upload_response = requests.put(
            upload_url,
            data=f,
            headers={"Content-Type": "application/pdf"}
        )

    upload_time = time.time() - start_time
    upload_speed = file_size_mb / upload_time

    if upload_response.status_code not in [200, 201, 204]:
        print(f"✗ Failed to upload to GCS: {upload_response.status_code}")
        print(f"  Response: {upload_response.text}")
        return False

    print(f"✓ Upload complete!")
    print(f"  Time: {upload_time:.2f}s")
    print(f"  Speed: {upload_speed:.2f} MB/s")

    # Step 3: Notify backend
    print("\n[Step 3] Notifying backend of upload completion...")
    complete_response = requests.post(
        f"{backend_url}/api/v1/files/upload/complete",
        headers=headers,
        json={
            "storage_path": storage_path,
            "folder_id": folder_id,
            "title": title,
            "description": "Test upload via signed URL",
            "file_size": file_size,
            "content_type": "application/pdf"
        }
    )

    if complete_response.status_code != 200:
        print(f"✗ Failed to notify backend: {complete_response.status_code}")
        print(f"  Response: {complete_response.text}")
        return False

    result = complete_response.json()
    item_id = result["item"]["id"]

    print(f"✓ Knowledge item created!")
    print(f"  Item ID: {item_id}")
    print(f"  Processing status: {result['processing_status']}")

    print("\n" + "="*60)
    print("✅ Large file upload test PASSED")
    print("="*60)

    return True


def test_standard_upload(
    backend_url: str,
    access_token: str,
    user_id: str,
    folder_id: str,
    file_path: str,
    title: str
):
    """Test standard upload for comparison (<32MB)."""

    print("\n" + "="*60)
    print("Testing Standard Upload (for comparison)")
    print("="*60)

    headers = {
        "Authorization": f"Bearer {access_token}",
        "x-user-id": user_id,
    }

    file_path = Path(file_path)
    file_size = file_path.stat().st_size
    file_size_mb = file_size / (1024 * 1024)

    print(f"\nFile: {file_path.name}")
    print(f"Size: {file_size_mb:.2f}MB")

    print("\nUploading via standard Cloud Run endpoint...")
    start_time = time.time()

    with open(file_path, 'rb') as f:
        files = {'file': (file_path.name, f, 'application/pdf')}
        data = {
            'folder_id': folder_id,
            'title': title,
            'description': 'Test standard upload'
        }

        response = requests.post(
            f"{backend_url}/api/v1/files/upload",
            headers=headers,
            files=files,
            data=data
        )

    upload_time = time.time() - start_time
    upload_speed = file_size_mb / upload_time

    if response.status_code == 200:
        result = response.json()
        print(f"✓ Upload complete!")
        print(f"  Time: {upload_time:.2f}s")
        print(f"  Speed: {upload_speed:.2f} MB/s")
        print(f"  Item ID: {result['item']['id']}")
        return True
    else:
        print(f"✗ Upload failed: {response.status_code}")
        print(f"  Response: {response.text}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Test large file upload')
    parser.add_argument('--backend-url', required=True, help='Backend API URL')
    parser.add_argument('--access-token', required=True, help='User access token')
    parser.add_argument('--user-id', required=True, help='User ID')
    parser.add_argument('--folder-id', required=True, help='Folder ID')
    parser.add_argument('--file-path', help='Path to existing file (optional)')
    parser.add_argument('--create-file', type=int, help='Create test file of N MB')
    parser.add_argument('--title', default='Test Large File', help='Item title')
    parser.add_argument('--test-standard', action='store_true', help='Also test standard upload')

    args = parser.parse_args()

    # Determine file path
    if args.file_path:
        file_path = args.file_path
        if not Path(file_path).exists():
            print(f"Error: File not found: {file_path}")
            sys.exit(1)
    elif args.create_file:
        file_path = create_test_file(
            args.create_file,
            f"/tmp/test_file_{args.create_file}mb.pdf"
        )
    else:
        print("Error: Either --file-path or --create-file must be specified")
        sys.exit(1)

    file_size_mb = Path(file_path).stat().st_size / (1024 * 1024)

    # Run appropriate test
    if file_size_mb > 32:
        print(f"\nFile is {file_size_mb:.2f}MB (>32MB) - using signed URL upload")
        success = test_signed_url_upload(
            args.backend_url,
            args.access_token,
            args.user_id,
            args.folder_id,
            file_path,
            args.title
        )
    else:
        print(f"\nFile is {file_size_mb:.2f}MB (≤32MB) - using standard upload")
        success = test_standard_upload(
            args.backend_url,
            args.access_token,
            args.user_id,
            args.folder_id,
            file_path,
            args.title
        )

        # Optionally test signed URL for small files too
        if args.test_standard:
            print("\n\nAlso testing signed URL flow for small file...")
            test_signed_url_upload(
                args.backend_url,
                args.access_token,
                args.user_id,
                args.folder_id,
                file_path,
                args.title + " (via signed URL)"
            )

    # Cleanup created files
    if args.create_file and Path(file_path).exists():
        print(f"\nCleaning up test file: {file_path}")
        Path(file_path).unlink()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
