# Track — Project Base

This file, together with the PRD, is the **base context** for anyone or anything (human contributor or AI coding agent) working on this project. Read both before writing code or making architecture decisions.

---

## 1. Source-of-Truth Documents

| Document | Answers | Status |
|---|---|---|
| `Track_MVP_PRD_v1.md` (or `.docx`) | **What** are we building, **why**, and **what's explicitly out of scope** for this release. | Complete for MVP scope. |
| `README.md` (this file) | **How** we work: architecture guardrails, module-to-code mapping, and rules for agents/contributors. | Partial — see Section 7. Update as real engineering decisions land; don't let it silently drift from reality. |

If the PRD and the actual code ever disagree, that's a flagged discrepancy, not something to quietly resolve by editing one to match the other.

---

## 2. The Product, As One Model

Before touching any single module, understand the shape of the whole system — this is what keeps individual features consistent with each other.

Track connects **four systems** around a **single global identity**:

- **Student Platform** — one person, one global career profile (Career Passport), opportunity discovery, personal calendar.
- **Organization OS** — recruitment, members, tasks, meetings, events — the operational workspace a club actually runs on.
- **University Layer** — portfolio visibility over subscribed organizations (Phase 2 in MVP, not built yet).
- **Services Marketplace** — co-working spaces and beyond (not in MVP).

The idea holding it together: **data is created once, and reused with consent** — not spreadsheets in one context and a separately-typed CV in another. Concretely:

```
Student applies → Organization runs recruitment → Applicant becomes a Membership
    → Membership generates real activity (tasks, meetings, events)
    → With the student's consent, that activity becomes a Career Passport entry
    → The organization can confirm it → Organization Verified
```

That loop (PRD §8.1) is the spine of the MVP. If a feature you're building doesn't fit somewhere on this loop or one of the four systems, check whether it's actually in scope.

---

## 3. Non-Negotiable Architecture Principles

These come from PRD §3 and are called out separately here because they are **expensive to retrofit** — get them right before building on top of them, not after.

1. **Global User + Membership, never schema-per-club.** One person = one User row, regardless of how many organizations they join. Organizations reference `user_id`; they never own a copy of the person.
2. **Workspace / tenant isolation.** Org-private data must not leak across organizations even though it lives in a shared identity layer. This has direct implications for however row-level access control ends up implemented.
3. **Consent gate between private and public.** Internal org data (attendance, tasks, warnings) never auto-publishes to a career profile. There must be an explicit opt-in step in the data flow, not a background job.
4. **Evidence ≠ truth.** Verification has states (Self Reported → Evidence Provided → Evidence Verified → Organization Verified). Nothing, including AI, is allowed to jump straight to "verified true."
5. **Mobile-first.** Design and build for a narrow viewport first, not as a responsive afterthought.

---

## 4. MVP Boundary

17 modules, 3 layers — full detail in the PRD (§4–§7). Quick map:

- **Layer A (Identity & Student Platform):** Global Identity, Career Passport, Experience Verification, Career Goals, Opportunity Marketplace, Org Public Profile, Personal Calendar.
- **Layer B (Organization OS):** Org Management/Seasons, Members, Recruitment, Tasks & Projects, Meetings & Attendance, Events, Org Dashboards.
- **Layer C (Trust & Platform Ops):** Moderation & Org Verification, Privacy & Consent Center, Super Admin.

**Rule:** if a feature isn't on this list, it's Phase 2 or Later (PRD §10) — flag it instead of building it "since we're already in there."

---

## 5. Data Entities (Product-Level Only)

The PRD gives concepts, not a schema. Real fields, types, relations, indexes, and constraints still need to be designed — see Section 7.

| Domain | Entities |
|---|---|
| Identity | User, AuthIdentity, EmailIdentity, UserProfile, PrivacyPreference |
| Organizations | Organization, Season, Department, Membership, Role, Permission |
| Career | CareerGoal, Skill, Experience, ExperienceEvidence, Verification |
| Opportunity | Opportunity, Application, Registration, Follow, SavedOpportunity |
| Operations | Task, Project, Meeting, Attendance, Event |
| Platform | Notification, Report, ModerationCase, Subscription, AuditEvent |

---

## 6. Working With AI Agents On This Project

This project is expected to be built with the help of AI coding agents. Agents don't share memory across sessions and can generate large amounts of plausible, internally-consistent, *wrong* architecture very quickly — that's the specific failure mode this section defends against.

**Every agent session should, in order:**

