# FairAssist

**AI-powered, evidence-grounded financial decision support for Indonesian consumers.**

FairAssist helps consumers understand repayment obligations, financial timing, applicable regulatory information, and possible next steps before making consequential financial decisions.

Rather than providing generic financial advice, FairAssist combines **confirmed financial evidence, user context, trusted regulatory and lender-policy information, and AI-assisted reasoning** to answer three practical questions:

> **What needs my attention?**  
> **What information is still missing?**  
> **What options can I responsibly explore next?**

FairAssist is built upon a verified production agentic technology foundation combining:

**Google Agent Development Kit (ADK) · Retrieval-Augmented Generation (RAG) · Gemini · Firebase Auth & Firestore · Google Cloud Secret Manager · Google Cloud Run**

> **FairAssist is a decision-support system.** It does not execute payments, approve repayment arrangements, guarantee restructuring or extensions, or replace professional financial or legal advice.

---

## At a Glance

**Problem**  
Consumers can face multiple repayment deadlines, fragmented financial evidence, limited cash before payday, and uncertainty about which obligation requires attention first.

**Approach**  
FairAssist converts confirmed financial evidence into structured decision context, connects that context with relevant trusted information, and helps the user explore responsible next steps.

**Technology foundation**  
**Google ADK · RAG · Gemini · Firebase Auth & Firestore · Google Cloud Secret Manager · Google Cloud Run**

**Key capabilities**  
Firebase Google Sign-In · User-isolated Firestore persistence · Multimodal evidence analysis · Context sufficiency · Trusted regulatory retrieval · Cash-flow reasoning · Action simulation · Human-in-the-loop control

---

## Technology Foundation

FairAssist implements an integrated full-stack architecture pairing a reactive client interface with a secure server-side agentic runtime.

The application implements **Google ADK multi-agent orchestration, server-side Gemini integration, multimodal evidence analysis, runtime RAG grounding, user-isolated Firestore persistence, Secret Manager credential handling, cash-flow reasoning, action simulation, and human-in-the-loop decision boundaries**.

| Layer | Technology | Role |
|---|---|---|
| **Agent Orchestration** | **Google Agent Development Kit (ADK)** | Production multi-agent orchestration coordinating root reasoning, multimodal extraction, financial calculation, and regulatory retrieval |
| **Generative AI** | **Gemini** | Multimodal evidence extraction, structured schema generation, financial timing reasoning, and conversational intelligence |
| **Grounding** | **Retrieval-Augmented Generation (RAG)** | Runtime grounding layer retrieving verified OJK regulations and lender-policy documentation with visible source provenance |
| **Authentication** | **Firebase Authentication** | Authoritative user identity boundary using Google Sign-In and server-side Bearer ID token verification |
| **Persistence** | **Cloud Firestore** | Dedicated named database (`ai-studio-fairassist-a8a2b6ad-7b34-4311-94e3-b2b3e8cd1f86`) with owner-isolated security rules |
| **Secret Management** | **Google Cloud Secret Manager** | Secure runtime secret injection to Cloud Run without hardcoded credentials in code or plaintext container settings |
| **Deployment & Runtime** | **Google Cloud Run** | Production managed container runtime with required challenge label (`dev-tutorial=cloud-run-ai-challenge`) |
| **Frontend UI** | **React 18 + TypeScript + Vite** | Responsive customer-facing interface styled with Tailwind CSS |
| **API Layer** | **Express + TypeScript** | Authenticated backend proxy verifying user tokens and isolating AI execution |
| **Source Validation** | **Server-side trusted verification** | Restricts external retrieval to allowlisted domains and tracks verified source freshness |

FairAssist is designed as an **authenticated, user-isolated, agentic, grounded, and deployable customer-facing AI decision-support system**.

---

## Secure Personal Gemini Journal / Challenge Core

FairAssist incorporates the security and isolation requirements of the Secure Personal Gemini Journal challenge:

### 1. Authenticated User Identity
- Direct integration with **Firebase Authentication (Google Sign-In)**.
- Authenticated state is managed through `AuthContext.tsx` and protected by `AuthGate.tsx`.
- Client requests to `/api/chat` and `/api/analyze-evidence` attach the user's Firebase ID token in the `Authorization: Bearer <token>` header, verified server-side.
- Borrower personas (e.g. synthetic demonstration data) are purely application data and are never trusted as identity proofs.

