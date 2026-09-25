function getRegistrationUserDefaults() {
  // Allow skipping verification for hosted/demo sites by setting DISABLE_REGISTRATION_OTP=true.
  // Verification is required by default so new users must activate before login.
  const skipOtp = process.env.DISABLE_REGISTRATION_OTP === 'true';
  return {
    isVerified: !!skipOtp ? true : false,
    verificationOtp: '',
  };
}

module.exports = {
  getRegistrationUserDefaults,
};
