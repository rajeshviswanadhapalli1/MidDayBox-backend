const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const { authenticateUser, requireParent } = require('../middleware/auth');

// All routes require authentication and parent role
router.use(authenticateUser);
router.use(requireParent);

// Parent address routes
router.post('/add', addressController.addParentAddress);
router.get('/all', addressController.getParentAddresses);
router.put('/:addressId', addressController.updateParentAddress);
router.delete('/:addressId', addressController.deleteParentAddress);
router.patch('/:addressId/default', addressController.setDefaultAddress);

module.exports = router; 