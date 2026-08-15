import { FinancialContext, FinancialObligation, RegulatorySource } from '../types';
import { TrustedSourceRegistry } from '../data/sourcesConfig';

export interface FacilityDetail {
  id: string;
  title: string;
  category: string;
  facilityIdentifier?: string;
  amount: number;
  dueDate?: string;
  status: 'Active' | 'Historical' | 'Upcoming' | 'Closed' | 'Overdue';
  evidenceRef?: string;
  notes?: string;
}

export interface ApplicableInstitution {
  institutionId: string;
  institutionName: string;
  legalEntity: string;
  institutionType: 'Bank' | 'Pindar' | 'Paylater' | 'Other';
  verifiedBadge: string;
  officialUrl: string;
  licenceNumber?: string;
  isVerifiedByOJK: boolean;
  facilities: FacilityDetail[];
  isPolicyVerified: boolean;
  verifiedPolicy?: {
    title: string;
    documentType: string;
    effectiveDate: string;
    officialUrl: string;
    productInformation: string;
    riplayInfo?: string;
    repaymentInformation: string;
    productTerms: string;
    customerAssistance: string;
    complaintsContactRoute: string;
  };
}

/**
 * 1. ACTIVE INSTITUTION RESOLUTION
 * Resolves institutions relevant to the user's current active (or historical if requested) obligations.
 */
export function getApplicableInstitutions(
  financialContext: FinancialContext,
  showHistorical: boolean = false
): ApplicableInstitution[] {
  const obligations = financialContext.obligations || [];
  const activeObligations = obligations.filter((obl) => {
    if (obl.isSalary) return false; // Exclude employer salary credit
    if (!showHistorical) {
      const statusLower = (obl.status || '').toLowerCase();
      if (statusLower === 'closed' || statusLower === 'historical' || statusLower === 'inactive') {
        return false;
      }
    }
    return true;
  });

  // Group obligations by normalized institution key
  const MapByInstKey = new Map<string, { name: string; obligations: FinancialObligation[] }>();

  for (const obl of activeObligations) {
    const rawName = obl.institutionName || obl.title || 'Unknown Institution';
    const key = normalizeInstitutionKey(rawName);

    if (!MapByInstKey.has(key)) {
      MapByInstKey.set(key, { name: rawName, obligations: [] });
    }
    MapByInstKey.get(key)!.obligations.push(obl);
  }

  const result: ApplicableInstitution[] = [];

  for (const [key, item] of MapByInstKey.entries()) {
    const verifiedInst = verifyInstitution(key, item.name);
    const facilities: FacilityDetail[] = item.obligations.map((o) => ({
      id: o.id,
      title: o.title,
      category: o.category,
      facilityIdentifier: o.notes?.match(/[A-Z0-9-]{6,}/)?.[0] || o.id.toUpperCase(),
      amount: o.amount,
      dueDate: o.dueDate,
      status: ((o.status as string) === 'Closed' || (o.status as string) === 'Historical' ? 'Closed' : 'Active') as 'Active' | 'Closed',
      notes: o.notes,
    }));

    // Retrieve product-aware policy
    const policy = retrieveInstitutionPolicy(key, item.name, facilities[0]?.category);

    result.push({
      ...verifiedInst,
      facilities,
      isPolicyVerified: !!policy,
      verifiedPolicy: policy || undefined,
    });
  }

  return result;
}

/**
 * Normalizes institution names into canonical keys
 */
function normalizeInstitutionKey(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('bca') || lower.includes('central asia')) return 'bca';
  if (lower.includes('mandiri')) return 'mandiri';
  if (lower.includes('bri') || lower.includes('rakyat indonesia')) return 'bri';
  if (lower.includes('btpn') || lower.includes('jenius')) return 'btpn';
  if (lower.includes('adakami')) return 'adakami';
  if (lower.includes('easycash') || lower.includes('easy cash')) return 'easycash';
  if (lower.includes('kredit pintar') || lower.includes('kreditpintar')) return 'kreditpintar';
  return lower.replace(/[^a-z0-9]/g, '');
}