### 2. User-Isolated Cloud Firestore Persistence
- State persists in the dedicated named database: `ai-studio-fairassist-a8a2b6ad-7b34-4311-94e3-b2b3e8cd1f86`.
- Storage is partitioned under strictly owner-isolated document paths:
  ```text
  /users/{userId}/interactions/current_session
  ```
- **Firestore Security Rules (`firestore.rules`)** enforce authenticated owner read/write boundaries with path and payload UID validation:
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{userId}/interactions/{interactionId} {
        allow read: if request.auth != null
                    && request.auth.uid == userId;
        allow write: if request.auth != null
                     && request.auth.uid == userId
                     && request.resource.data.userId == userId;
      }
    }
  }
  ```

### 3. Session Lifecycle & Quarantine Guardrails
- **Rehydration & Autosave**: Persisted user state automatically rehydrates upon login and page reload, with change-guarded debounced autosaving.
- **Guided Sample Quarantine**: Demonstration sample scenarios are quarantined in local memory and cannot silently overwrite an authenticated user's persisted session.
- **Payload Sanitization**: Evidence blobs and transient image buffers are stripped prior to database writes, preserving transactional efficiency.

### 4. Zero-Hardcoded Secrets & Secret Manager Runtime Binding
- No API keys, tokens, private keys, or service-account JSON files are stored in the codebase or client bundles.
- Production `GEMINI_API_KEY` is provisioned via **Google Cloud Secret Manager** and bound to Cloud Run as a secure environment variable at runtime.
- Backend code accesses credentials exclusively through `process.env.GEMINI_API_KEY`.

---

## Why FairAssist

A repayment problem is often not simply about whether someone earns enough money.

The real challenge can be **timing, fragmented information, and uncertainty**.

A consumer may have:

- several repayments due before payday;
- limited cash available today;
- repayment information distributed across screenshots, documents, messages, and lender applications;
- incomplete understanding of applicable regulations and lender policies;
- uncertainty about which obligation requires attention first;
- no clear distinction between an urgent deadline and the best way to allocate available cash.

FairAssist turns those fragmented signals into a structured financial decision context.

It focuses on five questions:

1. **What financial evidence has actually been confirmed?**
2. **What repayment obligations exist, and when are they due?**
3. **What cash and salary timing is available?**
4. **What trusted regulations or policies are relevant?**
5. **What should the user review or do next without allowing AI to overstep into an autonomous financial decision?**

---

## Core Capabilities

### Multimodal Financial Evidence Analysis

Users can provide financial evidence through:

- screenshots;
- photographs;
- PDF documents;
- repayment notifications;
- lender application screens;
- salary slips;
- bank-related financial documents;
- other relevant supporting evidence.

Gemini analyses submitted evidence multimodally and extracts supported information such as:

- institution;
- legal entity;
- financial product;
- repayment amount;
- due date;
- account or facility reference;
- evidence category;
- obligation status;
- confidence level;
- uncertain fields.

FairAssist follows an **evidence-before-assumption** principle.

If information cannot be reliably extracted, the system identifies it as uncertain rather than silently inventing financial facts.

---

### Evidence-to-Obligation Mapping

Confirmed evidence is translated into a structured view of the user's financial situation.

FairAssist distinguishes between:

- active repayment obligations;
- collection notices;
- salary and payroll evidence;
- bank statements;
- informational evidence;
- credit-report evidence;
- incomplete or unconfirmed information.

This prevents non-liability information, such as salary evidence or a credit report, from being incorrectly treated as a repayment obligation.

---

### Context Sufficiency Gate

FairAssist does not generate a confident repayment recommendation simply because the user asks:

> **Which repayment should I prioritise?**

The system first evaluates whether sufficient decision context is available.

Required context may include:

- confirmed repayment notices;
- repayment amounts;
- due dates;
- available cash;
- next salary date;
- expected salary amount;
- essential living expenses.

If context is incomplete, FairAssist requests the missing information before generating a decision-support recommendation.

This reduces the risk of confident financial guidance being generated from incomplete information.

---

## AI Intelligence Pipeline

FairAssist represents its reasoning workflow through five stages:

```text
UNDERSTAND → RETRIEVE → VERIFY → REASON → ACT
```

### 1. UNDERSTAND

Interpret the user's request, uploaded evidence, and confirmed financial context.

### 2. RETRIEVE

Identify trusted regulatory and institution-specific information relevant to the user's confirmed obligations.

### 3. VERIFY

Determine whether retrieved sources are available, applicable, and sufficiently verified before presenting information as current.

### 4. REASON

Combine:

- confirmed evidence;
- active repayment obligations;
- available cash;
- salary timing;
- essential expenses where provided;
- retrieved regulatory information;
- lender-policy context.

Gemini assists with financial timing and decision-support reasoning.

### 5. ACT

Present possible next steps while keeping consequential financial decisions under human control.

The **ACT** stage does not mean FairAssist autonomously performs financial transactions.

The user remains the final decision maker.

---

## Cash-Flow Analysis

FairAssist compares:

- confirmed available cash;
- repayments due before salary;
- next salary timing;
- expected salary amount;
- essential expenses where available.

When repayments due before payday exceed confirmed available cash, FairAssist identifies the:

> **Repayment-only funding gap**

FairAssist deliberately distinguishes between two different concepts:

### Deadline / Attention Priority

Which obligation requires attention first based on due date and timing.

### Payment Allocation

How the user's available cash should actually be distributed.

An earlier due date does **not automatically mean all available cash should be allocated to that obligation**.

This distinction is a core FairAssist decision-integrity principle.

---

## Action Simulator

FairAssist includes an **Action Simulator** that allows users to explore prospective financial scenarios before making a decision.

### Scenario A: Payment-Timing Adjustment

The simulator can explore what would happen **if a lender confirms** that a repayment date may be moved closer to payday.

FairAssist does not assume that:

- an extension is available;
- restructuring will be approved;
- a payment shift will be granted;
- fees will be waived;
- lender approval is automatic.

Any lender-specific arrangement requires explicit lender confirmation.

### Scenario B: Additional Borrowing

FairAssist can also examine whether additional borrowing would mathematically close an immediate repayment-only funding gap.

The simulator distinguishes between:

**solving a short-term timing gap**

and:

**creating an additional repayment obligation**.

If the interest rate, lender fees, tenor, or repayment structure is unknown, FairAssist does not manufacture a future repayment cost.

Instead, the future repayment burden remains uncertain until confirmed lender terms are available.

Because additional borrowing creates another obligation and its total repayment cost may not yet be known, **FairAssist may recommend exploring non-debt alternatives first as a decision-support judgement**.

This recommendation is kept separate from regulatory requirements.

Any LPBBTI borrowing remains subject to the applicable regulatory framework and lender-specific terms.

---

## Human-in-the-Loop External Action Lifecycle

FairAssist is deliberately designed as **decision support**, not autonomous financial decision-making.

```text
AI recommends
→ borrower approves
→ FairAssist prepares
→ borrower sends externally
→ borrower explicitly confirms: "I sent this request."
→ only then is ACT marked completed
```

Important boundaries include:

- **Strict Confirmation Boundary**: Approval or preparation of a message does not mark an external action complete. Only explicit borrower confirmation (*"I sent this request"*) marks an action complete.
- **No Automatic Payment Execution**: FairAssist never interacts with payment rails or executes fund transfers.
- **No Unilateral Restructuring Assumptions**: The system never promises that extensions, waivers, or repayment adjustments will be approved by lenders.
- **Deterministic Arithmetic Authority**: Generative AI models contextualize and explain financial calculations, but authoritative mathematical balances are derived deterministically.
- **Human Authority**: The borrower remains the final decision maker at all times.

---

## Trusted Regulatory & Policy Information

FairAssist uses official and institution-specific information relevant to the user's confirmed obligations.

Sources can include:

- **OJK — Otoritas Jasa Keuangan**
- regulated financial institutions;
- official lender websites;
- official consumer-protection resources.

Regulatory references currently used by FairAssist include, where applicable:

### POJK No. 22 Tahun 2023

**Pelindungan Konsumen dan Masyarakat di Sektor Jasa Keuangan**

Used for consumer-protection principles including transparent information and complaint-handling requirements.

FairAssist does not interpret POJK 22/2023 as automatically guaranteeing restructuring, extensions, or specific repayment options.

### POJK No. 40 Tahun 2024

**Layanan Pendanaan Bersama Berbasis Teknologi Informasi**

Used as part of the regulatory framework applicable to LPBBTI / Pindar (Pinjaman Daring / regulated online lending).

### SEOJK No. 19/SEOJK.06/2025

**Penyelenggaraan Layanan Pendanaan Bersama Berbasis Teknologi Informasi**

Used for operational guidance relevant to LPBBTI.

FairAssist distinguishes between:

- **regulatory requirements**;
- **institution-specific policies**;
- **retrieved factual information**;
- **FairAssist's own decision-support recommendations**.

A general regulatory principle is not intentionally converted into a lender-specific contractual promise.

---

## Source Verification

FairAssist distinguishes between:

> **a trusted domain**

and:

> **a source that has actually been successfully verified**

Trusted domains are restricted through an application allowlist.

A failed request, timeout, or unavailable network connection is **not automatically converted into successful source verification**.

Source states can include:

- `VERIFIED`
- `UNVERIFIED`
- `UNAVAILABLE`
- `NEEDS_REVIEW`

This prevents FairAssist from presenting source freshness with more certainty than the application can support.

---

## Agentic Architecture

The diagram below illustrates the implemented agentic architecture:

```text
                         ┌─────────────────────────────┐
                         │   AUTHENTICATED BORROWER    │
                         │    Firebase Google Sign-In  │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │   FAIRASSIST WEB CLIENT     │
                         │ React 18 + TypeScript + Vite│
                         │  - AuthGate & Context       │
                         │  - UI Dashboard & Simulator │
                         └──────────────┬──────────────┘
                                        │ Authenticated API Requests
                                        │ (Bearer ID Token)
                                        ▼
                         ┌─────────────────────────────┐
                         │   EXPRESS API SERVER        │
                         │  - Token Verification Auth  │
                         │  - Lazy Secret Manager Env  │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                     ┌─────────────────────────────────────┐
                     │ Google Agent Development Kit (ADK)  │
                     │        Agent Orchestration          │
                     └────────────────┬────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
            ▼                         ▼                         ▼
 ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
 │ EVIDENCE EXTRACTION  │  │ REGULATORY           │  │ FINANCIAL REASONING  │
 │                      │  │ RETRIEVAL (RAG)      │  │                      │
 │ Gemini Multimodal    │  │                      │  │ Deterministic Math + │
 │                      │  │ OJK Regulations      │  │ Gemini Contextual    │
 │ Screenshots / Docs   │  │ Lender Policies      │  │ Cash-Flow Analysis   │
 └──────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘
            │                         │                         │
            └─────────────────────────┼─────────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │   CLOUD FIRESTORE DB    │
                          │ Owner-Isolated Sessions │
                          │ /users/{uid}/...        │
                          └───────────┬─────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │    GOOGLE CLOUD RUN     │
                          │ Production Service      │
                          │ Secret Manager Binding  │
                          └─────────────────────────┘
