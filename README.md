# FairAssist

**AI-powered, evidence-grounded financial decision support for Indonesian consumers.**

FairAssist helps consumers understand repayment obligations, financial timing, applicable regulatory information, and possible next steps before making consequential financial decisions.

Rather than providing generic financial advice, FairAssist combines **confirmed financial evidence, user context, trusted regulatory and lender-policy information, and AI-assisted reasoning** to answer three practical questions:

> **What needs my attention?**  
> **What information is still missing?**  
> **What options can I responsibly explore next?**

FairAssist is being engineered around an agentic AI technology foundation combining:

**Google Agent Development Kit (ADK) · Retrieval-Augmented Generation (RAG) · Gemini · Google Cloud Run**

> **FairAssist is a decision-support system.** It does not execute payments, approve repayment arrangements, guarantee restructuring or extensions, or replace professional financial or legal advice.

---

## At a Glance

**Problem**  
Consumers can face multiple repayment deadlines, fragmented financial evidence, limited cash before payday, and uncertainty about which obligation requires attention first.

**Approach**  
FairAssist converts confirmed financial evidence into structured decision context, connects that context with relevant trusted information, and helps the user explore responsible next steps.

**Technology foundation**  
**Google ADK · RAG · Gemini · Google Cloud Run**

**Key capabilities**  
Multimodal evidence analysis · Context sufficiency · Trusted regulatory retrieval · Cash-flow reasoning · Action simulation · Human-in-the-loop control

---

## Technology Foundation

FairAssist combines an implemented customer-facing application stack with the target agentic foundation for its AI architecture.

The current application already implements **Gemini integration, multimodal evidence analysis, financial-context processing, source validation, cash-flow reasoning, action simulation, and decision-integrity safeguards**.

The target agentic architecture extends this foundation with **Google ADK orchestration, production RAG, and Google Cloud Run deployment**.

| Layer | Technology | Role |
|---|---|---|
| Agent orchestration | **Google Agent Development Kit (ADK)** | Target orchestration layer for specialised agent responsibilities, tools, context, and workflow |
| Generative AI | **Gemini** | Multimodal evidence analysis, reasoning, structured generation, and conversational intelligence |
| Grounding | **Retrieval-Augmented Generation (RAG)** | Target grounding layer for trusted regulatory and lender-policy evidence |
| Deployment | **Google Cloud Run** | Target managed application and agent runtime |
| Frontend | React + TypeScript + Vite | Customer-facing FairAssist experience |
| API layer | Express + TypeScript | Secure frontend/backend integration |
| Source validation | Server-side trusted-source verification | Separates trusted domains from successfully verified sources |

The objective is not simply to expose a Gemini-powered chatbot.

FairAssist is designed as an **agentic, grounded, multimodal, and deployable customer-facing AI decision-support system**.

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

Gemini then assists with financial timing and decision-support reasoning.

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

FairAssist deliberately distinguishes between two different concepts.

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

## Human-in-the-Loop Decision Boundary

FairAssist is deliberately designed as **decision support**, not autonomous financial decision-making.

Important boundaries include:

- no automatic payment execution;
- no autonomous financial transaction;
- no assumption that extensions will be approved;
- no assumption that restructuring is available;
- no assumption that partial payment will be accepted;
- no automatic prioritisation of bank debt over Pindar obligations;
- no unsupported claim that paying a particular lender protects SLIK status;
- no invented borrowing costs;
- no repayment recommendation that exceeds confirmed available cash;
- explicit recognition when essential expenses are unknown;
- lender-specific arrangements require lender confirmation;
- the borrower remains the final decision maker.

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

## Target Agentic Architecture

The diagram below represents the target agentic architecture.

The current application already implements the customer-facing experience, Gemini integration, multimodal evidence analysis, financial-context processing, trusted-source validation, and decision-support safeguards.

**Google ADK orchestration, production RAG, and Google Cloud Run deployment form the next layer of the agentic architecture.**

```text
                         ┌─────────────────────────────┐
                         │            USER             │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │   FAIRASSIST WEB EXPERIENCE │
                         │ React + TypeScript + Vite   │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │      FAIRASSIST AGENT API   │
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
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ EVIDENCE ANALYSIS    │   │ REGULATORY           │   │ FINANCIAL REASONING  │
│                      │   │ RETRIEVAL            │   │                      │
│ Gemini Multimodal    │   │ RAG                  │   │ Gemini               │
│                      │   │                      │   │                      │
│ Screenshots          │   │ OJK regulations      │   │ Cash-flow analysis   │
│ Documents            │   │ Lender policies      │   │ Repayment timing     │
│ Financial evidence   │   │ Trusted sources      │   │ Decision support     │
└──────────┬───────────┘   └──────────┬───────────┘   └──────────┬───────────┘
           │                          │                          │
           └──────────────────────────┼──────────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │ ACTION & SIMULATION     │
                          │                         │
                          │ Scenario comparison     │
                          │ Decision boundaries     │
                          │ Human authorisation     │
                          └────────────┬────────────┘
                                       │
                                       ▼
                          ┌─────────────────────────┐
                          │ GOOGLE CLOUD RUN        │
                          │ Managed Agent Runtime   │
                          └─────────────────────────┘
```

---

## Agent Responsibilities

### Evidence Analysis

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

### Regulatory Retrieval

The target retrieval layer uses **RAG** to provide trusted information relevant to the confirmed user situation.

Retrieval sources can include:

- OJK regulations;
- OJK circulars;
- official lender policies;
- official consumer-protection resources.

Retrieved material should be relevant to the current borrower context before being passed into the reasoning stage.

### Financial Reasoning

Combines:

