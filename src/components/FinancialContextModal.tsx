import React, { useState, useEffect, useMemo } from 'react';
import { X, Check } from 'lucide-react';
import { FinancialContext, extractSalaryDetailsFromEvidence } from '../types';

interface FinancialContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    availableCash: number;
    nextSalaryDate: string;
    nextSalaryAmount: number;
    essentialExpenses?: number | null;
  }) => void;
  context: FinancialContext;
}

function toISODateString(val?: string | null): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const monthStr = match[2].toLowerCase();
    const months: Record<string, string> = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12',
    };
    const m = months[monthStr] || months[monthStr.substring(0, 3)];
    if (m) {
      return `${match[3]}-${m}-${day}`;
    }
  }
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '2026-08-28';
}

function formatCanonicalDate(isoOrDateStr: string): string {
  if (!isoOrDateStr) return '28 Aug 2026';
  const trimmed = isoOrDateStr.trim();
  if (/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = parseInt(m, 10) - 1;
    return `${parseInt(d, 10)} ${months[mIdx] || m} ${y}`;
  }
  return trimmed;
}

export const FinancialContextModal: React.FC<FinancialContextModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  context,
}) => {
  if (!isOpen) return null;

  // Canonical confirmed salary details from context or confirmed evidence
  const canonicalSalary = useMemo(() => {
    let amt = context.nextSalaryAmount;
    let dt = context.nextSalaryDate;

    if (!amt || !dt) {
      for (const item of context.evidenceList || []) {
        const details = extractSalaryDetailsFromEvidence(item);
        if (!amt && details.salaryAmount) amt = details.salaryAmount;
        if (!dt && details.salaryDate) dt = details.salaryDate;
      }
    }
    return {
      amount: amt || 8500000,
      date: dt || '28 Aug 2026',
    };
  }, [context]);

  const [cashInput, setCashInput] = useState<string>(
    context.availableCash !== null && context.availableCash !== undefined
      ? context.availableCash.toLocaleString('id-ID')
      : ''
  );
  const [salaryDateInput, setSalaryDateInput] = useState<string>(
    toISODateString(canonicalSalary.date || context.nextSalaryDate || '28 Aug 2026')
  );
  const [salaryAmountInput, setSalaryAmountInput] = useState<string>(
    canonicalSalary.amount
      ? canonicalSalary.amount.toLocaleString('id-ID')
      : (context.nextSalaryAmount !== null && context.nextSalaryAmount !== undefined
          ? context.nextSalaryAmount.toLocaleString('id-ID')
          : '8.500.000')
  );
  const [essentialExpensesInput, setEssentialExpensesInput] = useState<string>(
    context.essentialExpenses !== null && context.essentialExpenses !== undefined
      ? context.essentialExpenses.toLocaleString('id-ID')
      : ''
  );

  useEffect(() => {
    if (isOpen) {
      if (context.availableCash !== null && context.availableCash !== undefined) {
        setCashInput(context.availableCash.toLocaleString('id-ID'));
      }
      const effectiveDate = canonicalSalary.date || context.nextSalaryDate || '28 Aug 2026';
      setSalaryDateInput(toISODateString(effectiveDate));

      const effectiveAmt = canonicalSalary.amount || context.nextSalaryAmount || 8500000;
      setSalaryAmountInput(effectiveAmt.toLocaleString('id-ID'));

      if (context.essentialExpenses !== null && context.essentialExpenses !== undefined) {
        setEssentialExpensesInput(context.essentialExpenses.toLocaleString('id-ID'));
      }
    }
  }, [isOpen, context, canonicalSalary]);

  const formatNumberString = (val: string) => {
    const raw = val.replace(/\D/g, '');
    if (!raw) return '';
    return parseInt(raw, 10).toLocaleString('id-ID');
  };

  const parseFormattedNumber = (val: string): number => {
    const raw = val.replace(/\D/g, '');
    return raw ? parseInt(raw, 10) : 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const availableCash = parseFormattedNumber(cashInput);
    const nextSalaryAmount = parseFormattedNumber(salaryAmountInput) || canonicalSalary.amount || 8500000;
    const essentialExpenses = essentialExpensesInput ? parseFormattedNumber(essentialExpensesInput) : null;
    const formattedDate = formatCanonicalDate(salaryDateInput || canonicalSalary.date || '28 Aug 2026');

    onSubmit({
      availableCash,
      nextSalaryDate: formattedDate,
      nextSalaryAmount,
      essentialExpenses,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                USER PROVIDED CONTEXT
              </span>
            </div>
            <h2 className="text-base font-bold text-stone-900 mt-1">
              {context.nextSalaryDate ? "Confirm available cash position" : "Add cash & salary timing"}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {context.nextSalaryDate 
                ? "Provide your available cash position. Salary timing is already confirmed from evidence."
                : "Provide your current cash position and upcoming salary schedule to enable cash-flow analysis."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Available Cash Now */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              Available cash now <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-stone-400">
                Rp
              </span>
              <input
                type="text"
                required
                value={cashInput}
                onChange={(e) => setCashInput(formatNumberString(e.target.value))}
                placeholder="e.g. 2,000,000"
                className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-stone-900"
              />
            </div>
            <p className="text-[11px] text-stone-500">
              Current liquid funds in bank or e-wallet available for immediate use.
            </p>
          </div>

          {/* Next Salary Date */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              Next salary date <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={salaryDateInput}
                onChange={(e) => setSalaryDateInput(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-stone-900"
              />
            </div>
            <p className="text-[11px] text-stone-500">
              Expected date of your next salary or major income disbursement.
            </p>
          </div>

          {/* Expected Salary Amount */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              Expected salary amount <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-stone-400">
                Rp
              </span>
              <input
                type="text"
                required
                value={salaryAmountInput}
                onChange={(e) => setSalaryAmountInput(formatNumberString(e.target.value))}
                placeholder="e.g. 5,000,000"
                className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-stone-900"
              />
            </div>
            <p className="text-[11px] text-stone-500">
              Net expected salary payout on your next payday.
            </p>
          </div>

          {/* Essential Expenses (Optional) */}
          <div className="space-y-1.5 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-stone-800">
                Essential expenses before salary
              </label>
              <span className="text-[10px] font-semibold text-stone-400 bg-stone-100 px-2 py-0.5 rounded">
                Optional
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-stone-400">
                Rp
              </span>
              <input
                type="text"
                value={essentialExpensesInput}
                onChange={(e) => setEssentialExpensesInput(formatNumberString(e.target.value))}
                placeholder="e.g. 500,000"
                className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-stone-900"
              />
            </div>
            <p className="text-[11px] text-stone-500">
              Rent, utilities, food, or unavoidable living costs due before payday.
            </p>
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-stone-300 text-stone-700 hover:bg-stone-50 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Use this information</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