```

---

## Agent Responsibilities

### Evidence Analysis Agent

Responsible for understanding uploaded financial evidence.

Capabilities include:

- multimodal document analysis;
- evidence classification;
- institution recognition;
- repayment amount extraction;
- due-date extraction;
- uncertainty identification;
- structured financial-context generation.

Gemini provides the multimodal intelligence for this capability.

### Context & Obligation Management

Maintains confirmed financial context derived from evidence and explicit user input.

Responsibilities include:

- identifying active repayment obligations;
- separating repayment liabilities from informational evidence;
- maintaining cash information;
- maintaining salary information;
- identifying missing context;
- preventing demo or unconfirmed data from entering normal user state.

### Regulatory Retrieval Agent (RAG)

Uses **RAG** to provide trusted information relevant to the confirmed user situation.

Retrieval sources include:

- OJK regulations;
- OJK circulars;
- official lender policies;
- official consumer-protection resources.

Retrieved material is verified for freshness and applicability before being passed into the reasoning stage.

### Financial Reasoning Agent

Combines:

- confirmed evidence;
- active obligations;
- available cash;
- salary timing;
- essential expenses;
- retrieved policy evidence;
- regulatory context.

Gemini assists with contextual reasoning while FairAssist enforces deterministic mathematical boundaries for calculations.

### Action & Simulation

Supports prospective decision analysis.

Responsibilities include:

- deadline sequencing;
- scenario comparison;
- repayment-timing scenarios;
- borrowing scenarios;
- lender-confirmation boundaries;
- financial calculation lineage;
- human-in-the-loop decision control.

---

## Retrieval-Augmented Generation

The RAG architecture ensures that regulatory and policy claims are grounded in retrieved evidence rather than relying solely on a model's internal knowledge.

```text
Confirmed user situation
          │
          ▼
