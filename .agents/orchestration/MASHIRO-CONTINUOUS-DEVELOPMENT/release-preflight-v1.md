# Release transport preflight

Date: 2026-09-06. Read-only readiness observation, not release acceptance.

The installed GitHub connector returned the exact repository `Molotov0cocktail/Mashiro`, ID `1353930434`, public visibility, unarchived, with push permission. No repository visibility or settings changed.

Separately, coordinator used the existing repository Git credential manager in a bounded, noninteractive child process and authenticated a GET to `https://api.github.com/repos/Molotov0cocktail/Mashiro`. The response again identified that repository ID, public visibility and `permissions.push: true`. The credential was consumed only inside the process; the script wrote no credential file, did not print credential-manager output, token, headers or response body, and did not search private directories. Installed Node supported `--use-env-proxy`; the command used the project's existing local proxy without modifying persistent settings. Command exited 0.

This establishes an available authenticated REST route using existing authorized repository access. It does not prove a Release POST or asset upload succeeded: both remain NOT RUN. The final release workflow must still create a new version/tag, upload the independently accepted actual installer, checksums/notices/instructions, and verify downloadable bytes. No draft, tag, release, asset or user notification was created during preflight. No GitHub CLI installation is required merely to use this observed REST route.
