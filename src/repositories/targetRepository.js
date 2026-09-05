import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../config/firebase.js";

// In-memory target cache
const monthTargetsCache = {};

/**
 * Get monthly target in Satang from cache or Firestore.
 */
export async function getMonthlyTargetSatangFromFirestore(monthKey) {
  if (monthTargetsCache[monthKey] !== undefined) {
    return monthTargetsCache[monthKey];
  }

  try {
    const targetDoc = await getDoc(doc(db, "targets", monthKey));
    if (targetDoc.exists()) {
      const data = targetDoc.data();
      const val = data.monthlyTargetSatang || 0;
      monthTargetsCache[monthKey] = val;
      return val;
    }
  } catch (error) {
    console.warn(`Could not load target for ${monthKey}:`, error);
  }

  monthTargetsCache[monthKey] = 0;
  return 0;
}

/**
 * Save monthly target transactionally and update cache.
 */
export async function saveMonthlyTargetToFirestore(monthKey, monthlyTargetSatang, currentUserIdentifier) {
  const targetRef = doc(db, "targets", monthKey);
  await runTransaction(db, async transaction => {
    const sfDoc = await transaction.get(targetRef);
    const payload = {
      monthKey,
      monthlyTargetSatang,
      updatedAt: serverTimestamp(),
      updatedBy: currentUserIdentifier
    };
    if (!sfDoc.exists()) {
      payload.createdAt = serverTimestamp();
      payload.createdBy = currentUserIdentifier;
      transaction.set(targetRef, payload);
    } else {
      const existing = sfDoc.data() || {};
      payload.createdAt = existing.createdAt || serverTimestamp();
      payload.createdBy = existing.createdBy || currentUserIdentifier;
      transaction.set(targetRef, payload, { merge: true });
    }
  });

  monthTargetsCache[monthKey] = monthlyTargetSatang;
}

export function getCachedMonthTargets() {
  return { ...monthTargetsCache };
}

export function setCachedMonthTarget(monthKey, satang) {
  monthTargetsCache[monthKey] = satang;
}

export function clearMonthTargetsCache() {
  for (const key in monthTargetsCache) {
    delete monthTargetsCache[key];
  }
}
