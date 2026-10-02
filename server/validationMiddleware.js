const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUSINESS_EMAIL_REGEX = /^[A-Za-z]+@[0-9]+\.com$/i;
const PHONE_REGEX = /^(97|98)\d{8}$/;
const PERSON_NAME_REGEX = /^[\p{L}]+(?:[ ][\p{L}]+)*$/u;
const PRODUCT_WORD_NAME_REGEX = /^[\p{L}0-9]+(?:[ ][\p{L}0-9]+)*$/u;

const validateProductWordName = (value, fieldLabel) => {
  if (!value || !String(value).trim()) return `${fieldLabel} is required.`;
  const trimmed = String(value).trim();
  if (trimmed.length < 2) return `${fieldLabel} must be at least 2 characters.`;
  if (!PRODUCT_WORD_NAME_REGEX.test(trimmed)) {
    return `${fieldLabel} can only contain letters and spaces (no special characters). Up to 2 numbers are allowed.`;
  }
  if (!/\p{L}/u.test(trimmed)) return `${fieldLabel} must include letters.`;
  const digitCount = (trimmed.match(/\d/g) || []).length;
  if (digitCount > 2) return `${fieldLabel} can include at most 2 numbers.`;
  return '';
};

// Helper to check if string looks like valid Mongo ObjectId or non-empty ID
const isValidId = (id) => {
  if (!id) return false;
  const str = String(id).trim();
  return /^[0-9a-fA-F]{24}$/.test(str) || str.length >= 1;
};

const validateRegistration = (req, res, next) => {
  const { name, email, password, confirmPassword, phone, role, businessOfferingType } = req.body || {};
  const errors = {};
  const isSeller = role === 'seller';

  if (isSeller && businessOfferingType !== undefined && !['products', 'services', 'both'].includes(businessOfferingType)) {
    errors.businessOfferingType = 'Choose Products, Services, or both.';
  }

  if (!name || !String(name).trim()) {
    errors.name = isSeller ? 'Business name is required.' : 'Name is required.';
  } else if (String(name).trim().length < 2) {
    errors.name = isSeller
      ? 'Business name must be at least 2 characters long.'
      : 'Name must be at least 2 characters long.';
  } else if (!PERSON_NAME_REGEX.test(String(name).trim())) {
    errors.name = isSeller
      ? 'Business name can only contain letters and spaces (words only).'
      : 'Name can only contain letters and spaces (no numbers or special characters).';
  }

  if (!email || !String(email).trim()) {
    errors.email = 'Email address is required.';
  } else if (isSeller) {
    if (!BUSINESS_EMAIL_REGEX.test(String(email).trim())) {
      errors.email = 'Business email must be in words@number.com format (e.g. shop@123.com).';
    }
  } else if (!EMAIL_REGEX.test(String(email).trim())) {
    errors.email = 'Please provide a valid email address.';
  }

  if (!phone || !String(phone).trim()) {
    errors.phone = 'Phone number is required.';
  } else if (!PHONE_REGEX.test(String(phone).trim())) {
    errors.phone = 'Phone number must be exactly 10 digits starting with 97 or 98.';
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters long.';
  } else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must contain at least one letter and one number.';
  }

  if (!confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (role === 'admin') {
    errors.role = 'Admin accounts cannot be created through public registration.';
  } else if (role && !['customer', 'seller'].includes(role)) {
    errors.role = 'Invalid account role specified.';
  }

  const acceptTerms = (req.body || {}).acceptTerms;
  if (acceptTerms !== true && acceptTerms !== 'true') {
    errors.acceptTerms = 'Please confirm you are 18 or older and agree to the Terms & Conditions and Privacy Policy.';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: errors[Object.keys(errors)[0]] || 'Validation failed.',
      errors,
    });
  }
  next();
};

const validateLogin = (req, res, next) => {
  const body = req.body || {};
  const email = body.email || body.username;
  const password = body.password;
  const errors = {};

  if (!email || !String(email).trim()) {
    errors.email = 'Email or phone number is required.';
  }

  if (!password) {
    errors.password = 'Password is required.';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: errors[Object.keys(errors)[0]] || 'Login details missing.',
      errors,
    });
  }
  next();
};

const validateBusinessPayload = (req, res, next) => {
  const { name, category, description, address, phone } = req.body || {};
  const errors = {};

  if (!name || !String(name).trim()) {
    errors.name = 'Business name is required.';
  }

  if (!category || !String(category).trim()) {
    errors.category = 'Business category is required.';
  }

  if (description && String(description).trim().length > 0 && String(description).trim().length < 10) {
    errors.description = 'Business description must be at least 10 characters if provided.';
  }

  if (phone) {
    const cleanPhone = String(phone).trim();
    if (!PHONE_REGEX.test(cleanPhone)) {
      errors.phone = 'Phone number must be exactly 10 digits starting with 97 or 98.';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: errors[Object.keys(errors)[0]] || 'Business details validation failed.',
      errors,
    });
  }
  next();
};

