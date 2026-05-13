# Annotated Claim Outcome Email Draft

Use this as the human review response after a claim is filed. Replace bracketed fields before sending.

## Subject

Annotated claim outcome: [claim id]

## Claim Upheld - Annotation Removed

Hi [claimant name],

Thank you for filing a claim with Annotated.

We reviewed your claim regarding this annotation:

- Claim ID: [claim id]
- Annotation ID: [annotation id]
- Source: [source title or URL]
- Claim reason: [reason]

Outcome: we have removed the annotation from public feeds and profile surfaces.

Notes from review:
[short explanation of why the annotation was removed]

If you believe anything else on Annotated needs review, reply to this email with the relevant link and a short explanation.

Nick  
Annotated

## Claim Not Upheld - Annotation Kept Live

Hi [claimant name],

Thank you for filing a claim with Annotated.

We reviewed your claim regarding this annotation:

- Claim ID: [claim id]
- Annotation ID: [annotation id]
- Source: [source title or URL]
- Claim reason: [reason]

Outcome: after review, we are keeping the annotation live.

Notes from review:
[short explanation of why the annotation remains available]

If you have additional context that was not included in the original claim, reply to this email and we can review again.

Nick  
Annotated

## Claim Upheld - User Account Removed

Hi [claimant name],

Thank you for filing a claim with Annotated.

We reviewed your claim regarding this annotation:

- Claim ID: [claim id]
- Annotation ID: [annotation id]
- Source: [source title or URL]
- Claim reason: [reason]

Outcome: we removed the annotation and removed the user account associated with it. The same account identity is blocked from signing up again for 30 days.

This account action applies to the user who posted the annotation under review. It does not apply to the claimant who filed this report.

Notes from review:
[short explanation of the account action]

If you see related content reappear, reply to this email with the relevant link.

Nick  
Annotated

## Internal Review Checklist

- Confirm the claimant email is valid enough to reply.
- Read the full claim description.
- Open the annotation and original source.
- Confirm the account action targets the annotation owner, not the claimant.
- Decide one outcome: keep annotation, remove annotation, or remove account.
- Add an internal note in `/admin/claims`.
- Send the claimant one of the drafts above.
- Mark the claim resolved in `/admin/claims`.
