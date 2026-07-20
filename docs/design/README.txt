PLEXUS OSCE SIMULATOR — V3 (consolidated design + specification system)
=======================================================================

HOW TO RUN
----------
1) Keep this folder intact (the pages use relative links to each other and to /assets).
2) Open  index.html  in a browser. This is the MARKETING WEBSITE — the main entry point.
   From its top navigation you can reach: All screens, Documentation, Requirements, and
   "Explore system" (the full hub).

If your browser blocks anything over file://, serve the folder instead:
   cd plexus-osce-v3
   python -m http.server 8000
   then open  http://localhost:8000

STRUCTURE
---------
index.html ................ Marketing website — the entry point to everything
system.html ............... "Explore the system" hub (screens gallery, stations, docs, mapping)
osce-screen-01-exam-chat .. Candidate encounter (tiers, modes, jargon layer)
osce-screen-02-station-report ... Results & feedback summary (per-station score wheel)
osce-screen-knowledge-bridge .... Knowledge Bridge — post-simulation remediation engine
osce-screen-03 ... 10 ...... Dashboard, sign-in, profile, admin (overview/tokens/users/settings/audit)
osce-design-system-v1 ..... Design-system reference
docs/ ..................... All specifications as live HTML pages:
    index.html ............ Documentation hub
    requirements-map.html . Design <-> Requirements traceability (basis for sign-off)
    blueprint.html ........ Master Station Blueprint
    station-itb.html ...... ITB pump station template (PMR-002)
    station-as.html ....... Ankylosing Spondylitis station template (PLX-PMR-AS-001)
    compliance.html ....... Station compliance contract
    test-plan.html ........ V3 acceptance test plan
    implementation.html ... Implementation plan
    brd-gap.html .......... BRD gap analysis
assets/ ................... Logos + screenshots used by the pages

Plexus (client) · Oxolus / Teqplan (delivery)