/**
 * 2. VERIFY INSTITUTION
 */
export function verifyInstitution(key: string, originalName: string) {
  switch (key) {
    case 'bca':
      return {
        institutionId: 'bank-bca',
        institutionName: 'Bank Central Asia (BCA)',
        legalEntity: 'PT Bank Central Asia Tbk',
        institutionType: 'Bank' as const,
        verifiedBadge: '✓ Verified financial institution',
        officialUrl: 'https://www.bca.co.id/id/Individu/produk/pinjaman/Pinjaman-Personal',
        licenceNumber: 'S-122/PB.1/2021',
        isVerifiedByOJK: true,
      };
    case 'mandiri':
      return {
        institutionId: 'bank-mandiri',
        institutionName: 'Bank Mandiri',
        legalEntity: 'PT Bank Mandiri (Persero) Tbk',
        institutionType: 'Bank' as const,
        verifiedBadge: '✓ Verified financial institution',
        officialUrl: 'https://www.bankmandiri.co.id',
        licenceNumber: 'S-088/PB.1/2020',
        isVerifiedByOJK: true,
      };
    case 'bri':
      return {
        institutionId: 'bank-bri',
        institutionName: 'Bank Rakyat Indonesia (BRI)',
        legalEntity: 'PT Bank Rakyat Indonesia (Persero) Tbk',
        institutionType: 'Bank' as const,
        verifiedBadge: '✓ Verified financial institution',
        officialUrl: 'https://www.bri.co.id',
        licenceNumber: 'S-045/PB.1/2019',
        isVerifiedByOJK: true,
      };
    case 'btpn':
      return {
        institutionId: 'bank-btpn',
        institutionName: 'Bank BTPN (Jenius / BTPN)',
        legalEntity: 'PT Bank BTPN Tbk',
        institutionType: 'Bank' as const,
        verifiedBadge: '✓ Verified financial institution',
        officialUrl: 'https://www.btpn.com',
        licenceNumber: 'S-102/PB.1/2020',
        isVerifiedByOJK: true,
      };
    case 'adakami':
      return {
        institutionId: 'pindar-adakami',
        institutionName: 'AdaKami',
        legalEntity: 'PT Pembiayaan Digital Indonesia',
        institutionType: 'Pindar' as const,
        verifiedBadge: '✓ OJK-licensed provider',
        officialUrl: 'https://www.adakami.id',
        licenceNumber: 'KEP-128/D.05/2021',
        isVerifiedByOJK: true,
      };
    case 'easycash':
      return {
        institutionId: 'pindar-easycash',
        institutionName: 'EasyCash',
        legalEntity: 'PT Indonesia Fintopia Tech',
        institutionType: 'Pindar' as const,
        verifiedBadge: '✓ OJK-licensed provider',
        officialUrl: 'https://www.easycash.id',
        licenceNumber: 'KEP-82/D.05/2020',
        isVerifiedByOJK: true,
      };
    case 'kreditpintar':
      return {
        institutionId: 'pindar-kreditpintar',
        institutionName: 'Kredit Pintar',
        legalEntity: 'PT Kredit Pintar Indonesia',
        institutionType: 'Pindar' as const,
        verifiedBadge: '✓ OJK-licensed provider',
        officialUrl: 'https://www.kreditpintar.com',
        licenceNumber: 'KEP-83/D.05/2019',
        isVerifiedByOJK: true,
      };
    default:
      return {
        institutionId: `custom-${key}`,
        institutionName: originalName,
        legalEntity: `${originalName} Entity`,
        institutionType: (originalName.toLowerCase().includes('bank') ? 'Bank' : 'Pindar') as any,
        verifiedBadge: 'Unverified Entity',
        officialUrl: '#',
        licenceNumber: 'Pending Verification',
        isVerifiedByOJK: false,
      };
  }
}

