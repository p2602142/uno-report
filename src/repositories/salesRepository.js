import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  runTransaction,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../config/firebase.js";

/**
 * Fetch a single sale record by date key (YYYY-MM-DD).
 */
export async function getSaleByDateFromFirestore(date) {
  if (!date) return null;
  const saleDocRef = doc(db, "sales", date);
  const snap = await getDoc(saleDocRef);
  if (snap.exists()) {
    return {
      ...snap.data(),
      _id: snap.id
    };
  }
  return null;
}

/**
 * Fetch sales between two ISO dates (YYYY-MM-DD), inclusive.
 */
export async function getSalesFromFirestore(startDate, endDate) {
  const q = query(
    collection(db, "sales"),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  );
  const snapshot = await getDocs(q);
  const rows = [];
  snapshot.forEach(document => {
    rows.push({
      ...document.data(),
      _id: document.id
    });
  });

  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/**
 * Save or update a daily sale record transactionally.
 */
export async function saveSaleToFirestore(payload, currentUserIdentifier) {
  const saleDocRef = doc(db, "sales", payload.date);
  await runTransaction(db, async transaction => {
    const sfDoc = await transaction.get(saleDocRef);
    const dataToSave = {
      ...payload,
      updatedAt: serverTimestamp(),
      updatedBy: currentUserIdentifier
    };

    if (!sfDoc.exists()) {
      dataToSave.createdAt = serverTimestamp();
      dataToSave.createdBy = currentUserIdentifier;
      transaction.set(saleDocRef, dataToSave);
    } else {
      const existingData = sfDoc.data() || {};
      dataToSave.createdAt = existingData.createdAt || serverTimestamp();
      dataToSave.createdBy = existingData.createdBy || currentUserIdentifier;
      transaction.set(saleDocRef, dataToSave, { merge: true });
    }
  });
}

/**
 * Delete a sale record by date key.
 */
export async function deleteSaleFromFirestore(date) {
  await deleteDoc(doc(db, "sales", date));
}
