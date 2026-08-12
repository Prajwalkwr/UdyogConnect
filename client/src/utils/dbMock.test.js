import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';

// Import the db module using commonjs require in vitest
const { connectDb, db, Business, Product } = require('../../../server/db');

describe('MockModel Deletion Operations', () => {
  let BusinessMDL;
  let ProductMDL;

  beforeAll(async () => {
    // Initialize mock database models
    await connectDb();
  });

  beforeEach(() => {
    BusinessMDL = Business();
    ProductMDL = Product();
  });

  it('correctly executes deleteOne', async () => {
    const businesses = await BusinessMDL.find({});
    if (businesses.length > 0) {
      const firstId = businesses[0]._id;
      const res = await BusinessMDL.deleteOne({ _id: firstId });
      expect(res.deletedCount).toBe(1);

      const found = await BusinessMDL.findById(firstId);
      expect(found).toBeNull();
    }
  });

  it('correctly executes deleteMany', async () => {
    const shopId = 'test_shop_delete_many';
    
    await ProductMDL.create({ businessId: shopId, name: 'Product A', category: 'Grocery', price: 100, description: 'Desc A' });
    await ProductMDL.create({ businessId: shopId, name: 'Product B', category: 'Grocery', price: 200, description: 'Desc B' });
    await ProductMDL.create({ businessId: 'other_shop', name: 'Product C', category: 'Grocery', price: 300, description: 'Desc C' });

    const beforeDelete = await ProductMDL.find({ businessId: shopId });
    expect(beforeDelete.length).toBe(2);

    const deleteRes = await ProductMDL.deleteMany({ businessId: shopId });
    expect(deleteRes.deletedCount).toBe(2);

    const afterDelete = await ProductMDL.find({ businessId: shopId });
    expect(afterDelete.length).toBe(0);

    const otherShopProducts = await ProductMDL.find({ businessId: 'other_shop' });
    expect(otherShopProducts.length).toBeGreaterThanOrEqual(1);
  });
});
