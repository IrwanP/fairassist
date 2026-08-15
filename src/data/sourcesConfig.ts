import { SourceFreshnessStatus } from '../types';

export interface CanonicalSourceConfig {
  id: string;
  organisation: string;
  title: string;
  codeNumber: string;
  sourceType: string;
  canonicalUrl: string;
  effectiveDate: string;
  status: SourceFreshnessStatus;
  supersededBy?: string;
  notes?: string;
}

export const ALLOWED_OFFICIAL_DOMAINS = [
  'ojk.go.id',
  'www.ojk.go.id',
  'bi.go.id',
  'www.bi.go.id',
  'bca.co.id',
  'www.bca.co.id',
  'bankmandiri.co.id',
  'www.bankmandiri.co.id',
  'bri.co.id',
  'www.bri.co.id',
  'btpn.com',
  'www.btpn.com',
  'adakami.id',
  'www.adakami.id',
  'kreditpintar.com',
  'www.kreditpintar.com',
  'easycash.id',
  'www.easycash.id'
];

export const CANONICAL_TRUSTED_SOURCES: CanonicalSourceConfig[] = [
  {
    id: 'ojk-directory',
    organisation: 'OJK (Otoritas Jasa Keuangan)',
    title: 'Direktori Penyelenggara LPBBTI (Fintech Lending) Berizin OJK',
    codeNumber: 'Direktori LPBBTI OJK',
    sourceType: 'Official Directory',
    canonicalUrl: 'https://ojk.go.id/id/kanal/iknb/data-dan-statistik/direktori/fintech/default.aspx',
    effectiveDate: '2025-01-01',
    status: 'Current',
    notes: 'Verify current licensed LPBBTI/Pindar providers.'
  },
  {
    id: 'pojk-40-2024',
    organisation: 'OJK (Otoritas Jasa Keuangan)',
    title: 'POJK 40 Tahun 2024 — Layanan Pendanaan Bersama Berbasis Teknologi Informasi',
    codeNumber: 'POJK 40 Tahun 2024',
    sourceType: 'Regulation (POJK)',
    canonicalUrl: 'https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx',
    effectiveDate: '2024-12-30',
    status: 'Current'
  },
  {
    id: 'seojk-19-2025',
    organisation: 'OJK (Otoritas Jasa Keuangan)',
    title: 'SEOJK 19/SEOJK.06/2025 — Penyelenggaraan LPBBTI',
    codeNumber: 'SEOJK 19/SEOJK.06/2025',
    sourceType: 'Circular Letter (SEOJK)',
    canonicalUrl: 'https://ojk.go.id/id/regulasi/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI.aspx',
    effectiveDate: '2025-07-31',
    status: 'Current',
    notes: 'Effective 31 July 2025; revokes and supersedes SEOJK 19/SEOJK.06/2023.'
  },
  {
    id: 'pojk-8-2026',
    organisation: 'OJK (Otoritas Jasa Keuangan)',
    title: 'POJK 8 Tahun 2026 — Pelaporan dan Permintaan Data Transaksi Pendanaan LPBBTI',
    codeNumber: 'POJK 8 Tahun 2026',
    sourceType: 'Regulation (POJK)',
    canonicalUrl: 'https://ojk.go.id/id/regulasi/Pages/POJK-8-Tahun-2026-Pelaporan-dan-Permintaan-Data-Transaksi-Pendanaan-oleh-Penyelenggara-LPBBTI.aspx',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  {
    id: 'pojk-22-2023',
    organisation: 'OJK (Otoritas Jasa Keuangan)',
    title: 'POJK 22 Tahun 2023 — Pelindungan Konsumen dan Masyarakat di Sektor Jasa Keuangan',
    codeNumber: 'POJK 22 Tahun 2023',
    sourceType: 'Regulation (POJK)',
    canonicalUrl: 'https://ojk.go.id/id/regulasi/Pages/Pelindungan-Konsumen-dan-Masyarakat-di-Sektor-Jasa-Keuangan.aspx',
    effectiveDate: '2023-12-22',
    status: 'Current'
  },
  {
    id: 'ojk-slik',
    organisation: 'OJK (Otoritas Jasa Keuangan)',
    title: 'SLIK — Sistem Layanan Informasi Keuangan',
    codeNumber: 'OJK SLIK',
    sourceType: 'Official System Portal',
    canonicalUrl: 'https://ojk.go.id/id/kanal/perbankan/Pages/Sistem-Layanan-Informasi-Keuangan-SLIK.aspx',
    effectiveDate: '2024-01-01',
    status: 'Current'
  },
  // BCA Sources
  {
    id: 'bca-personal-loan',
    organisation: 'Bank Central Asia (BCA)',
    title: 'BCA Personal Loan — Official Product Information',
    codeNumber: 'BCA Personal Loan',
    sourceType: 'Product Information',
    canonicalUrl: 'https://www.bca.co.id/id/Individu/produk/pinjaman/Pinjaman-Personal',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  {
    id: 'bca-halo-bca',
    organisation: 'Bank Central Asia (BCA)',
    title: 'Halo BCA — Official Customer Service & Restructuring',
    codeNumber: 'Halo BCA',
    sourceType: 'Support Channel',
    canonicalUrl: 'https://www.bca.co.id/id/Individu/layanan/Customer-Service/HaloBCA',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  // Bank Mandiri Sources
  {
    id: 'mandiri-personal-loan',
    organisation: 'Bank Mandiri',
    title: 'Mandiri KSM (Kredit Serbaguna Mandiri) — Product Terms',
    codeNumber: 'Mandiri KSM',
    sourceType: 'Product Information',
    canonicalUrl: 'https://www.bankmandiri.co.id/kredit-serbaguna-mandiri',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  {
    id: 'mandiri-call',
    organisation: 'Bank Mandiri',
    title: 'Mandiri Call 14000 & Customer Assistance',
    codeNumber: 'Mandiri Support',
    sourceType: 'Support Channel',
    canonicalUrl: 'https://www.bankmandiri.co.id/mandiri-call',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  // BRI Sources
  {
    id: 'bri-briguna',
    organisation: 'Bank Rakyat Indonesia (BRI)',
    title: 'BRI Briguna Personal Credit — Product & Repayment Terms',
    codeNumber: 'BRI Briguna',
    sourceType: 'Product Information',
    canonicalUrl: 'https://www.bri.co.id/bri-briguna',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  {
    id: 'bri-call',
    organisation: 'Bank Rakyat Indonesia (BRI)',
    title: 'Call BRI 14017 / 1500017 Official Contact Route',
    codeNumber: 'Call BRI',
    sourceType: 'Support Channel',
    canonicalUrl: 'https://www.bri.co.id/kontak-kami',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  // BTPN Sources
  {
    id: 'btpn-flexi',
    organisation: 'Bank BTPN (Jenius / BTPN)',
    title: 'BTPN Flexi Cash & Personal Facility Terms',
    codeNumber: 'BTPN Flexi Cash',
    sourceType: 'Product Information',
    canonicalUrl: 'https://www.btpn.com/id/pribadi/pinjaman',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  {
    id: 'btpn-care',
    organisation: 'Bank BTPN (Jenius / BTPN)',
    title: 'BTPN Care 1500300 Official Support Channel',
    codeNumber: 'BTPN Care',
    sourceType: 'Support Channel',
    canonicalUrl: 'https://www.btpn.com/id/bantuan',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  // AdaKami Sources
  {
    id: 'adakami-website',
    organisation: 'AdaKami (PT Pembiayaan Digital Indonesia)',
    title: 'AdaKami Official Portal & License Verification',
    codeNumber: 'AdaKami Portal',
    sourceType: 'Official Website',
    canonicalUrl: 'https://www.adakami.id/',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  {
    id: 'adakami-riplay',
    organisation: 'AdaKami (PT Pembiayaan Digital Indonesia)',
    title: 'AdaKami — Ringkasan Informasi Produk dan Layanan (RIPLAY)',
    codeNumber: 'RIPLAY AdaKami',
    sourceType: 'Product Summary (RIPLAY)',
    canonicalUrl: 'https://www.adakami.id/riplay',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  // EasyCash Sources
  {
    id: 'easycash-website',
    organisation: 'EasyCash (PT Indonesia Fintopia Tech)',
    title: 'EasyCash OJK Licensed LPBBTI Facility Terms',
    codeNumber: 'EasyCash Portal',
    sourceType: 'Official Website',
    canonicalUrl: 'https://www.easycash.id/',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  {
    id: 'easycash-riplay',
    organisation: 'EasyCash (PT Indonesia Fintopia Tech)',
    title: 'EasyCash — RIPLAY & Borrower Terms & Conditions',
    codeNumber: 'RIPLAY EasyCash',
    sourceType: 'Product Summary (RIPLAY)',
    canonicalUrl: 'https://www.easycash.id/riplay',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  // Kredit Pintar Sources
  {
    id: 'kreditpintar-riplay',
    organisation: 'Kredit Pintar (PT Kredit Pintar Indonesia)',
    title: 'Kredit Pintar — LPBBTI Product Summary & Restructuring Policy',
    codeNumber: 'RIPLAY Kredit Pintar',
    sourceType: 'Product Summary (RIPLAY)',
    canonicalUrl: 'https://www.kreditpintar.com/riplay',
    effectiveDate: '2026-01-01',
    status: 'Current'
  },
  {
    id: 'seojk-19-2023',
    organisation: 'OJK (Otoritas Jasa Keuangan)',
    title: 'SEOJK 19/SEOJK.06/2023 — Penyelenggaraan LPBBTI (Historic)',
    codeNumber: 'SEOJK 19/SEOJK.06/2023',
    sourceType: 'Circular Letter (SEOJK)',
    canonicalUrl: 'https://ojk.go.id/id/regulasi/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI.aspx',
    effectiveDate: '2024-01-01',
    status: 'Superseded',
    supersededBy: 'SEOJK 19/SEOJK.06/2025'
  }
];

export class TrustedSourceRegistryClass {
  private sources: Map<string, CanonicalSourceConfig> = new Map();

  constructor() {
    for (const src of CANONICAL_TRUSTED_SOURCES) {
      this.sources.set(src.id, src);
    }
  }

  public getAllSources(): CanonicalSourceConfig[] {
    return Array.from(this.sources.values());
  }

  public getCurrentSources(): CanonicalSourceConfig[] {
    return Array.from(this.sources.values()).filter(s => s.status === 'Current');
  }

  public getById(id: string): CanonicalSourceConfig | undefined {
    return this.sources.get(id);
  }

  public isApprovedDomain(urlStr: string): boolean {
    if (!urlStr || urlStr === '#') return false;
    try {
      const parsed = new URL(urlStr);
      return ALLOWED_OFFICIAL_DOMAINS.some(domain => 
        parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
      );
    } catch {
      return false;
    }
  }

  /**
   * Resolves any source identifier, key, title, code number, or raw URL into a verified source record.
   * Ensures that no raw, fabricated, or invalid OJK URLs are rendered.
   */
  public resolve(keyOrUrlOrTitle: string): {
    id: string;
    organisation: string;
    title: string;
    codeNumber: string;
    url: string;
    status: SourceFreshnessStatus;
    supersededBy?: string;
    isValidDomain: boolean;
    isAvailable: boolean;
    displayStatusText: string;
  } {
    if (!keyOrUrlOrTitle) {
      const defaultSrc = this.sources.get('seojk-19-2025')!;
      return {
        id: defaultSrc.id,
        organisation: defaultSrc.organisation,
        title: defaultSrc.title,
        codeNumber: defaultSrc.codeNumber,
        url: defaultSrc.canonicalUrl,
        status: defaultSrc.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    const trimmed = keyOrUrlOrTitle.trim();
    const lower = trimmed.toLowerCase();

    // 1. Direct ID match
    if (this.sources.has(trimmed)) {
      const src = this.sources.get(trimmed)!;
      const validDomain = this.isApprovedDomain(src.canonicalUrl);
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        supersededBy: src.supersededBy,
        isValidDomain: validDomain,
        isAvailable: validDomain,
        displayStatusText: src.status === 'Superseded' ? 'Superseded by SEOJK 19/SEOJK.06/2025' : src.status
      };
    }

    // 2. Search by codeNumber, title, or aliases
    for (const src of this.sources.values()) {
      if (
        src.id.toLowerCase() === lower ||
        src.codeNumber.toLowerCase() === lower ||
        src.title.toLowerCase() === lower ||
        lower.includes(src.id.toLowerCase()) ||
        lower.includes(src.codeNumber.toLowerCase())
      ) {
        const validDomain = this.isApprovedDomain(src.canonicalUrl);
        return {
          id: src.id,
          organisation: src.organisation,
          title: src.title,
          codeNumber: src.codeNumber,
          url: src.canonicalUrl,
          status: src.status,
          supersededBy: src.supersededBy,
          isValidDomain: validDomain,
          isAvailable: validDomain,
          displayStatusText: src.status === 'Superseded' ? 'Superseded by SEOJK 19/SEOJK.06/2025' : src.status
        };
      }
    }

    // 3. Keyword matching for common regulatory references
    if (lower.includes('19/2025') || lower.includes('19/seojk.06/2025') || lower.includes('seojk 19') || lower.includes('seojk-19')) {
      if (lower.includes('2023') || lower.includes('05/2023') || lower.includes('historic') || lower.includes('superseded')) {
        const src = this.sources.get('seojk-19-2023')!;
        return {
          id: src.id,
          organisation: src.organisation,
          title: src.title,
          codeNumber: src.codeNumber,
          url: src.canonicalUrl,
          status: 'Superseded',
          supersededBy: 'SEOJK 19/SEOJK.06/2025',
          isValidDomain: true,
          isAvailable: true,
          displayStatusText: 'Superseded by SEOJK 19/SEOJK.06/2025'
        };
      }
      const src = this.sources.get('seojk-19-2025')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('pojk 40') || lower.includes('40/2024') || lower.includes('40 tahun 2024')) {
      const src = this.sources.get('pojk-40-2024')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('pojk 8') || lower.includes('8 tahun 2026')) {
      const src = this.sources.get('pojk-8-2026')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('pojk 22') || lower.includes('22 tahun 2023') || lower.includes('consumer protection')) {
      const src = this.sources.get('pojk-22-2023')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('slik') || lower.includes('ideb')) {
      const src = this.sources.get('ojk-slik')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('halo bca') || lower.includes('customer service bca')) {
      const src = this.sources.get('bca-halo-bca')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('bca') && (lower.includes('complaint') || lower.includes('pengaduan'))) {
      const src = this.sources.get('bca-complaints')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('bca') && lower.includes('loan')) {
      const src = this.sources.get('bca-personal-loan')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('adakami') && lower.includes('riplay')) {
      const src = this.sources.get('adakami-riplay')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('adakami') && lower.includes('terms')) {
      const src = this.sources.get('adakami-terms')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('adakami') && lower.includes('faq')) {
      const src = this.sources.get('adakami-faq')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('adakami') && (lower.includes('complain') || lower.includes('support'))) {
      const src = this.sources.get('adakami-complain')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    if (lower.includes('adakami')) {
      const src = this.sources.get('adakami-website')!;
      return {
        id: src.id,
        organisation: src.organisation,
        title: src.title,
        codeNumber: src.codeNumber,
        url: src.canonicalUrl,
        status: src.status,
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    // 4. URL string fallback - check if domain is approved
    const isApproved = this.isApprovedDomain(trimmed);
    if (isApproved) {
      return {
        id: 'verified-url',
        organisation: trimmed.includes('ojk.go.id') ? 'OJK (Otoritas Jasa Keuangan)' : trimmed.includes('bca.co.id') ? 'Bank Central Asia (BCA)' : 'AdaKami',
        title: trimmed,
        codeNumber: 'Official Link',
        url: trimmed,
        status: 'Current',
        isValidDomain: true,
        isAvailable: true,
        displayStatusText: 'Current'
      };
    }

    // 5. If unvalidated/unapproved domain or unknown link:
    return {
      id: 'unverified-source',
      organisation: 'External Source',
      title: trimmed,
      codeNumber: 'Unverified Source',
      url: '#',
      status: 'Current status could not be verified',
      isValidDomain: false,
      isAvailable: false,
      displayStatusText: 'Official source temporarily unavailable'
    };
  }
}

export const TrustedSourceRegistry = new TrustedSourceRegistryClass();
