// src/services/emailService.js
// SRE-grade transactional email automation service formulating premium onboarding, payment recovery, and trial ending HTML logs

const fs = require('fs');
const path = require('path');

// Target directory path for local transactional mail simulation logs
const SCRATCH_DIR = '/home/alan/.gemini/antigravity/brain/e3f3a95f-fa6f-4818-8187-71d761799ed1/scratch';
const LOG_FILE_PATH = path.join(SCRATCH_DIR, 'emails-log.json');

/**
 * Ensures scratch directory structure is created before writing logs
 */
function ensureDirectoryExists() {
  if (!fs.existsSync(SCRATCH_DIR)) {
    fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  }
}

/**
 * Saves a transactional email record to our local sandbox JSON logs
 */
function logEmailToSandbox(emailData) {
  try {
    ensureDirectoryExists();
    let logs = [];
    if (fs.existsSync(LOG_FILE_PATH)) {
      const existing = fs.readFileSync(LOG_FILE_PATH, 'utf8');
      logs = JSON.parse(existing || '[]');
    }
    logs.push({
      id: `mail-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...emailData
    });
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('⚠️ [Email Service Exception] Failed to record simulated mailer log:', err.message);
  }
}

/**
 * 1. Generate Welcome Onboarding email HTML
 */
function getOnboardingHtml(username) {
  return `
    <div style="font-family: Arial, sans-serif; background-color: #05050a; color: #ffffff; padding: 2rem; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid rgba(99,102,241,0.2);">
      <div style="text-align: center; margin-bottom: 2rem;">
        <h1 style="color: #6366f1; margin: 0; font-size: 24px;">✨ Welcome to Antigravity Scholar!</h1>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">Your ultimate synchronized productivity focus corridor</p>
      </div>
      <p style="font-size: 15px; line-height: 1.6; color: #e2e8f0;">Hey <strong>${username}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #e2e8f0;">You have successfully registered. Ready to multiply study streaks, unlock achievements, and collaborate in real-time rooms with peers worldwide?</p>
      <div style="background-color: rgba(99,102,241,0.08); padding: 1rem; border-radius: 8px; margin: 1.5rem 0; border: 1px dashed rgba(99,102,241,0.25);">
        <h4 style="margin: 0 0 8px 0; color: #6366f1;">🚀 Focus Quickstart Steps:</h4>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
          <li>Enter an active study room in the <strong>Study Corridors</strong> tab.</li>
          <li>Double-click the <strong>Pomodoro timer</strong> to kick off your focus sprint.</li>
          <li>Interact with the <strong>Academic AI coach</strong> for notes summary cards.</li>
        </ul>
      </div>
      <div style="text-align: center; margin-top: 2rem;">
        <a href="http://localhost:5173" style="background: linear-gradient(135deg, #6366f1, #a855f7); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);">Launch Workspace Now 🚀</a>
      </div>
      <p style="font-size: 12px; color: #64748b; margin-top: 3rem; text-align: center;">Secured by Stripe billing. Cancel anytime. support@antigravity.io</p>
    </div>
  `;
}

/**
 * 2. Generate Payment Recovery email HTML
 */
function getPaymentRecoveryHtml(username, billingPortalUrl) {
  return `
    <div style="font-family: Arial, sans-serif; background-color: #05050a; color: #ffffff; padding: 2rem; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #ef4444;">
      <div style="text-align: center; margin-bottom: 2rem;">
        <h1 style="color: #ef4444; margin: 0; font-size: 22px;">⚠️ Action Required: Subscription Payment Failed</h1>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">Update your credit card details to retain premium benefits</p>
      </div>
      <p style="font-size: 15px; line-height: 1.6; color: #e2e8f0;">Hey <strong>${username}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #e2e8f0;">Your latest Stripe subscription invoice payment failed. We have placed your account in a **7-day billing grace period** so you don't lose access to unlimited corridors, notes scanning, and AI guidance.</p>
      <div style="background-color: rgba(239,68,68,0.08); padding: 1.25rem; border-radius: 8px; margin: 1.5rem 0; border: 1px dashed rgba(239,68,68,0.25);">
        <p style="margin: 0; font-size: 14px; color: #fca5a5; line-height: 1.5;">💡 If billing details are not resolved, your premium membership benefits will be automatically revoked on <strong>${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toDateString()}</strong>.</p>
      </div>
      <div style="text-align: center; margin-top: 2rem;">
        <a href="${billingPortalUrl || 'http://localhost:5000/api/v1/billing/portal'}" style="background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);">Update Billing Information 💳</a>
      </div>
      <p style="font-size: 12px; color: #64748b; margin-top: 3rem; text-align: center;">Secured by Stripe customer billing portals. support@antigravity.io</p>
    </div>
  `;
}

/**
 * 3. Generate Trial Ending / Quota Exhaustion email HTML
 */
function getTrialEndingHtml(username, remainingCredits) {
  return `
    <div style="font-family: Arial, sans-serif; background-color: #05050a; color: #ffffff; padding: 2rem; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #eab308;">
      <div style="text-align: center; margin-bottom: 2rem;">
        <h1 style="color: #eab308; margin: 0; font-size: 22px;">⏳ Scholar AI Free Credits Exhausting</h1>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">Unlock Cognitive Elite Pro to ensure seamless tutor coaching access</p>
      </div>
      <p style="font-size: 15px; line-height: 1.6; color: #e2e8f0;">Hey <strong>${username}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #e2e8f0;">You have consumed **90%** of your monthly free academic AI credits. Only <strong>${remainingCredits}</strong> standard response blocks remain for this active billing interval.</p>
      <div style="background-color: rgba(234,179,8,0.08); padding: 1rem; border-radius: 8px; margin: 1.5rem 0; border: 1px dashed rgba(234,179,8,0.25);">
        <h4 style="margin: 0 0 6px 0; color: #eab308;">🔒 Premium Pro Privileges Unlocked:</h4>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
          <li>Unlimited Academic AI Chat Companion triggers</li>
          <li>High-speed OCR document notes uploads</li>
          <li>3x Streak Freezes replenished monthly</li>
        </ul>
      </div>
      <div style="text-align: center; margin-top: 2rem;">
        <a href="http://localhost:5173" style="background-color: #eab308; color: #000000; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 15px rgba(234, 179, 8, 0.4);">Upgrade to Scholar Pro 🚀</a>
      </div>
      <p style="font-size: 12px; color: #64748b; margin-top: 3rem; text-align: center;">Cancel anytime. support@antigravity.io</p>
    </div>
  `;
}

/**
 * Central router triggering lifecycle mailer dispatches
 */
async function sendTransactionalEmail({ emailType, recipientEmail, username, metadata = {} }) {
  let subject = '';
  let html = '';

  switch (emailType) {
    case 'onboarding':
      subject = '✨ Welcome to Antigravity Scholar! Let\'s build study streaks.';
      html = getOnboardingHtml(username);
      break;
    case 'payment_recovery':
      subject = '⚠️ Action Required: Subscription payment failed';
      html = getPaymentRecoveryHtml(username, metadata.billingPortalUrl);
      break;
    case 'trial_ending':
      subject = '⏳ Scholar AI Free Credits Exhausting (90% Consumed)';
      html = getTrialEndingHtml(username, metadata.remainingCredits || 5);
      break;
    default:
      throw new Error(`Unsupported email transactional trigger: ${emailType}`);
  }

  // 1. Log structural payload line to stdout via SRE console format
  console.log(JSON.stringify({
    level: 'info',
    timestamp: new Date().toISOString(),
    event: 'transactional_email_sent',
    recipientEmail,
    emailType,
    subject
  }));

  // 2. Persist full details to sandbox log file
  logEmailToSandbox({
    emailType,
    recipientEmail,
    username,
    subject,
    html,
    metadata
  });

  return { success: true, subject, recipientEmail };
}

module.exports = {
  sendTransactionalEmail
};
