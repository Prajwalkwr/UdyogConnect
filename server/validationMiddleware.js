const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^9\d{9}$/;

// Helper to check if string looks like valid Mongo ObjectId or non-empty ID
const isValidId = (id) => {
  if (!id) return false;
  const str = String(id).trim();
  return /^[0-9a-fA-F]{24}$/.test(str) || str.length >= 1;
};

const validateRegistration = (req, res, next) => {
  const { name, email, password, confirmPassword, phone, role } = req.body || {};
  const errors = {};

  if (!name || !String(name).trim()) {
    errors.name = 'Name is required.';
  } else if (String(name).trim().length < 2) {
    errors.name = 'Name must be at least 2 characters long.';
  }

  if (!email || !String(email).trim()) {
    errors.email = 'Email address is required.';
  } else if (!EMAIL_REGEX.test(String(email).trim())) {
    errors.email = 'Please provide a valid email address.';
  }

  if (phone) {
    const cleanPhone = String(phone).trim();
    if (!PHONE_REGEX.test(cleanPhone)) {
      errors.phone = 'Phone number must be exactly 10 digits starting with 9.';
    }
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters long.';
  } else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must contain at least one letter and one number.';
  }

  if (confirmPassword && password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (role && !['customer', 'seller', 'rider', 'admin'].includes(role)) {
    errors.role = 'Invalid account role specified.';
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
      errors.phone = 'Phone number must be exactly 10 digits starting with 9.';
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
  const { name, price, quantity, stock, category, description } = req.body || {};
  const errors = {};

  if (!name || !String(name).trim()) {
    errors.name = 'Product name is required.';
  }

  const numPrice = Number(price);
  if (price === undefined || price === null || price === '' || isNaN(numPrice)) {
    errors.price = 'Valid price is required.';
  } else if (numPrice < 0) {
    errors.price = 'Price cannot be negative.';
  }

  const q = quantity !== undefined ? quantity : stock;
  const numQty = Number(q);
  if (q === undefined || q === null || q === '' || isNaN(numQty) || !Number.isInteger(numQty)) {
    errors.quantity = 'Valid integer stock quantity is required.';
  } else if (numQty < 0) {
    errors.quantity = 'Quantity cannot be negative.';
  }

  if (!category || !String(category).trim()) {
    errors.category = 'Category is required.';
  }

  if (description && String(description).trim().length < 10) {
    errors.description = 'Description must be at least 10 characters.';
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
      errors.phone = 'Delivery phone number must be 10 digits starting with 9.';
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
