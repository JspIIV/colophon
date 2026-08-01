# Colophon

A licence registry where infringement is decided, not asserted.

A creator registers a work together with the licence they publish. Anyone can request a licence against an escrowed fee, or report a use they believe falls outside it against a bond. Every decision is made by GenLayer validators that fetch the cited page themselves and read the licence as written, and every decision can be challenged and then appealed.

* **Live app:** https://colophon-genlayer.vercel.app
* **Contract:** [`0x9f13269cb0c2BBb570C88051f2114827e4201117`](https://explorer-studio.genlayer.com/address/0x9f13269cb0c2BBb570C88051f2114827e4201117) on GenLayer Studionet
* **Regression suite:** [`tests/colophon_suite.mjs`](tests/colophon_suite.mjs), 28 checks
* **Contract source:** [`contracts/colophon.py`](contracts/colophon.py)

## Why this needs an intelligent contract

"Is this use inside the licence?" is not a question a deterministic contract can answer. It requires reading a page, reading a licence written in prose, and judging one against the other. That is exactly what GenLayer validators can do and what an ordinary smart contract cannot, so the adjudication lives on chain rather than in a company's moderation queue.

Two things follow from putting it on chain. The licence terms are stored as written, so the rule being applied is the rule the creator published rather than a policy someone can quietly restate later. And because escrowed value moves on the outcome, the decision has to be bound by consensus rather than left to whichever validator happened to lead.

## Lifecycle

Both a licence request and an infringement report run through the same three stages, each a fresh consensus round over a wider evidence set.

| Stage | What happens |
|---|---|
| `REVIEW` | Validators fetch the cited page and rule on it for the first time |
| `CHALLENGE` | Either party submits new evidence and a fresh round runs over it |
| `APPEAL` | Final round, after which the outcome settles and escrowed value moves |

Both paths really do run all three. Reports used to stop at `CHALLENGE` while requests had a third round, so `appeal_report` was added and the two are now symmetrical.

**The next stage is a right, not a courtesy.** Each round opens a window of `CHALLENGE_WINDOW_SECONDS` in which only the side the round went against may act. Until it closes, the favoured side cannot settle, so it cannot end the case before the other party has had its turn. The side holding the window can waive it by finalising early itself; nobody can waive it on their behalf. `get_settlement_window` reports the seconds left and who currently holds it.

**Money.** A licence request escrows exactly the fee the creator registered, enforced to the wei, so the published price is the price paid. It goes to the owner on `GRANTED` and back to the requester on `REFUSED`. A report bonds that same fee, so accusing somebody costs what licensing the work costs and every report on a work carries the same risk. The bond is returned on `CONFIRMED` and forfeited to the owner on `UNFOUNDED`.

**`UNCLEAR` is neutral on both paths.** It is not a finding against anybody: the arbiter could not place the use inside or outside the terms. The escrow or bond goes back to whoever put it up and no standing moves. Reports used to settle `UNCLEAR` as though it were `UNFOUNDED`, forfeiting the bond and applying the full penalty, so a reporter who raised a real question the arbiter could not resolve was treated exactly like one who invented an accusation.

**Reputation** moves with outcomes, and every action lands in an immutable audit trail carrying the actor, the outcome and a timestamp.

## How the decision is bound

The published outcome is not something a leader can nudge. The equivalence rule requires validators to match exactly on **both** `verdict` and `evidence_supports_claim`, and the contract says why in the rule itself: the verdict decides where escrowed value goes, and `evidence_supports_claim` decides whether a verdict may be entered at all. Only the wording of `reasoning` is free to differ.

Actors are bound to the transaction sender throughout. A work's owner is whoever registered it, a request's requester is whoever paid the fee, and challenge and appeal are restricted to the two parties to that item.

### Evidence is fetched, not described

The contract retrieves the cited page itself with `gl.nondet.web.render(url, mode="text")` rather than a raw HTTP `get`. A raw fetch returns HTML whose first thousands of characters are head metadata, so a reviewer given `get` output is weighing boilerplate instead of the document. The window is 20000 characters because the clause that decides a case is rarely in the opening paragraphs.

### A request and a report ask different questions of their page

This distinction was found by watching the first review fail in a way that was actually correct. A licence request describes a use that **has not happened yet**, so demanding that the page show the work already in use is incoherent, and the first version of this contract did exactly that and returned `UNCLEAR` for a perfectly good request. The two paths now ask their own questions:

* For a **request**, the page is the requester's own project, offered as context for who they are. Evidence supports the claim when the page shows a real project consistent with the description; the ruling then turns on whether the described use is permitted by the licence.
* For a **report**, the page is the allegedly infringing use itself. Evidence supports the allegation only when the page actually shows the registered work being used.

## Verified on chain

A full three-stage licence dispute was run end to end between two genuinely separate addresses, with real GEN moving.

A work was registered by `0x2a348d…a03b7a` under the SIL Open Font License: free to use, embed and modify including commercially, must not be sold on its own, derivatives must keep the licence. A different address, `0x1bfe60…6a9b80`, requested a licence to embed the webfont unmodified on a commercial product site, escrowing **3 GEN**.

| Stage | Verdict | What the arbiter said |
|---|---|---|
| `REVIEW` | `GRANTED` | the page shows a commercial SaaS product consistent with the description, and the OFL permits such use |
| `CHALLENGE` | `UNCLEAR` | raised by the work owner, citing only the text of the licence: *"the retrieved page is a Wikipedia article about the SIL Open Font License, not the requester's own project or site, so it provides no evidence of what the requester is actually building"* |
| `APPEAL` | `GRANTED` | the requester's own project page was fetched and the earlier finding restored |

Final state `FINAL_GRANTED`, settled. The contract's escrow went from 3 GEN to **0** and the work owner's balance went from 10 GEN to **13 GEN**.

The middle row is the part worth reading twice. A baseless challenge, made by the party with the most to gain from it, did not flip the outcome, because the page it cited said nothing about the thing in dispute.

That run was on an earlier deployment. The contract linked above then went through review, and everything below was re-established on it.

## What review changed, and the tests that hold it

A reviewer asked for four things: enforceable challenge and appeal rights, the missing report appeal, an enforced licence fee, and consistent behaviour across report parties, bond incentives and `UNCLEAR` versus `UNFOUNDED`. All four were fair, and all four are now covered by [`tests/colophon_suite.mjs`](tests/colophon_suite.mjs), which asserts them on chain rather than in a mock.

| Was | Is |
|---|---|
| Any amount above zero bought a licence, so the published fee was decorative | The fee is enforced to the wei, under and over payment both refused |
| Either side could finalise the moment a round landed | Settlement waits for the window, and only the side the round went against may act inside it |
| Reports stopped at `CHALLENGE` | `appeal_report` exists, and a report ran `REVIEW`, `CHALLENGE` and `APPEAL` on chain with a three entry history |
| Any bond above zero, and owners could report themselves | The bond is the work's own fee, and an owner reporting their own work is refused |
| An `UNCLEAR` report forfeited the bond and applied the unfounded penalty | `UNCLEAR` returns the bond, pays the owner nothing, and leaves standing alone |

The suite also carries two checks that exist because of a runtime behaviour worth knowing about. **Raising out of a payable method reverts the state change but not the incoming transfer.** Measured on Studionet: a refused payable call carrying 1 GEN left the contract 1 GEN heavier and the caller 1 GEN poorer. Every guard on a payable method was therefore a way to strand somebody's money, so `request_licence` and `report_infringement` now return the value and record why instead of raising. A refusal is consequently a successful transaction that creates nothing, which is what the tests assert; asserting on an error result would be asserting on the bug.

The last check is the invariant: the contract's real balance read from `eth_getBalance` must equal the escrow and bonds of everything still unsettled.

```
28 passed, 0 failed
```

## Running it

```bash
npm install
npm run dev
```

The frontend is Vite plus `genlayer-js`, talking to Studionet directly from the browser with no backend of its own. Every figure it shows is read from the contract; `get_frontend_bootstrap` returns a freshly loaded UI's whole first screen in one call, and the query indexes (`idx_status_*`, `idx_party_*`, `idx_work_*`) exist so listing a status or a party is a lookup rather than a scan.

## Contract API

```python
register_work(title, description, licence_terms, fee_units)
retire_work(work_id)
request_licence(work_id, intended_use, use_url)          # payable, escrows the fee
review_request(request_id)
challenge_request(request_id, argument, evidence_url)
appeal_request(request_id, argument, evidence_url)       # final, settles
finalise_request(request_id)
report_infringement(work_id, infringing_url, note)       # payable, posts the bond
review_report(report_id)
challenge_report(report_id, argument, evidence_url)
appeal_report(report_id, argument, evidence_url)         # final, settles
finalise_report(report_id)
get_settlement_window(item_kind, item_id)                # seconds left, and who holds them
set_review_rubric(rubric)                                # admin only

get_licence_status(request_id)   # composition surface, consensus-bound fields only
get_report_status(report_id)
get_frontend_bootstrap()
get_recent_works(limit)
get_requests_by_status(status) / get_reports_by_status(status)
get_work_activity(work_id) / get_party_activity(address)
get_reputation(address) / get_audit_trail(item_kind, item_id)
get_work / get_request / get_report / get_rubric / get_stats
```

## Honest limits

The contract cannot authenticate an image or prove that a page it fetched today looked the same yesterday. It judges what it can retrieve at the moment it runs, and returns `UNCLEAR` rather than guessing when the page does not carry the question. Ownership is asserted by whoever registers a work first; Colophon adjudicates licences against that registration, it does not establish authorship.
