import React, { useState } from 'react';
import { EvidenceItem } from '../types';
import { 
  X, 
  FileText, 
  ImageIcon, 
  Sparkles, 
  Check, 
  Trash2, 
  Edit3, 
  RotateCcw, 
  ShieldCheck, 
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  ExternalLink,
  Info
} from 'lucide-react';

interface EvidenceDetailModalProps {
  item: EvidenceItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateEvidence: (updatedItem: EvidenceItem) => void;
  onReplaceFile: (item: EvidenceItem) => void;
  onDeleteEvidence: (id: string) => void;
  isDemoScenario?: boolean;
}

export const EvidenceDetailModal: React.FC<EvidenceDetailModalProps> = ({
  item,
  isOpen,
  onClose,
  onUpdateEvidence,
  onReplaceFile,
  onDeleteEvidence,
  isDemoScenario = false,
}) => {
  if (!isOpen || !item) return null;

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // Editable Form State
  const [title, setTitle] = useState<string>(item.title || '');
  const [category, setCategory] = useState<EvidenceItem['category']>(item.category);
  const [institution, setInstitution] = useState<string>(
    item.userConfirmedDetails?.institutionName || item.extractedDetails?.institutionName || ''
  );
  const [product, setProduct] = useState<string>(
    item.userConfirmedDetails?.productName || item.extractedDetails?.productName || ''
  );
  const [amount, setAmount] = useState<string>(
    item.userConfirmedDetails?.amountDue !== undefined 
      ? String(item.userConfirmedDetails.amountDue)
      : (item.extractedDetails?.amountDue !== undefined ? String(item.extractedDetails.amountDue) : '')
  );
  const [dueDate, setDueDate] = useState<string>(
    item.userConfirmedDetails?.dueDate || item.extractedDetails?.dueDate || ''
  );
  const [refNo, setRefNo] = useState<string>(
    item.userConfirmedDetails?.referenceNumber || item.extractedDetails?.referenceNumber || ''
  );
  const [notes, setNotes] = useState<string>(
    item.userConfirmedDetails?.notes || item.extractedDetails?.notes || ''
  );

  const categoriesList: EvidenceItem['category'][] = [
    'Bank repayment notification',
    'Pindar app repayment screenshot',
    'Bank statement',
    'iDeb SLIK – Debitur Perseorangan',
    'Repayment or borrowing offer',
    'Other financial evidence',
  ];

  const handleSaveEdit = () => {
    const numAmount = amount ? Number(amount) : undefined;
    const updated: EvidenceItem = {
      ...item,
      title: title || `${institution} ${product}`,
      category,
      extractedDetails: {
        ...item.extractedDetails,
        institutionName: institution,
        productName: product,
        amountDue: numAmount,
        dueDate: dueDate || undefined,
        referenceNumber: refNo || undefined,
        notes,
      },
      userConfirmedDetails: {
        category,
        institutionName: institution,
        productName: product,
        amountDue: numAmount,
        dueDate: dueDate || undefined,
        referenceNumber: refNo || undefined,
        notes,
      },
      verifiedBadge: 'User modified · Re-calculated',
    };

    onUpdateEvidence(updated);
    setIsEditing(false);
  };

  const handleDelete = () => {
    onDeleteEvidence(item.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  const [isReanalyzing, setIsReanalyzing] = useState<boolean>(false);
  const [reanalysisResult, setReanalysisResult] = useState<any | null>(null);

  const handleReanalyzeWithGemini = async () => {
    setIsReanalyzing(true);
    setReanalysisResult(null);

    const activeReqId = `req-reanalyze-${Date.now()}`;

    try {
      const response = await fetch('/api/analyze-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidenceId: item.id,
          analysisRequestId: activeReqId,
          fileBase64: item.previewUrl || '',
          fileName: item.fileName,
          evidenceType: item.fileType?.includes('pdf') ? 'document' : 'screenshot',
        }),
      });

      const data = await response.json();
      setReanalysisResult(data);
    } catch (err) {
      console.error('Re-analysis error:', err);
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleAcceptReanalysis = () => {
    if (!reanalysisResult) return;

    const numAmount = reanalysisResult.amountDue !== null && reanalysisResult.amountDue !== undefined ? Number(reanalysisResult.amountDue) : undefined;

    const updated: EvidenceItem = {
      ...item,
      title: reanalysisResult.title || item.title,
      category: reanalysisResult.category || item.category,
      extractedDetails: {
        institutionName: reanalysisResult.institution || item.extractedDetails?.institutionName,
        productName: reanalysisResult.product || item.extractedDetails?.productName,
        amountDue: numAmount,
        dueDate: reanalysisResult.dueDate || undefined,
        referenceNumber: reanalysisResult.accountOrFacility || undefined,
        notes: reanalysisResult.extractedNotes || reanalysisResult.summaryStatement,
      },
      userConfirmedDetails: {
        category: reanalysisResult.category || item.category,
        institutionName: reanalysisResult.institution || item.extractedDetails?.institutionName || '',
        productName: reanalysisResult.product || item.extractedDetails?.productName || '',
        amountDue: numAmount,
        dueDate: reanalysisResult.dueDate || undefined,
        referenceNumber: reanalysisResult.accountOrFacility || undefined,
        notes: reanalysisResult.extractedNotes || reanalysisResult.summaryStatement,
      },
      summaryStatement: reanalysisResult.summaryStatement || item.summaryStatement,
      confidence: reanalysisResult.confidence || item.confidence,
      verifiedBadge: 'Re-analysed with Gemini · User confirmed',
    };

    onUpdateEvidence(updated);
    setReanalysisResult(null);
  };

  const isPreloadedDemo = Boolean(isDemoScenario) && item.id.startsWith('ev-') && !item.id.startsWith('ev-custom-');

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-stone-200 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-6 relative max-h-[92vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-stone-100 text-stone-700 border border-stone-200">
              {item.fileType?.includes('image') || item.fileType?.includes('png') ? (
                <ImageIcon className="w-5 h-5 text-indigo-600" />
              ) : (
                <FileText className="w-5 h-5 text-purple-600" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-900 tracking-tight">
                  {item.title}
                </h3>
                {isPreloadedDemo ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200/70">
                    Sample Evidence Pack
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/70">
                    User Uploaded Evidence
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 font-mono mt-0.5">
                {item.fileName} • {item.fileSize || '420 KB'} • Uploaded {item.uploadDate}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Delete Confirmation Banner */}
        {showDeleteConfirm && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 text-rose-900 font-bold">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Are you sure you want to delete this evidence record?</span>
            </div>
            <p className="text-rose-700 text-[11px]">
              This action will permanently remove {item.title} from your Evidence Context and trigger an immediate recalculation of your Financial Obligations and Rules & Policies.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-white border border-stone-200 text-stone-700 font-semibold rounded-lg hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Section: View Mode vs Edit Mode */}
        {!isEditing ? (
          <div className="space-y-4">
            
            {/* Image Preview / File Representation */}
            {item.previewUrl ? (
              <div className="rounded-2xl border border-stone-200 overflow-hidden bg-stone-900 aspect-16/9 relative max-h-56 flex items-center justify-center">
                <img
                  src={item.previewUrl}
                  alt={item.title}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-200 p-6 bg-stone-50 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                  {item.fileType?.includes('pdf') ? 'PDF' : 'DOC'}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900">{item.fileName}</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Original evidence file parsed by Gemini Multimodal Engine.
                  </p>
                </div>
              </div>
            )}

            {/* Gemini Understood Statement */}
            <div className="bg-indigo-50/80 border border-indigo-200/90 rounded-2xl p-3.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Gemini Multimodal Interpretation
                </span>
                <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono">
                  {item.confidence || 'High'} Confidence
                </span>
              </div>
              <p className="text-xs text-stone-800 italic leading-relaxed pt-0.5">
                “{item.summaryStatement || item.geminiExtractedDetails?.summaryStatement || 'Parsed and extracted financial evidence details.'}”
              </p>
            </div>

            {/* Extracted & Confirmed Parameters Grid */}
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Extracted Parameters
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-semibold text-stone-400 block uppercase">Category</span>
                  <span className="font-bold text-stone-900">{item.category}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-stone-400 block uppercase">Institution</span>
                  <span className="font-bold text-stone-900">
                    {item.userConfirmedDetails?.institutionName || item.extractedDetails?.institutionName || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-stone-400 block uppercase">Product / Facility</span>
                  <span className="font-semibold text-stone-800">
                    {item.userConfirmedDetails?.productName || item.extractedDetails?.productName || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-stone-400 block uppercase">Amount Due</span>
                  <span className="font-bold text-stone-900">
                    {(item.category?.includes('SLIK') || item.category?.includes('iDeb') || item.title?.includes('SLIK') || item.title?.includes('iDeb'))
                      ? 'N/A (Credit Report)'
                      : item.extractedDetails?.amountDue !== undefined && item.extractedDetails.amountDue > 0
                      ? `Rp${item.extractedDetails.amountDue.toLocaleString('id-ID')}`
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-stone-400 block uppercase">Due Date</span>
                  <span className="font-mono text-stone-800">
                    {(item.category?.includes('SLIK') || item.category?.includes('iDeb') || item.title?.includes('SLIK') || item.title?.includes('iDeb'))
                      ? 'N/A (Credit Report)'
                      : item.userConfirmedDetails?.dueDate || item.extractedDetails?.dueDate || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-stone-400 block uppercase">Facility Ref</span>
                  <span className="font-mono text-stone-800">
                    {item.userConfirmedDetails?.referenceNumber || item.extractedDetails?.referenceNumber || 'N/A'}
                  </span>
                </div>
              </div>

              {item.extractedDetails?.notes && (
                <div className="pt-2 border-t border-stone-200/80">
                  <span className="text-[10px] font-semibold text-stone-400 block uppercase mb-0.5">Notes</span>
                  <p className="text-[11px] text-stone-700 bg-white p-2 rounded-lg border border-stone-200 leading-relaxed">
                    {item.extractedDetails.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Candidate Re-analysis Review Panel */}
            {reanalysisResult && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-indigo-900 font-bold text-xs">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    New Gemini Re-analysis Result
                  </span>
                  <span className="bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded text-[10px]">
                    {reanalysisResult.confidence || 'High'} Confidence
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-xl border border-indigo-100">
                  <div><span className="text-stone-400 block text-[10px]">Institution:</span> <strong>{reanalysisResult.institution || 'N/A'}</strong></div>
                  <div><span className="text-stone-400 block text-[10px]">Product:</span> <strong>{reanalysisResult.product || 'N/A'}</strong></div>
                  <div><span className="text-stone-400 block text-[10px]">Amount:</span> <strong>{reanalysisResult.amountDue ? `Rp${Number(reanalysisResult.amountDue).toLocaleString('id-ID')}` : 'N/A'}</strong></div>
                  <div><span className="text-stone-400 block text-[10px]">Due Date:</span> <strong>{reanalysisResult.dueDate || 'N/A'}</strong></div>
                </div>
                <p className="text-[11px] text-stone-700 italic bg-white/70 p-2 rounded-lg border border-indigo-100">
                  “{reanalysisResult.summaryStatement}”
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setReanalysisResult(null)}
                    className="px-3 py-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-semibold rounded-lg"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptReanalysis}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Re-analysis</span>
                  </button>
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-100 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleReanalyzeWithGemini}
                  disabled={isReanalyzing}
                  className="px-3 py-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-indigo-600 ${isReanalyzing ? 'animate-spin' : ''}`} />
                  <span>{isReanalyzing ? 'Re-analysing…' : 'Re-analyse File'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onReplaceFile(item)}
                  className="px-3.5 py-2 border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
                  <span>Replace File</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Edit3 className="w-3.5 h-3.5 text-stone-300" />
                  <span>Edit Details</span>
                </button>
              </div>
            </div>

          </div>
        ) : (
          /* EDIT MODE FORM */
          <div className="space-y-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-indigo-600" />
                <span>Edit User-Confirmed Evidence Values</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs font-semibold text-stone-500 hover:text-stone-800"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Evidence Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Evidence Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EvidenceItem['category'])}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
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
                <label className="block text-xs font-semibold text-stone-700 mb-1">Institution Name</label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Product / Facility</label>
                <input
                  type="text"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Amount Due (Rp)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Reference Number</label>
              <input
                type="text"
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Notes & Context</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Save Changes & Recalculate</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