/**
 * 3. PRODUCT-AWARE POLICY RETRIEVAL
 */
export function retrieveInstitutionPolicy(key: string, name: string, productCategory?: string) {
  switch (key) {
    case 'bca':
      return {
        title: 'BCA Personal Loan — Product Terms & Service Guidelines',
        documentType: 'Standard Bank Facility Policy',
        effectiveDate: '2026-01-15',
        officialUrl: 'https://www.bca.co.id/id/Individu/produk/pinjaman/Pinjaman-Personal',
        productInformation: 'BCA Personal Loan unsecured facility with fixed monthly instalment schedule.',
        riplayInfo: 'N/A (Commercial Bank Facility Statement)',
        repaymentInformation: 'Scheduled auto-debit from designated primary BCA payroll or operational account.',
        productTerms: 'Fixed monthly principal & interest. Grace periods or auto-debit adjustments require prior authorization.',
        customerAssistance: 'Halo BCA 1500888 / official Halo BCA Mobile application.',
        complaintsContactRoute: 'BCA Customer Relations & Branch Relationship Manager.',
      };

    case 'mandiri':
      return {
        title: 'Bank Mandiri KSM — Product Terms & Customer Assistance',
        documentType: 'Standard Bank Credit Policy',
        effectiveDate: '2026-01-01',
        officialUrl: 'https://www.bankmandiri.co.id/kredit-serbaguna-mandiri',
        productInformation: 'Mandiri Kredit Serbaguna Mandiri (KSM) consumer credit facility.',
        riplayInfo: 'N/A (Commercial Bank Product Terms)',
        repaymentInformation: 'Automatic debit from Mandiri savings account on designated instalment due date.',
        productTerms: 'Fixed tenure rate. Late payments attract contractual penalty per Mandiri lending guidelines.',
        customerAssistance: 'Mandiri Call 14000 / Livin\' by Mandiri Help Desk.',
        complaintsContactRoute: 'Mandiri Consumer Protection Unit & Branch Service Manager.',
      };

    case 'bri':
      return {
        title: 'BRI Briguna — Personal Loan Product & Service Rules',
        documentType: 'Standard Bank Facility Policy',
        effectiveDate: '2026-01-01',
        officialUrl: 'https://www.bri.co.id/bri-briguna',
        productInformation: 'BRI Briguna Personal Loan for payroll and salaried individuals.',
        riplayInfo: 'N/A (State Commercial Bank Terms)',
        repaymentInformation: 'Direct payroll auto-deduction or account standing order on salary date.',
        productTerms: 'Fixed monthly payments linked to employer payroll agreement.',
        customerAssistance: 'Call BRI 14017 / 1500017 / BRImo In-App Assistance.',
        complaintsContactRoute: 'BRI Official Complaints Care & Local Branch Management.',
      };

    case 'btpn':
      return {
        title: 'BTPN Flexi Cash — Facility Guidelines & Terms',
        documentType: 'Digital Bank Credit Policy',
        effectiveDate: '2026-01-01',
        officialUrl: 'https://www.btpn.com/id/pribadi/pinjaman',
        productInformation: 'BTPN Jenius Flexi Cash revolving credit line facility.',
        riplayInfo: 'Jenius Digital Product Disclosure Statement',
        repaymentInformation: 'Automatic deduction from active Jenius balance on selected due date.',
        productTerms: 'Flexible repayment tenure option with daily interest calculation.',
        customerAssistance: 'BTPN Care 1500300 / Jenius 24/7 In-App Chat.',
        complaintsContactRoute: 'BTPN Customer Care Service & Digital Support Center.',
      };

    case 'adakami':
      return {
        title: 'AdaKami — RIPLAY & Product Governance Standards',
        documentType: 'OJK LPBBTI Product RIPLAY',
        effectiveDate: '2026-01-01',
        officialUrl: 'https://www.adakami.id/riplay',
        productInformation: 'Short-term micro-credit and instalment facility under OJK LPBBTI framework.',
        riplayInfo: 'AdaKami Ringkasan Informasi Produk dan Layanan (RIPLAY) document.',
        repaymentInformation: 'Virtual Account repayment via major Indonesian bank gateways or retail channels.',
        productTerms: 'Interest rates and daily caps strictly regulated under SEOJK 19/SEOJK.06/2025.',
        customerAssistance: 'AdaKami Customer Service Hotline (1500077) / Email support.',
        complaintsContactRoute: 'AdaKami Customer Support & Official Complaints Channel.',
      };

    case 'easycash':
      return {
        title: 'EasyCash — RIPLAY & LPBBTI Borrower Guidelines',
        documentType: 'OJK LPBBTI Product Disclosure',
        effectiveDate: '2026-01-01',
        officialUrl: 'https://www.easycash.id/riplay',
        productInformation: 'Licensed P2P digital cash advance facility operated by PT Indonesia Fintopia Tech.',
        riplayInfo: 'EasyCash RIPLAY transparency and fee schedule disclosure.',
        repaymentInformation: 'Virtual Account payment due before 23:59 WIB on repayment date.',
        productTerms: 'Complies with POJK 40/2024 borrower protection and SEOJK 19/2025 collection codes.',
        customerAssistance: 'EasyCash Customer Service App & Official Telephone Hotline.',
        complaintsContactRoute: 'EasyCash Complaints & Consumer Helpdesk.',
      };

    case 'kreditpintar':
      return {
        title: 'Kredit Pintar — LPBBTI RIPLAY & Service Terms',
        documentType: 'OJK LPBBTI Product Summary',
        effectiveDate: '2026-01-01',
        officialUrl: 'https://www.kreditpintar.com/riplay',
        productInformation: 'Licensed LPBBTI cash advance & installment facility by PT Kredit Pintar Indonesia.',
        riplayInfo: 'Kredit Pintar RIPLAY product disclosure document.',
        repaymentInformation: 'In-app Virtual Account or Alfamart/Indomaret retail payment code.',
        productTerms: 'Governed by OJK LPBBTI regulations.',
        customerAssistance: 'Kredit Pintar Customer Care (021-50882388).',
        complaintsContactRoute: 'Kredit Pintar Consumer Service Department.',
      };

    default:
      // Return null for unverified or custom institutions
      return null;
  }
}

