PDF FIELD GUIDE — DROP THE REAL FILE HERE
=========================================

This folder is served publicly at:  https://<your-site>/downloads/

The post-payment welcome email links buyers to their PDF using the
PDF_URL environment variable you set in Netlify. The default/expected value is:

    https://<your-site>/downloads/peptides-field-guide.pdf

TO GO LIVE:
1. Put the real PDF in THIS folder.
2. Name it exactly:  peptides-field-guide.pdf
   (or, if you use a different name, set PDF_URL in Netlify to match).
3. Commit + push. Netlify publishes /downloads/ as part of the public site.

NOTE: This public download is the primary delivery path (simplest — no login needed
to grab the PDF from the welcome email). A licensed/gated route also exists via
netlify/functions/get-doc.js if you ever want the PDF behind the license instead;
see SETUP.md.
