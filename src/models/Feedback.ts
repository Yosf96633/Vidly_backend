import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedback extends Document {
  rating: number;
  tool: string;
  feedback: string;
  email?: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackSchema: Schema = new Schema({
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5'],
  },
  tool: {
    type: String,
    required: [true, 'Tool selection is required'],
    trim: true,
  },
  feedback: {
    type: String,
    required: [true, 'Feedback text is required'],
    trim: true,
    minlength: [10, 'Feedback must be at least 10 characters long'],
    maxlength: [2000, 'Feedback cannot exceed 2000 characters'],
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null,
    validate: {
      validator: function(v: string | null) {
        if (!v) return true;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(v);
      },
      message: 'Invalid email format'
    }
  },
  userAgent: {
    type: String,
    default: null,
  },
  ipAddress: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'feedbacks' // Explicitly set collection name
});

// Create indexes
FeedbackSchema.index({ tool: 1, createdAt: -1 });
FeedbackSchema.index({ rating: 1 });
FeedbackSchema.index({ email: 1 }, { sparse: true });

// Prevent model overwrite error
const Feedback = mongoose.models.Feedback || mongoose.model<IFeedback>('Feedback', FeedbackSchema);


export default Feedback;