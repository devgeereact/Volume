# Production check

The host check is no longer a separate status page. Volume is live at https://volume.gakinz.com. The live release, its main commit and the rollback target are kept in one place only: [deployment](../07-operations/DEPLOYMENT.md#current-release), section "Current release". The post-deploy checks and the rollback steps are in the same file. Record results of each deploy in the handoff log (`.agent/HANDOFF.md`) and, for release evidence, in ../reports/volume/ (outside the repository).
