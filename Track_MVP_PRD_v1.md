# TRACK — MVP Product Requirements Document
**Student Career & Organization Operating Platform**
Version 1.0 (MVP Scope) | Derived from Track PRD v2.0 | August 2026

> This document isolates the Foundation- and MVP-priority modules from Track PRD v2.0 into a standalone, buildable first release. Phase 2 / Later scope is intentionally excluded and listed for reference only in Section 9.

**CONFIDENTIAL**

---

## 1. MVP Overview

### 1.1 Purpose of This Document
Track PRD v2.0 defines the full long-term platform across 37 modules spanning student career identity, organization operations, university governance, and a services marketplace. This document extracts only the modules tagged **FOUNDATION** or **MVP** in v2.0 and organizes them into a coherent, shippable first release, so engineering and design can scope, estimate and build without the Phase 2 / Later surface area.

### 1.2 MVP Vision
Deliver one global student identity and career record, one operating workspace for student organizations, and the discovery layer that connects them — without building the recommendation engine, marketplace payments, wallet, or university financial governance yet.

### 1.3 Problem Statement (MVP-relevant)
- Students discover events, volunteering, activities, internships and programs through fragmented WhatsApp groups, Facebook pages and word-of-mouth.
- Student organizations manage recruitment, members, meetings, tasks and events across disconnected tools such as Google Forms, Sheets, Drive and WhatsApp.
- Student career history is reconstructed manually in a CV after the fact; experiences are forgotten and rarely verified.

### 1.4 MVP Goals

| Goal | Outcome |
|---|---|
| Single operating environment | Replace fragmented club operations with one structured workspace. |
| Verified career identity | Turn real participation into a durable, shareable career passport, starting with self-reported and evidence-based states. |
| Opportunity discovery | Give students one place to discover and act on relevant opportunities. |
| Data reuse | Recruitment and membership records feed the student's career profile with consent — entered once, reused. |

### 1.5 Explicit Non-Goals for MVP
- No public social feed — no posts, likes, comments or creator content.
- No recruiter / Track Talent candidate search.
- No arbitrary universal career-readiness percentage.
- AI never independently declares a claim true — it only analyzes evidence, consistency and confidence.
- No wallet, ledger, or custody of organization funds.
- No marketplace payments, bookings or commission engine.
- No university financial governance or license administration UI.
- No employer / talent layer.

---

## 2. Target Users (MVP)

| User | Primary Need in MVP |
|---|---|
| Student / Young Person | Discover opportunities, track career progress, maintain career passport. |
| Applicant | Apply to opportunities and track status. |
| Member | Manage own tasks, meetings, attendance and organization experience. |
| Head / Director | Manage department members, tasks, meetings and events. |
| President / Board | Operate the entire organization and approve critical actions. |
| Track Super Admin | Operate the platform: organizations, moderation, verification review. |

> University Admin, Workspace Partner and Employer/Recruiter roles exist in the long-term model but are out of scope for MVP (see Section 9).

---

## 3. Core Principles Carried Into MVP
- **Global identity first** — one person owns one global user account, regardless of how many organizations they join.
- **Workspace isolation** — organization-private data stays isolated by organization; the same user can belong to multiple workspaces.
- **One source of truth** — data is created once and referenced in recruitment, membership, career profile and public publishing.
- **Permission by context** — access is determined by User + Organization + Role, not a global title.
- **Student ownership and consent** — private organization data must never automatically become public career data.
- **External file storage first** — large files are referenced by URL/credential link rather than stored directly by Track.
- **Evidence is not truth** — evidence can raise confidence; organization confirmation is a stronger verification source.
- **Mobile-first** — students and activity leaders operate primarily from mobile devices.
- **Auditability** — sensitive changes and approvals require an audit trail.

> **Architecture requirement:** the MVP must be built on a global User entity plus Organization Membership entities from day one — not a schema-per-club model. Retrofitting global identity after launch is significantly more expensive than building it first.

---

## 4. MVP Module Map
The MVP consists of 17 modules across three layers. Everything below is in scope for the first release; Section 9 lists what is deliberately deferred.

