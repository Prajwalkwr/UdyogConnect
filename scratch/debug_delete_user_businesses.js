const path = require('path');
const dotenv = require('dotenv');
// Load .env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { connectDb, Business, Product, Service, Review, Booking } = require('../server/db');

async function debugDelete() {
  console.log('Connecting to DB...');
  await connectDb();

  const BusinessMDL = Business();
  const ProductMDL = Product();
  const ServiceMDL = Service();
  const ReviewMDL = Review();
  const BookingMDL = Booking();

  const targetNames = ['bull', 'Sunar Craft House', 'Lalitpur Home Essentials'];
  console.log('Searching for target businesses:', targetNames);

  for (const name of targetNames) {
    try {
      const bizs = await BusinessMDL.find({ name: name });
      console.log(`\nFound ${bizs.length} businesses matching name "${name}":`);
      
      for (const biz of bizs) {
        console.log('--- Business Details ---');
        console.log('ID:', biz._id, 'Type of ID:', typeof biz._id);
        console.log('Name:', biz.name);
        console.log('Owner ID:', biz.ownerId, 'Type of Owner ID:', typeof biz.ownerId);
        console.log('Verified Status:', biz.verified);
        
        console.log('Trying to perform deletion actions for this business ID...');
        
        // 1. Delete Business
        console.log('1. Deleting Business...');
        let bizDelResult;
        try {
          bizDelResult = await BusinessMDL.deleteOne({ _id: biz._id });
          console.log('Mongoose deleteOne result:', bizDelResult);
        } catch (err) {
          console.log('Mongoose deleteOne failed. Error:', err.message);
          if (BusinessMDL.collection) {
            console.log('Bypassing Mongoose, trying raw collection deleteOne...');
            bizDelResult = await BusinessMDL.collection.deleteOne({ _id: biz._id });
            console.log('Raw collection deleteOne result:', bizDelResult);
          }
        }

        // 2. Delete Products
        console.log('2. Deleting Products...');
        try {
          const prodDelResult = await ProductMDL.deleteMany({ businessId: biz._id });
          console.log('Mongoose deleteMany products result:', prodDelResult);
        } catch (err) {
          console.log('Mongoose deleteMany products failed. Error:', err.message);
          if (ProductMDL.collection) {
            console.log('Bypassing Mongoose, trying raw collection deleteMany products...');
            const prodDelResult = await ProductMDL.collection.deleteMany({ businessId: biz._id });
            console.log('Raw collection deleteMany products result:', prodDelResult);
          }
        }

        // 3. Delete Services
        console.log('3. Deleting Services...');
        try {
          const servDelResult = await ServiceMDL.deleteMany({ businessId: biz._id });
          console.log('Mongoose deleteMany services result:', servDelResult);
        } catch (err) {
          console.log('Mongoose deleteMany services failed. Error:', err.message);
          if (ServiceMDL.collection) {
            console.log('Bypassing Mongoose, trying raw collection deleteMany services...');
            const servDelResult = await ServiceMDL.collection.deleteMany({ businessId: biz._id });
            console.log('Raw collection deleteMany services result:', servDelResult);
          }
        }
      }
    } catch (err) {
      console.error(`Error processing ${name}:`, err);
    }
  }

  process.exit(0);
}

debugDelete();
