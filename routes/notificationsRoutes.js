const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// No auth required (called directly by app)
router.post('/fcm-token', notificationController.saveFcmToken);

module.exports = router;

