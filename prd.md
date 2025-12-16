📘 PRD — TSI Lead Fit Scoring & Retention Enrichment Engine (MVP)

Product Name: TSI Fit Score Engine
Version: MVP v1.0
Owner: Growth / Acquisition (Townsquare Interactive)
Primary Goal: Improve customer retention and LTV by pre-qualifying leads before sales using automated data enrichment and scoring, and passing those signals to Salesforce and ad platforms.

⸻

1. Problem Statement (Why This Exists)

Current paid acquisition (Facebook, Google, TikTok) optimizes on cheap MQLs and early sales signals, not long-term retention.

As a result:
	•	High volume of low-solvency, early-stage SMBs
	•	Sales closes deals that technically qualify but churn within 3–6 months
	•	Ad platforms are being trained on bad customers, compounding the problem

Root cause:
There is no automated, pre-sales signal that predicts whether a lead is capable of retaining.

⸻

2. Product Objective (What Success Looks Like)

Primary Objective

Create an automated system that:
	1.	Enriches leads at form submit
	2.	Calculates a Fit Score (0–100) tied to retention probability
	3.	Writes the score + attributes into Salesforce
	4.	Powers downstream decisions:
	•	Sales routing
	•	Qualification rules
	•	Ad platform standard events (via Stape)

Success Metrics (Not Vanity)
	•	↑ 90-day retention rate (primary KPI)
	•	↑ LTV per customer
	•	↓ Sales-closed / churned accounts
	•	↓ % of low-fit customers sold
	•	↑ Average Fit Score of closed-won deals

⸻

3. MVP Scope (Strict)

IN SCOPE (v1)
	•	Automated enrichment using:
	•	Google Places / Maps API
	•	Website tech detection
	•	Clay enrichment (employees, revenue where available)
	•	Deterministic Fit Score calculation
	•	Salesforce write-back
	•	Synchronous scoring (<10s) OR async with callback
	•	Logging + audit trail

OUT OF SCOPE (for MVP)
	•	n8n orchestration (comes later)
	•	Real-time bid optimization logic
	•	UI dashboards (BI later)
	•	Call transcription / RAG (separate system)

⸻

4. System Architecture (MVP)

Flow:

Landing Page → API (Render)
           → Enrichment (Google + Website + Clay)
           → Fit Score Calculation
           → Salesforce Update
           → (Optional) Stape event decision

Hosting: Render
Services:
	•	Web API
	•	Background Worker
	•	Postgres DB

⸻

5. Data Enrichment Signals (MVP)

Positive Retention Signals (Add Points)

Signal	Why
Business exists on Google Places	Real business
≥ 15 Google reviews	Operational maturity
Years in business ≥ 2	Survivability
Employees ≥ 3	Payroll + solvency
Physical location	Non-fly-by-night
Website present	Baseline legitimacy

Negative Sophistication Signals (Subtract Points)

(Weighted at ~50% of original values)

Signal	Points	Why
Meta Pixel detected	−7	Already running ads / agency risk
GA4 / Google Ads tag	−5	Prior acquisition experience
Multiple ad pixels	−10	Highly optimized, harder to satisfy
Marketing automation (HubSpot, etc.)	−5	Sophisticated buyer

Design Principle:
Penalize over-sophistication, not competence.
We want solvent but under-optimized businesses.

⸻

6. Fit Score Model (v1)

Score Range: 0–100
Structure:
	•	Solvency Score (0–70)
	•	Digital Sophistication Adjustment (−30 to 0)

Output Tiers

Score	Tier	Action
0–39	Disqualified	Do not sell
40–59	MQL	Caution
60–79	High Fit	Standard close
80–100	Premium	Priority routing


⸻

7. Salesforce Integration (Core Requirement)

Objects Updated
	•	Lead
	•	Opportunity

Fields (New or Required)

Field	Type
Fit_Score__c	Number
Fit_Tier__c	Picklist
Years_In_Business__c	Number
Employee_Estimate__c	Number
Google_Reviews_Count__c	Number
Has_Website__c	Boolean
Digital_Sophistication_Level__c	Picklist
Enrichment_Source__c	Text
Fit_Score_Timestamp__c	Datetime

Salesforce is the source of truth.

⸻

8. API Contracts (MVP)

Input (from Landing Page / Webhook)

{
  "lead_id": "uuid",
  "business_name": "ABC Roofing",
  "phone": "+1...",
  "email": "hashed",
  "website": "example.com",
  "utm_source": "facebook",
  "fbclid": "...",
  "gclid": "..."
}

Output (to Salesforce)

{
  "lead_id": "SFDC_ID",
  "fit_score": 78,
  "fit_tier": "High Fit",
  "signals": {
    "google_reviews": 23,
    "employees_est": 5,
    "years_in_business": 4,
    "pixels_detected": ["meta"]
  }
}


⸻

9. Operational Rules (Non-Negotiable)
	•	Sales cannot override Fit Score
	•	Leads <40 must not be sold
	•	Any override requires manager approval + logging
	•	Fit Score must be calculated before first sales call
	•	Fail-closed: if enrichment fails → default conservative score

⸻

10. MVP Rollout Plan (7 Days)

Day 1–2
	•	API skeleton
	•	Google Places integration
	•	Salesforce auth

Day 3
	•	Website tech detection
	•	Clay enrichment wiring

Day 4
	•	Fit Score logic
	•	Unit tests for scoring

Day 5
	•	Salesforce write-back
	•	Logging + retries

Day 6
	•	End-to-end test with real leads
	•	Compare vs rep qualification

Day 7
	•	Production deploy
	•	Monitor Fit Score distribution

⸻

11. Risks & Mitigations

Risk	Mitigation
Enrichment API limits	Async worker + caching
False negatives	Conservative thresholds in v1
Sales resistance	Make Fit Score visible + auditable
Platform latency	Async scoring allowed


⸻

12. Future Extensions (Post-MVP)
	•	n8n orchestration
	•	Event-level feedback loop to Meta / Google
	•	90-/120-/180-day ROAS attribution
	•	Call Rack sentiment injection
	•	BI dashboard (retention by Fit Tier)

⸻

Bottom Line (for Leadership)

This system redefines MQL from:

“Someone who filled a form”

to:

“A business that can actually retain”

If this isn’t built, every optimization downstream is lying.