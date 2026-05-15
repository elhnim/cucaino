# Cucaino Roadmap

**Goal:** 200 paying families at $10/month by Dec 2026.

---

## Must-Have: Before Charging (~Aug 2026)

| ID | Feature | Status | Notes |
|---|---|---|---|
| R01 | Streak counter per habit | `todo` | Simplest daily pull. One number per task/habit. |
| R02 | Kid history / progress view | `todo` | Spec exists at docs/superpowers/specs/2026-05-13-kid-parent-history-design.md |
| R03 | Billing — Stripe integration | `todo` | Blocks taking any money. Must ship before founder #21. |
| R04 | Onboarding wizard | `todo` | New family setup in <5 min with smart defaults and starter packs. |
| R05 | Web push notifications | `todo` | Daily habit trigger. Works now on Android + Safari without native app. |

---

## Must-Have: 200 Families (~Nov 2026)

| ID | Feature | Status | Notes |
|---|---|---|---|
| R06 | Virtual pet / mascot | `todo` | Emotional attachment = daily opens. Spec in Obsidian inbox. |
| R07 | Referral flow | `todo` | "Invite a family, get 1 month free." Only scalable acquisition channel pre-App Store. |
| R08 | Native app — iOS | `todo` | App Store discovery + reliable push. |
| R09 | Weekly family report email | `todo` | Digest keeps parent engaged when kids forget. |

---

## Foundation (Done)

| ID | Feature | Status | Notes |
|---|---|---|---|
| F01 | Landing page | `done` | Live at cucaino.com |
| F02 | Signup / auth flow | `done` | Email confirmation, forgot password, confirm password |
| F03 | Founding families tracking | `done` | DB column, live counter, profile badge, free-forever logic |
| F04 | Security hardening | `done` | Open redirect fixed, PIN hashing, family_id scoping |
| F05 | Task + chore system | `done` | Full CRUD, kid assignment, scheduling |
| F06 | Music practice + timer | `done` | Metronome, tuner, practice logging |
| F07 | Rewards + approval flow | `done` | Kid claims, parent approves, points deducted |
| F08 | School bag reminders | `done` | Per-kid school items, daily checklist |
| F09 | Quiz / play mode | `done` | Quiz banks, live quiz, kid + family |
| F10 | Parent dashboard | `done` | Overview, tasks, rewards, requests, settings |

---

## Sequence

```
May 2026  → F01–F10 ✅, F01–F04 ✅
Jun 2026  → R01 (streak), R02 (history), R04 (onboarding)
Jul 2026  → R03 (billing live — critical path)
Aug 2026  → R05 (push notifications), R06 (virtual pet)
Sep 2026  → R07 (referral flow) + marketing push
Oct 2026  → R08 (native app submission)
Nov 2026  → R09 (weekly email) + 200 families target
Dec 2026  → $2,000 MRR
```

---

## Status key
`todo` · `in-progress` · `done` · `blocked`