Context-aware retrieval query
          │
          ▼
Trusted Knowledge Sources (OJK regulations, circulars, lender policies)
          │
          ▼
Relevant evidence retrieval
          │
          ▼
Source verification & freshness check
          │
          ▼
Grounded context & provenance
          │
          ▼
Gemini reasoning via Google ADK
          │
          ▼
FairAssist response with visible source lineage
```

FairAssist maintains strict separation between:

- user-provided evidence;
- retrieved evidence;
- regulatory requirements;
- lender-specific policies;
- AI reasoning;
- FairAssist recommendations.

---

## Google Cloud Run

FairAssist is deployed on **Google Cloud Run** in `asia-southeast1`.

The production service utilizes:

- **Managed Container Runtime**: Scalable, containerized Node.js backend serving both Vite static client assets and Express API endpoints.
- **Google Cloud Secret Manager**: Production runtime credentials are securely provided to the application through Secret Manager.
- **Challenge Label**: Verified and tagged with `dev-tutorial=cloud-run-ai-challenge`.
- **Server-Side Security**: All Gemini API calls, Google ADK orchestration, RAG retrieval, and token verification occur strictly server-side.

### Production Verification

FairAssist’s own-evidence multimodal workflow has been validated end-to-end on the live Cloud Run deployment. Gemini successfully extracted institution, repayment amount, due date, evidence category, and supporting details from both BCA and Easycash repayment screenshots, while keeping the borrower in control of confirmation before the information enters their financial context. The verified production workflow demonstrates evidence-grounded multimodal analysis operating successfully within FairAssist’s secure Cloud Run architecture.

---

## Demo

The FairAssist end-to-end demo shows the complete journey from authenticated conversational guidance and Gemini multimodal evidence analysis to grounded reasoning, scenario simulation, and human-controlled action.

▶️ **[Watch the FairAssist end-to-end demo](https://youtu.be/A108zglKsI8)**

---

## Current Capabilities

The FairAssist application demonstrates the following production capabilities:

| Capability | Status |
|---|---|
| Customer-facing financial decision-support experience | ✅ Implemented |
| Firebase Google Authentication & Identity Gate | ✅ Implemented |
| Authenticated backend API access with Bearer ID token verification | ✅ Implemented |
| Dedicated named Cloud Firestore database integration | ✅ Implemented |
| User-isolated Firestore persistence (`/users/{uid}/interactions/current_session`) | ✅ Implemented |
| Session state rehydration & debounced autosave | ✅ Implemented |
| Cross-user isolation verified with Firestore Security Rules | ✅ Implemented |
| Guided Sample quarantine (protects authenticated persistence) | ✅ Implemented |
| Google Cloud Secret Manager runtime credential binding | ✅ Implemented |
| Google Agent Development Kit (ADK) multi-agent orchestration | ✅ Implemented |
| Gemini server-side multimodal evidence analysis | ✅ Implemented |
| Evidence-to-obligation mapping & sanitization | ✅ Implemented |
| Context Sufficiency Gate | ✅ Implemented |
| Cash-flow gap analysis & deterministic arithmetic | ✅ Implemented |
| Interactive financial timeline | ✅ Implemented |
| Action Simulator | ✅ Implemented |
| Human-in-the-loop decision boundaries ("I sent this request" lifecycle) | ✅ Implemented |
| Runtime grounded RAG with visible trusted-source provenance | ✅ Implemented |
| Trusted-domain allowlist & source freshness tracking | ✅ Implemented |
| Google Cloud Run production deployment (`dev-tutorial=cloud-run-ai-challenge`) | ✅ Implemented |

---

## Sample Scenario

FairAssist includes a **fixed synthetic borrower scenario used for demonstration and testing**.

The sample scenario contains representative:

- repayment obligations;
- repayment dates;
- salary timing;
- available cash;
- supporting financial evidence.

The sample scenario is explicitly quarantined from normal runtime persistence.

Demo-specific values do not silently populate an ordinary user session.

A fresh FairAssist session begins with:

- no repayment obligations;
- no available cash;
- no salary information;
- no borrower-specific financial assumptions.

The sample scenario is activated only when explicitly selected by the user.

---

## Evidence & Decision Integrity

FairAssist applies six core integrity principles:

### Evidence Before Assumption

Financial facts must originate from confirmed evidence or explicit user input. Missing information remains missing until confirmed.

### Context Before Recommendation

Incomplete context produces clarifying prompts rather than premature financial guidance.

### Retrieval Before Regulatory Claims

Regulatory and policy statements must remain connected to verified trusted sources.

### Verification Before Certainty

Unavailable or unverified sources are never represented as successfully verified.

### Simulation Before Commitment

Users can evaluate financial scenarios and trade-offs before taking consequential action.

### Human Judgement Remains Final

AI supports the decision; the human borrower owns the decision.

---

## Security & Privacy Principles

FairAssist adheres to rigorous secret management and data protection practices:

- **Zero Hardcoded Secrets**: No API keys, tokens, private keys, or service-account JSON files are stored in the codebase or client bundles.
- **Google Cloud Secret Manager**: Production `GEMINI_API_KEY` is stored in Secret Manager and injected at runtime into Cloud Run.
- **Server-Side Credential Isolation**: Backend reads `process.env.GEMINI_API_KEY`. No Gemini credentials ever reach the client browser.
- **Public Client Config**: Firebase Web configuration (`firebase-applet-config.json`) contains only public identifiers used by the Firebase Client SDK. Access is secured by Firebase Auth and Firestore Security Rules.
- **Owner-Isolated Firestore Rules**: Security rules enforce `request.auth.uid == userId` for both reads and writes.
- **Evidence Sanitization**: File uploads and base64 image data are sanitized before persistence to protect database integrity.

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or Bun
- Gemini API key (for local development)

### Clone the Repository

```bash
git clone https://github.com/IrwanP/fairassist.git
cd fairassist
```

### Install Dependencies

Using npm:

```bash
npm install
```

or Bun:

```bash
bun install
```

### Local Environment Configuration

For **local development only**, create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Set your development key in `.env`:

```bash
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```

> **Note**: In production, credentials are never stored in `.env` files. They are injected automatically by Google Cloud Secret Manager.

### Run Locally

```bash
npm run dev
```

The application will start on `http://localhost:3000`.

