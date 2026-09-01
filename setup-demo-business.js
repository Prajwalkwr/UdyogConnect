#!/usr/bin/env node
/**
 * Setup Script: Register praa@G.com account with business
 * Registers a pre-configured business profile
 */

const axios = require('axios');

// Configuration
const API_BASE = process.env.API_URL || 'http://localhost:3000';
const DEMO_EMAIL = 'praa@G.com';
const DEMO_PASSWORD = 'A12345678';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
};

async function setupAccount() {
  try {
    log.info(`Setting up account for ${DEMO_EMAIL}...`);

    // Step 1: Register the account
    log.info('Step 1: Registering user account...');
    let loginToken = null;
    let userId = null;

    try {
      const registerRes = await axios.post(`${API_BASE}/api/auth/register`, {
        name: 'Cafe Owner',
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        confirmPassword: DEMO_PASSWORD,
        phone: '9800000001',
        role: 'seller',
      });
      log.success(`Account created: ${DEMO_EMAIL}`);
    } catch (err) {
      if (err.response?.status === 400 && err.response?.data?.message?.includes('already exists')) {
        log.warn(`Account already exists: ${DEMO_EMAIL}`);
      } else {
        throw err;
      }
    }

    // Step 2: Login to get token
    log.info('Step 2: Logging in...');
    const loginRes = await axios.post(`${API_BASE}/api/auth/login`, {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });

    loginToken = loginRes.data.token;
    userId = loginRes.data.user.id || loginRes.data.user._id;
    log.success(`Logged in successfully. Token: ${loginToken.slice(0, 20)}...`);

    // Step 3: Register business (like Cafe XYZ)
    log.info('Step 3: Registering business...');
    const businessData = {
      name: 'Cafe XYZ',
      category: 'Restaurants & Food',
      subcategory: 'Cafe',
      location: 'Thamel, Kathmandu',
      price: '150-500',
      description: 'A cozy and modern café in the heart of Thamel, Kathmandu. We serve fresh coffee, delicious food and a warm atmosphere for everyone.',
      phone: '9812345678',
      contactEmail: DEMO_EMAIL,
      website: 'www.cafexyz.com',
      hours: '09:00 - 18:00',
      latitude: 27.7161,
      longitude: 85.3256,
      registrationNumber: 'REG-2024-001',
      panVatNumber: 'PAN-123456789',
      deliveryAvailable: true,
      isOpen: true,
      deliveryRadiusKm: 5,
      offeringType: 'both',
      logoUrl: 'https://via.placeholder.com/300x300?text=Cafe+XYZ+Logo',
      coverUrl: 'https://via.placeholder.com/1200x400?text=Cafe+XYZ+Cover',
    };

    let businessId = null;
    try {
      const businessRes = await axios.post(`${API_BASE}/api/businesses`, businessData, {
        headers: { Authorization: `Bearer ${loginToken}` },
      });
      businessId = businessRes.data.business._id || businessRes.data.business.id;
      log.success(`Business registered: Cafe XYZ (ID: ${businessId})`);
    } catch (err) {
      if (err.response?.status === 409) {
        log.warn('Business already exists. Fetching existing business...');
        // Business already exists, fetch it
        const businessesRes = await axios.get(`${API_BASE}/api/businesses`, {
          headers: { Authorization: `Bearer ${loginToken}` },
        });
        const cafeBiz = businessesRes.data.find((b) => b.name === 'Cafe XYZ');
        if (cafeBiz) {
          businessId = cafeBiz._id || cafeBiz.id;
          log.warn(`Found existing business: ${businessId}`);
        }
      } else {
        throw err;
      }
    }

    // Step 4: Register products for the business
    if (businessId) {
      log.info('Step 4: Adding products to business...');

      const products = [
        {
          businessId,
          name: 'Hot Coffee',
          category: 'Beverages',
          subcategory: 'Hot Drinks',
          description: 'Freshly brewed coffee with rich aroma',
          price: 150,
          discount: 0,
          stock: 100,
          sku: 'COFFEE-001',
          brand: 'Cafe XYZ',
        },
        {
          businessId,
          name: 'Chicken Burger',
          category: 'Food',
          subcategory: 'Burgers',
          description: 'Juicy chicken patty with fresh veggies',
          price: 250,
          discount: 10,
          stock: 50,
          sku: 'BURGER-001',
          brand: 'Cafe XYZ',
        },
        {
          businessId,
          name: 'Veg Momos',
          category: 'Food',
          subcategory: 'Snacks',
          description: 'Steamed momos with spicy sauce',
          price: 120,
          discount: 5,
          stock: 75,
          sku: 'MOMO-001',
          brand: 'Cafe XYZ',
        },
      ];

      for (const product of products) {
        try {
          await axios.post(`${API_BASE}/api/products`, product, {
            headers: { Authorization: `Bearer ${loginToken}` },
          });
          log.success(`Product added: ${product.name}`);
        } catch (err) {
          if (err.response?.status === 409) {
            log.warn(`Product already exists: ${product.name}`);
          } else {
            log.error(`Failed to add product ${product.name}: ${err.message}`);
          }
        }
      }
    }

    // Step 5: Register service
    if (businessId) {
      log.info('Step 5: Adding service to business...');
      const service = {
        businessId,
        name: 'Coffee Catering Service',
        description: 'We provide special coffee catering for events and meetings',
        price: 1500,
        duration: 60,
        slots: ['09:00 - 10:00', '11:00 - 12:00', '14:00 - 15:00'],
        staff: ['Barista', 'Server'],
        homeService: true,
      };

      try {
        await axios.post(`${API_BASE}/api/services`, service, {
          headers: { Authorization: `Bearer ${loginToken}` },
        });
        log.success(`Service added: ${service.name}`);
      } catch (err) {
        if (err.response?.status === 409) {
          log.warn(`Service already exists: ${service.name}`);
        } else {
          log.error(`Failed to add service: ${err.message}`);
        }
      }
    }

    log.success('\n========================================');
    log.success('Setup Complete!');
    log.success('========================================');
    log.info(`Email: ${DEMO_EMAIL}`);
    log.info(`Password: ${DEMO_PASSWORD}`);
    log.info(`Business: Cafe XYZ`);
    log.info(`\nYou can now login with these credentials!`);
    log.success('========================================\n');
  } catch (error) {
    log.error(`Setup failed: ${error.message}`);
    if (error.response?.data) {
      log.error(`Response: ${JSON.stringify(error.response.data)}`);
    }
    process.exit(1);
  }
}

// Run setup
setupAccount();
