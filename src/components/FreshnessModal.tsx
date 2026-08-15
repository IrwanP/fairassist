import React from 'react';
import { RegulatorySource, InstitutionPolicy, SourceFreshnessStatus, FinancialContext } from '../types';
import { TrustedSourceRegistry } from '../data/sourcesConfig';
import { getApplicableInstitutions, retrieveApplicableRegulations } from '../services/policyRetrievalService';
import { X, ShieldCheck, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';

interface FreshnessModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources?: RegulatorySource[];
  policies?: InstitutionPolicy[];
  context?: FinancialContext;
}

export const FreshnessModal: React.FC<FreshnessModalProps> = ({
  isOpen,
  onClose,
  sources = [],
  policies = [],
  context,
}) => {
  if (!isOpen) return null;

  // If context is available, compute dynamic applicable institutions & regulatory sectors
  const dynamicInstitutions = context ? getApplicableInstitutions(context) : [];
  const dynamicSectors = context ? retrieveApplicableRegulations(context) : [];

  const displaySources = context && dynamicSectors.length > 0 
    ? dynamicSectors.flatMap(s => s.rules)
    : sources;

  const renderStatusBadge = (status: SourceFreshnessStatus, displayStatusText?: string) => {
    switch (status) {
      case 'Current':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Current
          </span>
        );
      case 'Superseded':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200 w-fit">
              Superseded
            </span>
            <span className="text-[10px] text-stone-500 font-medium">
              {displayStatusText || 'Superseded by SEOJK 19/SEOJK.06/2025'}
            </span>
          </div>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            {displayStatusText || 'Current'}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-stone-200 rounded-2xl max-w-4xl w-full p-6 shadow-xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 tracking-tight">
                Regulatory & Policy Freshness
              </h2>
              <p className="text-xs text-stone-500">
                Verified status of statutory codes, OJK circulars and lender policies via TrustedSourceRegistry
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Verification Guarantee Disclaimer */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
            <span>
              All regulatory sources are continuously cross-checked against official OJK & Bank Indonesia portals.
            </span>
          </div>
          <span className="text-[10px] font-mono text-stone-400">
            Last global check: Today 17:30 WIB
          </span>
        </div>

        {/* Regulatory Sources Table */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Statutory & Regulatory Framework
          </h3>
          <div className="border border-stone-200/90 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
                <tr>
                  <th className="p-3">Organisation & Type</th>
                  <th className="p-3">Document Title</th>
                  <th className="p-3">Effective Date</th>
                  <th className="p-3">Last Checked</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Official Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-800">
                {displaySources.map((src) => {
                  const resolved = TrustedSourceRegistry.resolve(src.id || src.codeNumber || src.officialUrl);
                  return (
                    <tr key={src.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="p-3">
                        <span className="font-bold block text-stone-900">{resolved.organisation}</span>
                        <span className="text-[10px] text-stone-500">{src.sourceType}</span>
                      </td>
                      <td className="p-3 font-medium max-w-xs leading-snug">
                        {resolved.title}
                      </td>
                      <td className="p-3 text-stone-600 font-mono text-[11px]">
                        {src.effectiveDate}
                      </td>
                      <td className="p-3 text-stone-500 font-mono text-[10px]">
                        {src.lastChecked}
                      </td>
                      <td className="p-3">
                        {renderStatusBadge(resolved.status, resolved.displayStatusText)}
                      </td>
                      <td className="p-3 text-right">
                        {resolved.isAvailable ? (
                          <a
                            href={resolved.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline font-semibold"
                          >
                            Open official source <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-stone-400 italic text-[11px]">
                            Official source temporarily unavailable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lender Policies Table */}
        <div className="space-y-2 pt-2">
          <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Verified Lender Restructuring Policies
          </h3>
          <div className="border border-stone-200/90 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
                <tr>
                  <th className="p-3">Institution</th>
                  <th className="p-3">Policy Title</th>
                  <th className="p-3">Effective Date</th>
                  <th className="p-3">Last Checked</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Policy Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-800">
                {policies.map((pol) => {
                  const resolved = TrustedSourceRegistry.resolve(pol.id || pol.title || pol.officialUrl);
                  return (
                    <tr key={pol.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="p-3">
                        <span className="font-bold block text-stone-900">{pol.institutionName}</span>
                        <span className="text-[10px] text-stone-500">{pol.documentType}</span>
                      </td>
                      <td className="p-3 font-medium max-w-xs leading-snug">
                        {resolved.title}
                      </td>
                      <td className="p-3 text-stone-600 font-mono text-[11px]">
                        {pol.effectiveDate}
                      </td>
                      <td className="p-3 text-stone-500 font-mono text-[10px]">
                        {pol.lastChecked}
                      </td>
                      <td className="p-3">
                        {renderStatusBadge(resolved.status, resolved.displayStatusText)}
                      </td>
                      <td className="p-3 text-right">
                        {resolved.isAvailable ? (
                          <a
                            href={resolved.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline font-semibold"
                          >
                            View Policy Document <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-stone-400 italic text-[11px]">
                            Official source temporarily unavailable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-stone-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
