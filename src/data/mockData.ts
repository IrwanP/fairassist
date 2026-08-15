import { 
  FinancialContext, 
  Institution, 
  EvidenceItem, 
  FinancialObligation, 
  RegulatorySource, 
  InstitutionPolicy, 
  NextBestAction, 
  GeminiInsight,
  AgentActivity
} from '../types';

export const AVAILABLE_BANKS: Institution[] = [
  {
    id: 'bank-bca',
    name: 'Bank Central Asia (BCA)',
    shortName: 'BCA',
    type: 'Bank',
    logoText: 'BCA',
    officialUrl: 'https://www.bca.co.id/id/Individu/produk/pinjaman/Pinjaman-Personal',
    licenceNumber: 'S-122/PB.1/2021',
    status: 'OJK Authorised'
  },
  {
    id: 'bank-mandiri',
    name: 'Bank Mandiri',
    shortName: 'Mandiri',
    type: 'Bank',
    logoText: 'MDR',
    officialUrl: 'https://www.bankmandiri.co.id',
    licenceNumber: 'S-088/PB.1/2020',
    status: 'OJK Authorised'
  },
  {
    id: 'bank-bri',
    name: 'Bank Rakyat Indonesia (BRI)',
    shortName: 'BRI',
    type: 'Bank',
    logoText: 'BRI',
    officialUrl: 'https://www.bri.co.id',
    licenceNumber: 'S-045/PB.1/2019',
    status: 'OJK Authorised'
  }
];

export const AVAILABLE_PINDARS: Institution[] = [
  {
    id: 'pindar-adakami',
    name: 'AdaKami (PT Pembiayaan Digital Indonesia)',
    shortName: 'AdaKami',
    type: 'OJK Licensed P2P',
    logoText: 'ADK',
    officialUrl: 'https://www.adakami.id',
    licenceNumber: 'KEP-128/D.05/2021',
    status: 'Licensed & Supervised'
  },
  {
    id: 'pindar-easycash',
    name: 'EasyCash (PT Indonesia Fintopia Tech)',
    shortName: 'EasyCash',
    type: 'OJK Licensed P2P',
    logoText: 'EC',
    officialUrl: 'https://easycash.id',
    licenceNumber: 'KEP-82/D.05/2020',
    status: 'Licensed & Supervised'
  },
  {
    id: 'pindar-kreditpintar',
    name: 'Kredit Pintar (PT Kredit Pintar Indonesia)',
    shortName: 'Kredit Pintar',
    type: 'OJK Licensed P2P',
    logoText: 'KPT',
    officialUrl: 'https://www.kreditpintar.com',
    licenceNumber: 'KEP-83/D.05/2019',
    status: 'Licensed & Supervised'
  }
];

