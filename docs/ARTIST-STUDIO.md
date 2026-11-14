# Drawing to wallpaper and artist applications
Route: /drawing-to-wallpaper. Existing finished-art checkout stays at /print-your-own.
This release is explicitly studio-assisted. No instant AI conversion is claimed. Recover the approved Nafas transformation rules before building unattended generation.

## Review
Submissions are private in mimipip.artist_projects and artist_project_files; objects are under artist-projects/ in the existing private mimipip-print-files bucket.
Verified parent/adult account owns a project. Anonymous/authenticated Data API roles cannot read or mutate these tables; the server checks ownership on each request. The existing contact_messages desk receives a pointer on submission.
Use the authenticated database dashboard to review projects and private storage objects. Do not make the bucket public. No public admin endpoint was added.
Review status: submitted -> in_review -> accepted or not_selected (changes_requested available). Only accepted, design_approved and published award programme badges. No application auto-acceptance.
Before publication collect a separate parent/guardian agreement covering artwork licence, credit, media visibility and commercial terms. This release does not grant a sales licence or royalties. Publication remains a manual reviewed operation.
Original work belongs to the artist; Mimi Pip reserves selection rights.
Badge artwork must come from the existing gift-card design session. Do not generate replacement art in this implementation session. Until that artwork is supplied, the page and account show text milestones only.

## Verification
artist-rules.test.ts covers portfolio threshold, recordings, story and badge gates.
Production CI runs the existing suite, typecheck and build. Public functional tests must not submit a child's actual data as a test.
Files are sequentially uploaded (12MB image/30MB video/10MB audio); SHA-256 duplicates count once. Max 32 uploads/project and five drafts/day. Draft metadata is not resumable in this initial UI; private saved projects remain visible in status.
Withdrawal requests go through contact; remove private objects and records through the authorised desk.
