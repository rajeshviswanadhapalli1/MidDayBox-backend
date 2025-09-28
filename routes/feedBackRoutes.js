const express = require("express");
const router = express.Router();
const feedbackController = require("../controllers/feedBackController");
// const authMiddleware = require("../middleware/authMiddleware"); // if you need user auth
const { authenticateUser } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateUser);
// Submit feedback
router.post("/create", feedbackController.createFeedback);

// Get all feedback (admin purpose)
router.get("/getAllFeedback", feedbackController.getAllFeedback);

module.exports = router;