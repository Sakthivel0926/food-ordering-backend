import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FoodItem from '../models/FoodItem.js';

dotenv.config();

const updateFoodItemsStock = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // First, check if there are any food items
    const count = await FoodItem.countDocuments();
    console.log(`Found ${count} food items in the database`);

    if (count === 0) {
      console.log('No food items found in the database');
      return;
    }

    // Get all food items
    const allItems = await FoodItem.find({});
    console.log('Current food items:', allItems);

    // Update all food items to have a stock of 10 if stock doesn't exist or is not a number
    const result = await FoodItem.updateMany(
      { $or: [
        { quantity: { $exists: false } },
        { quantity: { $type: 'null' } },
        { quantity: { $not: { $type: 'number' } } }
      ]},
      { $set: { stock: 10 } },
      { multi: true }
    );

    console.log('Update result:', result);
    console.log(`Updated ${result.nModified} food items with default stock value`);

    // Verify the update
    const updatedItems = await FoodItem.find({});
    console.log('Updated food items:', updatedItems);

    process.exit(0);
  } catch (error) {
    console.error('Error updating food items:', error);
    process.exit(1);
  }
};

updateFoodItemsStock();
