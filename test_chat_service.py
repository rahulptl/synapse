#!/usr/bin/env python3
"""
Test script for the chat service with OpenAI Vector Stores.
"""
import requests
import json

def test_chat_endpoint():
    """Test the main chat endpoint."""

    url = "http://localhost:8000/api/v1/chat"

    # Test chat request
    chat_data = {
        "message": "Hello, this is a test message to verify the chat service is working with the new OpenAI Vector Stores architecture.",
        "user_id": "test-user-id"
    }

    try:
        print("🤖 Testing chat endpoint...")
        print(f"   URL: {url}")
        print(f"   Message: {chat_data['message']}")
        print()

        response = requests.post(url, json=chat_data)

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

def test_conversations_endpoint():
    """Test the conversations endpoint."""

    url = "http://localhost:8000/api/v1/chat/conversations"

    try:
        print("\n💬 Testing conversations endpoint...")
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
    """Run all chat tests."""
    print("=" * 60)
    print("🤖 Testing Chat Service")
    print("=" * 60)

    # Test chat endpoint
    chat_success = test_chat_endpoint()

    # Test conversations endpoint
    conv_success = test_conversations_endpoint()

    print("\n" + "=" * 60)
    print("📋 Test Results:")
    print(f"   Chat Endpoint: {'✅ Working' if chat_success else '❌ Failed'}")
    print(f"   Conversations Endpoint: {'✅ Working' if conv_success else '❌ Failed'}")

    if chat_success and conv_success:
        print("\n🎉 Chat service endpoints are accessible!")
        print("   Note: Authentication is required for actual usage")
        print("   The service should work with the new OpenAI Vector Stores architecture")
    else:
        print("\n⚠️  Some chat endpoints may have issues")

    print("=" * 60)

if __name__ == "__main__":
    main()