**Layer A — Identity & Student Platform**
- Module 1 — Global Identity & Authentication (Foundation)
- Module 2 — Personal Profile & Career Passport
- Module 3 — Experience Verification
- Module 4 — Career Goals, Preferences & Exploration
- Module 7 — Opportunity Marketplace
- Module 8 — Organization Public Profile & Publishing
- Module 10 — Personal Calendar & Notifications

**Layer B — Organization Operating System**
- Module 11 — Organization Management, Seasons & Structure
- Module 12 — Members & Memberships
- Module 13 — Recruitment Management
- Module 14 — Tasks & Projects
- Module 15 — Meetings & Attendance
- Module 16 — Events & Volunteer Operations
- Module 22 — Organization Dashboards, Reports & Settings

**Layer C — Trust & Platform Operations**
- Module 32 — Trust, Moderation & Organization Verification
- Module 33 — Privacy & Consent Center
- Module 34 — Super Admin & Platform Operations

---

## 5. Layer A — Identity & Student Platform

### Module 1 — Global Identity & Authentication
*Global account foundation for all student, organization and university relationships.*
**PRIORITY: FOUNDATION**

**Core Features**
- Global unique user ID.
- Email/password login.
- Google sign-in.
- Multiple verified emails per user with primary email selection.
- University email verification.
- Account linking from organization invitations.
- Duplicate account detection and controlled account merge.
- Account status: active / suspended / deleted.

**Product Rules**
- Email must not be the primary identity key.
- One global career profile per User.
- Organization memberships reference User ID, never copy full user records.
- Merging accounts requires ownership verification of both identities and an audit log.

### Module 2 — Personal Profile & Career Passport
*Durable career archive that can contain historical and Track-generated experiences.*
**PRIORITY: MVP**

**Personal Profile**
- Full name, headline, bio, city/location.
- University, faculty, academic year and graduation year.
- Contact links and selected social links.
- Languages and self-declared skills.
- Primary career goal and secondary interests.
- Privacy/visibility controls.

**Career Timeline**
- Chronological timeline independent of when the item was added.
- Experience types: student activity, volunteering, event role, internship, job, freelance, project, training, course, bootcamp, competition, award, leadership, certificate, workshop, conference.
- Each experience captures organization, role, dates, responsibilities, achievements, measurable outcomes, skills used and verification state.
- Allow experiences from before Track account creation, without requiring media upload.
- External certificate/Drive/credential links supported.

**Sharing & Output**
- Shareable profile URL.
- Visibility: private / Track users / verified organizations / anyone with link / public.
- CV export from selected career data.

### Module 3 — Experience Verification
*Confidence system for self-added and organization-generated achievements.*
**PRIORITY: MVP**

**Verification States**

| State | Meaning |
|---|---|
| Self Reported | User entered claim; no supporting evidence reviewed. |
| Evidence Provided | User attached an external evidence link or source. |
| Evidence Verified | Evidence is consistent with the claim after automated/manual checking. |
| Organization Verified | The issuing/host organization explicitly confirmed the experience. |

**Evidence Sources**
- Public professional profile link when accessible/permitted.
- Certificate or credential URL.
- Google Drive evidence link.
- Recommendation/participation letter.
- Organization verification request.
- Track dashboard-generated membership, training, event or project record.

**Product Rule**
- AI may only analyze evidence, consistency and confidence — it must never independently label a user dishonest or upgrade weak evidence to Organization Verified. The full AI Verification Agent (auto-extraction, contradiction detection) is Phase 2; MVP ships the verification states and manual/organization confirmation flow.

### Module 4 — Career Goals, Preferences & Exploration
*Captures what the student wants so the platform can personalize opportunities.*
**PRIORITY: MVP**

- Primary career goal and secondary career interests.
- Current stage: exploring / learning / building experience / seeking internship / seeking job / networking / leadership.
- Opportunity preferences: events, volunteering, activities, internships, courses, competitions, bootcamps, networking.
- Location, online/offline preference, cost preference, availability and industry interests.
- Exploration mode for students with no clear career goal.

