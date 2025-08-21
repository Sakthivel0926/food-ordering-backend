import Order from "../models/Order.js";
import FoodItem from "../models/FoodItem.js";
import mongoose from "mongoose";

const useTransactions = process.env.NODE_ENV === 'production';

// Function to clean up delivered orders
export const cleanupDeliveredOrders = async () => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    // Find orders that are marked as completed and were delivered more than 30 minutes ago
    const result = await Order.deleteMany({
      status: 'completed',
      deliveredAt: { $lte: thirtyMinutesAgo }
    });
    
    return result;
  } catch (error) {
    console.error('Error cleaning up delivered orders:', error);
    throw error;
  }
};

// Schedule the cleanup to run every hour
setInterval(cleanupDeliveredOrders, 60 * 60 * 1000);

// Run cleanup on startup
cleanupDeliveredOrders().catch(console.error);

// Mark an order as delivered
// Cancel an order
export const cancelOrder = async (orderId, userId) => {
  try {
    const order = await Order.findOneAndUpdate(
      { 
        _id: orderId, 
        userId, // Ensure the order belongs to the user
        status: { $in: ['pending', 'processing'] } // Only allow cancellation for these statuses
      },
      { 
        status: 'cancelled',
        cancelledAt: new Date()
      },
      { new: true }
    );
    
    if (!order) {
      throw new Error('Order not found or cannot be cancelled');
    }
    
    // Restore food item quantities
    const bulkOps = order.items.map(item => ({
      updateOne: {
        filter: { _id: item.foodId },
        update: { $inc: { quantity: item.quantity } }
      }
    }));
    
    await FoodItem.bulkWrite(bulkOps);
    
    return order;
  } catch (error) {
    console.error('Error cancelling order:', error);
    throw error;
  }
};

export const markOrderAsDelivered = async (orderId) => {
  try {
    const order = await Order.findByIdAndUpdate(
      orderId,
      { 
        status: 'completed',
        deliveredAt: new Date()
      },
      { new: true }
    );
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    return order;
  } catch (error) {
    console.error('Error marking order as delivered:', error);
    throw error;
  }
};

export const createOrder = async (req, res) => {
  const session = useTransactions ? await mongoose.startSession() : null;
  
  try {
    if (session) await session.startTransaction();
    
    const { items, ...orderData } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }
    
    // Validate and process each item
    const processedItems = [];
    
    for (const item of items) {
      
      if (!item.foodId) {
        return res.status(400).json({ 
          message: 'Each item must have a foodId',
          item
        });
      }
      
      // Extract foodId whether it's a string or object
      let foodId = item.foodId;
      if (typeof foodId === 'object' && foodId !== null) {
        foodId = foodId._id || foodId;
      }
      
      // Validate foodId
      if (!mongoose.Types.ObjectId.isValid(foodId)) {
        return res.status(400).json({ 
          message: `Invalid foodId format: ${foodId}`,
          item
        });
      }
      
      // Find the food item
      const foodItem = await FoodItem.findById(foodId).lean();
      if (!foodItem) {
        return res.status(404).json({ 
          message: `Food item not found with ID: ${foodId}`,
          foodId,
          item
        });
      }
      
      // Validate quantity
      const quantity = parseInt(item.quantity, 10);
      if (isNaN(quantity) || quantity < 1) {
        return res.status(400).json({ 
          message: `Invalid quantity for ${foodItem.name}`,
          item
        });
      }
      
      // Check stock
      if (foodItem.quantity < quantity) {
        return res.status(400).json({ 
          message: `Insufficient quantity for ${foodItem.name}. Available: ${foodItem.quantity}`,
          foodId: foodItem._id,
          available: foodItem.quantity,
          requested: quantity
        });
      }
      
      processedItems.push({
        foodId: foodItem._id,
        name: foodItem.name,
        image: foodItem.image,
        quantity: quantity,
        price: foodItem.price
      });
    }
    
    // Update quantities in database
    const bulkOps = processedItems.map(item => ({
      updateOne: {
        filter: { _id: item.foodId, quantity: { $gte: item.quantity } },
        update: { $inc: { quantity: -item.quantity } }
      }
    }));
    
    const bulkResult = await FoodItem.bulkWrite(bulkOps, { session });
    
    // Calculate total amount
    const totalAmount = processedItems.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
    
    // Create the order with estimated delivery time (25-30 minutes from now)
    const estimatedDeliveryMinutes = 25 + Math.floor(Math.random() * 6); // Random between 25-30 minutes
    const estimatedDeliveryTime = new Date(Date.now() + estimatedDeliveryMinutes * 60 * 1000);
    
    const order = new Order({
      userId: orderData.userId,
      name: orderData.name,
      address: orderData.address,
      contact: orderData.contact,
      location: orderData.location,
      paymentMethod: orderData.paymentMethod,
      items: processedItems,
      status: 'pending',
      totalAmount: totalAmount,
      estimatedDeliveryTime: estimatedDeliveryTime
    });
    
    const savedOrder = await order.save({ session });
    
    if (session) await session.commitTransaction();
    
    res.status(201).json({
      message: 'Order created successfully',
      order: savedOrder
    });
  } catch (err) {
    console.error('Error creating order:', {
      name: err.name,
      message: err.message,
      code: err.code,
      keyPattern: err.keyPattern,
      keyValue: err.keyValue,
      errors: err.errors,
      stack: err.stack
    });
    
    if (session) await session.abortTransaction();
    
    let errorMessage = 'Failed to create order. Please try again.';
    let statusCode = 400;
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
      errorMessage = 'Validation Error: ' + Object.values(err.errors).map(e => e.message).join(', ');
    } else if (err.name === 'MongoServerError' && err.code === 11000) {
      errorMessage = 'Duplicate key error: ' + JSON.stringify(err.keyValue);
    } else if (process.env.NODE_ENV !== 'production') {
      errorMessage = err.message;
    }
    
    const errorResponse = { message: errorMessage };
    
    // Add more details in development
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.error = {
        name: err.name,
        stack: err.stack,
        ...(err.errors && { errors: err.errors }),
        ...(err.keyPattern && { keyPattern: err.keyPattern })
      };
    }
    
    res.status(statusCode).json(errorResponse);
  } finally {
    if (session) session.endSession();
  }
};