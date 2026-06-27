// ================= FIREBASE =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================= CONFIG =================
const firebaseConfig = {
  apiKey: "AIzaSyDrLuZwJ_GZieK1vAA_KGQlY1DRe4Z2BRQ",
  authDomain: "sgasaintvalentines.firebaseapp.com",
  databaseURL: "https://sgasaintvalentines-default-rtdb.firebaseio.com",
  projectId: "sgasaintvalentines",
  storageBucket: "sgasaintvalentines.firebasestorage.app",
  messagingSenderId: "521888807329",
  appId: "1:521888807329:web:66dd6faca9c0e8c28273e0"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// ================= EMAILJS =================
emailjs.init("drByTK1umJR4gqRMI");

const SERVICE_ID = "service_quh25un";
const TEMPLATE_ID = "template_k23fp7p";
const ALERT_TEMPLATE_ID = "template_32bhn0v";

const ALERT_EMAIL = "Matias_riboldi@eton.edu.mx";
const CC_EMAILS = "gerardo.g@eton.edu.mx ana_arjona@eton.edu.mx";

// ================= LIMITS =================
const GIFT_LIMITS = {
  roses: 250
};

// ================= HELPERS =================
function generateOrderID(gifts) {
  // Get the first school from the gifts array
  const school = gifts[0]?.school || "UNKNOWN";
  
  // Get current timestamp
  const timestamp = Date.now();
  
  // Generate 4 random digits
  const random = Math.floor(1000 + Math.random() * 9000); // ensures 4 digits (1000-9999)
  
  return `${school}-${timestamp}-${random}`;
}

function collectGifts() {
  const gifts = [];
  document.querySelectorAll(".gift-block").forEach(block => {
    gifts.push({
      recipientName: block.querySelector('[name="recipientName"]').value,
      school: block.querySelector('[name="school"]').value,
      grade: block.querySelector('[name="grade"]').value,
      giftType: block.querySelector('[name="giftType"]').value
    });
  });
  return gifts;
}

function formatGiftsForEmail(gifts) {
  return gifts.map((g, i) =>
    `Gift ${i + 1}
Recipient: ${g.recipientName}
School: ${g.school}
Grade: ${g.grade}
Gift: ${g.giftType}`
  ).join("\n\n");
}

function countGiftsByType(gifts) {
  return gifts.reduce((acc, g) => {
    acc[g.giftType] = (acc[g.giftType] || 0) + 1;
    return acc;
  }, {});
}

// ================= COUNTERS + ALERTS =================
async function updateCountersAndCheckLimits(giftCounts) {
  for (const [giftType, qty] of Object.entries(giftCounts)) {
    const counterRef = ref(database, `giftCounters/${giftType}`);

    const result = await runTransaction(counterRef, current => {
      return (current || 0) + qty;
    });

    const newTotal = result.snapshot.val();
    const limit = GIFT_LIMITS[giftType];

    // crossed limit → send alert once
    if (limit && newTotal >= limit && newTotal - qty < limit) {
      await emailjs.send(SERVICE_ID, ALERT_TEMPLATE_ID, {
        to_email: ALERT_EMAIL,
        cc_email: CC_EMAILS,
        gift_type: giftType,
        current_count: newTotal,
        limit: limit,
        timestamp: new Date().toLocaleString()
      });
    }
  }
}

// ================= FORM SUBMIT =================
const orderForm = document.getElementById("orderForm");
let isSubmitting = false; // Prevent double submissions

orderForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Prevent double submission
  if (isSubmitting) {
    return;
  }

  // PAYMENT METHOD REQUIRED
  const paymentMethod = document.getElementById("paymentMethod").value;
  if (!paymentMethod) {
    alert("Please select a payment method.");
    return;
  }

  // TOTAL PRICE
  const totalPrice = parseFloat(
    document.getElementById("totalPrice").textContent
  );

  // ✅ VALIDATE MINIMUM AMOUNT
  if (totalPrice <= 0) {
    alert("Please select at least one gift before placing your order.");
    return;
  }

  // BUYER INFO
  const buyerName = orderForm.name.value;
  const buyerEmail = orderForm.email.value;
  const anonymous = orderForm.anonymous.value; // YES / NO

  // GIFTS
  const gifts = collectGifts();
  if (gifts.length === 0) {
    alert("Please add at least one gift.");
    return;
  }

  // ✅ SET SUBMITTING STATE
  isSubmitting = true;
  const submitBtn = orderForm.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = "Processing...";
  submitBtn.disabled = true;

  try {
    // ================= GENERATE CUSTOM ORDER ID =================
    const orderID = generateOrderID(gifts);
    
    // ================= SEND CONFIRMATION EMAIL FIRST =================
    // If email fails, order won't be saved
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
      to_email: buyerEmail,
      to_name: buyerName,
      order_id: orderID,
      gifts: formatGiftsForEmail(gifts),
      payment_method: paymentMethod,
      amount: `$${totalPrice.toFixed(2)}`,
      payment_deadline: "February 10, 2026",
      reply_to: buyerEmail
    });

    // ================= SAVE ORDER ONLY IF EMAIL SUCCEEDED =================
    const orderRef = ref(database, `orders/${orderID}`);

    await set(orderRef, {
      orderID, // store the custom ID in the order data
      buyerName,
      buyerEmail,
      anonymous,
      gifts,
      paymentMethod,
      totalAmount: totalPrice,
      status: "pending",
      createdAt: Date.now()
    });

    // ================= UPDATE COUNTERS =================
    const giftCounts = countGiftsByType(gifts);
    await updateCountersAndCheckLimits(giftCounts);

    // ================= REDIRECT ALWAYS =================
    window.location.href =
      `payment.html?order=${orderID}&amount=${totalPrice}&method=${paymentMethod}`;

  } catch (err) {
    console.error(err);
    
    // Check if it's an email error
    if (err.text || err.status) {
      alert("❌ Unable to send confirmation email. Please check your email address and try again.\n\nIf the problem persists, contact support.");
    } else {
      alert("❌ Error placing order. Please try again or contact support if the problem persists.");
    }
    
    // ✅ RESET BUTTON STATE
    isSubmitting = false;
    submitBtn.textContent = originalBtnText;
    submitBtn.disabled = false;
  }
});