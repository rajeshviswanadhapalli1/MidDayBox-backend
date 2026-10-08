const FestivalWish = require('../models/FestivalWish');
const FestivalWishDismissal = require('../models/FestivalWishDismissal');
const { deleteStoredMedia } = require('../utils/s3Helpers');

const AUDIENCES = ['all', 'school', 'parent', 'deliveryboy'];
const APP_ROLES = ['school', 'parent', 'deliveryboy'];

function formatWish(doc) {
  return {
    id: doc._id,
    title: doc.title,
    message: doc.message || '',
    mediaType: doc.mediaType,
    mediaUrl: doc.mediaUrl,
    thumbnailUrl: doc.thumbnailUrl || null,
    audience: doc.audience,
    startDate: doc.startDate,
    endDate: doc.endDate,
    isActive: doc.isActive,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function audienceMatchesUser(audience, role) {
  return audience === 'all' || audience === role;
}

// ——— Admin ———

exports.createFestivalWish = async (req, res) => {
  try {
    const { title, message, mediaType, audience, startDate, endDate, sortOrder } = req.body;

    if (!title || !mediaType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'title, mediaType, startDate, endDate are required'
      });
    }

    if (!['image', 'video'].includes(mediaType)) {
      return res.status(400).json({ success: false, message: 'mediaType must be image or video' });
    }

    const aud = audience || 'all';
    if (!AUDIENCES.includes(aud)) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ success: false, message: 'Invalid startDate or endDate' });
    }

    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];

    let mediaUrl;
    let mediaKey;
    let thumbnailUrl = null;
    let thumbnailKey = null;

    if (mediaType === 'image') {
      if (!imageFile) {
        return res.status(400).json({ success: false, message: 'image file is required for mediaType image' });
      }
      mediaUrl = imageFile.location;
      mediaKey = imageFile.key;
    } else {
      if (!videoFile) {
        return res.status(400).json({ success: false, message: 'video file is required for mediaType video' });
      }
      mediaUrl = videoFile.location;
      mediaKey = videoFile.key;
      if (thumbFile) {
        thumbnailUrl = thumbFile.location;
        thumbnailKey = thumbFile.key;
      }
    }

    const wish = new FestivalWish({
      title: String(title).trim(),
      message: message ? String(message).trim() : '',
      mediaType,
      mediaUrl,
      mediaKey,
      thumbnailUrl,
      thumbnailKey,
      audience: aud,
      startDate: start,
      endDate: end,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      isActive: true,
      uploadedBy: req.user?.id
    });

    await wish.save();

    res.status(201).json({
      success: true,
      message: 'Festival wish created successfully',
      wish: formatWish(wish)
    });
  } catch (error) {
    console.error('createFestivalWish error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminFestivalWishes = async (req, res) => {
  try {
    const { audience, isActive, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (audience) filter.audience = audience;
    if (isActive !== undefined) filter.isActive = String(isActive) === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      FestivalWish.find(filter).sort({ sortOrder: 1, startDate: -1 }).skip(skip).limit(parseInt(limit)),
      FestivalWish.countDocuments(filter)
    ]);

    res.json({
      success: true,
      wishes: items.map(formatWish),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminFestivalWishById = async (req, res) => {
  try {
    const wish = await FestivalWish.findById(req.params.id);
    if (!wish) {
      return res.status(404).json({ success: false, message: 'Festival wish not found' });
    }
    res.json({ success: true, wish: formatWish(wish) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateFestivalWish = async (req, res) => {
  try {
    const wish = await FestivalWish.findById(req.params.id);
    if (!wish) {
      return res.status(404).json({ success: false, message: 'Festival wish not found' });
    }

    const { title, message, mediaType, audience, startDate, endDate, sortOrder, isActive } = req.body;

    if (title) wish.title = String(title).trim();
    if (message !== undefined) wish.message = String(message).trim();
    if (audience && AUDIENCES.includes(audience)) wish.audience = audience;
    if (startDate) wish.startDate = new Date(startDate);
    if (endDate) wish.endDate = new Date(endDate);
    if (sortOrder !== undefined) wish.sortOrder = Number(sortOrder);
    if (isActive !== undefined) wish.isActive = String(isActive) === 'true' || isActive === true;

    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];

    if (mediaType && ['image', 'video'].includes(mediaType)) {
      wish.mediaType = mediaType;
    }

    if (imageFile) {
      await deleteStoredMedia(wish.mediaKey);
      wish.mediaUrl = imageFile.location;
      wish.mediaKey = imageFile.key;
      wish.mediaType = 'image';
      wish.thumbnailUrl = null;
      wish.thumbnailKey = null;
    }
    if (videoFile) {
      await deleteStoredMedia(wish.mediaKey);
      wish.mediaUrl = videoFile.location;
      wish.mediaKey = videoFile.key;
      wish.mediaType = 'video';
    }
    if (thumbFile) {
      if (wish.thumbnailKey) await deleteStoredMedia(wish.thumbnailKey);
      wish.thumbnailUrl = thumbFile.location;
      wish.thumbnailKey = thumbFile.key;
    }

    await wish.save();
    res.json({ success: true, message: 'Festival wish updated', wish: formatWish(wish) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteFestivalWish = async (req, res) => {
  try {
    const wish = await FestivalWish.findById(req.params.id);
    if (!wish) {
      return res.status(404).json({ success: false, message: 'Festival wish not found' });
    }

    await deleteStoredMedia(wish.mediaKey);
    if (wish.thumbnailKey) await deleteStoredMedia(wish.thumbnailKey);
    await FestivalWishDismissal.deleteMany({ wishId: wish._id });
    await FestivalWish.deleteOne({ _id: wish._id });

    res.json({ success: true, message: 'Festival wish deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ——— Mobile app ———

exports.getActiveFestivalWish = async (req, res) => {
  try {
    const role = req.user.role;
    if (!APP_ROLES.includes(role)) {
      return res.json({ success: true, wish: null });
    }

    const now = new Date();
    const candidates = await FestivalWish.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [{ audience: 'all' }, { audience: role }]
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(10);

    if (candidates.length === 0) {
      return res.json({ success: true, wish: null });
    }

    const hidden = await FestivalWishDismissal.find({
      userId: req.user.id,
      role,
      wishId: { $in: candidates.map((w) => w._id) }
    }).select('wishId');

    const hiddenIds = new Set(hidden.map((h) => String(h.wishId)));
    const active = candidates.find((w) => !hiddenIds.has(String(w._id)));

    res.json({
      success: true,
      wish: active ? formatWish(active) : null
    });
  } catch (error) {
    console.error('getActiveFestivalWish error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Permanent hide — user tapped "Don't show again" / Hide */
exports.hideFestivalWish = async (req, res) => {
  try {
    const role = req.user.role;
    if (!APP_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    const wish = await FestivalWish.findById(req.params.id);
    if (!wish) {
      return res.status(404).json({ success: false, message: 'Festival wish not found' });
    }

    await FestivalWishDismissal.findOneAndUpdate(
      { wishId: wish._id, userId: req.user.id, role },
      { wishId: wish._id, userId: req.user.id, role },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Festival wish hidden permanently for this account'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
