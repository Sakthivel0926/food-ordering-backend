import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  name: { 
    type: String, 
    required: [true, 'Name is required'] 
  },
  address: { 
    type: String, 
    required: [true, 'Address is required'] 
  },
  contact: { 
    type: String, 
    required: [true, 'Contact is required'] 
  },
  location: { 
    type: String, 
    required: [true, 'Location is required'] 
  },
  paymentMethod: { 
    type: String, 
    required: [true, 'Payment method is required'] 
  },
  items: [{
    foodId: { 
      type: mongoose.Schema.Types.Mixed, 
      ref: "FoodItem",
      required: [true, 'Food item ID is required'],
      validate: {
        validator: function(v) {
          if (typeof v === 'string') {
            return mongoose.Types.ObjectId.isValid(v);
          } else if (v instanceof mongoose.Types.ObjectId) {
            return true;
          }
          return false;
        },
        message: props => `${props.value} is not a valid food ID!`
      }
    },
    name: { 
      type: String, 
      required: [true, 'Food name is required'] 
    },
    image: { 
      type: String, 
      required: [true, 'Food image is required'] 
    },
    quantity: { 
      type: Number, 
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    price: { 
      type: Number, 
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative']
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled', 'delivered'],
    default: 'pending'
  },
  estimatedDeliveryTime: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  totalAmount: {
    type: Number,
    required: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Calculate total amount before saving
orderSchema.pre('save', function(next) {
  if (this.isModified('items') || this.isNew) {
    this.totalAmount = this.items.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
  }
  next();
});

// Add text index for search
orderSchema.index({
  'name': 'text',
  'address': 'text',
  'location': 'text',
  'items.name': 'text'
});

export default mongoose.model("Order", orderSchema);