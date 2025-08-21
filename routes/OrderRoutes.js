import express from "express";
import { createOrder, markOrderAsDelivered, cancelOrder } from "../controllers/OrderController.js";
import Order from "../models/Order.js";
const router = express.Router();

router.post("/", createOrder);

// Mark an order as delivered
router.put("/:id/delivered", async (req, res) => {
  try {
    const order = await markOrderAsDelivered(req.params.id);
    res.json({ message: 'Order marked as delivered', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cancel an order
router.put("/:id/cancel", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    const order = await cancelOrder(req.params.id, userId);
    res.json({ message: 'Order cancelled successfully', order });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Add this GET route to fetch orders by userId
router.get("/", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    const orders = await Order.find({ userId });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;