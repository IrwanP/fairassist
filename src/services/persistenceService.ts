/**
 * FairAssist - Firestore Owner-Isolated Persistence Service
 * Persists user financial session state under /users/{uid}/interactions/current_session
 * British English spelling used throughout.
 */

import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { 
  EvidenceItem, 
  FinancialObligation, 
  ChatMessage, 
  ActionOutcomeTrackingState 
} from "../types";

export interface FairAssistPersistedState {
  userId?: string;
  evidenceList: EvidenceItem[];
  obligations: FinancialObligation[];
  availableCash: number | null;
  nextSalaryDate: string | null;
  nextSalaryAmount: number | null;
  essentialExpenses: number | null;
  chatMessages: ChatMessage[];
  approvedActionIds: Record<string, { isApproved: boolean; approvedAt: string }>;
  readyRequestActionIds: Record<string, { isReady: boolean; readyAt: string }>;
  actionOutcomeTracking: Record<string, ActionOutcomeTrackingState>;
  isUserActionExecuted: boolean;
  updatedAt?: any;
}

/**
 * Sanitize an evidence item to strip out non-serializable, binary, blob, or oversized fields
 * such as File objects, base64 strings, or temporary browser blob URLs.
 */
function sanitizeEvidenceItem(item: EvidenceItem): EvidenceItem {
  return {
    id: item.id || `ev-${Date.now()}`,
    title: item.title || 'Evidence Item',
    category: item.category || 'Other financial evidence',
    fileName: item.fileName || 'evidence.png',
    fileType: item.fileType || 'image/png',
    uploadDate: item.uploadDate || new Date().toISOString(),
    syntheticFlag: true,
    extractedDetails: {
      category: item.extractedDetails?.category || '',
      institutionName: item.extractedDetails?.institutionName || '',
      productName: item.extractedDetails?.productName || '',
      amountDue: item.extractedDetails?.amountDue ?? null as any,
      dueDate: item.extractedDetails?.dueDate || '',
      referenceNumber: item.extractedDetails?.referenceNumber || '',
      notes: item.extractedDetails?.notes || '',
    },
    geminiExtractedDetails: item.geminiExtractedDetails ? {
      category: item.geminiExtractedDetails.category || '',
      institutionName: item.geminiExtractedDetails.institutionName || '',
      productName: item.geminiExtractedDetails.productName || '',
      amountDue: item.geminiExtractedDetails.amountDue ?? null as any,
      dueDate: item.geminiExtractedDetails.dueDate || '',
      referenceNumber: item.geminiExtractedDetails.referenceNumber || '',
      confidence: item.geminiExtractedDetails.confidence || 'Needs review',
      summaryStatement: item.geminiExtractedDetails.summaryStatement || '',
    } : undefined,
    userConfirmedDetails: item.userConfirmedDetails ? {
      category: item.userConfirmedDetails.category || '',
      institutionName: item.userConfirmedDetails.institutionName || '',
      productName: item.userConfirmedDetails.productName || '',
      amountDue: item.userConfirmedDetails.amountDue ?? null as any,
      dueDate: item.userConfirmedDetails.dueDate || '',
      referenceNumber: item.userConfirmedDetails.referenceNumber || '',
      notes: item.userConfirmedDetails.notes || '',
    } : undefined,
    confidence: item.confidence || 'Medium',
    summaryStatement: item.summaryStatement || '',
    fileSize: item.fileSize || '120 KB',
    verifiedStatus: item.verifiedStatus || 'Unverified',
    verifiedBadge: item.verifiedBadge || '',
    // Intentionally omit: previewUrl, file, rawFileContent, rawBinary
  };
}

/**
 * Deep sanitization helper to replace `undefined` with `null` or remove it,
 * ensuring clean Firestore write payloads.
 */
function removeUndefinedValues(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedValues);
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedValues(value);
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Load user interaction state from Cloud Firestore.
 * Target document: /users/{uid}/interactions/current_session
 */
export async function loadUserInteractionState(uid: string): Promise<FairAssistPersistedState | null> {
  if (!uid) return null;
  try {
    const docRef = doc(db, "users", uid, "interactions", "current_session");
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    const data = snapshot.data();
    return {
      userId: data.userId || uid,
      evidenceList: Array.isArray(data.evidenceList) ? data.evidenceList : [],
      obligations: Array.isArray(data.obligations) ? data.obligations : [],
      availableCash: data.availableCash ?? null,
      nextSalaryDate: data.nextSalaryDate ?? null,
      nextSalaryAmount: data.nextSalaryAmount ?? null,
      essentialExpenses: data.essentialExpenses ?? null,
      chatMessages: Array.isArray(data.chatMessages) ? data.chatMessages : [],
      approvedActionIds: data.approvedActionIds || {},
      readyRequestActionIds: data.readyRequestActionIds || {},
      actionOutcomeTracking: data.actionOutcomeTracking || {},
      isUserActionExecuted: Boolean(data.isUserActionExecuted),
    };
  } catch (error) {
    console.error("Failed to load user interaction state from Firestore:", error);
    return null;
  }
}

/**
 * Save user interaction state to Cloud Firestore.
 * Target document: /users/{uid}/interactions/current_session
 */
export async function saveUserInteractionState(
  uid: string,
  state: Omit<FairAssistPersistedState, 'userId' | 'updatedAt'>
): Promise<void> {
  if (!uid) return;

  try {
    // 1. Sanitize evidence list (exclude raw images/blobs/preview URLs)
    const sanitizedEvidence = (state.evidenceList || []).map(sanitizeEvidenceItem);

    // 2. Cap chat messages to the most recent 50
    const cappedChatMessages = (state.chatMessages || []).slice(-50);

    // 3. Construct payload ensuring owner UID is present and all fields are clean
    const payload = removeUndefinedValues({
      userId: uid,
      evidenceList: sanitizedEvidence,
      obligations: state.obligations || [],
      availableCash: state.availableCash ?? null,
      nextSalaryDate: state.nextSalaryDate ?? null,
      nextSalaryAmount: state.nextSalaryAmount ?? null,
      essentialExpenses: state.essentialExpenses ?? null,
      chatMessages: cappedChatMessages,
      approvedActionIds: state.approvedActionIds || {},
      readyRequestActionIds: state.readyRequestActionIds || {},
      actionOutcomeTracking: state.actionOutcomeTracking || {},
      isUserActionExecuted: Boolean(state.isUserActionExecuted),
      updatedAt: serverTimestamp(),
    });

    const docRef = doc(db, "users", uid, "interactions", "current_session");
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    console.error("Failed to save user interaction state to Firestore:", error);
  }
}
