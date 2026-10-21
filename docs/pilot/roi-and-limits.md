# ROI worksheet and limits

Enter measured pilot values. Blank means unknown; no savings or commercial price is claimed.

| Input                             | Operator value | Source                             |
| --------------------------------- | -------------- | ---------------------------------- |
| Packs/day                         |                | Receiving records                  |
| Minutes/pack before and with tool |                | Timed matched sessions             |
| Staff cost/minute                 |                | Operator-approved cost             |
| Avoided write-offs/day            |                | Attributable matched stock records |
| Extra review minutes/day          |                | Amber/CAPA log                     |
| Hosting/AI/hardware cost/day      |                | Invoices/amortization              |

Labor saving/day = packs × (minutes before − minutes with tool) × cost/minute. Net daily benefit = labor saving + evidenced avoided write-offs − extra review cost − operating cost. Payback days = setup cost / positive daily benefit. If benefit ≤0, do not quote payback. Do not double-count avoided losses or assign a hypothetical liability saving.

## Known limits

- Real-photo accuracy, physical sensors, three-person usability and low-end Android Slow 3G/airplane-mode checks remain pending.
- Vision cannot see hidden labels, detect pathogens or establish scientific shelf life. Uncertain dates require human review. Thermal debit and risk are estimates.
- One API process serializes zone work. Photos use bounded Mongo binary storage. Dispatch scans store lots; replace with product-scoped indexed reads and measure before scale.
- The 120 requests/minute/IP ceiling throttles 50-rps bursts. Shared ingress/sensor fleets need a measured per-user/device capacity and rate-limit design.
- Outbox replay needs the app open and valid access. Failed evidence needs intervention. Packing and stock approval require server checks.
- Hindi navigation/reasons/onboarding exist; full screen-copy localization and worker comprehension remain pilot work.
- Incomplete evidence produces unavailable health. Synthetic map coordinates/traces do not prove coverage. No history is invented for missing days.
- Production account lifecycle, local encryption, retention automation, overlapping JWT keys, multi-worker jobs and alert routing remain rollout requirements.

## Free-tier migration

Verify current model names, quotas, terms and hosting availability in provider consoles. Keep sensitive data out of prototype free-tier calls. Use conservative rate ceilings, monitor cache/review outcomes, and degrade to manual review when unavailable.

Measure demand and cost, obtain explicit budget approval, then configure paid/self-hosted services if needed. Validate model schemas and the real-photo regression set before switching. Revisit backups, storage, monitoring, legal review and incident ownership with capacity.