### Module 7 — Opportunity Marketplace
*Student-facing discovery and action layer for youth opportunities.*
**PRIORITY: MVP**

**Categories**
- Events, student activity recruitment, volunteering, internships, competitions, bootcamps, scholarships, training/workshops, conferences, programs.

**Discovery & Search**
- Personalized feed (rule-based in MVP, not the full recommendation engine).
- Search and category browsing.
- Filters by type, date, location, track, cost, organizer and deadline.
- Save opportunity and follow organizer.

**Opportunity Page**
- Title, type, organizer, description, images/links.
- Date/time, location, capacity and deadline.
- Requirements/prerequisites, career tracks and skills tags.
- Price/ticket info where applicable.
- Registration/application call to action.

**Student Actions**
- Register for event.
- Apply to activity/internship/volunteering.
- Track application status.
- Save/share opportunity.
- Add confirmed/verified outcome to career profile when appropriate.

### Module 8 — Organization Public Profile & Publishing
*Public layer that turns internal organization workflows into student acquisition.*
**PRIORITY: MVP**

- Organization public page: about, university, focus areas, public events and active recruitment.
- Follow organization and receive recruitment-open notifications.
- Public event history.
- Verified organization badge/status when applicable.
- Publish recruitment campaign or public event from the dashboard to the marketplace without re-entering data.
- Capacity and deadline stay in sync between dashboard and marketplace.

### Module 10 — Personal Calendar & Notifications
*Unifies deadlines, meetings and opportunity activity across personal and organization contexts.*
**PRIORITY: MVP**

- My Calendar: registered events, interviews, organization meetings, trainings and application deadlines.
- Calendar export/sync to Google Calendar / iCal.
- In-app and email notifications.
- Reminder rules for event date, closing deadline, interview time and meeting.

---

## 6. Layer B — Organization Operating System

### Module 11 — Organization Management, Seasons & Structure
*Foundational configuration for how an organization operates on Track.*
**PRIORITY: MVP**

- Organization profile: name, description, university, vision, mission, values and social links.
- Season management with an active season and complete historical archive.
- Departments/committees with description, leaders and hierarchy.
- Organization chart visualization.
- Global organization calendar.
- Organization subscription and workspace status.

### Module 12 — Members & Memberships
*How people relate to an organization without duplicating their identity.*
**PRIORITY: MVP**

- Membership references a global User instead of creating a separate person record.
- Current position, department, season, joined date, exit date and status.
- Position and promotion history.
- Multi-organization membership support.
- Member directory and filters.
- Career-safe fields available for profile sync with consent.
- Alumni state and historical membership retention.

### Module 13 — Recruitment Management
*End-to-end hiring pipeline that ends in a Membership.*
**PRIORITY: MVP**

| Stage | Core Actions |
|---|---|
| Applicants | Submit, filter and view profile. |
| Screening | Approve/reject with notes. |
| Interview | Schedule, score, notes and decision. |
| Assessment | Task/skills assessment and score. |
| Accepted | Offer and start date. |
| Training | Pre-onboarding completion. |
| Onboarding | Checklist and orientation. |
| Committee Assignment | Assign department/role. |
| Active Member | Create Membership against global User. |

- Public campaign page and shareable link.
- Custom questions per campaign/season.
- Bulk actions and email/in-app status notifications.
- Recruitment analytics: funnel, acceptance rate, source and drop-off.
- Marketplace publishing from the same campaign record.
- Existing Track users apply with reusable personal data rather than re-entering profile fields.

### Module 14 — Tasks & Projects
*Day-to-day execution layer for organizations.*
**PRIORITY: MVP**

- Task title, description, priority, deadline, status and progress.
- Checklist, links, dependencies and comments.
- Assigned members, reviewer and approver, with an audit/history log.
- Tasks linked to project, event, meeting or department.
- Recurring tasks and task templates.
- List, Kanban and calendar views.
- Projects with objectives, teams, milestones, cross-committee ownership and post-project review.

