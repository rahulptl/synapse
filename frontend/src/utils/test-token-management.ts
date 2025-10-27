/**
 * Token Management Test Suite
 * Tests for JWT utilities and automatic token refresh functionality
 */

import {
  parseJWT,
  isTokenExpired,
  shouldRefreshToken,
  isTokenValid,
  getTokenRemainingTime,
  getUserIdFromToken
} from './jwt';

// Mock JWT token for testing (expires in 1 hour from now)
const createMockJWT = (expiresInMinutes: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (expiresInMinutes * 60);

  // Create mock header and payload
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: 'test-user-123',
    exp,
    iat: now,
    email: 'test@example.com'
  };

  // Create mock JWT (base64 encoded)
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

// Test functions
export function runTokenTests() {
  console.log('🧪 Starting Token Management Tests...');

  // Test 1: Valid token parsing
  console.log('\n📝 Test 1: Valid Token Parsing');
  const validToken = createMockJWT(60); // 1 hour expiry
  const parsed = parseJWT(validToken);

  if (parsed && parsed.sub === 'test-user-123') {
    console.log('✅ Token parsing successful');
  } else {
    console.error('❌ Token parsing failed');
    return false;
  }

  // Test 2: Expired token detection
  console.log('\n📝 Test 2: Expired Token Detection');
  const expiredToken = createMockJWT(-60); // Expired 1 hour ago
  const isExpired = isTokenExpired(expiredToken);

  if (isExpired) {
    console.log('✅ Expired token detection successful');
  } else {
    console.error('❌ Expired token detection failed');
    return false;
  }

  // Test 3: Valid token detection
  console.log('\n📝 Test 3: Valid Token Detection');
  const isValid = isTokenValid(validToken);

  if (isValid) {
    console.log('✅ Valid token detection successful');
  } else {
    console.error('❌ Valid token detection failed');
    return false;
  }

  // Test 4: Token refresh timing
  console.log('\n📝 Test 4: Token Refresh Timing');
  const soonToExpireToken = createMockJWT(2); // Expires in 2 minutes
  const shouldRefresh = shouldRefreshToken(soonToExpireToken, 3); // 3 minute buffer

  if (shouldRefresh) {
    console.log('✅ Token refresh timing detection successful');
  } else {
    console.error('❌ Token refresh timing detection failed');
    return false;
  }

  // Test 5: User ID extraction
  console.log('\n📝 Test 5: User ID Extraction');
  const userId = getUserIdFromToken(validToken);

  if (userId === 'test-user-123') {
    console.log('✅ User ID extraction successful');
  } else {
    console.error('❌ User ID extraction failed');
    return false;
  }

  // Test 6: Invalid token handling
  console.log('\n📝 Test 6: Invalid Token Handling');
  const invalidToken = 'invalid.jwt.token';
  const isValidInvalid = isTokenValid(invalidToken);
  const isExpiredInvalid = isTokenExpired(invalidToken);

  if (!isValidInvalid && isExpiredInvalid) {
    console.log('✅ Invalid token handling successful');
  } else {
    console.error('❌ Invalid token handling failed');
    return false;
  }

  // Test 7: Token remaining time
  console.log('\n📝 Test 7: Token Remaining Time');
  const remainingTime = getTokenRemainingTime(validToken);

  if (remainingTime !== null && remainingTime > 0 && remainingTime <= 3600) {
    console.log('✅ Token remaining time calculation successful');
  } else {
    console.error('❌ Token remaining time calculation failed');
    return false;
  }

  console.log('\n🎉 All Token Management Tests Passed!');
  console.log('\n📊 Test Summary:');
  console.log('  - Token Parsing: ✅');
  console.log('  - Expired Token Detection: ✅');
  console.log('  - Valid Token Detection: ✅');
  console.log('  - Refresh Timing: ✅');
  console.log('  - User ID Extraction: ✅');
  console.log('  - Invalid Token Handling: ✅');
  console.log('  - Remaining Time Calculation: ✅');

  return true;
}

// Function to test request interceptor setup
export function testInterceptorSetup() {
  console.log('\n🔍 Testing Request Interceptor Setup...');

  // Test that we can import the interceptor functions
  try {
    import('./requestInterceptor').then((interceptor) => {
      console.log('✅ Request interceptor imported successfully');

      // Test that the expected functions are available
      if (interceptor.setRefreshTokenCallback &&
          interceptor.authenticatedFetch &&
          interceptor.clearQueuedRequests) {
        console.log('✅ All required interceptor functions available');
      } else {
        console.error('❌ Missing interceptor functions');
      }
    });
  } catch (error) {
    console.error('❌ Failed to import request interceptor:', error);
  }
}

// Export test runner for manual testing in browser console
export function runAllTests() {
  console.log('🚀 Running Complete Token Management Test Suite...');
  console.log('=====================================================');

  const tokenTestsPassed = runTokenTests();
  testInterceptorSetup();

  console.log('\n=====================================================');
  if (tokenTestsPassed) {
    console.log('🎉 All tests completed successfully!');
    console.log('\n💡 You can now test the automatic token refresh by:');
    console.log('1. Logging into the application');
    console.log('2. Making API requests');
    console.log('3. Waiting for tokens to expire (or manually clear them)');
    console.log('4. Observing the automatic refresh in the console');
  } else {
    console.log('❌ Some tests failed. Please check the implementation.');
  }
}

// Auto-run tests if this file is imported in development mode
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('🔧 Token Management utilities loaded. Run runAllTests() to test functionality.');
}