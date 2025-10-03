const Feedback = require("../models/FeedBack");
const USER_TYPE_MAP = {
  parent: "Parent",
  deliveryboy: "DeliveryBoy",
  school: "SchoolRegistration",
};
exports.createFeedback = async (req, res) => {
  try {
    const { message, userType,subject } = req.body;
    const userId = req.user.id; // assuming auth middleware sets req.user
    console.log(message, userId);
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
     if (!subject) {
      return res.status(400).json({ error: "Subject is required" });
    }
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // const normalizedType = userType.charAt(0).toUpperCase() + userType.slice(1).toLowerCase();
const normalizedType = USER_TYPE_MAP[userType.toLowerCase()];
    if (!normalizedType) {
      return res.status(400).json({ error: "Invalid userType" });
    }
    const feedback = new Feedback({
        userId,
        userType:normalizedType,
        subject,
      message,
    });
    console.log("Feedback created:", feedback);

    await feedback.save();

    res.status(201).json({
      message: "Feedback submitted successfully",
      feedback,
    });
  } catch (error) {
    console.error("Error creating feedback:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// GET /api/feedback (optional: list all feedbacks)
exports.getAllFeedback = async (req, res) => {
  try {
    const feedbacks = await Feedback.find().populate("userId", "name email");
    res.json(feedbacks);
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ error: "Server error" });
  }
};
