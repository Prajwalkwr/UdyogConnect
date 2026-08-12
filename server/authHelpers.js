function getRegistrationUserDefaults() {
  // Allow skipping verification for hosted/demo sites by setting DISABLE_REGISTRATION_OTP=true
  const skipOtp = process.env.DISABLE_REGISTRATION_OTP === 'true' || process.env.NODE_ENV === 'test';
  return {
    isVerified: !!skipOtp ? true : false,
    verificationOtp: '',
  };
}

module.exports = {
  getRegistrationUserDefaults,
};
