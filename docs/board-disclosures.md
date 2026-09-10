# Board disclosures

The Board app owns this workflow and all of its data. Open **Conflict disclosures**
from Board home, or go to `/disclosures`. An individual disclosure is separate from
the unanimous written consent used to adopt a Board resolution. The annual form
does not itself approve a transaction or satisfy the process for handling a
conflict in a specific decision.

## First organizational actions

1. Confirm the active library document is the intended Conflict of Interest
   Policy. The form provides the policy's seven disclosure categories, room for
   explanatory details, and its acknowledgment. Details are entered directly in
   the restricted form rather than uploaded to the ordinary document library.
2. As Chair, expand **Assign a disclosure**. Select a director or Div as the
   person disclosing, **Annual disclosure and acknowledgment**, the reporting
   year, and an optional completion date. Repeat for each of the five directors
   and the Executive Director. Invited portal users can receive a request before
   first sign-in, but must finish onboarding and verify their own passkey to sign.
3. Select the exact active policy version and whether it is proposed or adopted.
   Proposed-policy acknowledgments expressly make compliance effective upon
   adoption. The app records the designation; it does not independently establish
   that the Board adopted a policy. A changed policy version requires a new
   request and acknowledgment. An annual request for the same person, year, and
   policy version cannot be duplicated; use an amendment instead.
4. Assign a disinterested director to receive and review the disclosure. For the
   Chair's disclosure, choose another director. Explicitly invite legal counsel
   only when appropriate. The app does not infer Secretary or Treasurer duties
   from portal roles. Coordinate these assignments with the recipients required
   by the policy and document any needed follow-up in the private review note.
5. Create the request, then use **Send reminder** to send an individual email.
   Request creation, saving, and signing do not automatically send email.
   A newly recorded director review automatically sends the subject an outcome
   notification, as described below.
   The reminder contains only the portal link, reporting year, and optional due
   date. Signing users may explicitly email their reviewing director. Reviewers
   may explicitly email the person disclosing.
6. Ask each person to complete the form and disclose any conflict relevant to an
   upcoming decision before participating in that decision. The app does not
   impose a blanket meeting blocker or mechanically decide legal conflicts.
   Resolve relevant disclosures and any required recusal before the affected
   deliberation or action; keep the deliberation within the appropriate
   restricted workspace.

## Complete and sign

The subject opens their request, reads the pinned policy, states their roles,
and chooses **None** or **Disclose** for each category. **Disclose** requires
explanatory text before signing. Exact asset values and wallet addresses are
ordinarily unnecessary; provide sufficient facts for the policy's determination.
**Save private draft** supports incomplete work and is visible only to the subject.

**Review for signature** validates and saves the exact answers, then displays
them with the policy acknowledgment and explicit electronic-signature intent.
The person checks the acknowledgment, types the name shown for their account,
and selects **Sign and deliver**. A verified passkey session and recent passkey
verification are required. Only the subject can sign; administrators cannot
sign on behalf of another person. The record retains the normalized answers,
policy version and digest, the exact category prompts, signed name, authenticated identity, server delivery
time, acknowledgment, signature intent, and a canonical SHA-256 digest.

**Prepare an amendment** starts another draft. Saving it does not alter the
submitted record or its review status. Signing it appends a new immutable signed
revision, links it to the prior signed digest, and returns the request to
**Awaiting review**. Earlier signed versions remain available.

## Restricted review and routing

Only the subject, currently assigned director, and explicitly invited current
legal counsel can open the submitted record. Board staff and administrators have
no override. Directors see a status register containing the person's name,
year, type, deadline, and completion state, without private answers or notes.
Other roles see only requests in which they currently participate. Reviewers
never see unsubmitted draft answers.

The reviewing director reads the latest signed revision, confirms they are
disinterested, and records findings, required recusals, communication to other
decision-makers, and follow-up steps. Choose **Review complete — satisfactory**
when the disclosure review is complete and no further clarification or review
follow-up is needed; record any ongoing recusals in the required note. Choose
**Request an update or clarification** when more information is needed, or
**Review recorded — follow-up documented below** to retain findings with
outstanding follow-up. The satisfactory outcome appears in the status register,
request, review history, and printable record. Earlier **Review recorded**
outcomes retain their meaning and are not automatically marked satisfactory.
After **Record review**, a focused **Review recorded** confirmation replaces the
form and shows the saved outcome and revision. This current-review summary also
appears when reopening the request. Use **Add another review note** only when
needed, or **Back to disclosures** to return to the register. If saving succeeds
but refreshing fails, the panel confirms the save and offers a refresh without
asking you to submit again. Failed or uncertain submissions show a notice by
the form and preserve your entries.

Invited counsel can add advice but cannot mark the
director's review complete. A new submission or changed review assignment
requires fresh review. These notes do not constitute a Board vote, approval of
compensation, or permission for an interested person to participate.
The person disclosing can read these notes; use a restricted executive session
for directors-only deliberation rather than this disclosure review record.

If a reviewer is implicated, cannot serve, or counsel needs to be invited, the
subject or an admitted reviewer uses **Change the review assignment / recuse**.
Select the new director/counsel assignment and give a private reason. Unchanged
participants remain admitted; removed participants immediately lose access and
are excluded from later re-addition through this workflow. A removed reviewer
cannot restore their own access. The current subject or an admitted reviewer
must select a replacement. The app retains the change and reason; the ordinary
register does not expose them. If all admitted people are unavailable, use an
authorized governance/support process to resolve the records; the portal offers
no administrative privacy bypass.

For a new, specific matter, use **Start my disclosure** and choose
**Matter-specific disclosure**. Its private context field is required. Use this
alongside the annual disclosure and appropriate decision-making process.

## Automatic review outcome notifications

Each newly recorded director review (**satisfactory**, **update requested**, or
**follow-up documented**) triggers one automatic email attempt to the person
disclosing. The email contains the outcome, reporting year, signed revision,
and restricted portal link. It excludes answers, review notes, financial details,
and recusal explanations. Counsel advice, drafts, signatures, opening a record,
and previously recorded reviews do not trigger automatic outcome emails.

The review and notification attempt are claimed in one transaction before
sending. A stale/replayed submission cannot send another email. The subject's
current active Board access and email must still match the assigned recipient;
otherwise delivery is skipped. The review remains saved even if sending fails.
The confirmation and retained history distinguish provider acceptance, skipped
delivery, and uncertainty. Provider acceptance does not establish inbox delivery.
If execution is interrupted after the claim, the attempt remains unconfirmed;
there is no automatic retry. Check with the recipient, then use the existing
manual reminder only when needed. A new review is not required to resend a reminder.

## Retained record and email status

**Print / save signed record** opens an escaped, script-free HTML record for
browser printing or saving as PDF. The JSON export contains all signed versions
and private review history. Neither includes the subject's unsubmitted draft.
Both require current admission, and exports verify the signed chain. The pinned
policy remains available through the request even if later archived in the
ordinary library. Store downloaded copies only where this same review group is
authorized; revocation in the app cannot revoke an already downloaded copy.

Email notifications and reminders are not the legal signature or proof of
delivery. Each attempt is claimed transactionally before sending to one
recipient. Manual reminders also reject stale requests and rapid duplicates. Provider acceptance is
recorded when known. A timeout or failed result is shown as unconfirmed, and is
never automatically retried. Check with the recipient before manually retrying;
the minimum interval between attempts is five minutes.

See [Board deployment](board-deployment.md#disclosure-storage-and-release) for
storage boundaries, release checks, and operational safeguards.