### Module 15 — Meetings & Attendance
*Structured record of how organizations govern themselves.*
**PRIORITY: MVP**

- Meeting types: board, department, committee, project, emergency.
- Date/time, location, agenda and attendees.
- Attendance: present / absent / excused.
- Minutes and decision log.
- Create action items/tasks directly from a meeting.
- Recording/reference URL and follow-up notes.

> Note: the "Need a venue?" → Co-working Marketplace integration point is defined in v2.0 but depends on Module 25 (Phase 2) and is therefore out of scope for MVP; meetings simply record a free-text location in MVP.

### Module 16 — Events & Volunteer Operations
*Planning and delivery of organization events, mapped to public opportunities.*
**PRIORITY: MVP**

- Event objectives, timeline, venue and status.
- Cross-committee role assignments and volunteer/member teams.
- Pre/during/post checklists.
- Public registration or opportunity publishing.
- Capacity and attendance tracking.
- Post-event evaluation and lessons learned.
- Career-profile sync for verified event roles such as organizer, volunteer or speaker.

> Risk register, supplier linkage, sponsor/Partnerships linkage and budget linkage are retained conceptually from v2.0 but their owning modules (Finance, Partnerships) are Phase 2 — MVP events carry a simple free-text budget note instead.

### Module 22 — Organization Dashboards, Reports & Settings
*Role-specific views into what is happening across the organization.*
**PRIORITY: MVP**

**President / Board Dashboard**
- Membership and activity health summary.
- Tasks and overdue work; attendance summary.
- Recruitment funnel; upcoming meetings/events.
- Department alerts.

**Director / Head Dashboard**
- Department members and status; department tasks/deadlines.
- Upcoming meetings/events.

**Member Dashboard**
- My tasks, my meetings, attendance record.
- Career-profile sync suggestions.

**Reports & Settings**
- Member, department, recruitment, attendance and event reports with PDF/Excel export and date filters.
- Custom roles and module permissions.
- Approval workflows and notification preferences.
- Onboarding checklist configuration.

---

## 7. Layer C — Trust & Platform Operations

### Module 32 — Trust, Moderation & Organization Verification
*Baseline integrity controls needed before opening the platform publicly.*
**PRIORITY: MVP**

- Verified organization state and organization claiming flow.
- Report fake opportunity / report fake experience.
- Evidence/manual review queue.
- Suspicious account/behavior review.
- Moderation audit trail.

### Module 33 — Privacy & Consent Center
*Gives students control over what leaves the organization workspace.*
**PRIORITY: MVP**

- Profile visibility, experience-level visibility and social activity visibility controls.
- Attendance-sharing controls.
- Dashboard-to-career-profile consent (explicit opt-in before internal records become public career data).
- Organization/private-data policy enforcement.

### Module 34 — Super Admin & Platform Operations
*Internal tooling to operate the MVP safely.*
**PRIORITY: MVP**

- Manage users, universities and organizations.
- Manage subscriptions and licenses (basic).
- Manage opportunity moderation.
- Review verification cases.
- Configure platform categories, career tracks and global settings.
- Platform-wide announcements and basic revenue/usage analytics.

---

## 8. Critical MVP Workflow

### 8.1 Recruitment → Member → Career Profile

| Step | System Behavior |
|---|---|
| 1. Apply | Student uses existing Track profile to apply to organization recruitment. |
| 2. Process | Organization moves applicant through screening/interview/assessment. |
| 3. Accept | Accepted applicant becomes a Membership against the same global User. |
| 4. Operate | Member participates in meetings, tasks and events. |
| 5. Career-safe output | Eligible records may create/update career experiences with user consent. |
| 6. Verification | Dashboard-generated records can receive Organization Verified status. |

### 8.2 Dashboard → Opportunity Marketplace

| Internal Action | Public Result |
|---|---|
| Create recruitment campaign | Option to publish recruitment opportunity. |
| Create public event | Option to publish event page and registration. |
| Open volunteer request | Option to publish volunteer opportunity. |
| Change capacity/deadline | Public listing updates from the same source of truth. |

