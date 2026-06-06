const Razorpay = require('razorpay');
const systemEventBus = require('../telemetry/eventBus');

let razorpay = null;
let billingStatus = 'DOWN';

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (keyId && keySecret) {
  try {
    razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    billingStatus = 'UP';
    console.log('   ✅ Razorpay Billing Client initialized successfully.');
    
    // Defer the event emit to let the reconciler register its listener first
    process.nextTick(() => {
      systemEventBus.emit('infra:billing:state', 'info', { status: 'UP' });
    });
  } catch (err) {
    console.error('❌ Failed to initialize Razorpay client:', err.message);
    billingStatus = 'DOWN';
    process.nextTick(() => {
      systemEventBus.emit('infra:billing:state', 'warn', { status: 'DOWN' });
    });
  }
} else {
  console.warn('⚠️ Razorpay credentials missing. Operating in degraded billing mode.');
  billingStatus = 'DOWN';
  process.nextTick(() => {
    systemEventBus.emit('infra:billing:state', 'warn', { status: 'DOWN' });
  });
}

module.exports = {
  getRazorpayClient: () => razorpay,
  getBillingStatus: () => billingStatus,
  setBillingStatus: (status) => {
    billingStatus = status;
    systemEventBus.emit('infra:billing:state', 'info', { status });
  }
};