export const SAMPLE_SCENARIO_EVIDENCE: EvidenceItem[] = [
  {
    id: 'ev-1',
    title: 'Bank Repayment SMS & App Notice',
    category: 'Bank repayment notification',
    fileName: 'repayment_notice_bca_202608.png',
    fileType: 'image/png',
    uploadDate: '2026-08-20',
    syntheticFlag: true,
    extractedDetails: {
      institutionName: 'Bank Central Asia (BCA)',
      amountDue: 1200000,
      dueDate: '2026-08-25',
      referenceNumber: 'BCA-PL-8839201',
      notes: 'Automated auto-debit reminder for Personal Loan instalment.'
    },
    verifiedStatus: 'Verified',
    verifiedBadge: 'Sample Evidence · Gemini Analysed'
  },
  {
    id: 'ev-2',
    title: 'Pindar Active Loan Screen',
    category: 'Pindar app repayment screenshot',
    fileName: 'pindar_adakami_repayment.jpg',
    fileType: 'image/jpeg',
    uploadDate: '2026-08-21',
    syntheticFlag: true,
    extractedDetails: {
      institutionName: 'AdaKami (PT Pembiayaan Digital Indonesia)',
      amountDue: 750000,
      dueDate: '2026-08-27',
      referenceNumber: 'ADK-LN-3349102',
      notes: 'Short-term cash advance instalment due before 23:59 WIB.'
    },
    verifiedStatus: 'Verified',
    verifiedBadge: 'Sample Evidence · Gemini Analysed'
  },
  {
    id: 'ev-easycash-collection',
    title: 'EasyCash Repayment Notification',
    category: 'Pindar app repayment screenshot',
    fileName: 'easycash_repayment_notice.png',
    fileType: 'image/png',
    uploadDate: '2026-08-23',
    syntheticFlag: true,
    extractedDetails: {
      institutionName: 'EasyCash (PT Indonesia Fintopia Tech)',
      productName: 'LPBBTI Short-term Loan',
      amountDue: 650000,
      dueDate: '2026-08-24',
      referenceNumber: 'EC-NOTICE-9921',
      notes: 'Active repayment notification before due date. Classification: ACTIVE_OBLIGATION / REPAYMENT_NOTICE.'
    },
    geminiExtractedDetails: {
      category: 'Pindar app repayment screenshot',
      institutionName: 'EasyCash',
      productName: 'LPBBTI Short-term Loan',
      amountDue: 650000,
      dueDate: '2026-08-24',
      referenceNumber: 'EC-NOTICE-9921',
      confidence: 'High',
      summaryStatement: 'An EasyCash repayment notification showing Rp650,000 due on 24 August 2026.'
    },
    userConfirmedDetails: {
      category: 'Pindar app repayment screenshot',
      institutionName: 'EasyCash',
      productName: 'LPBBTI Short-term Loan',
      amountDue: 650000,
      dueDate: '2026-08-24',
      referenceNumber: 'EC-NOTICE-9921',
      notes: 'Repayment notification for active EasyCash obligation.'
    },
    confidence: 'High',
    summaryStatement: 'An EasyCash repayment notification showing Rp650,000 due on 24 August 2026.',
    verifiedStatus: 'Verified',
    verifiedBadge: 'Sample Evidence · Gemini Analysed'
  },
  {
    id: 'ev-3',
    title: 'Monthly Salary Bank Statement',
    category: 'Bank statement',
    fileName: 'bank_statement_august_2026.pdf',
    fileType: 'application/pdf',
    uploadDate: '2026-08-22',
    syntheticFlag: true,
    extractedDetails: {
      institutionName: 'Bank Central Asia (BCA)',
      amountDue: 0,
      dueDate: '2026-08-28',
      referenceNumber: 'TX-PAYROLL-99201',
      notes: 'Verified regular monthly employer payroll deposit Rp8,500,000 scheduled on 28th.'
    },
    verifiedStatus: 'Verified',
    verifiedBadge: 'Sample Evidence · Gemini Analysed'
  },
  {
    id: 'ev-4',
    title: 'iDeb SLIK Debitur Inquiry',
    category: 'iDeb SLIK – Debitur Perseorangan',
    fileName: 'ideb_slik_report_ayu_putri.pdf',
    fileType: 'application/pdf',
    uploadDate: '2026-08-20',
    syntheticFlag: true,
    extractedDetails: {
      institutionName: 'OJK SLIK System',
      referenceNumber: 'SLIK-2026-88391',
      notes: 'Debtor: Ayu Putri. 3 active facilities, Collectibility 1 (Lancar), no current arrears. Report date: 20 August 2026.'
    },
    verifiedStatus: 'Verified',
    verifiedBadge: 'Sample Evidence · Credit Report'
  }
];

export const INITIAL_EVIDENCE: EvidenceItem[] = [];

export const SAMPLE_SCENARIO_OBLIGATIONS: FinancialObligation[] = [
  {
    id: 'obl-1',
    title: 'Personal Loan Instalment',
    institutionId: 'bank-bca',
    institutionName: 'Bank Central Asia (BCA)',
    category: 'Bank Loan',
    amount: 1200000,
    dueDate: '2026-08-25',
    formattedDate: '25 August 2026',
    status: 'Upcoming',
    notes: 'Auto-debit mandate active on BCA primary operational account.'
  },
  {
    id: 'obl-2',
    title: 'Short-term Micro-credit',
    institutionId: 'pindar-adakami',
    institutionName: 'AdaKami',
    category: 'Pindar Loan',
    amount: 750000,
    dueDate: '2026-08-27',
    formattedDate: '27 August 2026',
    status: 'Upcoming',
    notes: 'P2P repayment via virtual account.'
  },
  {
    id: 'obl-easycash',
    title: 'Repayment Due Notice',
    institutionId: 'pindar-easycash',
    institutionName: 'EasyCash',
    category: 'Pindar Loan',
    amount: 650000,
    dueDate: '2026-08-24',
    formattedDate: '24 August 2026',
    status: 'Upcoming',
    notes: 'Repayment notification from EasyCash for Rp650,000 due on 24 August 2026.'
  },
  {
    id: 'obl-3',
    title: 'Monthly Employment Salary Deposit',
    institutionId: 'employer-payroll',
    institutionName: 'PT Teknologi Digital Indonesia',
    category: 'Salary',
    amount: 8500000,
    dueDate: '2026-08-28',
    formattedDate: '28 August 2026',
    isSalary: true,
    status: 'Upcoming',
    notes: 'Verified recurring monthly payroll credit.'
  }
];

