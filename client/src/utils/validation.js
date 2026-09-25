/**
 * Centralized Client-Side Validation Utilities for UdyogConnect
 */

import { isNepalPlace } from './nepalPlaces';

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Business signup: letters only before @, digits only for domain, then .tld (e.g. shop@123.com). */
export const BUSINESS_EMAIL_REGEX = /^[A-Za-z]+@[0-9]+\.com$/i;
/** Nepal mobile: exactly 10 digits starting with 97 or 98. */
export const PHONE_REGEX = /^(97|98)\d{8}$/;
export const PERSON_NAME_REGEX = /^[\p{L}]+(?:[ ][\p{L}]+)*$/u;

export const validateEmail = (email) => {
  if (!email || !String(email).trim()) {
    return 'Email address is required.';
  }
  if (!EMAIL_REGEX.test(String(email).trim())) {
    return 'Please enter a valid email address (e.g. user@example.com).';
  }
  return '';
};

/** Business emails only: words@number.com (letters @ digits . letters). */
export const validateBusinessEmail = (email) => {
  if (!email || !String(email).trim()) {
    return 'Email address is required.';
  }
  const trimmed = String(email).trim().toLowerCase();
  if (!BUSINESS_EMAIL_REGEX.test(trimmed)) {
    return 'Business email must be words@number.com (letters before @, numbers for domain, e.g. shop@123.com).';
  }
  return '';
};

export const validatePhone = (phone, isRequired = false) => {
  const str = phone ? String(phone).trim() : '';
  if (!str) {
    return isRequired ? 'Phone number is required.' : '';
  }
  if (!PHONE_REGEX.test(str)) {
    return 'Phone number must be exactly 10 digits starting with 97 or 98 (e.g. 9800000000).';
  }
  return '';
};