1. Read the PRD and this README fully before generating code or proposing structure — not just the section that looks relevant to the current task.
2. Treat PRD priority tags (FOUNDATION / MVP / PHASE 2 / LATER) as binding. Don't add Phase 2 fields, tables, or endpoints into MVP code "for completeness" or "since it's easy while we're in here."
3. Treat Section 7 below as a literal blocker list. If a task depends on a decision marked unresolved — especially anything touching identity, tenancy, or the data schema — **stop and ask**, don't silently pick a default. Module 1's architecture is explicitly called out in the PRD as the hardest thing to change later; that's not a place for an agent to improvise.
4. Trace every module's code back to a PRD module number — in commit messages, PR titles, or top-of-file comments (e.g. `// Module 12 — member directory filters`). This is what keeps a 37-module spec navigable in an actual codebase.
5. If implementation and PRD start disagreeing, report the discrepancy rather than quietly editing either one to match the other.
6. Don't invent your own auth strategy, ID format, naming convention, or folder structure if a previous session already decided one — check this file and existing code first. New decisions get written back into this README, not left implicit in one agent's session history.

---

## 7. Gaps — What's Actually Missing Before This Is a Real Engineering Base

Straight assessment: the PRD is a strong **product** spec. It is not, by itself, enough to start writing code against. Below is what's missing, grouped by how much they block getting started.

### Blocking — needed before Module 1 (Identity) can be built at all
- **Multi-tenancy pattern.** The PRD itself flags this as unresolved (v2.0 §14): shared schema + row-level security vs. a hybrid isolation model. Module 1 and Module 12 (Members) can't be designed without this being decided first.
- **Tech stack.** No frontend framework, backend language/framework, database, or hosting target has been chosen anywhere in the PRD.
- **Real data schema / ERD.** Section 5 above is concepts, not implementable tables — no field names, types, constraints, or relations are defined yet.
- **Auth implementation details.** OAuth client setup, session vs. JWT strategy, and how RBAC (User + Organization + Role) is actually stored and checked at query time.
- **RTL / Arabic UI strategy.** The PRD says "Arabic + English architecture-ready" but never addresses right-to-left layout, which is a frontend architecture decision, not a translation-string decision. This needs to be settled before UI components get built, not retrofitted after.
- **Repo structure.** Monorepo vs. multiple repos, and how the module boundaries in the PRD map to folders/services in code.

### Needed soon — will block later modules or a growing team, not Day 1
- API design: REST vs. GraphQL, versioning, and an actual contract (OpenAPI or equivalent).
- Design system / UI kit / branding — nothing exists beyond this document's placeholder colors.
- Environments and secrets management (dev/staging/prod, `.env` conventions).
- CI/CD pipeline and branching strategy.
- Coding standards, lint/format config.
- Testing strategy (unit/integration/e2e expectations).
- Definition of Done per module — the PRD gives feature lists, not acceptance criteria a QA process can check against.
- Team ownership map: who owns which module, and where work is tracked (Jira/Linear/Notion/etc.).
- Analytics/observability tooling to actually capture the metrics defined in PRD §12 (someone has to instrument events).
- Email/notification provider choice — Module 10 (Calendar & Notifications) is MVP and needs this to function at all.

### Can wait — genuinely Phase 2/Later, don't block MVP start
- Everything already listed as deferred in PRD §10 (Wallet, Marketplace, Payments, University Financial Governance, AI Layer, Employer/Talent Layer, etc.).

---

## 8. Foundation Decisions (August 2026)

- **Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, and Supabase (Auth + PostgreSQL).
- **Tenancy:** one shared PostgreSQL schema. Every organization-owned row carries an `organization_id`; Row Level Security is mandatory on every exposed table.
- **Identity:** `auth.users.id` is the global user ID. Product profile data lives in `public.profiles`; organization relationships live in `public.memberships`.
- **Sessions:** Supabase SSR cookie sessions refreshed through Next.js 16 `proxy.ts`. Authorization remains enforced in RLS.
- **Repo:** one Next.js repository; no speculative monorepo or service split.
- **Languages:** Arabic-first with document `dir="rtl"` and CSS logical properties.
- **Schema workflow:** imperative Supabase migrations under `supabase/migrations/`.

Current Module 1 slice covers email/password and Google authentication, profiles, organizations, memberships, and tenant isolation. Multiple emails, invitation linking, duplicate detection, and account merging remain later Module 1 slices.

## 9. Suggested Immediate Next Step

Apply and verify the Module 1 foundation migration against a local or linked Supabase project, then complete the first authenticated profile flow before expanding into later modules.

## 10. Vercel Deployment

Vercel detects this Next.js app without a `vercel.json` file. Configure the Supabase variables for Preview and Production using `.env.example` as the key list:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (Production only, set to the exact production URL; Preview falls back to Vercel's generated URL)

In Supabase Auth URL Configuration, set the production Site URL and allow localhost, the exact production callback URL, and the Vercel preview wildcard for the owning account/team.

Never commit `.env.local` or secret/service-role keys.
