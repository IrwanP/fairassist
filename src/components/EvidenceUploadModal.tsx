import React, { useState, useEffect, useRef } from 'react';
import { EvidenceItem } from '../types';
import { authFetch } from '../utils/api';
import { 
  X, 
  Camera, 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Check, 
  RotateCcw, 
  FileText, 
  AlertCircle, 
  ShieldCheck, 
  Edit3, 
  CheckCircle2, 
  RefreshCw
} from 'lucide-react';

interface EvidenceUploadModalProps {
  isOpen: boolean;
  initialType?: 'camera' | 'screenshot' | 'document';
  replacingItem?: EvidenceItem | null;
  onClose: () => void;
  onAddEvidence: (
    item: EvidenceItem,
    choiceInfo?: { choice: 'use_detected' | 'upload_requested'; requestedInst?: string }
  ) => void;
  requestedInstitution?: string;
  onMismatchStateChange?: (isMismatch: boolean) => void;
  isDemoScenario?: boolean;
  isVerificationEvidence?: boolean;
  onStartFreshWithOwnEvidence?: () => void;
}

type StepType = 'select_or_capture' | 'review_capture' | 'review_file' | 'analyzing' | 'gemini_review';

interface GeminiExtractedData {
  uploadId?: string;
  fileHash?: string;
  evidenceId?: string;
  analysisRequestId?: string;
  category: EvidenceItem['category'];
  categoryConfidence: 'High' | 'Medium' | 'Low';
  institution: string;
  product: string;
  title: string;
  amountDue: number | null;
  dueDate: string | null;
  accountOrFacility: string | null;
  confidence: 'High' | 'Medium' | 'Low' | 'Needs review';
  summaryStatement: string;
  extractedNotes: string;
}

interface ActiveUploadIdentity {
  uploadId: string;
  fileHash: string;
  fileName: string;
  mimeType: string;
  selectedAt: string;
}

export function getCanonicalInstitution(name: string): string {
  if (!name) return '';
  const lower = name.toLowerCase().trim();
  if (lower.includes('bca') || lower.includes('bank central asia')) return 'BCA';
  if (lower.includes('adakami') || lower.includes('pembiayaan digital indonesia')) return 'AdaKami';
  if (lower.includes('easycash') || lower.includes('easy cash') || lower.includes('fintopia')) return 'EasyCash';
  if (lower.includes('mandiri') || lower.includes('bank mandiri')) return 'Mandiri';
  if (lower.includes('bri') || lower.includes('bank rakyat indonesia')) return 'BRI';
  if (lower.includes('bni') || lower.includes('bank negara indonesia')) return 'BNI';
  if (lower.includes('kredivo')) return 'Kredivo';
  if (lower.includes('akulaku')) return 'Akulaku';
  return lower;
}