---

## 9. Core Data Entities (MVP Scope)
Product-level entities only — not a database schema.

| Domain | Key Entities |
|---|---|
| Identity | User, AuthIdentity, EmailIdentity, UserProfile, PrivacyPreference |
| Organizations | University (reference only), Organization, Season, Department, Membership, Role, Permission |
| Career | CareerGoal, Skill, Experience, ExperienceEvidence, Verification |
| Opportunity | Opportunity, Application, Registration, Follow, SavedOpportunity |
| Operations | Task, Project, Meeting, Attendance, Event |
| Platform | Notification, Report, ModerationCase, Subscription, AuditEvent |

> Even though Finance, Marketplace and Career Blueprint entities are out of MVP scope, the schema should reserve the shared identity keys (User ID, Organization ID) these later modules will need, so Phase 2/3 do not require a data migration.

---

## 10. Explicitly Out of Scope for MVP
Carried over from Track PRD v2.0 for traceability. These modules are designed but deliberately not built in this release.

| Module | Deferred Scope |
|---|---|
| Module 5 | Career Blueprint & Progress — Phase 2 |
| Module 6 | Career Recommendation Engine — Phase 2 |
| Module 9 | Social Discovery Layer — Phase 2 |
| Module 17 | Performance, KPIs & Evaluations — Phase 2 |
| Module 18 | Finance, Budgets & Approvals — Phase 2 |
| Module 19 | Partnerships / Fundraising CRM — Phase 2 |
| Module 20 | Knowledge Base, Training & Handover — Phase 2 |
| Module 21 | Logistics, Assets & Suppliers — Phase 2 |
| Module 23 | University Administration & License Management — Phase 2 |
| Module 24 | University Financial Governance — Later |
| Modules 25–27 | Co-working Marketplace, Partner Portal, Booking Engine — Phase 2 |
| Module 28 | Organization Wallet & Financial Ledger — Later |
| Module 29 | Payment, Commission & Settlement Engine — Phase 2 |
| Module 30 | Track Services Marketplace — Later |
| Module 31 | Event Ticketing & Payments — Later |
| Module 35 | AI Layer (full agentic capabilities) — Phase 2 |
| Module 36 | Integrations beyond calendar export — Phase 2 |
| Module 37 | Future Employer / Talent Layer — Later |

---

## 11. Non-Functional Requirements

| Requirement | Target / Principle |
|---|---|
| Security | HTTPS, secure auth, session expiration, rate limiting, least-privilege RBAC. |
| Tenant Isolation | No cross-organization access without explicit membership/permission. |
| Auditability | Sensitive actions, verification and approvals are logged. |
| Mobile Support | Fully responsive; PWA-ready where practical. |
| Languages | Arabic + English architecture-ready. |
| Performance | Fast interactive dashboards and marketplace browsing; pagination on large lists. |
| Backups | Automated database backups and a tested recovery plan. |
| File Cost Control | Prefer external URLs for large media/documents. |
| Privacy | Consent controls and separation of internal/private vs. public career data. |
| Accessibility | Keyboard-friendly controls, readable contrast, semantic forms/tables. |

---

## 12. MVP Success Metrics

| Area | Example Metrics |
|---|---|
| Student Acquisition | New users, profile completion rate, opportunity viewers, applications/registrations. |
| Student Retention | Weekly active students, saved opportunities, recurring sessions, career-profile updates. |
| Organization Adoption | Active workspaces, weekly active leaders, members managed, meetings/tasks created. |
| Recruitment Loop | Campaigns published, applicant conversion, accepted users already on Track. |
| Career Identity | Experiences added, % with evidence, organization-verified experiences. |
| Quality / Trust | Fraud reports, verification turnaround, support volume. |

---

## 13. MVP Success Condition
> A student can create one global account and career profile; an organization can run recruitment and day-to-day operations; the same student can join multiple organizations; an organization can publish opportunities to the student platform; and approved/verified organization experiences can feed the student career history — without duplicating identity or exposing private internal data.
