# TSSC Proto-Website — Project Context

## Overview
Prototype website for the **Technology Support Services Center (TSSC)** IT Service Desk at **Queensborough Community College (QCC)**. Built by Jalen & David.

## Purpose
- Public-facing site for the TSSC IT Help Desk
- Provides info on tech support, account access, classroom help, and service updates
- Includes a **Meet the Team** directory powered by `data/full-part-time.json` and `data/tech-fees.json`

## File Structure
| File | Purpose |
|---|---|
| `index.html` | Main landing/service desk page |
| `css/styles.css` | Global styles |
| `js/script.js` | Main page scripts |
| `meet-the-team.html` | Team directory page |
| `css/meet-the-team.css` | Styles for team page |
| `js/team-members.js` | Fetches & renders employee cards from team data files |
| `js/team-particles.js` | Animated particle background for team page |
| `data/full-part-time.json` | Faculty and full/part-time employee data |
| `data/tech-fees.json` | Tech Fee employee data |
| `assets/headshots/` | Employee headshot images (uses `placeholder.png` for camera-shy staff) |

## Employee Data (`data/full-part-time.json` and `data/tech-fees.json`)
Fields per employee:
- `First Name`, `Last Name`
- `Title` — used for sorting (see sort order below)
- `Department/Team`
- `Year Started`
- `Role & Contributions` — shown as bio on card
- `Fun Fact or Interests`
- `Photo` — path to headshot or `"camera shy"` for placeholder
- `Email`

## Team Card Sort Order
Cards on the Meet the Team page are sorted by title group, then alphabetically by last name:

| Group | Titles matched |
|---|---|
| 0 — Managers | contains `"manager"` |
| 1 — Associates | contains `"associate"` |
| 2 — IT Assistants | contains `"it assistant"` or `"support assistant"` |
| 3 — Tech Fees / College Assistants | contains `"tech fee"` or `"college assistant"` |
| 4 — Everyone else | all other titles |

## Branch / Repo Info
- Repo: `JBanks222/TSSC-proto-website`
- Working branch: `testing2`
- Default branch: `main`
- Active PR: [Testing2-pull1](https://github.com/JBanks222/TSSC-proto-website/pull/1)