export const INITIAL_OBLIGATIONS: FinancialObligation[] = [];

export const INITIAL_REGULATORY_SOURCES: RegulatorySource[] = [
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
  },
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
  },
  {
    id: 'seojk-19-2023',
    organisation: 'OJK (Otoritas Jasa Keuangan)',
    sourceType: 'Circular Letter (SEOJK)',
    title: 'SEOJK 19/SEOJK.06/2023 — Penyelenggaraan LPBBTI (Historic)',
    codeNumber: 'SEOJK 19/SEOJK.06/2023',
    publicationDate: '2023-11-10',
    effectiveDate: '2024-01-01',
    lastChecked: 'Today 17:30 WIB',
    status: 'Superseded',
    officialUrl: 'https://ojk.go.id/id/regulasi/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI.aspx',
    summaryText: 'Historic circular letter for LPBBTI providers. Revoked and superseded by SEOJK 19/SEOJK.06/2025 on 31 July 2025.',
    keyClauses: [
      'Superseded by SEOJK 19/SEOJK.06/2025 effective 31 July 2025.',
      'Retained for historical regulatory comparison only.'
    ]
  }
];

export const INITIAL_INSTITUTION_POLICIES: InstitutionPolicy[] = [
  {
    id: 'pol-bca-res',
    institutionId: 'bank-bca',
    institutionName: 'Bank Central Asia (BCA)',
    title: 'BCA Personal Loan — Official Product Information',
    documentType: 'Standard Lending Terms',
    effectiveDate: '2026-01-15',
    lastChecked: 'Today 17:30 WIB',
    status: 'Current',
    officialUrl: 'https://www.bca.co.id/id/Individu/produk/pinjaman/Pinjaman-Personal',
    eligibleConditions: [
      'Borrowers with active BCA Personal Loan facility.',
      'Contact Halo BCA official customer service for individual facility options.'
    ],
    maxExtensionDays: 5
  },
  {
    id: 'pol-adakami-riplay',
    institutionId: 'pindar-adakami',
    institutionName: 'AdaKami (PT Pembiayaan Digital Indonesia)',
    title: 'AdaKami — Ringkasan Informasi Produk dan Layanan (RIPLAY)',
    documentType: 'Standard Lending Terms',
    effectiveDate: '2026-01-01',
    lastChecked: 'Today 17:30 WIB',
    status: 'Current',
    officialUrl: 'https://www.adakami.id/riplay',
    eligibleConditions: [
      'Borrowers with active account in good standing.',
      'Contact AdaKami official support and complaints channel prior to due date for facility options.'
    ],
    maxExtensionDays: 3
  }
];

export const INITIAL_GEMINI_INSIGHT: GeminiInsight = {
  id: 'gi-1',
  quote: 'Welcome to FairAssist.',
  summary: 'Ask FairAssist about your repayment concern or add financial evidence when ready.',
  evidenceCount: 0,
  trustedSourcesCount: 0,
  generatedAt: 'Just now',
  tags: ['Onboarding', 'Awaiting Evidence']
};

export const INITIAL_NEXT_BEST_ACTIONS: NextBestAction[] = [];

export const INITIAL_PIPELINE_STATE: AgentActivity = {
  currentStage: 'UNDERSTAND',
  stages: [
    { stage: 'UNDERSTAND', status: 'pending' },
    { stage: 'RETRIEVE', status: 'pending' },
    { stage: 'VERIFY', status: 'pending' },
    { stage: 'REASON', status: 'pending' },
    { stage: 'ACT', status: 'pending' }
  ],
  activeStepDescription: 'Waiting for your question or evidence'
};

export const DEFAULT_FINANCIAL_CONTEXT: FinancialContext = {
  userPersona: {
    name: 'Borrower',
    email: 'borrower@fairassist.id',
    occupation: 'Borrower',
    syntheticFlag: false
  },
  availableCash: null,
  selectedBank: AVAILABLE_BANKS[0],
  selectedPindar: AVAILABLE_PINDARS[0],
  obligations: [],
  evidenceList: [],
  regulatorySources: INITIAL_REGULATORY_SOURCES,
  institutionPolicies: INITIAL_INSTITUTION_POLICIES,
  nextSalaryDate: null,
  nextSalaryAmount: null
};
