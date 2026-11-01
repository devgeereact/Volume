# Email Spec

No email transport or mailbox is part of Volume today, and Volume sends no email. Sign-in codes are sent by Clerk, not by Volume (D-039). Member invitations send nothing: the owner tells the person, who then signs in with that address (D-047, `apps/web/src/features/settings/MembersPanel.tsx`). A future notification flow needs a separate integration decision.
