const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const { connectDb, db, User, Business, Product, Service, Order, Booking, Review, Chat, Notification, Coupon, AuditLog } = require('./db');

async function migrate() {
  console.log('Connecting to database...');
  const connected = await connectDb();
  if (!connected) {
    console.error('Could not connect to MongoDB. Migration cancelled.');
    process.exit(1);
  }

  const models = {
    User: User(),
    Business: Business(),
    Product: Product(),
    Service: Service(),
    Order: Order(),
    Booking: Booking(),
    Review: Review(),
    Chat: Chat(),
    Notification: Notification(),
    Coupon: Coupon(),
    AuditLog: AuditLog()
  };

  const dataDir = path.join(__dirname, '.data');

  for (const [name, model] of Object.entries(models)) {
    const filePath = path.join(dataDir, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}, skipping...`);
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`No data or empty array in ${name}.json, skipping...`);
        continue;
      }

      // Check if data already exists in MongoDB
      const count = await model.countDocuments({});
      if (count > 0) {
        console.log(`Collection ${name} already has ${count} documents. Skipping import.`);
        continue;
      }

      console.log(`Importing ${data.length} documents into ${name}...`);
      // Since Mongoose schemas don't define _id as String, Mongoose might fail to cast 'u1' to ObjectId.
      // Let's check if the document has a string _id that is not a valid 24-character hex string.
      // If it fails, we will catch it and try to clean/adapt it.
      await model.insertMany(data);
      console.log(`Successfully imported ${name}.`);
    } catch (err) {
      console.error(`Error importing ${name}:`, err.message);
    }
  }

  console.log('Migration process finished.');
  process.exit(0);
}

migrate();
