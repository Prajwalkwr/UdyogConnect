const path = require('path');
const dotenv = require('dotenv');
// Load the .env from root workspace
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { connectDb, Business, Product, Service, Review, Booking } = require('../server/db');

async function testDelete() {
  console.log('Connecting to DB with MONGODB_URI:', process.env.MONGODB_URI ? 'FOUND' : 'NOT FOUND');
  await connectDb();

  const BusinessMDL = Business();
  const ProductMDL = Product();
  const ServiceMDL = Service();
  const ReviewMDL = Review();
  const BookingMDL = Booking();

  const testId = 'b1'; // Let's test with the default seed business 'b1'
  console.log(`Testing deletion of business with ID: ${testId}`);

  try {
    const biz = await BusinessMDL.findById(testId);
    console.log('Business found:', biz ? biz.name : 'Not found');

    if (biz) {
      console.log('Attempting deleteOne on Business...');
      const delBiz = await BusinessMDL.deleteOne({ _id: testId });
      console.log('Delete business result:', delBiz);

      console.log('Attempting deleteMany on Products...');
      const delProd = await ProductMDL.deleteMany({ businessId: testId });
      console.log('Delete products result:', delProd);

      console.log('Attempting deleteMany on Services...');
      const delServ = await ServiceMDL.deleteMany({ businessId: testId });
      console.log('Delete services result:', delServ);
    }
  } catch (err) {
    console.error('ERROR ENCOUNTERED:', err);
  }

  process.exit(0);
}

testDelete();
