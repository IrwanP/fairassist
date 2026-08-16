import React, { useState } from 'react';
import { EvidenceItem, extractSalaryDetailsFromEvidence } from '../types';
import { 
  FileText, 
  ImageIcon, 
  Trash2, 
  FileSpreadsheet, 
  CheckCircle2, 
  Eye, 
  Edit3, 
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { EvidenceDetailModal } from './EvidenceDetailModal';

interface EvidenceColumnProps {
  evidenceList: EvidenceItem[];
  onOpenUploadModal: (type: 'camera' | 'screenshot' | 'document') => void;
  onUpdateEvidence?: (updatedItem: EvidenceItem) => void;
  onReplaceFile?: (item: EvidenceItem) => void;
  onRemoveEvidence?: (id: string) => void;
  onLoadSampleScenario?: () => void;
  onStartFreshWithOwnEvidence?: () => void;
  isFocusArea?: boolean;
  isDemoScenario?: boolean;
}

export const EvidenceColumn: React.FC<EvidenceColumnProps> = ({
  evidenceList,
  onOpenUploadModal,
  onUpdateEvidence,
  onReplaceFile,
  onRemoveEvidence,
  onLoadSampleScenario,
  onStartFreshWithOwnEvidence,
  isFocusArea = false,
  isDemoScenario = false,
}) => {
  const [selectedItem, setSelectedItem] = useState<EvidenceItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  const getCategoryIcon = (category: EvidenceItem['category']) => {
    switch (category) {
      case 'Bank repayment notification':
        return <FileText className="w-4 h-4 text-stone-700" />;
      case 'Pindar app repayment screenshot':
        return <ImageIcon className="w-4 h-4 text-stone-700" />;
      case 'Bank statement':
        return <FileSpreadsheet className="w-4 h-4 text-stone-700" />;
      case 'iDeb SLIK – Debitur Perseorangan':
        return <CheckCircle2 className="w-4 h-4 text-stone-700" />;
      default:
        return <FileText className="w-4 h-4 text-stone-700" />;
    }
  };

  const handleOpenDetail = (item: EvidenceItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedItem(item);
    setIsDetailModalOpen(true);
  };

  return (
    <aside className="space-y-4">
      {/* Column Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-stone-600" />
          <span>Your Evidence</span>
        </h3>
        <div className="flex items-center gap-2">
          {onLoadSampleScenario && (
            isDemoScenario ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200/90 px-2 py-0.5 rounded-md">
                  Sample scenario active
                </span>
                <button
                  type="button"
                  onClick={onLoadSampleScenario}
                  className="text-[10px] font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 border border-stone-200 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                  title="Reset demo scenario"
                >
                  Reset Demo
                </button>
              </div>
            ) : null
          )}
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
            {evidenceList.length} Items
          </span>
        </div>
      </div>

      {/* Recommended Walkthrough Card (Top of Column) */}
      {!isDemoScenario && onLoadSampleScenario && (
        <button
          type="button"
          onClick={onLoadSampleScenario}
          className="w-full p-2.5 bg-teal-50/70 hover:bg-teal-50/95 text-left rounded-2xl transition-all cursor-pointer border border-teal-300/80 shadow-2xs group relative overflow-hidden flex items-center justify-between gap-2"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-teal-100/80 border border-teal-200/90 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-bold text-teal-800 tracking-wider uppercase">
                RECOMMENDED WALKTHROUGH
              </span>
              <span className="text-xs font-bold text-stone-900 leading-snug mt-0.5">
                Try guided sample
              </span>
              <span className="text-[10px] text-stone-500 mt-0.5 leading-tight">
                See FairAssist end-to-end · ~2 min
              </span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-teal-700/70 group-hover:text-teal-800 group-hover:translate-x-0.5 transition-all shrink-0 mr-0.5" />
        </button>
      )}

      {/* Quiet Separator between Walkthrough and Manual Evidence */}
      {!isDemoScenario && onLoadSampleScenario && (
        <div className="relative flex items-center justify-center my-1">
          <div className="w-full border-t border-stone-200/90"></div>
          <span className="bg-stone-100/60 px-2.5 text-[9px] text-stone-400 uppercase tracking-widest font-semibold absolute rounded">
            OR USE YOUR OWN EVIDENCE
          </span>
        </div>
      )}

      {/* Add Financial Evidence Box */}
      <div className={`flex flex-col gap-2 p-3.5 rounded-2xl transition-all duration-300 relative ${
        isFocusArea 
          ? 'bg-gradient-to-b from-indigo-50/90 to-white border-2 border-indigo-500 shadow-md ring-4 ring-indigo-500/15' 
          : 'bg-white border border-stone-200 shadow-xs'
      }`}>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[11px] font-bold text-stone-900 flex items-center gap-1.5">
            {isFocusArea && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-extrabold uppercase tracking-wide animate-pulse">
                ✦ ACTION REQUIRED
              </span>
            )}
            <span>Add financial evidence</span>
          </span>
          <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100/80">
            Multimodal Gemini
          </span>
        </div>

        {isDemoScenario && (
          <div className="flex items-center justify-between p-2 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-[11px]">
            <span className="text-indigo-900 font-medium">Sample scenario active</span>
            <button
              type="button"
              onClick={onStartFreshWithOwnEvidence || onLoadSampleScenario}
              className="text-[10px] font-semibold text-indigo-900 hover:text-indigo-950 bg-indigo-100/90 hover:bg-indigo-200 border border-indigo-300/80 px-2 py-0.5 rounded cursor-pointer transition-colors"
            >
              Start fresh with your own evidence
            </button>
          </div>
        )}
        
        <button
          onClick={() => onOpenUploadModal('camera')}
          className="flex items-center justify-between px-3 py-2 text-xs bg-stone-50 border border-stone-200/90 rounded-xl hover:bg-stone-100 hover:border-stone-300 transition-all cursor-pointer text-stone-800 font-medium group"
        >
          <span className="flex items-center gap-2">
            <span className="text-base group-hover:scale-110 transition-transform">📷</span>
            <span>Take a photo</span>
          </span>
          <span className="text-[10px] font-mono text-stone-400 group-hover:text-stone-600">Camera</span>
        </button>

        <button
          onClick={() => onOpenUploadModal('screenshot')}
          className="flex items-center justify-between px-3 py-2 text-xs bg-stone-50 border border-stone-200/90 rounded-xl hover:bg-stone-100 hover:border-stone-300 transition-all cursor-pointer text-stone-800 font-medium group"
        >
          <span className="flex items-center gap-2">
            <span className="text-base group-hover:scale-110 transition-transform">📁</span>
            <span>Upload screenshot</span>
          </span>
          <span className="text-[10px] font-mono text-stone-400 group-hover:text-stone-600">PNG / JPG</span>
        </button>

        <button
          onClick={() => onOpenUploadModal('document')}
          className="flex items-center justify-between px-3 py-2 text-xs bg-stone-50 border border-stone-200/90 rounded-xl hover:bg-stone-100 hover:border-stone-300 transition-all cursor-pointer text-stone-800 font-medium group"
        >
          <span className="flex items-center gap-2">
            <span className="text-base group-hover:scale-110 transition-transform">📄</span>
            <span>Upload document</span>
          </span>
          <span className="text-[10px] font-mono text-stone-400 group-hover:text-stone-600">PDF</span>
        </button>
      </div>

      {/* Empty State Status Card when no evidence exists */}
      {evidenceList.length === 0 && (
        <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl space-y-1">
          <h4 className="text-xs font-bold text-stone-900">
            No evidence yet
          </h4>
          <p className="text-[11px] text-stone-600 leading-relaxed">
            Add a repayment notice when FairAssist asks for it.
          </p>
        </div>
      )}

      {/* Evidence Items Stack */}
      <div className="space-y-3">
        {evidenceList.map((item) => {
          const isPreloadedDemo = Boolean(isDemoScenario) && item.id.startsWith('ev-') && !item.id.startsWith('ev-custom-');

          return (
            <div
              key={item.id}
              onClick={(e) => handleOpenDetail(item, e)}
              className="p-3.5 bg-white rounded-2xl border border-stone-200/90 shadow-xs hover:border-stone-400 transition-all cursor-pointer space-y-2 group relative"
            >
              {/* Card Top Line */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-stone-500 font-mono">
                  {item.uploadDate}
                </span>

                {/* Preloaded Demo vs User Uploaded Badge */}
                {isPreloadedDemo ? (
                  <span className="text-[9px] bg-indigo-50 text-indigo-800 border border-indigo-200/80 px-1.5 py-0.5 rounded font-bold uppercase tracking-tight">
                    Sample Evidence Pack
                  </span>
                ) : (
                  <span className="text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-1.5 py-0.5 rounded font-bold uppercase tracking-tight">
                    User Evidence
                  </span>
                )}
              </div>

              {/* Title & Icon */}
              <div className="flex items-start gap-2">
                <div className="p-1.5 rounded-lg bg-stone-100 text-stone-700 shrink-0 mt-0.5">
                  {getCategoryIcon(item.category)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-stone-900 truncate leading-snug group-hover:text-indigo-600 transition-colors">
                    {item.title}
                  </p>
                  <p className="text-[10px] text-stone-500 truncate mt-0.5">
                    {item.category}
                  </p>
                </div>
              </div>

              {/* Gemini Badge */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/80 px-2 py-0.5 rounded flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
                  {item.verifiedBadge || 'Gemini analysed · User confirmed'}
                </span>
              </div>

              {/* Extracted Details / SLIK Credit Report details */}
              {(item.category.includes('SLIK') || item.category.includes('iDeb') || item.title.includes('SLIK') || item.title.includes('iDeb')) ? (
                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] font-semibold text-stone-800">
                  <span className="text-stone-700 text-[10px] font-medium">OJK SLIK Credit Report · 3 facilities</span>
                  <span className="text-emerald-700 text-[10px] font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Collectibility 1 – Lancar</span>
                </div>
              ) : (() => {
                const salaryDetails = extractSalaryDetailsFromEvidence(item);
                if (salaryDetails.salaryAmount || salaryDetails.salaryDate) {
                  return (
                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] font-semibold text-stone-800">
                      {salaryDetails.salaryAmount ? (
                        <span className="font-bold text-stone-900">
                          Rp{salaryDetails.salaryAmount.toLocaleString('id-ID')}
                        </span>
                      ) : (
                        <span className="text-stone-400 font-normal">Salary confirmed</span>
                      )}
                      {salaryDetails.salaryDate && (
                        <span className="text-stone-500 text-[10px] font-mono">
                          Pay date {salaryDetails.salaryDate}
                        </span>
                      )}
                    </div>
                  );
                }
                return item.extractedDetails ? (
                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] font-semibold text-stone-800">
                    {item.extractedDetails.amountDue !== undefined && item.extractedDetails.amountDue > 0 ? (
                      <span className="font-bold text-stone-900">
                        Rp{item.extractedDetails.amountDue.toLocaleString('id-ID')}
                      </span>
                    ) : (
                      <span className="text-stone-400 font-normal">No amount</span>
                    )}
                    {item.extractedDetails.dueDate && (
                      <span className="text-stone-500 text-[10px] font-mono">
                        Due {item.extractedDetails.dueDate}
                      </span>
                    )}
                  </div>
                ) : null;
              })()}

              {/* Quick Actions Bar */}
              <div className="pt-2 border-t border-stone-100/80 flex items-center justify-between text-[10px] text-stone-600">
                <button
                  type="button"
                  onClick={(e) => handleOpenDetail(item, e)}
                  className="hover:text-stone-900 font-semibold flex items-center gap-1 cursor-pointer hover:underline"
                >
                  <Eye className="w-3 h-3 text-stone-500" />
                  <span>View Details</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDetail(item, e);
                    }}
                    className="hover:text-stone-900 font-medium flex items-center gap-0.5 cursor-pointer"
                    title="Edit details"
                  >
                    <Edit3 className="w-3 h-3 text-stone-400 hover:text-stone-700" />
                  </button>

                  {onReplaceFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReplaceFile(item);
                      }}
                      className="hover:text-stone-900 font-medium flex items-center gap-0.5 cursor-pointer"
                      title="Replace file"
                    >
                      <RotateCcw className="w-3 h-3 text-stone-400 hover:text-stone-700" />
                    </button>
                  )}

                  {onRemoveEvidence && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveEvidence(item.id);
                      }}
                      className="hover:text-rose-600 font-medium flex items-center gap-0.5 cursor-pointer"
                      title="Delete evidence"
                    >
                      <Trash2 className="w-3 h-3 text-stone-400 hover:text-rose-600" />
                    </button>
                  )}
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      <EvidenceDetailModal
        item={selectedItem}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onUpdateEvidence={(updated) => {
          if (onUpdateEvidence) onUpdateEvidence(updated);
          setSelectedItem(updated);
        }}
        onReplaceFile={(itemToReplace) => {
          setIsDetailModalOpen(false);
          if (onReplaceFile) onReplaceFile(itemToReplace);
        }}
        onDeleteEvidence={(id) => {
          if (onRemoveEvidence) onRemoveEvidence(id);
          setIsDetailModalOpen(false);
        }}
        isDemoScenario={isDemoScenario}
      />
    </aside>
  );
};