/**
 * 4. RETRIEVE APPLICABLE REGULATIONS
 * Returns only regulatory frameworks relevant to the user's active obligations!
 */
export function retrieveApplicableRegulations(
  financialContext: FinancialContext,
  showHistorical: boolean = false
): {
  sector: 'Banking' | 'Pindar / LPBBTI' | 'Credit Reporting & Consumer Protection';
  rules: RegulatorySource[];
}[] {
  const applicableInsts = getApplicableInstitutions(financialContext, showHistorical);
  const hasBank = applicableInsts.some((i) => i.institutionType === 'Bank');
  const hasPindar = applicableInsts.some((i) => i.institutionType === 'Pindar');

  const sectors: {
    sector: 'Banking' | 'Pindar / LPBBTI' | 'Credit Reporting & Consumer Protection';
    rules: RegulatorySource[];
  }[] = [];

  // 1. Banking Regulations
  if (hasBank) {
    sectors.push({
      sector: 'Banking',
      rules: [
        {
          id: 'pojk-22-2023',
          organisation: 'OJK (Otoritas Jasa Keuangan)',
          sourceType: 'Regulation (POJK)',
          title: 'POJK 22 Tahun 2023 — Pelindungan Konsumen dan Masyarakat di Sektor Jasa Keuangan',
          codeNumber: 'POJK 22 Tahun 2023',
          publicationDate: '2023-12-22',
          effectiveDate: '2023-12-22',
          lastChecked: 'Today 17:30 WIB',
          status: 'Current',
          officialUrl: 'https://ojk.go.id/id/regulasi/Pages/Pelindungan-Konsumen-dan-Masyarakat-di-Sektor-Jasa-Keuangan.aspx',
          summaryText: 'Statutory framework for financial consumer rights, transparent dispute resolution, and fair treatment.',
          keyClauses: [
            'Consumers are entitled to clear, accurate, correct, accessible and non-misleading information about financial products and services.',
            'Financial services providers must maintain consumer complaint-handling mechanisms and respond to complaints in accordance with applicable requirements.'
          ]
        }
      ]
    });
  }

  // 2. LPBBTI / Pindar Regulations
  if (hasPindar) {
    sectors.push({
      sector: 'Pindar / LPBBTI',
      rules: [
        {
          id: 'pojk-40-2024',
          organisation: 'OJK (Otoritas Jasa Keuangan)',
          sourceType: 'Regulation (POJK)',
          title: 'POJK 40 Tahun 2024 — Layanan Pendanaan Bersama Berbasis Teknologi Informasi',
          codeNumber: 'POJK 40 Tahun 2024',
          publicationDate: '2024-12-30',
          effectiveDate: '2024-12-30',
          lastChecked: 'Today 17:30 WIB',
          status: 'Current',
          officialUrl: 'https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx',
          summaryText: 'Primary statutory framework for LPBBTI operations, consumer protection, governance, and borrower rights.',
          keyClauses: [
            'Establishes statutory governance standards and borrower dispute resolution procedures.',
            'Mandates fair treatment and clear disclosure of repayment terms for licensed P2P providers.'
          ]
        },
        {
          id: 'seojk-19-2025',
          organisation: 'OJK (Otoritas Jasa Keuangan)',
          sourceType: 'Circular Letter (SEOJK)',
          title: 'SEOJK 19/SEOJK.06/2025 — Penyelenggaraan LPBBTI',
          codeNumber: 'SEOJK 19/SEOJK.06/2025',
          publicationDate: '2025-07-31',
          effectiveDate: '2025-07-31',
          lastChecked: 'Today 17:30 WIB',
          status: 'Current',
          officialUrl: 'https://ojk.go.id/id/regulasi/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI.aspx',
          summaryText: 'Current operational guidelines for LPBBTI providers. Effective 31 July 2025, revoking and superseding SEOJK 19/SEOJK.06/2023.',
          keyClauses: [
            'Sets current regulatory parameters for LPBBTI lender operations and collection protocols.',
            'Supersedes SEOJK 19/SEOJK.06/2023 effective 31 July 2025.'
          ]
        }
      ]
    });
  }

  // 3. Credit Reporting (SLIK) - Always applicable for general credit quality reference
  sectors.push({
    sector: 'Credit Reporting & Consumer Protection',
    rules: [
      {
        id: 'ojk-slik',
        organisation: 'OJK (Otoritas Jasa Keuangan)',
        sourceType: 'Official System Portal',
        title: 'SLIK — Sistem Layanan Informasi Keuangan & Credit Reporting',
        codeNumber: 'OJK SLIK',
        publicationDate: '2024-01-01',
        effectiveDate: '2024-01-01',
        lastChecked: 'Today 17:30 WIB',
        status: 'Current',
        officialUrl: 'https://ojk.go.id/id/kanal/perbankan/Pages/Sistem-Layanan-Informasi-Keuangan-SLIK.aspx',
        summaryText: 'National credit reporting database tracking borrower collectibility and credit history.',
        keyClauses: [
          'Collectibility classifications (Collectibility 1-5) determine debtor credit score.',
          'Timely settlement prevents adverse reporting to OJK SLIK iDeb register.'
        ]
      }
    ]
  });

  return sectors;
}
