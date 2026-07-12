function getRegistrationUserDefaults() {
  return {
    isVerified: true,
    verificationOtp: '',
  };
}

module.exports = {
  getRegistrationUserDefaults,
};