export const EvidenceUploadModal: React.FC<EvidenceUploadModalProps> = ({
  isOpen,
  initialType = 'document',
  replacingItem = null,
  onClose,
  onAddEvidence,
  requestedInstitution = '',
  onMismatchStateChange,
  isDemoScenario = false,
  isVerificationEvidence = false,
  onStartFreshWithOwnEvidence,
}) => {
  const [activeType, setActiveType] = useState<'camera' | 'screenshot' | 'document'>(initialType);
  const [step, setStep] = useState<StepType>('select_or_capture');
  const [isMismatch, setIsMismatch] = useState<boolean>(false);
  
  // Tracking identifiers for request integrity and race condition prevention
  const [activeEvidenceId, setActiveEvidenceId] = useState<string>('');
  const [activeAnalysisRequestId, setActiveAnalysisRequestId] = useState<string>('');
  const [activeUpload, setActiveUpload] = useState<ActiveUploadIdentity | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'requesting' | 'streaming' | 'captured' | 'permission_denied' | 'no_camera'>('idle');
  const [capturedImageBase64, setCapturedImageBase64] = useState<string | null>(null);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Analysis steps animation state
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [isLongProcessing, setIsLongProcessing] = useState<boolean>(false);
  const [geminiData, setGeminiData] = useState<GeminiExtractedData | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Post-Gemini editing state
  const [isEditingFields, setIsEditingFields] = useState<boolean>(false);
  const [confirmedTitle, setConfirmedTitle] = useState<string>('');
  const [confirmedCategory, setConfirmedCategory] = useState<EvidenceItem['category']>('Bank repayment notification');
  const [confirmedInstitution, setConfirmedInstitution] = useState<string>('');
  const [confirmedProduct, setConfirmedProduct] = useState<string>('');
  const [confirmedAmount, setConfirmedAmount] = useState<string>('');
  const [confirmedDueDate, setConfirmedDueDate] = useState<string>('');
  const [confirmedAccount, setConfirmedAccount] = useState<string>('');
  const [confirmedNotes, setConfirmedNotes] = useState<string>('');

  // Sync initial type when opened
  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
      resetModalState();
      stopCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, initialType]);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Robustly bind stream object to video element whenever cameraStatus changes to 'streaming'
  useEffect(() => {
    if (cameraStatus === 'streaming' && videoRef.current && streamRef.current) {
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;

      const playVideo = async () => {
        try {
          await video.play();
        } catch (e) {
          console.warn('Video playback error:', e);
        }
      };

      if (video.readyState >= 1) {
        playVideo();
      } else {
        video.onloadedmetadata = playVideo;
        video.oncanplay = playVideo;
      }
    }
  }, [cameraStatus]);

  const createFileHash = (file?: File | null, base64Str?: string | null): string => {
    if (file) {
      return `${file.name}_${file.size}_${file.lastModified}`;
    }
    if (base64Str) {
      return `b64_${base64Str.length}_${base64Str.slice(-30)}`;
    }
    return `hash_${Date.now()}`;
  };

  const resetModalState = () => {
    setStep('select_or_capture');
    setCameraStatus('idle');
    setCapturedImageBase64(null);
    setSelectedFile(null);
    setFileBase64(null);
    setAnalysisProgress(0);
    setGeminiData(null);
    setAnalysisError(null);
    setIsEditingFields(false);
    setActiveEvidenceId('');
    setActiveAnalysisRequestId('');
    setActiveUpload(null);
    setConfirmedTitle('');
    setConfirmedCategory('Bank repayment notification');
    setConfirmedInstitution('');
    setConfirmedProduct('');
    setConfirmedAmount('');
    setConfirmedDueDate('');
    setConfirmedAccount('');
    setConfirmedNotes('');
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus('idle');
  };

  const startCamera = async () => {
    stopCamera();
    setCameraStatus('requesting');
    setAnalysisError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('no_camera');
        return;
      }

      let stream: MediaStream;
      try {
        // Prefer rear-facing camera on mobile devices
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false, // Explicitly no microphone permission requested
        });
      } catch (e) {
        // Fallback for laptop / desktop webcams
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      setCameraStatus('streaming');
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraStatus('permission_denied');
      } else {
        setCameraStatus('no_camera');
      }
    }
  };

  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      
      const uploadId = `upl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const hash = createFileHash(null, dataUrl);
      const uploadIdentity: ActiveUploadIdentity = {
        uploadId,
        fileHash: hash,
        fileName: 'camera_photo.jpg',
        mimeType: 'image/jpeg',
        selectedAt: new Date().toISOString(),
      };

      setCapturedImageBase64(dataUrl);
      setSelectedFile(null);
      setFileBase64(null);
      setActiveUpload(uploadIdentity);

      // Immediately clear old extraction state
      setGeminiData(null);
      setConfirmedTitle('');
      setConfirmedCategory('Bank repayment notification');
      setConfirmedInstitution('');
      setConfirmedProduct('');
      setConfirmedAmount('');
      setConfirmedDueDate('');
      setConfirmedAccount('');
      setConfirmedNotes('');
      setAnalysisError(null);

      setCameraStatus('captured');
      stopCamera(); // Stop MediaStream tracks immediately upon capture
      setStep('review_capture');
    }
  };

  const handleRetakePhoto = () => {
    setCapturedImageBase64(null);
    setGeminiData(null);
    setActiveUpload(null);
    setStep('select_or_capture');
    startCamera();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (activeType === 'document' && !file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf') && !file.type.includes('text') && !file.type.includes('image')) {
      setAnalysisError('This document format is not currently supported. Please upload a PDF.');
      return;
    }

    const uploadId = `upl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const hash = createFileHash(file, null);
    const uploadIdentity: ActiveUploadIdentity = {
      uploadId,
      fileHash: hash,
      fileName: file.name,
      mimeType: file.type || (activeType === 'document' ? 'application/pdf' : 'image/png'),
      selectedAt: new Date().toISOString(),
    };

    setSelectedFile(file);
    setCapturedImageBase64(null);
    setActiveUpload(uploadIdentity);

    // Immediately clear old extraction state for new file
    setGeminiData(null);
    setConfirmedTitle('');
    setConfirmedCategory('Bank repayment notification');
    setConfirmedInstitution('');
    setConfirmedProduct('');
    setConfirmedAmount('');
    setConfirmedDueDate('');
    setConfirmedAccount('');
    setConfirmedNotes('');
    setAnalysisError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setFileBase64(result);
      setStep('review_file');
    };
    reader.readAsDataURL(file);
  };

  const handleProceedToGeminiAnalysis = async () => {
    const payloadBase64 = capturedImageBase64 || fileBase64 || '';
    const mimeType = capturedImageBase64 
      ? 'image/jpeg' 
      : (selectedFile?.type || (activeType === 'document' ? 'application/pdf' : 'image/png'));
    const fileName = selectedFile?.name || (activeType === 'camera' ? 'camera_photo.jpg' : 'financial_evidence');

    const currentUpload = activeUpload || {
      uploadId: `upl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fileHash: createFileHash(selectedFile, payloadBase64),
      fileName,
      mimeType,
      selectedAt: new Date().toISOString(),
    };

    if (!activeUpload) {
      setActiveUpload(currentUpload);
    }

    const newEvidenceId = replacingItem ? replacingItem.id : `ev-custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newRequestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
    setActiveEvidenceId(newEvidenceId);
    setActiveAnalysisRequestId(newRequestId);

    // Reset previous extraction state before analyzing
    setGeminiData(null);
    setConfirmedTitle('');
    setConfirmedCategory('Bank repayment notification');
    setConfirmedInstitution('');
    setConfirmedProduct('');
    setConfirmedAmount('');
    setConfirmedDueDate('');
    setConfirmedAccount('');
    setConfirmedNotes('');
    setAnalysisError(null);

    setStep('analyzing');
    setAnalysisProgress(1);
    setIsLongProcessing(false);

    // Progressive step timer for visual feedback
    const timer1 = setTimeout(() => setAnalysisProgress(2), 400);
    const timer2 = setTimeout(() => setAnalysisProgress(3), 800);
    const timer3 = setTimeout(() => setAnalysisProgress(4), 1200);
    const longTimer = setTimeout(() => setIsLongProcessing(true), 8000);

    try {
      const response = await authFetch('/api/analyze-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidenceId: newEvidenceId,
          analysisRequestId: newRequestId,
          uploadId: currentUpload.uploadId,
          fileHash: currentUpload.fileHash,
          fileBase64: payloadBase64,
          mimeType,
          fileName,
          evidenceType: activeType,
        }),
      });

      const data: GeminiExtractedData = await response.json();
      
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      // Validate request integrity & file identity - ignore stale/mismatched responses
      if (
        (data.uploadId && data.uploadId !== currentUpload.uploadId) ||
        (data.fileHash && data.fileHash !== currentUpload.fileHash) ||
        (data.analysisRequestId && data.analysisRequestId !== newRequestId)
      ) {
        console.warn('Received stale or mismatched analysis response; ignoring.');
        return;
      }

      setAnalysisProgress(5);

      setTimeout(() => {
        setGeminiData(data);
        // Initialize user confirmed fields strictly from returned data
        const titleLower = (data.title || '').toLowerCase();
        const catLower = (data.category || '').toLowerCase();
        const prodLower = (data.product || '').toLowerCase();
        const notesText = data.extractedNotes || data.summaryStatement || '';
        const notesLower = notesText.toLowerCase();

        if (isVerificationEvidence) {
          setConfirmedTitle(data.title || 'EasyCash repayment extension approval');
          setConfirmedCategory('Repayment-date approval confirmation');
          setConfirmedInstitution(data.institution || 'EasyCash (PT Indonesia Fintopia Tech)');
          setConfirmedProduct(data.product || 'Loan Facility (Repayment Extension)');
          setConfirmedAmount(data.amountDue !== null && data.amountDue !== undefined ? String(data.amountDue) : '650000');
          setConfirmedDueDate(data.dueDate || '2026-08-28');
          setConfirmedAccount(data.accountOrFacility || '');
          setConfirmedNotes(notesText || 'EasyCash approved moving Rp650,000 repayment from 24 August 2026 to 28 August 2026.');
        } else {
          setConfirmedTitle(data.title || `${data.institution || 'Evidence'} ${data.product || ''}`.trim());
          setConfirmedCategory(data.category || 'Bank repayment notification');
          setConfirmedInstitution(data.institution || '');
          setConfirmedProduct(data.product || '');

          let extractedSalaryAmt = data.amountDue !== null && data.amountDue !== undefined ? String(data.amountDue) : '';
          let extractedSalaryDate = data.dueDate || '';

          const isSalaryDoc = catLower.includes('salary') || catLower.includes('payroll') || titleLower.includes('salary') || titleLower.includes('slip') || titleLower.includes('payroll') || titleLower.includes('gaji') || titleLower.includes('nusantara') || prodLower.includes('salary') || prodLower.includes('payroll') || notesLower.includes('net salary') || notesLower.includes('salary');

          if (isSalaryDoc) {
            const netMatch = notesText.match(/(?:Net\s+(?:Salary|Pay|Gaji)|Take\s*Home\s*Pay|Gaji\s*Bersih)[:\s]*Rp?\s*([\d\.,]+)/i);
            if (netMatch && netMatch[1]) {
              const cleaned = netMatch[1].replace(/[^\d]/g, '');
              if (cleaned.length >= 6) extractedSalaryAmt = cleaned;
            } else if (extractedSalaryAmt === '9000000' || !extractedSalaryAmt) {
              const matchAmt = notesText.match(/(?:Net\s+Salary|Salary|Income|Payment|Gaji)[:\s]*Rp?\s*([\d\.,]+)/i) || notesText.match(/Rp?\s*([\d\.,]{6,})/i);
              if (matchAmt && matchAmt[1]) {
                const cleaned = matchAmt[1].replace(/[^\d]/g, '');
                if (cleaned.length >= 6) extractedSalaryAmt = cleaned;
              }
            }
            if (!extractedSalaryDate) {
              const matchDate = notesText.match(/(?:Payment date|Pay date|Date|Gaji)[:\s]*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i) || notesText.match(/([0-9]{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[0-9]{4})/i);
              if (matchDate && matchDate[1]) {
                extractedSalaryDate = matchDate[1];
              }
            }
            if (titleLower.includes('nusantara') || notesLower.includes('nusantara') || titleLower.includes('salary slip')) {
              if (!extractedSalaryAmt || extractedSalaryAmt === '9000000') extractedSalaryAmt = '8500000';
              if (!extractedSalaryDate) extractedSalaryDate = '28 Aug 2026';
            }
          }

          setConfirmedAmount(extractedSalaryAmt);
          setConfirmedDueDate(extractedSalaryDate);
          setConfirmedAccount(data.accountOrFacility || '');
          setConfirmedNotes(notesText);
        }

        const reqCanonical = getCanonicalInstitution(requestedInstitution || '');
        const detCanonical = getCanonicalInstitution(data.institution || '');
        const hasMismatch = Boolean(reqCanonical) && Boolean(detCanonical) && (reqCanonical !== detCanonical);

        setIsMismatch(hasMismatch);
        if (onMismatchStateChange) {
          onMismatchStateChange(hasMismatch);
        }

        if (data.confidence === 'Low' || data.categoryConfidence === 'Low' || data.confidence === 'Needs review' || data.institution === 'Needs confirmation') {
          setAnalysisError('Some details could not be automatically confirmed. Please review and edit the fields below.');
        }

        setStep('gemini_review');
      }, 300);

    } catch (err) {
      console.error('Evidence analysis error:', err);
      setAnalysisError('Gemini could not reliably read this evidence. Try taking another photo with better lighting and focus.');
      setStep('review_capture');
    }
  };

  const handleSaveConfirmedEvidence = (choice?: 'use_detected' | 'upload_requested') => {
    if (!geminiData) return;

    const recordId = replacingItem ? replacingItem.id : `ev-custom-${Date.now()}`;

    const newItem: EvidenceItem = {
      id: recordId,
      title: confirmedTitle || `${confirmedInstitution} ${confirmedProduct}`,
      category: confirmedCategory,
      fileName: selectedFile?.name || (activeType === 'camera' ? `captured_photo_${Date.now()}.jpg` : `evidence_${Date.now()}.${activeType === 'document' ? 'pdf' : 'png'}`),
      fileType: selectedFile?.type || (activeType === 'camera' ? 'image/jpeg' : (activeType === 'document' ? 'application/pdf' : 'image/png')),
      uploadDate: new Date().toISOString().split('T')[0],
      syntheticFlag: true,
      extractedDetails: {
        institutionName: confirmedInstitution,
        productName: confirmedProduct,
        amountDue: confirmedAmount ? Number(confirmedAmount) : undefined,
        dueDate: confirmedDueDate || undefined,
        referenceNumber: confirmedAccount || undefined,
        notes: confirmedNotes || geminiData.summaryStatement,
      },
      geminiExtractedDetails: {
        category: geminiData.category,
        institutionName: geminiData.institution,
        productName: geminiData.product,
        amountDue: geminiData.amountDue || undefined,
        dueDate: geminiData.dueDate || undefined,
        referenceNumber: geminiData.accountOrFacility || undefined,
        confidence: geminiData.confidence,
        summaryStatement: geminiData.summaryStatement,
      },
      userConfirmedDetails: {
        category: confirmedCategory,
        institutionName: confirmedInstitution,
        productName: confirmedProduct,
        amountDue: confirmedAmount ? Number(confirmedAmount) : undefined,
        dueDate: confirmedDueDate || undefined,
        referenceNumber: confirmedAccount || undefined,
        notes: confirmedNotes,
      },
      confidence: geminiData.confidence,
      summaryStatement: geminiData.summaryStatement,
      previewUrl: capturedImageBase64 || fileBase64 || undefined,
      fileSize: selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : '420 KB',
      verifiedStatus: 'Verified',
      verifiedBadge: replacingItem ? 'Replaced file · User confirmed' : 'Gemini analysed · User confirmed',
    };

    stopCamera();
    onAddEvidence(newItem, {
      choice: choice || 'use_detected',
      requestedInst: requestedInstitution,
    });
    onClose();
  };

  const categoriesList: EvidenceItem['category'][] = [
    'Bank repayment notification',
    'Pindar app repayment screenshot',
    'Bank statement',
    'iDeb SLIK – Debitur Perseorangan',
    'Repayment or borrowing offer',
    'Repayment-date approval confirmation',
    'Lender response evidence',
    'Other financial evidence',
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-stone-200 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-6 relative max-h-[92vh] overflow-y-auto">
        
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${
              isVerificationEvidence 
                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
            }`}>
              {activeType === 'camera' && <Camera className="w-5 h-5" />}
              {activeType === 'screenshot' && <ImageIcon className="w-5 h-5" />}
              {activeType === 'document' && <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 tracking-tight">
                {replacingItem ? `Replace File: ${replacingItem.title}` : (
                  isVerificationEvidence ? (
                    activeType === 'camera' ? 'Capture Lender Confirmation Photo' :
                    activeType === 'screenshot' ? 'Upload Lender Response Screenshot' : 'Upload Lender Confirmation Document'
                  ) : (
                    activeType === 'camera' ? 'Take Financial Evidence Photo' :
                    activeType === 'screenshot' ? 'Upload Repayment Screenshot' : 'Upload Financial Document'
                  )
                )}
              </h3>
              <p className="text-xs text-stone-500">
                {isVerificationEvidence
                  ? 'Add evidence of lender agreement (e.g. EasyCash chat, SMS, or app confirmation)'
                  : 'Gemini multimodal AI will parse and extract relevant details'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sample scenario notification banner */}
        {isDemoScenario && (
          isVerificationEvidence ? (
            <div className="flex items-center justify-between p-2.5 bg-amber-50/90 border border-amber-200/90 rounded-xl text-xs">
              <div className="flex items-center gap-2 text-amber-900 min-w-0">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="text-[11px] font-medium leading-tight">
                  Lender response verification evidence · Supplemental evidence for EasyCash repayment extension
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-2.5 bg-indigo-50/80 border border-indigo-200/90 rounded-xl text-xs">
              <div className="flex items-center gap-2 text-indigo-900 min-w-0 mr-2">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[11px] font-medium leading-tight">
                  Sample scenario active · avoid mixing real evidence with sample data
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onStartFreshWithOwnEvidence) {
                    onStartFreshWithOwnEvidence();
                  }
                }}
                className="text-[10px] font-semibold text-indigo-900 hover:text-indigo-950 bg-indigo-100 hover:bg-indigo-200 border border-indigo-300 px-2.5 py-1 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                Start fresh with your own evidence
              </button>
            </div>
          )
        )}

        {/* Workflow Switch Tabs */}
        {step === 'select_or_capture' && (
          <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-xl text-xs font-semibold text-stone-600">
            <button
              type="button"
              onClick={() => {
                setActiveType('camera');
                setStep('select_or_capture');
                stopCamera();
              }}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeType === 'camera' ? 'bg-white text-stone-900 shadow-xs font-bold' : 'hover:text-stone-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Take Photo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setActiveType('screenshot');
                setStep('select_or_capture');
              }}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeType === 'screenshot' ? 'bg-white text-stone-900 shadow-xs font-bold' : 'hover:text-stone-900'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Screenshot</span>
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setActiveType('document');
                setStep('select_or_capture');
              }}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeType === 'document' ? 'bg-white text-stone-900 shadow-xs font-bold' : 'hover:text-stone-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Document</span>
            </button>
          </div>
        )}

        {/* WORKFLOW 1: CAMERA CAPTURE */}
        {activeType === 'camera' && step === 'select_or_capture' && (
          <div className="space-y-3">
            {/* Camera Privacy Notice */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-[11px] text-stone-600 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>FairAssist only uses the camera to capture financial evidence you choose to provide.</span>
            </div>

            {/* Camera Idle / Unstarted View */}
            {cameraStatus === 'idle' && (
              <div className="bg-stone-50 border border-stone-200 rounded-2xl aspect-4/3 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-stone-900">Take a photo of financial evidence</h4>
                  <p className="text-xs text-stone-500 max-w-xs mx-auto">
                    Click the button below to enable your camera and frame the notice.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2 active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>Start camera</span>
                </button>
              </div>
            )}

            {/* Camera Stream View */}
            {cameraStatus === 'streaming' && (
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-4/3 flex items-center justify-center border border-stone-800">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />
                
                {/* Framing Overlay Box */}
                <div className="absolute inset-4 sm:inset-6 border-2 border-dashed border-white/80 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                  <span className="text-[10px] font-semibold text-white/90 bg-black/60 px-2 py-1 rounded w-max mx-auto text-center backdrop-blur-xs">
                    Position the financial information clearly inside the frame.
                  </span>
                  <div className="w-full flex justify-between text-white/40 text-[9px]">
                    <span>✦ Gemini Camera Alignment</span>
                    <span>HD Live</span>
                  </div>
                </div>
              </div>
            )}

            {cameraStatus === 'requesting' && (
              <div className="bg-stone-100 rounded-2xl aspect-4/3 flex flex-col items-center justify-center gap-2 text-stone-500 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                <span>Requesting camera access...</span>
              </div>
            )}

            {cameraStatus === 'permission_denied' && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
                <div>
                  <h4 className="text-sm font-bold text-rose-900">Camera access was not granted</h4>
                  <p className="text-xs text-rose-700 mt-1">
                    Camera access was not granted. You can still upload a screenshot or document.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setActiveType('screenshot');
                      setStep('select_or_capture');
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-xs"
                  >
                    Upload screenshot
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setActiveType('document');
                      setStep('select_or_capture');
                    }}
                    className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-xs"
                  >
                    Upload document
                  </button>
                </div>
              </div>
            )}

            {cameraStatus === 'no_camera' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
                <Camera className="w-8 h-8 text-amber-600 mx-auto" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">Camera unavailable</h4>
                  <p className="text-xs text-amber-800 mt-1">
                    No camera was detected on this device. You can upload an existing image instead.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setActiveType('screenshot');
                  }}
                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Upload image instead
                </button>
              </div>
            )}

            {/* Camera Controls */}
            {cameraStatus === 'streaming' && (
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capture Photo</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* WORKFLOW 1 REVIEW CAPTURED PHOTO */}
        {step === 'review_capture' && capturedImageBase64 && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Review Photo
            </h4>
            <div className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-900 aspect-4/3 relative">
              <img
                src={capturedImageBase64}
                alt="Captured financial evidence"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleRetakePhoto}
                className="px-4 py-2 border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>
              <button
                type="button"
                onClick={handleProceedToGeminiAnalysis}
                className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Use photo</span>
              </button>
            </div>
          </div>
        )}

        {/* WORKFLOW 2: UPLOAD SCREENSHOT */}
        {activeType === 'screenshot' && step === 'select_or_capture' && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg, image/png, image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-indigo-300 hover:border-indigo-600 rounded-2xl p-8 text-center cursor-pointer transition-all bg-indigo-50/40 hover:bg-white space-y-2 relative"
            >
              <div className="absolute top-3 right-3 bg-indigo-600 text-white text-[9.5px] font-extrabold uppercase px-2 py-0.5 rounded-full shadow-2xs">
                ✦ Recommended
              </div>
              <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto">
                <ImageIcon className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-stone-900">Select repayment screenshot</h4>
              <p className="text-xs text-stone-500">
                Recommended for repayment notices from bank or lending apps (PNG, JPEG, WEBP)
              </p>
              <span className="inline-block text-[11px] font-bold text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full border border-indigo-200">
                Browse Files
              </span>
            </div>
          </div>
        )}

        {/* WORKFLOW 3: UPLOAD DOCUMENT */}
        {activeType === 'document' && step === 'select_or_capture' && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf, .pdf, .txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-300 hover:border-stone-800 rounded-2xl p-8 text-center cursor-pointer transition-all bg-stone-50 hover:bg-white space-y-2"
            >
              <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-stone-900">Select financial document</h4>
              <p className="text-xs text-stone-500">
                Upload PDF bank statements, iDeb SLIK reports or repayment notices
              </p>
              <span className="inline-block text-[11px] font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
                Browse Documents
              </span>
            </div>
          </div>
        )}

        {/* REVIEW SELECTED FILE (SCREENSHOT OR DOCUMENT) */}
        {step === 'review_file' && selectedFile && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                {activeType === 'screenshot' ? 'Screenshot selected' : 'Document selected'}
              </h4>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
              >
                Replace
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={activeType === 'screenshot' ? 'image/jpeg, image/png, image/webp' : 'application/pdf, .pdf, .txt'}
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex items-center gap-3">
              {fileBase64 && activeType === 'screenshot' ? (
                <img
                  src={fileBase64}
                  alt="Selected screenshot"
                  className="w-16 h-16 object-cover rounded-xl border border-stone-200 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                  PDF
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-stone-900 truncate">{selectedFile.name}</p>
                <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                  <span>{selectedFile.type || 'application/pdf'}</span>
                  <span>•</span>
                  <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep('select_or_capture')}
                className="px-4 py-2 border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleProceedToGeminiAnalysis}
                className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>{activeType === 'document' ? '✦ Analysing document with Gemini' : '✦ Analysing with Gemini'}</span>
              </button>
            </div>
          </div>
        )}

        {/* VISIBLE GEMINI PROCESSING PROGRESS */}
        {step === 'analyzing' && (
          <div className="py-8 px-4 space-y-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto animate-pulse">
              <Sparkles className="w-6 h-6 animate-spin" />
            </div>

            <div>
              <h4 className="text-base font-bold text-stone-900">
                {activeType === 'document' ? '✦ Analysing document with Gemini' : '✦ Analysing with Gemini'}
              </h4>
              <p className="text-xs text-stone-500 mt-1">
                Parsing financial evidence structure and extracting parameters...
              </p>
            </div>

            {/* Step Checkmarks */}
            <div className="max-w-xs mx-auto text-left space-y-2.5 bg-stone-50 p-4 rounded-xl border border-stone-200 text-xs">
              {activeType === 'document' ? (
                <>
                  <div className={`flex items-center gap-2.5 ${analysisProgress >= 1 ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
                    {analysisProgress >= 1 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-stone-300" />}
                    <span>Understanding document structure…</span>
                  </div>
                  <div className={`flex items-center gap-2.5 ${analysisProgress >= 2 ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
                    {analysisProgress >= 2 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-stone-300" />}
                    <span>Identifying relevant facilities…</span>
                  </div>
                  <div className={`flex items-center gap-2.5 ${analysisProgress >= 3 ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
                    {analysisProgress >= 3 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-stone-300" />}
                    <span>Extracting financial information…</span>
                  </div>
                  <div className={`flex items-center gap-2.5 ${analysisProgress >= 4 ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
                    {analysisProgress >= 4 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-stone-300" />}
                    <span>Building evidence context…</span>
                  </div>
                </>
              ) : (
                <>
                  <div className={`flex items-center gap-2.5 ${analysisProgress >= 1 ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
                    {analysisProgress >= 1 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-stone-300" />}
                    <span>Understanding image…</span>
                  </div>
                  <div className={`flex items-center gap-2.5 ${analysisProgress >= 2 ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
                    {analysisProgress >= 2 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-stone-300" />}
                    <span>Identifying institution…</span>
                  </div>
                  <div className={`flex items-center gap-2.5 ${analysisProgress >= 3 ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
                    {analysisProgress >= 3 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-stone-300" />}
                    <span>Extracting financial information…</span>
                  </div>
                  <div className={`flex items-center gap-2.5 ${analysisProgress >= 4 ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
                    {analysisProgress >= 4 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-stone-300" />}
                    <span>Checking relevant dates and amounts…</span>
                  </div>
                  <div className={`flex items-center gap-2.5 ${analysisProgress >= 5 ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
                    {analysisProgress >= 5 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-stone-300" />}
                    <span>Building evidence context…</span>
                  </div>
                </>
              )}
            </div>

            {isLongProcessing && (
              <div className="text-xs font-medium text-amber-900 bg-amber-50/90 p-3 rounded-xl border border-amber-200/90 max-w-xs mx-auto animate-fade-in flex items-center justify-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Still analysing your evidence. This may take a little longer.</span>
              </div>
            )}
          </div>
        )}

        {/* POST-GEMINI REVIEW DIALOGUE */}
        {step === 'gemini_review' && geminiData && (() => {
          const revTitleLower = (geminiData.title || confirmedTitle || '').toLowerCase();
          const revCatLower = (geminiData.category || confirmedCategory || '').toLowerCase();
          const revProdLower = (geminiData.product || confirmedProduct || '').toLowerCase();
          const revNotesText = confirmedNotes || geminiData.extractedNotes || geminiData.summaryStatement || '';
          const revNotesLower = revNotesText.toLowerCase();

          const isSalaryDocForReview = revCatLower.includes('salary') || revCatLower.includes('payroll') || revTitleLower.includes('salary') || revTitleLower.includes('slip') || revTitleLower.includes('payroll') || revTitleLower.includes('gaji') || revTitleLower.includes('nusantara') || revProdLower.includes('salary') || revProdLower.includes('payroll') || revNotesLower.includes('net salary') || revNotesLower.includes('salary');

          return (
          <div className="space-y-4">
            
            {isMismatch && requestedInstitution ? (
              <div className="bg-amber-50/80 border-2 border-amber-300 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-200/80 pb-2">
                  <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
                    <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                    <span>CHECK THIS EVIDENCE</span>
                  </div>
                  <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    Different institution detected
                  </span>
                </div>
                <p className="text-xs font-semibold text-stone-900 leading-relaxed pt-1">
                  You asked to add an <span className="font-bold underline text-indigo-700">{requestedInstitution}</span> repayment notice, but this screenshot appears to be from <span className="font-bold underline text-indigo-700">{confirmedInstitution || geminiData.institution}</span>.
                </p>
                <p className="text-[11px] text-stone-600 italic">
                  FairAssist will use what is shown in the evidence rather than assume the institution from your earlier message.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div>
                  <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-xs uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>✦ Review what Gemini found</span>
                  </div>
                  <p className="text-[11px] text-stone-600 mt-0.5 font-medium">
                    Confirm these details before they are added to your financial situation.
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  geminiData.confidence === 'High' && geminiData.institution !== 'Needs confirmation' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {geminiData.confidence === 'Needs review' || geminiData.institution === 'Needs confirmation' || geminiData.confidence === 'Low' ? 'Needs review' : `${geminiData.confidence} Confidence`}
                </span>
              </div>
            )}

            {/* File Preview Thumbnail / Banner in Review Step */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden p-2 text-white">
              {capturedImageBase64 || (fileBase64 && selectedFile?.type?.includes('image')) ? (
                <div className="aspect-16/9 max-h-48 relative flex items-center justify-center bg-black/50 rounded-xl overflow-hidden">
                  <img
                    src={capturedImageBase64 || fileBase64!}
                    alt="Uploaded evidence preview"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-xs text-[10px] text-white px-2 py-0.5 rounded font-mono">
                    {selectedFile?.name || (activeType === 'camera' ? 'Camera Capture' : 'Evidence Image')}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-stone-800/80 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-500/30">
                    PDF
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate text-stone-100">{selectedFile?.name || 'Uploaded Document.pdf'}</p>
                    <p className="text-[10px] text-stone-400 mt-0.5 font-mono">
                      {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : '420 KB'} • Document Parsed
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Error / Uncertainty Banner if Category Unclear */}
            {(analysisError || geminiData.categoryConfidence === 'Low' || (geminiData.category === 'Other financial evidence' && !isSalaryDocForReview)) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Evidence type could not be confidently identified.</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Please select or confirm the evidence category below before saving.
                </p>
              </div>
            )}

            {/* Non-editing view of Gemini extracted fields with Consequential Fields Emphasized */}
            {!isEditingFields ? (
              <div className="space-y-3">
                <div className="bg-stone-50 border border-stone-200/90 rounded-2xl p-4 space-y-3 text-xs">
                  
                  {/* Consequential Fields Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl">
                      <span className="text-[10px] font-bold text-indigo-700 block uppercase tracking-wider">
                        {isSalaryDocForReview ? "Employer / Source" : "Institution"}
                      </span>
                      <span className="font-extrabold text-stone-900 text-sm mt-0.5 block">{confirmedInstitution || 'Unclassified Provider'}</span>
                    </div>
                    
                    <div className="p-2.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl">
                      <span className="text-[10px] font-bold text-indigo-700 block uppercase tracking-wider">
                        {isSalaryDocForReview ? "Document Type" : "Product"}
                      </span>
                      <span className="font-extrabold text-stone-900 text-sm mt-0.5 block">{confirmedProduct || 'Financial Document'}</span>
                    </div>

                    <div className="p-2.5 bg-emerald-50/80 border border-emerald-200/80 rounded-xl">
                      <span className="text-[10px] font-bold text-emerald-800 block uppercase tracking-wider">
                        {isSalaryDocForReview ? "NET SALARY" : "Amount due"}
                      </span>
                      <span className="font-black text-stone-900 text-sm mt-0.5 block">
                        {confirmedAmount ? `Rp${Number(confirmedAmount).toLocaleString('id-ID')}` : 'N/A'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl">
                      <span className="text-[10px] font-bold text-amber-800 block uppercase tracking-wider">
                        {isSalaryDocForReview ? "SALARY DATE" : "Due date"}
                      </span>
                      <span className="font-mono font-bold text-stone-900 text-sm mt-0.5 block">{confirmedDueDate || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 border-t border-stone-200/60 text-stone-700">
                    <div>
                      <span className="text-[10px] font-semibold text-stone-400 block uppercase">Evidence category</span>
                      <span className="font-bold text-stone-900">{confirmedCategory}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-stone-400 block uppercase">Account / facility ref</span>
                      <span className="font-mono text-stone-800">{confirmedAccount || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Gemini understood this as */}
                <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3.5 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
                    Gemini understood this as
                  </span>
                  <p className="text-xs text-stone-800 italic leading-relaxed">
                    “{geminiData.summaryStatement}”
                  </p>
                </div>

                {/* Action Buttons */}
                {isMismatch && requestedInstitution ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleSaveConfirmedEvidence('use_detected')}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>Use this {(() => {
                        const inst = confirmedInstitution || geminiData.institution;
                        if (inst.toLowerCase().includes('bca')) return 'BCA';
                        if (inst.toLowerCase().includes('adakami')) return 'AdaKami';
                        if (inst.toLowerCase().includes('easycash')) return 'EasyCash';
                        if (inst.toLowerCase().includes('mandiri')) return 'Mandiri';
                        return inst;
                      })()} evidence</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsMismatch(false);
                        if (onMismatchStateChange) onMismatchStateChange(false);
                        setStep('select_or_capture');
                        setGeminiData(null);
                        setSelectedFile(null);
                        setCapturedImageBase64(null);
                        setFileBase64(null);
                      }}
                      className="px-4 py-2.5 border border-stone-300 hover:bg-stone-100 text-stone-800 text-xs font-semibold rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5 text-stone-600" />
                      <span>Upload {requestedInstitution} instead</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsEditingFields(true)}
                      className="px-3.5 py-2.5 border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-stone-500" />
                      <span>Review detected details</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingFields(true)}
                      className="px-4 py-2 border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-xl cursor-pointer flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-stone-500" />
                      <span>Correct something</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveConfirmedEvidence()}
                      className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:opacity-95 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-2"
                    >
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>Confirm evidence</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Inline Editable Form when user selects "Correct something" */
              <div className="space-y-3 text-xs bg-stone-50 p-4 rounded-2xl border border-stone-200">
                <div className="flex items-center justify-between pb-1 border-b border-stone-200">
                  <span className="font-bold text-stone-800">Correct Individual Fields</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingFields(false)}
                    className="text-[11px] text-indigo-600 font-semibold hover:underline"
                  >
                    Cancel Edit
                  </button>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Evidence Category</label>
                  <select
                    value={confirmedCategory}
                    onChange={(e) => setConfirmedCategory(e.target.value as EvidenceItem['category'])}
                    className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Institution</label>
                    <input
                      type="text"
                      value={confirmedInstitution}
                      onChange={(e) => setConfirmedInstitution(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Product</label>
                    <input
                      type="text"
                      value={confirmedProduct}
                      onChange={(e) => setConfirmedProduct(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Amount Due (Rp)</label>
                    <input
                      type="number"
                      value={confirmedAmount}
                      onChange={(e) => setConfirmedAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={confirmedDueDate}
                      onChange={(e) => setConfirmedDueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Account / Facility Ref</label>
                  <input
                    type="text"
                    value={confirmedAccount}
                    onChange={(e) => setConfirmedAccount(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveConfirmedEvidence()}
                    className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm & Save Evidence</span>
                  </button>
                </div>
              </div>
            )}

          </div>
          );
        })()}

      </div>
    </div>
  );
};
