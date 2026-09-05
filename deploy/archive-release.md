# Archive-only public release

This release descends from main bde6ec4, retaining the committed community implementation for future deployment. Only app/page.tsx uses the c1b35a2 public community surface until the community backend/reverse proxy is ready. Chat, voice and their server configuration are unchanged.

The archive change from bde6ec4 is integrated into that public page. Do not merge this temporary page restoration over main blindly. When community deployment is approved and operational, publish main's CommunityFeed surface and retain StarArchive in both home/feed locations. Sites source main includes this release commit; merge its ancestry while retaining the intended page before the next source push (no force push).

Historical image, attribution, licenses, original event date and profile facts are rendered in-page. No daily synchronization is configured.
