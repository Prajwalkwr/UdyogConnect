function getRegistrationUserDefaults() {
  // This app does not send email OTPs by default — activation codes are only returned
  // in the API/notification payload. New accounts should be usable immediately.
  // Set REQUIRE_REGISTRATION_OTP=true to enforce verify-before-login.
  // DISABLE_REGISTRATION_OTP=true always skips OTP (kept for existing tests/deployments).
  const requireOtp =
    process.env.REQUIRE_REGISTRATION_OTP === 'true' &&
    process.env.DISABLE_REGISTRATION_OTP !== 'true';

  return {
    isVerified: !requireOtp,
    verificationOtp: '',
  };
}

module.exports = {
  getRegistrationUserDefaults,
};