---

## Repository Structure

```text
fairassist/
├── .env.example
├── .gitignore
├── README.md
├── firebase-applet-config.json
├── firebase.json
├── firestore.rules
├── index.html
├── metadata.json
├── package.json
├── server.ts
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── types.ts
    ├── agents/
    │   ├── fairAssistAgent.ts
    │   ├── financialReasoningAgent.ts
    │   ├── multimodalEvidenceAgent.ts
    │   ├── regulatoryRetrievalAgent.ts
    │   └── index.ts
    ├── components/
    │   ├── ActionPlanView.tsx
    │   ├── ActionSimulator.tsx
    │   ├── AuthGate.tsx
    │   ├── ChatComposer.tsx
    │   ├── EvidenceColumn.tsx
    │   ├── EvidenceDetailModal.tsx
    │   ├── EvidenceUploadModal.tsx
    │   ├── FairAssistCopilot.tsx
    │   ├── FinancialContextModal.tsx
    │   ├── FreshnessModal.tsx
    │   ├── GeminiResponse.tsx
    │   ├── Header.tsx
    │   ├── LineageModal.tsx
    │   ├── MobileFairAssistDrawer.tsx
    │   ├── NextBestActionsColumn.tsx
    │   ├── PipelineStepper.tsx
    │   ├── RulesAndPoliciesView.tsx
    │   └── SituationColumn.tsx
    ├── contexts/
    │   └── AuthContext.tsx
    ├── data/
    │   ├── mockData.ts
    │   └── sourcesConfig.ts
    ├── lib/
    │   └── firebase.ts
    ├── services/
    │   ├── persistenceService.ts
    │   └── policyRetrievalService.ts
    └── utils/
        ├── api.ts
        └── canonicalData.ts
```

---

## Disclaimer

FairAssist provides **AI-assisted financial decision support for informational purposes**.

It does not provide financial, investment, legal, or credit advice.

FairAssist does not guarantee:

- lender approval;
- repayment extensions;
- restructuring;
- payment-date changes;
- waivers;
- reduced interest;
- reduced fees;
- changes to credit-reporting treatment;
- any other lender-specific arrangement.

Users should confirm institution-specific terms directly with the relevant financial services provider and consult qualified professionals where appropriate.

---

## Author

**Irwan Prabowo**

GitHub: [@IrwanP](https://github.com/IrwanP)

---

## Licence

Licence terms are not currently specified.