const validateProductPayload = (req, res, next) => {
  const { name, brand, price, quantity, stock, discount, category, description, imageUrl } = req.body || {};
  const errors = {};

  const nameErr = validateProductWordName(name, 'Product name');
  if (nameErr) errors.name = nameErr;

  const brandErr = validateProductWordName(brand, 'Brand');
  if (brandErr) errors.brand = brandErr;

  const numPrice = Number(price);
  if (price === undefined || price === null || price === '' || Number.isNaN(numPrice)) {
    errors.price = 'Valid price is required.';
  } else if (numPrice < 0) {
    errors.price = 'Price cannot be negative.';
  }

  const discountRaw = discount === undefined || discount === null || discount === '' ? 0 : discount;
  const numDiscount = Number(discountRaw);
  if (Number.isNaN(numDiscount)) {
    errors.discount = 'Discount must be a valid number.';
  } else if (numDiscount < 0) {
    errors.discount = 'Discount cannot be negative.';
  } else if (numDiscount > 100) {
    errors.discount = 'Discount cannot exceed 100%.';
  }

  const q = quantity !== undefined ? quantity : stock;
  const numQty = Number(q);
  if (q === undefined || q === null || q === '' || Number.isNaN(numQty) || !Number.isInteger(numQty)) {
    errors.stock = 'Valid integer stock quantity is required.';
  } else if (numQty < 0) {
    errors.stock = 'Stock cannot be negative.';
  }

  if (!category || !String(category).trim()) {
    errors.category = 'Category is required.';
  }

  if (!description || String(description).trim().length < 10) {
    errors.description = 'Description must be at least 10 characters.';
  }

  const hasImageFile = Boolean(req.file);
  const hasImageUrl = Boolean(imageUrl && String(imageUrl).trim());
  if (req.method === 'POST' && !hasImageFile && !hasImageUrl) {
    errors.image = 'Product image is required.';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: errors[Object.keys(errors)[0]] || 'Product validation failed.',
      errors,
    });
  }
  next();
};

const validateServicePayload = (req, res, next) => {
  const { name, price, duration, category, description } = req.body || {};
  const errors = {};

  if (!name || !String(name).trim()) {
    errors.name = 'Service name is required.';
  }

  const numPrice = Number(price);
  if (price === undefined || price === null || price === '' || isNaN(numPrice)) {
    errors.price = 'Valid price is required.';
  } else if (numPrice < 0) {
    errors.price = 'Price cannot be negative.';
  }

  const numDur = Number(duration);
  if (duration === undefined || duration === null || duration === '' || isNaN(numDur) || numDur <= 0) {
    errors.duration = 'Duration must be a positive number.';
  }

  if (!category || !String(category).trim()) {
    errors.category = 'Category is required.';
  }

  if (description && String(description).trim().length < 10) {
    errors.description = 'Description must be at least 10 characters.';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: errors[Object.keys(errors)[0]] || 'Service validation failed.',
      errors,
    });
  }
  next();
};

const validateReviewPayload = (req, res, next) => {
  const { rating, comment, text } = req.body || {};
  const errors = {};

  const numRating = Number(rating);
  if (rating === undefined || rating === null || isNaN(numRating) || numRating < 1 || numRating > 5) {
    errors.rating = 'Rating must be a number between 1 and 5.';
  }

  const reviewContent = comment || text;
  if (!reviewContent || !String(reviewContent).trim()) {
    errors.comment = 'Review text cannot be empty.';
  } else if (String(reviewContent).trim().length < 5) {
    errors.comment = 'Review text must be at least 5 characters long.';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: errors[Object.keys(errors)[0]] || 'Review validation failed.',
      errors,
    });
  }
  next();
};

const validateOrderPayload = (req, res, next) => {
  const { items, shippingAddress, address } = req.body || {};
  const errors = {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.items = 'Order must contain at least one item.';
  } else {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const q = Number(item.quantity);
      if (!item.productId && !item.serviceId && !item._id && !item.id) {
        errors[`items_${i}`] = 'Each order item must specify a valid product or service.';
      }
      if (isNaN(q) || q <= 0 || !Number.isInteger(q)) {
        errors[`items_${i}_quantity`] = 'Quantity for each item must be an integer greater than zero.';
      }
    }
  }

  const deliveryAddr = shippingAddress || address;
  if (deliveryAddr && typeof deliveryAddr === 'object') {
    if (!deliveryAddr.phone && !deliveryAddr.contactPhone) {
      // Optional or warning
    } else if (deliveryAddr.phone && !PHONE_REGEX.test(String(deliveryAddr.phone).trim())) {
      errors.phone = 'Delivery phone number must be 10 digits starting with 97 or 98.';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: errors[Object.keys(errors)[0]] || 'Order payload validation failed.',
      errors,
    });
  }
  next();
};

const validateFileUpload = (maxSizeBytes = 5 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file && !req.files) return next();

    const checkFile = (file) => {
      if (!file) return null;
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(file.mimetype)) {
        return 'Invalid file type. Only JPEG, PNG, WEBP, and PDF files are allowed.';
      }
      if (file.size > maxSizeBytes) {
        return `File size exceeds the max allowed limit of ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB.`;
      }
      return null;
    };

    let err = null;
    if (req.file) {
      err = checkFile(req.file);
    } else if (req.files) {
      if (Array.isArray(req.files)) {
        for (const f of req.files) {
          err = checkFile(f);
          if (err) break;
        }
      } else if (typeof req.files === 'object') {
        for (const key of Object.keys(req.files)) {
          const fileArr = Array.isArray(req.files[key]) ? req.files[key] : [req.files[key]];
          for (const f of fileArr) {
            err = checkFile(f);
            if (err) break;
          }
          if (err) break;
        }
      }
    }

    if (err) {
      return res.status(400).json({ message: err });
    }
    next();
  };
};

module.exports = {
  isValidId,
  validateRegistration,
  validateLogin,
  validateBusinessPayload,
  validateProductPayload,
  validateServicePayload,
  validateReviewPayload,
  validateOrderPayload,
  validateFileUpload,
};
