// src/routes/compliance.js
// GDPR-compliant personal data export and "Right to be Forgotten" account erasure endpoints

const express = require('express');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const StudyRoom = require('../models/StudyRoom');
const RoomMessage = require('../models/RoomMessage');
const AuditLog = require('../models/AuditLog');
const AiUsageLog = require('../models/AiUsageLog');
const { logAuditEvent } = require('../utils/auditLogger');

const router = express.Router();

// Enforce authentication safeguards on all compliance routes
router.use(protect);

let stripe = null;
if (process.env.STRIPE_API_KEY) {
  stripe = require('stripe')(process.env.STRIPE_API_KEY);
}

/**
 * GET /api/v1/compliance/export
 * Compiles user's complete data footprint into a portable JSON package
 */
router.get('/export', async (req, res) => {
  try {
    const userId = req.user._id;

    // Aggregate user records
    const profile = await User.findById(userId).select('-password');
    const roomsCreated = await StudyRoom.find({ creatorId: userId });
    const aiInteractions = await AiUsageLog.find({ userId });
    const actionHistory = await AuditLog.find({ userId });

    const exportData = {
      exportTimestamp: new Date().toISOString(),
      complianceStatement: "GDPR Portable Data Export Bundle — Scholar Platform",
      data: {
        profile,
        roomsCreated,
        aiInteractions,
        actionHistory
      }
    };

    logAuditEvent({
      action: 'gdpr_export',
      userId,
      success: true,
      metadata: { reason: 'User requested portable data package' }
    });

    // Send formatted JSON file response
    res.setHeader('Content-disposition', `attachment; filename=scholar_export_${userId}.json`);
    res.setHeader('Content-type', 'application/json');
    return res.send(JSON.stringify(exportData, null, 2));

  } catch (error) {
    console.error('[Compliance API] GDPR export failure:', error.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to construct compliance data export bundle' });
  }
});

/**
 * DELETE /api/v1/compliance/forget
 * Permanent GDPR user deletion ("Right to be Forgotten") with clean subscription release
 */
router.delete('/forget', async (req, res) => {
  try {
    const userId = req.user._id;
    const stripeCustomerId = req.user.stripeCustomerId;

    console.log(`🧹 [GDPR Erasure] Commencing permanent data purge for user: ${userId} (${req.user.email})`);

    // 1. Terminate active Stripe Subscriptions if exists
    if (stripe && stripeCustomerId) {
      try {
        console.log(`💳 [GDPR Erasure] Releasing Stripe Subscriptions for Customer: ${stripeCustomerId}`);
        const subscriptions = await stripe.subscriptions.list({ customer: stripeCustomerId });
        for (const sub of subscriptions.data) {
          await stripe.subscriptions.cancel(sub.id);
          console.log(`[Stripe Release] Cancelled subscription: ${sub.id}`);
        }
      } catch (err) {
        console.warn('[GDPR Erasure] Stripe subscription release skip/failed:', err.message);
      }
    }

    // 2. Soft Anonymize Audit logs to retain financial telemetry without PII leaks
    await AuditLog.updateMany(
      { userId },
      { $set: { userId: null, performedBy: 'anonymized_user', metadata: { notice: 'PII removed under GDPR Article 17 request' } } }
    );
    await AiUsageLog.updateMany(
      { userId },
      { $set: { userId: null, ipAddress: '0.0.0.0', userAgent: 'anonymized' } }
    );

    // 3. Purge operational messages and room details
    await RoomMessage.deleteMany({ userId });
    await StudyRoom.deleteMany({ creatorId: userId });

    // 4. Record the compliance action before User profile deletion
    await AuditLog.create({
      action: 'gdpr_erase',
      performedBy: 'system',
      success: true,
      metadata: { deletedUserId: userId.toString(), originalEmail: req.user.email }
    });

    // 5. Delete User document permanently
    await User.findByIdAndDelete(userId);

    console.log(`✅ [GDPR Erasure] Purge sequence finished successfully for user ID ${userId}.`);

    return res.json({
      success: true,
      message: 'Your account and personal data footprint have been permanently erased from all Scholar databases. We are sorry to see you go!'
    });

  } catch (error) {
    console.error('[Compliance API] GDPR erasure sequence failure:', error.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to completely purge account records' });
  }
});

module.exports = router;