- confirmed evidence;
- active obligations;
- available cash;
- salary timing;
- essential expenses;
- retrieved policy evidence;
- regulatory context.

Gemini assists with contextual reasoning while FairAssist applies deterministic decision-integrity guardrails.

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

The target RAG architecture is designed to ensure that regulatory and policy claims are grounded in retrieved evidence rather than relying solely on a model's internal knowledge.

```text
Confirmed user situation
          │
          ▼
Context-aware retrieval query
          │
          ▼
Trusted Knowledge Sources
          │
          ├── OJK regulations
          ├── OJK circulars
          ├── lender policies
          └── official consumer resources
          │
          ▼
Relevant evidence retrieval
          │
          ▼
Source verification
          │
          ▼
Grounded context
          │
          ▼
Gemini reasoning
          │
          ▼
FairAssist response
          │
          └── evidence + source lineage
```

FairAssist aims to maintain clear separation between:

- user-provided evidence;
- retrieved evidence;
- regulatory requirements;
- lender-specific policies;
- AI reasoning;
- FairAssist recommendations.

---

## Google Cloud Run

FairAssist's target deployment architecture uses **Google Cloud Run** as the managed runtime for the application and agent backend.

The deployment architecture is designed to keep:

- Gemini credentials server-side;
- ADK execution server-side;
- RAG retrieval server-side;
- source verification server-side;
- financial reasoning server-side.

This avoids exposing sensitive backend configuration or model credentials to the browser.

---

## Current Capabilities

The current FairAssist application already demonstrates the following capabilities:

| Capability | Status |
|---|---|
| Customer-facing financial decision-support experience | ✅ Implemented |
| Gemini server-side integration | ✅ Implemented |
| Gemini multimodal evidence analysis | ✅ Implemented |
| Evidence-to-obligation mapping | ✅ Implemented |
| Context Sufficiency Gate | ✅ Implemented |
| Cash-flow gap analysis | ✅ Implemented |
| Interactive financial timeline | ✅ Implemented |
| Action Simulator | ✅ Implemented |
| Human-in-the-loop decision boundaries | ✅ Implemented |
| Regulatory source validation | ✅ Implemented |
| Trusted-domain restrictions | ✅ Implemented |
| Demo-data isolation | ✅ Implemented |
| Safe evidence fallback behaviour | ✅ Implemented |
| API request validation | ✅ Implemented |
| Evidence-analysis API rate limiting | ✅ Implemented |

This table intentionally describes capabilities already present in the current application.

---

## Sample Scenario

FairAssist includes a **fixed August 2026 borrower scenario** for demonstration, screenshots, and end-to-end testing.

The sample scenario contains representative:

- repayment obligations;
- repayment dates;
- salary timing;
- available cash;
- supporting financial evidence.

The sample scenario is explicitly separated from normal runtime behaviour.

Demo-specific values must not silently populate an ordinary user session.

A fresh FairAssist session begins with:

- no repayment obligations;
- no available cash;
- no salary information;
- no borrower-specific financial assumptions.

The sample scenario is activated only when explicitly selected.

---

## Evidence & Decision Integrity

FairAssist applies six core integrity principles.

### Evidence Before Assumption

Financial facts must originate from:

- confirmed evidence; or
- explicit user input.

Missing information remains missing until confirmed.

### Context Before Recommendation

Incomplete context should produce additional questions rather than premature financial guidance.

### Retrieval Before Regulatory Claims

Regulatory and policy statements should remain connected to appropriate trusted sources.

### Verification Before Certainty

Unavailable sources should not be represented as successfully verified.

### Simulation Before Commitment

Users should be able to understand potential consequences before taking consequential financial action.

### Human Judgement Remains Final

AI supports the decision.

AI does not own the decision.

---

## Security & Privacy Principles

FairAssist keeps Gemini API credentials on the server.

Environment configuration is supplied through environment variables.

The repository contains only example values:

```bash
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
```

Actual `.env` files are excluded through `.gitignore`.

Current application safeguards include:

- server-side API key handling;
- trusted-domain allowlisting;
- evidence payload limits;
- request validation;
- evidence-analysis API rate limiting;
- safe production error responses;
- non-fabricating evidence fallbacks;
- explicit uncertainty handling;
- demo-state isolation.

FairAssist is designed to minimise unnecessary handling and retention of financial evidence.

Production deployments should implement storage, retention, deletion, access-control, and audit controls appropriate to the intended use case.

---

## Getting Started

### Requirements

- Node.js
- npm or Bun
- Gemini API access

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

### Configure Environment Variables

Create a local `.env` file based on `.env.example`.

```bash
cp .env.example .env
```

Configure:

```bash
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
APP_URL="YOUR_APPLICATION_URL"
```

Never commit actual API credentials.

### Run Locally

```bash
npm run dev
```

The development application currently runs on port `3000` unless configured differently by the deployment environment.

---

## Repository Structure

The current repository contains the FairAssist frontend, application API, evidence-processing logic, regulatory-source configuration, and trusted retrieval services.

The structure below reflects the current repository rather than the future target architecture:

```text
fairassist/
│
├── app/
│   └── applet/
│       └── src/
│
├── assets/
│   └── aistudio/
│
├── src/
│   ├── components/
│   ├── data/
│   ├── services/
│   └── ...
│
├── .env.example
├── .gitignore
├── bun.lock
├── index.html
├── metadata.json
├── package.json
├── server.ts
├── tsconfig.json
├── vite.config.ts
└── README.md
```

As ADK orchestration, RAG, and Cloud Run deployment are incorporated, their implementation components will become directly visible in the repository structure.

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

Licence information will be added before the public release.