export const validatePassword = (password) => {
  if (!password) {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return '';
};

export const validateConfirmPassword = (password, confirmPassword) => {
  if (!confirmPassword) {
    return 'Please confirm your password.';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return '';
};

export const validateName = (name, fieldLabel = 'Name') => {
  if (!name || !String(name).trim()) {
    return `${fieldLabel} is required.`;
  }
  if (String(name).trim().length < 2) {
    return `${fieldLabel} must be at least 2 characters.`;
  }
  return '';
};

/** Letters (incl. Devanagari) and spaces only — no numbers or special characters. */
export const validatePersonName = (name, fieldLabel = 'Name') => {
  const requiredErr = validateName(name, fieldLabel);
  if (requiredErr) return requiredErr;
  const trimmed = String(name).trim();
  if (!PERSON_NAME_REGEX.test(trimmed)) {
    return `${fieldLabel} can only contain letters and spaces (no numbers or special characters).`;
  }
  return '';
};

export const validateNepalLocation = (location, fieldLabel = 'Location / City') => {
  if (!location || !String(location).trim()) {
    return `${fieldLabel} is required.`;
  }
  if (!isNepalPlace(location)) {
    return `${fieldLabel} must be a place in Nepal (e.g. Kathmandu, Pokhara, Thamel).`;
  }
  return '';
};

export const validatePrice = (price) => {
  if (price === '' || price === null || price === undefined) {
    return 'Price is required.';
  }
  const num = Number(price);
  if (isNaN(num)) {
    return 'Price must be a valid number.';
  }
  if (num < 0) {
    return 'Price cannot be negative.';
  }
  return '';
};

export const validateQuantity = (quantity) => {
  if (quantity === '' || quantity === null || quantity === undefined) {
    return 'Quantity is required.';
  }
  const num = Number(quantity);
  if (isNaN(num) || !Number.isInteger(num)) {
    return 'Quantity must be a valid whole number.';
  }
  if (num < 0) {
    return 'Quantity cannot be negative.';
  }
  return '';
};

export const validateDuration = (duration) => {
  if (duration === '' || duration === null || duration === undefined) {
    return 'Duration is required.';
  }
  const num = Number(duration);
  if (isNaN(num) || num <= 0) {
    return 'Duration must be a positive number (minutes/hours).';
  }
  return '';
};

export const validateRating = (rating) => {
  if (!rating) {
    return 'Rating is required.';
  }
  const num = Number(rating);
  if (isNaN(num) || num < 1 || num > 5) {
    return 'Rating must be a number between 1 and 5.';
  }
  return '';
};

export const validateReviewText = (text) => {
  if (!text || !String(text).trim()) {
    return 'Review text cannot be empty.';
  }
  if (String(text).trim().length < 5) {
    return 'Review text must be at least 5 characters long.';
  }
  return '';
};

export const validateImageFile = (file, maxSizeBytes = 5 * 1024 * 1024) => {
  if (!file) return '';
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
  if (!validTypes.includes(file.type)) {
    return 'Invalid file format. Only JPEG, PNG, WEBP, and PDF files are allowed.';
  }
  if (file.size > maxSizeBytes) {
    return `File size exceeds limit of ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB.`;
  }
  return '';
};

export const validateRegistrationForm = (formData) => {
  const errors = {};
  const isSeller = formData.role === 'seller';

  const nameErr = isSeller
    ? validatePersonName(formData.name, 'Business Name')
    : validatePersonName(formData.name, 'Full Name');
  if (nameErr) errors.name = nameErr;

  const emailErr = isSeller
    ? validateBusinessEmail(formData.email)
    : validateEmail(formData.email);
  if (emailErr) errors.email = emailErr;

  const phoneErr = validatePhone(formData.phone, true);
  if (phoneErr) errors.phone = phoneErr;

  const passwordErr = validatePassword(formData.password);
  if (passwordErr) errors.password = passwordErr;

  const confirmErr = validateConfirmPassword(formData.password, formData.confirmPassword);
  if (confirmErr) errors.confirmPassword = confirmErr;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateLoginForm = (formData) => {
  const errors = {};
  const emailErr = validateEmail(formData.email || formData.username);
  if (emailErr) errors.email = emailErr;

  if (!formData.password) {
    errors.password = 'Password is required.';
  }
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const countWords = (text) =>
  String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

export const BUSINESS_HOURS_OPTIONS = [
  '07:00 - 19:00',
  '08:00 - 17:00',
  '08:00 - 18:00',
  '08:00 - 20:00',
  '09:00 - 17:00',
  '09:00 - 18:00',
  '09:00 - 20:00',
  '09:00 - 21:00',
  '10:00 - 18:00',
  '10:00 - 20:00',
  '10:00 - 22:00',
  '11:00 - 21:00',
  '11:00 - 23:00',
  '12:00 - 22:00',
  '16:00 - 23:00',
];

export const BUSINESS_CATEGORY_OPTIONS = [
  'Grocery',
  'Restaurants & Food',
  'Furniture',
  'Gift Shop / Crafts',
  'Home Services',
  'Mechanics & Repair',
  'Electronics',
  'Clothing & Fashion',
  'Health & Beauty',
  'Education',
];

export const validateBusinessForm = (formData) => {
  const errors = {};
  const nameErr = validatePersonName(formData.name, 'Business Name');
  if (nameErr) errors.name = nameErr;

  if (!formData.category || !String(formData.category).trim()) {
    errors.category = 'Please select a business category.';
  }

  const locationValue = formData.location || formData.address;
  const locationErr = validatePersonName(locationValue, 'Location');
  if (locationErr) {
    errors.location = locationErr;
    if (!formData.location && formData.address !== undefined) errors.address = locationErr;
  }

  if (!formData.hours || !String(formData.hours).trim()) {
    errors.hours = 'Please select business hours.';
  } else if (!BUSINESS_HOURS_OPTIONS.includes(String(formData.hours).trim())) {
    errors.hours = 'Please choose business hours from the list.';
  }

  const emailErr = validateBusinessEmail(formData.contactEmail || formData.email);
  if (emailErr) {
    errors.contactEmail = emailErr;
    if (formData.email !== undefined) errors.email = emailErr;
  }

  const phoneErr = validatePhone(formData.phone, true);
  if (phoneErr) errors.phone = phoneErr;

  const words = countWords(formData.description);
  if (!formData.description || !String(formData.description).trim()) {
    errors.description = 'Business description is required.';
  } else if (words < 50) {
    errors.description = `Business description must be at least 50 words (currently ${words}).`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateProductForm = (formData) => {
  const errors = {};
  const nameErr = validateName(formData.name, 'Product Name');
  if (nameErr) errors.name = nameErr;

  const priceErr = validatePrice(formData.price);
  if (priceErr) errors.price = priceErr;

  const qtyErr = validateQuantity(formData.quantity ?? formData.stock);
  if (qtyErr) errors.quantity = qtyErr;

  if (!formData.category || !String(formData.category).trim()) {
    errors.category = 'Category is required.';
  }

  if (!formData.description || String(formData.description).trim().length < 10) {
    errors.description = 'Product description is required (minimum 10 characters).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateServiceForm = (formData) => {
  const errors = {};
  const nameErr = validateName(formData.name, 'Service Name');
  if (nameErr) errors.name = nameErr;

  const priceErr = validatePrice(formData.price);
  if (priceErr) errors.price = priceErr;

  const durationErr = validateDuration(formData.duration);
  if (durationErr) errors.duration = durationErr;

  if (!formData.category || !String(formData.category).trim()) {
    errors.category = 'Category is required.';
  }

  if (!formData.description || String(formData.description).trim().length < 10) {
    errors.description = 'Service description is required (minimum 10 characters).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateReviewForm = (formData) => {
  const errors = {};
  const ratingErr = validateRating(formData.rating);
  if (ratingErr) errors.rating = ratingErr;

  const textErr = validateReviewText(formData.comment || formData.text);
  if (textErr) errors.comment = textErr;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateCheckoutForm = (formData) => {
  const errors = {};
  const deliveryMethod = formData.deliveryMethod || formData.method || 'delivery';

  const nameErr = validatePersonName(formData.fullName || formData.name, 'Full Name');
  if (nameErr) errors.name = nameErr;

  const emailErr = validateEmail(formData.email);
  if (emailErr) errors.email = emailErr;

  const phoneErr = validatePhone(formData.phone, true);
  if (phoneErr) errors.phone = phoneErr;

  const cityErr = validateNepalLocation(formData.city || formData.location, 'Location / City');
  if (cityErr) errors.city = cityErr;

  if (deliveryMethod === 'delivery') {
    if (!formData.address || !String(formData.address).trim()) {
      errors.address = 'Street address / landmark is required.';
    } else if (String(formData.address).trim().length < 5) {
      errors.address = 'Street address must be at least 5 characters.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
