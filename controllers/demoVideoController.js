const DemoVideo = require('../models/DemoVideo');
const { deleteS3Object } = require('../utils/s3Helpers');

const AUDIENCES = ['school', 'parent', 'deliveryboy'];

function formatVideo(doc) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description || '',
    audience: doc.audience,
    videoUrl: doc.videoUrl,
    thumbnailUrl: doc.thumbnailUrl,
    durationSeconds: doc.durationSeconds,
    sortOrder: doc.sortOrder,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function roleToAudience(role) {
  if (role === 'school') return 'school';
  if (role === 'parent') return 'parent';
  if (role === 'deliveryboy') return 'deliveryboy';
  return null;
}

// ——— Admin ———

exports.createDemoVideo = async (req, res) => {
  try {
    const { title, description, audience, durationSeconds, sortOrder } = req.body;

    if (!title || !audience) {
      return res.status(400).json({
        success: false,
        message: 'title and audience are required'
      });
    }

    if (!AUDIENCES.includes(audience)) {
      return res.status(400).json({
        success: false,
        message: 'audience must be school, parent, or deliveryboy'
      });
    }

    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];

    if (!videoFile || !thumbFile) {
      return res.status(400).json({
        success: false,
        message: 'video and thumbnail files are required'
      });
    }

    const video = new DemoVideo({
      title: String(title).trim(),
      description: description ? String(description).trim() : '',
      audience,
      videoUrl: videoFile.location,
      videoKey: videoFile.key,
      thumbnailUrl: thumbFile.location,
      thumbnailKey: thumbFile.key,
      durationSeconds: durationSeconds ? Number(durationSeconds) : null,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      isActive: true,
      uploadedBy: req.user?.id
    });

    await video.save();

    res.status(201).json({
      success: true,
      message: 'Demo video uploaded successfully',
      video: formatVideo(video)
    });
  } catch (error) {
    console.error('createDemoVideo error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload demo video'
    });
  }
};

exports.getAdminDemoVideos = async (req, res) => {
  try {
    const { audience, isActive, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (audience) {
      if (!AUDIENCES.includes(audience)) {
        return res.status(400).json({ success: false, message: 'Invalid audience' });
      }
      filter.audience = audience;
    }
    if (isActive !== undefined) {
      filter.isActive = String(isActive) === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      DemoVideo.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      DemoVideo.countDocuments(filter)
    ]);

    res.json({
      success: true,
      videos: items.map(formatVideo),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('getAdminDemoVideos error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminDemoVideoById = async (req, res) => {
  try {
    const video = await DemoVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Demo video not found' });
    }
    res.json({ success: true, video: formatVideo(video) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateDemoVideo = async (req, res) => {
  try {
    const video = await DemoVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Demo video not found' });
    }

    const { title, description, audience, durationSeconds, sortOrder, isActive } = req.body;

    if (title) video.title = String(title).trim();
    if (description !== undefined) video.description = String(description).trim();
    if (audience) {
      if (!AUDIENCES.includes(audience)) {
        return res.status(400).json({ success: false, message: 'Invalid audience' });
      }
      video.audience = audience;
    }
    if (durationSeconds !== undefined) video.durationSeconds = Number(durationSeconds) || null;
    if (sortOrder !== undefined) video.sortOrder = Number(sortOrder);
    if (isActive !== undefined) video.isActive = String(isActive) === 'true' || isActive === true;

    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];

    if (videoFile) {
      await deleteS3Object(video.videoKey);
      video.videoUrl = videoFile.location;
      video.videoKey = videoFile.key;
    }
    if (thumbFile) {
      await deleteS3Object(video.thumbnailKey);
      video.thumbnailUrl = thumbFile.location;
      video.thumbnailKey = thumbFile.key;
    }

    await video.save();

    res.json({
      success: true,
      message: 'Demo video updated',
      video: formatVideo(video)
    });
  } catch (error) {
    console.error('updateDemoVideo error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteDemoVideo = async (req, res) => {
  try {
    const video = await DemoVideo.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Demo video not found' });
    }

    await deleteS3Object(video.videoKey);
    await deleteS3Object(video.thumbnailKey);
    await DemoVideo.deleteOne({ _id: video._id });

    res.json({ success: true, message: 'Demo video deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ——— Mobile app (school / parent / delivery boy) ———

exports.getDemoVideosForApp = async (req, res) => {
  try {
    const audience = roleToAudience(req.user.role);
    if (!audience) {
      return res.status(403).json({
        success: false,
        message: 'Demo videos are not available for this account type'
      });
    }

    const videos = await DemoVideo.find({ audience, isActive: true }).sort({
      sortOrder: 1,
      createdAt: -1
    });

    res.json({
      success: true,
      audience,
      videos: videos.map(formatVideo)
    });
  } catch (error) {
    console.error('getDemoVideosForApp error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
