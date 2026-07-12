export const SELLER_WORKFLOW_STEPS = [
  {
    key: 'signup',
    title: { en: 'Sign Up', ne: 'खाता खोल्नुहोस्' },
    description: {
      en: 'Create an account with your full name, email, phone number, and password.',
      ne: 'आफ्नो पूरा नाम, इमेल, फोन नम्बर र पासवर्डले खाता खोल्नुहोस्।',
    },
  },
  {
    key: 'register',
    title: { en: 'Register a Business', ne: 'व्यवसाय दर्ता गर्नुहोस्' },
    description: {
      en: 'Submit your business profile, address, contact details, logo, hours, and proof for admin review.',
      ne: 'आफ्नो व्यवसायको प्रोफाइल, ठेगाना, सम्पर्क विवरण, लोगो, समय र प्रमाण प्रशासकले जाँच्न पठाउनुहोस्।',
    },
  },
  {
    key: 'approval',
    title: { en: 'Wait for Approval', ne: 'स्वीकृति पर्खनुहोस्' },
    description: {
      en: 'Your business stays pending until the admin approves it. Approved shops can manage their own catalog and orders.',
      ne: 'प्रशासकले स्वीकृति दिनु अघि तपाईंको व्यवसाय पेन्डिङमा रहन्छ। स्वीकृत पसलहरूले आफ्नै सूची र अर्डर व्यवस्थापन गर्न सक्छन्।',
    },
  },
];

export const SELLER_DASHBOARD_SECTIONS = [
  {
    key: 'overview',
    label: { en: 'Dashboard', ne: 'ड्यासबोर्ड' },
    description: {
      en: 'Monitor business metrics, orders, and stock health for your own shop only.',
      ne: 'आफ्नै पसलका मेट्रिक, अर्डर र स्टक स्वास्थ्य निरीक्षण गर्नुहोस्।',
    },
  },
  {
    key: 'profile',
    label: { en: 'Business Profile', ne: 'व्यवसाय प्रोफाइल' },
    description: {
      en: 'Update your business name, address, hours, and media.',
      ne: 'आफ्नोव्यवसायको नाम, ठेगाना, समय र मिडिया अपडेट गर्नुहोस्।',
    },
  },
  {
    key: 'catalog',
    label: { en: 'Product & Service Management', ne: 'उत्पादन र सेवा व्यवस्थापन' },
    description: {
      en: 'Add, edit, remove, and manage products or services for your shop.',
      ne: 'आफ्नो पसलका उत्पादन वा सेवाहरू थप, सम्पादन, हटाउने र व्यवस्थापन गर्नुहोस्।',
    },
  },
  {
    key: 'orders',
    label: { en: 'Order Management', ne: 'अर्डर व्यवस्थापन' },
    description: {
      en: 'Accept, reject, prepare, and track orders for your shop.',
      ne: 'आफ्नो पसलका अर्डर स्वीकार, अस्वीकार, तयारी र ट्र्याक गर्नुहोस्।',
    },
  },
  {
    key: 'inventory',
    label: { en: 'Inventory Management', ne: 'इन्वेन्टरी व्यवस्थापन' },
    description: {
      en: 'Watch stock levels and keep important products available.',
      ne: 'स्टक स्तर अनुगमन गरेर महत्त्वपूर्ण सामान उपलब्ध राख्नुहोस्।',
    },
  },
  {
    key: 'customers',
    label: { en: 'Customer Management', ne: 'ग्राहक व्यवस्थापन' },
    description: {
      en: 'See customer activity and purchase history for your own business.',
      ne: 'आफ्नै व्यवसायका ग्राहक गतिविधि र खरिद इतिहास हेर्नुहोस्।',
    },
  },
  {
    key: 'reviews',
    label: { en: 'Reviews & Ratings', ne: 'समीक्षा र रेटिङ' },
    description: {
      en: 'Read customer feedback and reply to reviews.',
      ne: 'ग्राहक प्रतिक्रिया पढ़ी र समीक्षा जवाफ दिनुहोस्।',
    },
  },
  {
    key: 'promotions',
    label: { en: 'Promotions & Discounts', ne: 'प्रमोशन र छुट' },
    description: {
      en: 'Create discount offers and feature products for the shop.',
      ne: 'पसलका लागि छुट प्रस्ताव र featured उत्पादन सिर्जना गर्नुहोस्।',
    },
  },
  {
    key: 'analytics',
    label: { en: 'Reports & Analytics', ne: 'रिपोर्ट र विश्लेषण' },
    description: {
      en: 'Track daily, weekly, and monthly sales performance.',
      ne: 'दैनिक, साप्ताहिक र मासिक बिक्री प्रदर्शन ट्र्याक गर्नुहोस्।',
    },
  },
  {
    key: 'notifications',
    label: { en: 'Notifications', ne: 'सूचनाहरू' },
    description: {
      en: 'Receive alerts about orders, stock, reviews, and admin updates.',
      ne: 'अर्डर, स्टक, समीक्षा र प्रशासकीय अपडेटका सूचना प्राप्त गर्नुहोस्।',
    },
  },
  {
    key: 'settings',
    label: { en: 'Settings', ne: 'सेटिङ' },
    description: {
      en: 'Manage your account settings, email, and notifications.',
      ne: 'आफ्नो खाता सेटिङ, इमेल र सूचनाहरू व्यवस्थापन गर्नुहोस्।',
    },
  },
];

export function getSellerDashboardSections(lang = 'en') {
  return SELLER_DASHBOARD_SECTIONS.map((section) => ({
    ...section,
    label: section.label[lang] || section.label.en,
    description: section.description[lang] || section.description.en,
  }));
}

export function getSellerWorkflowSteps(lang = 'en') {
  return SELLER_WORKFLOW_STEPS.map((step) => ({
    ...step,
    title: step.title[lang] || step.title.en,
    description: step.description[lang] || step.description.en,
  }));
}

export function buildSellerProfilePayload(formValues) {
  return {
    name: formValues.name,
    location: formValues.location,
    category: formValues.category,
    hours: formValues.hours,
    phone: formValues.phone,
    contactEmail: formValues.contactEmail,
    description: formValues.description,
  };
}
